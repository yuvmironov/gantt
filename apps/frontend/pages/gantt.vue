<script setup>
const projects = ref([]);
const diagrams = ref([]);
const projectId = ref('');
const diagramId = ref('');
const snapshot = ref(null);
const selectedTask = ref(null);
const comments = ref([]);
const commentBody = ref('');
const progress = ref(0);
const status = ref('planned');
const error = ref('');
const loading = ref(true);
const syncConnected = ref(false);
const dependencyForm = reactive({ predecessorId: '', successorId: '' });
const holidayDate = ref('');
const holidayName = ref('');
const importJob = ref(null);
const importing = ref(false);
const taskForm = reactive({ name: '', directionId: '' });
const taskEdit = reactive({
  name: '',
  description: '',
  priority: 'medium',
  jiraNumber: '',
  startDate: '',
  endDate: '',
});
let syncSocket = null;

function csrfToken() {
  return document.cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith('__Host-csrf='))
    ?.slice('__Host-csrf='.length);
}

async function api(path, options = {}) {
  const headers = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if ((options.method ?? 'GET') !== 'GET') headers['X-CSRF-Token'] = csrfToken() ?? '';
  const response = await fetch(`/api/v1${path}`, {
    ...options,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail ?? response.statusText);
  return response.status === 204 ? null : response.json();
}

function statusLabel(value) {
  return {
    planned: 'Планируется',
    in_progress: 'В работе',
    done: 'Готово',
    blocked: 'Блокировано',
  }[value] ?? value;
}

async function loadProjects() {
  projects.value = (await api('/projects?limit=100')).items ?? [];
  const query = new URLSearchParams(window.location.search);
  projectId.value = query.get('project') || projects.value[0]?.id || '';
  await loadDiagrams(query.get('diagram'));
}

async function loadDiagrams(preferredDiagram) {
  diagrams.value = (await api(`/projects/${projectId.value}/diagrams?limit=100`)).items ?? [];
  diagramId.value = preferredDiagram || diagrams.value[0]?.id || '';
  await loadSnapshot();
}

async function loadSnapshot(preserveTask = false) {
  const previousId = preserveTask ? selectedTask.value?.id : null;
  snapshot.value = null;
  if (!preserveTask) selectedTask.value = null;
  if (!diagramId.value) return;
  snapshot.value = await api(`/diagrams/${diagramId.value}/snapshot`);
  const fresh = (snapshot.value?.tasks ?? []).find((task) => task.id === previousId);
  if (fresh) {
    selectedTask.value = fresh;
    progress.value = Number(fresh.progress) || 0;
    status.value = fresh.status ?? 'planned';
    fillTaskEdit(fresh);
  }
}

function fillTaskEdit(task) {
  taskEdit.name = task.name ?? '';
  taskEdit.description = task.description ?? '';
  taskEdit.priority = task.priority ?? 'medium';
  taskEdit.jiraNumber = task.jiraNumber ?? '';
  taskEdit.startDate = task.startDate ? task.startDate.slice(0, 10) : '';
  taskEdit.endDate = task.endDate ? task.endDate.slice(0, 10) : '';
}

async function selectTask(task) {
  selectedTask.value = task;
  progress.value = Number(task.progress) || 0;
  status.value = task.status ?? 'planned';
  fillTaskEdit(task);
  comments.value = (await api(`/comments?entityType=task&entityId=${task.id}`)).items ?? [];
}

async function createTask() {
  if (!taskForm.name.trim() || !taskForm.directionId) return;
  try {
    await api(`/diagrams/${diagramId.value}/tasks`, {
      method: 'POST',
      body: {
        directionId: taskForm.directionId,
        name: taskForm.name,
        priority: 'medium',
      },
    });
    taskForm.name = '';
    await loadSnapshot();
  } catch (reason) {
    error.value = reason.message;
  }
}

async function saveTask() {
  if (!selectedTask.value || !taskEdit.name.trim()) return;
  try {
    await api(`/tasks/${selectedTask.value.id}`, {
      method: 'PATCH',
      body: {
        expectedVersion: selectedTask.value.version,
        baseRevision: snapshot.value?.currentRevision ?? 0,
        name: taskEdit.name,
        description: taskEdit.description,
        priority: taskEdit.priority,
        jiraNumber: taskEdit.jiraNumber,
        startDate: taskEdit.startDate || null,
        endDate: taskEdit.endDate || null,
      },
    });
    await loadSnapshot(true);
  } catch (reason) {
    error.value = reason.message;
  }
}

async function deleteTask() {
  if (!selectedTask.value) return;
  try {
    await api(
      `/tasks/${selectedTask.value.id}?expectedVersion=${selectedTask.value.version}&baseRevision=${snapshot.value?.currentRevision ?? 0}`,
      { method: 'DELETE' },
    );
    await loadSnapshot();
  } catch (reason) {
    error.value = reason.message;
  }
}

async function saveProgress() {
  if (!selectedTask.value) return;
  try {
    const updated = await api(`/tasks/${selectedTask.value.id}/progress`, {
      method: 'PATCH',
      body: {
        status: status.value,
        progress: Number(progress.value),
        expectedVersion: selectedTask.value.version,
      },
    });
    await loadSnapshot(true);
  } catch (reason) {
    error.value = reason.message;
  }
}

async function addComment() {
  if (!selectedTask.value || !commentBody.value.trim()) return;
  const taskId = selectedTask.value.id;
  try {
    await api('/comments', {
      method: 'POST',
      body: {
        entityType: 'task',
        entityId: taskId,
        body: commentBody.value,
      },
    });
    commentBody.value = '';
    comments.value = (await api(`/comments?entityType=task&entityId=${taskId}`)).items ?? [];
  } catch (reason) {
    error.value = reason.message;
  }
}

function taskLabel(taskId) {
  const task = (snapshot.value?.tasks ?? []).find((item) => item.id === taskId);
  return task ? `${task.wbsCode} ${task.name}` : taskId;
}

async function addDependency() {
  if (!dependencyForm.predecessorId || !dependencyForm.successorId) return;
  try {
    await api(`/diagrams/${diagramId.value}/dependencies`, {
      method: 'POST',
      body: {
        predecessorType: 'task',
        predecessorId: dependencyForm.predecessorId,
        successorType: 'task',
        successorId: dependencyForm.successorId,
      },
    });
    dependencyForm.predecessorId = '';
    dependencyForm.successorId = '';
    await loadSnapshot(true);
  } catch (reason) {
    error.value = reason.message;
  }
}

async function deleteDependency(dependencyId) {
  try {
    await api(`/dependencies/${dependencyId}`, { method: 'DELETE' });
    await loadSnapshot(true);
  } catch (reason) {
    error.value = reason.message;
  }
}

async function saveHolidays(items) {
  try {
    await api(`/diagrams/${diagramId.value}/holidays`, {
      method: 'PUT',
      body: { items, baseRevision: snapshot.value?.currentRevision ?? 0 },
    });
    await loadSnapshot(true);
  } catch (reason) {
    error.value = reason.message;
  }
}

async function addHoliday() {
  if (!holidayDate.value) return;
  const existing = (snapshot.value?.holidays ?? []).map((holiday) => ({
    holidayDate: holiday.holidayDate,
    name: holiday.name ?? '',
  }));
  if (existing.some((holiday) => holiday.holidayDate === holidayDate.value)) return;
  existing.push({ holidayDate: holidayDate.value, name: holidayName.value });
  await saveHolidays(existing);
  holidayDate.value = '';
  holidayName.value = '';
}

async function deleteHoliday(date) {
  const items = (snapshot.value?.holidays ?? [])
    .filter((holiday) => holiday.holidayDate !== date)
    .map((holiday) => ({ holidayDate: holiday.holidayDate, name: holiday.name ?? '' }));
  await saveHolidays(items);
}

async function importFile(event) {
  const file = event.target.files?.[0];
  if (!file || !diagramId.value) return;
  importing.value = true;
  importJob.value = null;
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('format', file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'json');
    const response = await fetch(`/api/v1/diagrams/${diagramId.value}/import`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-CSRF-Token': csrfToken() ?? '' },
      body: formData,
    });
    if (!response.ok) {
      throw new Error((await response.json().catch(() => ({}))).detail ?? response.statusText);
    }
    importJob.value = await response.json();
    await pollImport(importJob.value.id);
  } catch (reason) {
    error.value = reason.message;
  } finally {
    importing.value = false;
    event.target.value = '';
  }
}

async function pollImport(jobId) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    importJob.value = await api(`/import-jobs/${jobId}`);
    if (importJob.value.status === 'completed') {
      await loadSnapshot(true);
      return;
    }
    if (importJob.value.status === 'failed' || importJob.value.status === 'cancelled') return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

async function connectSync() {
  try {
    const issued = await api('/sync/token');
    syncSocket = new WebSocket(`wss://sync.localhost/ws?token=${encodeURIComponent(issued.token)}`);
    syncSocket.addEventListener('open', () => {
      syncConnected.value = true;
    });
    syncSocket.addEventListener('close', () => {
      syncConnected.value = false;
    });
    syncSocket.addEventListener('message', async (message) => {
      let payload;
      try {
        payload = JSON.parse(message.data);
      } catch {
        return;
      }
      if (payload.type !== 'diagram.changed' || !payload.event) return;
      if (payload.event.diagram_id !== diagramId.value) return;
      await loadSnapshot(true);
    });
  } catch {
    syncConnected.value = false;
  }
}

onUnmounted(() => syncSocket?.close());

onMounted(async () => {
  try {
    await api('/auth/session');
    await loadProjects();
    await connectSync();
  } catch (reason) {
    error.value = reason.message;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <main class="gantt-page">
    <header class="gantt-header">
      <div>
        <a href="/" class="back">← Legacy Gantt</a>
        <h1>Gantt</h1>
      </div>
      <div class="selectors">
        <select v-model="projectId" @change="loadDiagrams()">
          <option v-for="project in projects" :key="project.id" :value="project.id">{{ project.name }}</option>
        </select>
        <select v-model="diagramId" @change="loadSnapshot()">
          <option v-for="diagram in diagrams" :key="diagram.id" :value="diagram.id">{{ diagram.name }}</option>
        </select>
        <span class="sync-status">{{ syncConnected ? 'Realtime' : 'Offline' }}</span>
        <a v-if="diagramId" class="export" :href="`/api/v1/diagrams/${diagramId}/export?format=json`">JSON</a>
        <a v-if="diagramId" class="export" :href="`/api/v1/diagrams/${diagramId}/export?format=csv`">CSV</a>
      </div>
    </header>

    <p v-if="loading">Загрузка...</p>
    <p v-if="error" class="error">{{ error }}</p>

    <div class="gantt-layout">
      <section class="card table-card">
        <table v-if="snapshot">
          <thead>
            <tr><th>WBS</th><th>Задача</th><th>Статус</th><th>Прогресс</th></tr>
          </thead>
          <tbody>
            <tr
              v-for="task in snapshot.tasks"
              :key="task.id"
              :class="{ selected: selectedTask?.id === task.id }"
              @click="selectTask(task)"
            >
              <td>{{ task.wbsCode }}</td>
              <td>{{ task.name }}</td>
              <td>{{ statusLabel(task.status) }}</td>
              <td>{{ task.progress }}%</td>
            </tr>
          </tbody>
        </table>
        <p v-else-if="!loading">Выберите диаграмму.</p>
      </section>

      <div class="side">
        <aside v-if="selectedTask" class="card drawer">
        <div class="drawer-head">
          <h2>{{ selectedTask.name }}</h2>
          <button type="button" @click="selectedTask = null">Закрыть</button>
        </div>
        <div class="inline">
          <select v-model="status">
            <option value="planned">Планируется</option>
            <option value="in_progress">В работе</option>
            <option value="done">Готово</option>
            <option value="blocked">Блокировано</option>
          </select>
          <input v-model.number="progress" type="number" min="0" max="100" step="5" />
          <button type="button" @click="saveProgress">Сохранить</button>
        </div>
        <div class="stack">
          <input v-model="taskEdit.name" placeholder="Название задачи" />
          <textarea v-model="taskEdit.description" rows="2" placeholder="Описание" />
          <select v-model="taskEdit.priority">
            <option value="low">Низкий</option>
            <option value="medium">Средний</option>
            <option value="high">Высокий</option>
            <option value="critical">Критический</option>
          </select>
          <input v-model="taskEdit.jiraNumber" placeholder="Jira" />
          <div class="dates">
            <input v-model="taskEdit.startDate" type="date" />
            <input v-model="taskEdit.endDate" type="date" />
          </div>
          <button type="button" @click="saveTask">Сохранить задачу</button>
          <button type="button" class="danger" @click="deleteTask">Удалить задачу</button>
        </div>
        <div v-if="selectedTask.assignments?.length" class="assignments">
          <h3>Назначения</h3>
          <div v-for="assignment in selectedTask.assignments" :key="assignment.id" class="comment">
            <strong>{{ assignment.displayName || assignment.assigneeId }}</strong>
            <span>{{ assignment.role }}</span>
          </div>
        </div>
        <h3>Комментарии</h3>
        <div class="comments">
          <div v-for="comment in comments" :key="comment.id" class="comment">
            <strong>{{ comment.authorUserId }}</strong>
            <span>{{ comment.body }}</span>
          </div>
        </div>
        <form class="comment-form" @submit.prevent="addComment">
          <textarea v-model="commentBody" rows="3" placeholder="Комментарий" />
          <button type="submit">Добавить</button>
        </form>
      </aside>

      <section v-if="snapshot" class="card manage">
        <h3>Новая задача</h3>
        <form class="stack" @submit.prevent="createTask">
          <select v-model="taskForm.directionId" class="task-direction" required>
            <option value="" disabled>Направление</option>
            <option v-for="direction in snapshot.directions" :key="direction.id" :value="direction.id">
              {{ direction.name }}
            </option>
          </select>
          <input v-model="taskForm.name" placeholder="Название задачи" required />
          <button type="submit">Создать задачу</button>
        </form>

        <h3>Зависимости</h3>
        <div class="manage-list">
          <div v-for="dependency in snapshot.dependencies" :key="dependency.id" class="manage-item">
            <span>{{ taskLabel(dependency.predecessorId) }} → {{ taskLabel(dependency.successorId) }}</span>
            <button type="button" class="danger" @click="deleteDependency(dependency.id)">Удалить</button>
          </div>
          <p v-if="!snapshot.dependencies?.length" class="empty">Связей пока нет.</p>
        </div>
        <form class="stack" @submit.prevent="addDependency">
          <select v-model="dependencyForm.predecessorId" class="dep-predecessor" required>
            <option value="" disabled>Предшественник</option>
            <option v-for="task in snapshot.tasks" :key="task.id" :value="task.id">{{ task.wbsCode }} {{ task.name }}</option>
          </select>
          <select v-model="dependencyForm.successorId" class="dep-successor" required>
            <option value="" disabled>Последователь</option>
            <option v-for="task in snapshot.tasks" :key="task.id" :value="task.id">{{ task.wbsCode }} {{ task.name }}</option>
          </select>
          <button type="submit">Добавить связь</button>
        </form>

        <h3>Производственный календарь</h3>
        <div class="manage-list">
          <div v-for="holiday in snapshot.holidays" :key="holiday.id" class="manage-item">
            <span>{{ holiday.holidayDate }} — {{ holiday.name || 'Праздник' }}</span>
            <button type="button" class="danger" @click="deleteHoliday(holiday.holidayDate)">Удалить</button>
          </div>
          <p v-if="!snapshot.holidays?.length" class="empty">Праздников пока нет.</p>
        </div>
        <form class="stack" @submit.prevent="addHoliday">
          <input v-model="holidayDate" type="date" required />
          <input v-model="holidayName" placeholder="Название" />
          <button type="submit">Добавить праздник</button>
        </form>

        <h3>Импорт</h3>
        <input type="file" accept=".json,.csv" :disabled="importing" @change="importFile" />
        <p v-if="importing" class="empty">Импорт выполняется...</p>
        <p v-else-if="importJob" class="empty">
          {{ importJob.fileName }}: {{ importJob.status }}
          <span v-if="importJob.errorMessage"> — {{ importJob.errorMessage }}</span>
        </p>
        <p v-if="importJob?.report" class="empty">
          Направления: {{ importJob.report.directionsCount }}, задачи: {{ importJob.report.tasksCount }},
          назначения: {{ importJob.report.assignmentsCount }}.
        </p>
      </section>
      </div>
    </div>
  </main>
</template>

<style scoped>
.gantt-page { max-width: 1400px; margin: 0 auto; padding: 24px; color: #1f2937; font-family: Inter, system-ui, sans-serif; }
.gantt-header { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
.back { color: #2563eb; text-decoration: none; font-size: 14px; }
h1 { margin: 4px 0 0; font-size: 28px; }
.selectors { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.sync-status, .export { font-size: 12px; color: #475569; text-decoration: none; padding: 6px 8px; border: 1px solid #cbd5e1; border-radius: 7px; }
.sync-status { color: #047857; }
.gantt-layout { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 20px; align-items: start; }
.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 18px; }
.table-card { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { text-align: left; padding: 9px 8px; border-bottom: 1px solid #e5e7eb; }
tbody tr { cursor: pointer; }
tbody tr:hover, tbody tr.selected { background: #eff6ff; }
.side { display: grid; gap: 16px; }
.side .drawer { position: static; z-index: auto; width: auto; height: auto; overflow: visible; box-shadow: none; }
.drawer-head { display: flex; justify-content: space-between; gap: 12px; align-items: start; }
.manage { max-height: calc(100vh - 40px); overflow: auto; }
.manage-list { display: grid; gap: 8px; }
.manage-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px; background: #f9fafb; border-radius: 8px; font-size: 13px; }
.manage-item span { overflow-wrap: anywhere; }
.stack { display: grid; gap: 8px; margin-top: 10px; }
.dates { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.stack button, .danger { background: #fff; color: #b91c1c; border-color: #fecaca; }
.stack button { background: #111827; color: #fff; border-color: #111827; }
.danger { padding: 5px 8px; font-size: 12px; }
.empty { color: #6b7280; font-size: 13px; margin: 0; }
h2 { margin: 0; font-size: 18px; }
h3 { margin: 18px 0 10px; font-size: 15px; }
.inline { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
input, select, textarea, button { font: inherit; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 8px; }
button { background: #111827; color: #fff; border-color: #111827; cursor: pointer; }
.comments { display: grid; gap: 8px; max-height: 220px; overflow: auto; }
.comment { display: grid; gap: 2px; padding: 8px; background: #f9fafb; border-radius: 8px; }
.comment span { color: #4b5563; font-size: 13px; }
.comment-form { display: grid; gap: 8px; margin-top: 12px; }
.error { color: #b91c1c; }
@media (max-width: 900px) {
  .gantt-page { padding: 14px; }
  .gantt-header, .gantt-layout { grid-template-columns: 1fr; flex-direction: column; }
  .drawer, .side { position: static; }
  .manage { max-height: none; }
}
</style>
