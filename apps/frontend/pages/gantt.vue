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
const currentUser = ref(null);
const dependencyForm = reactive({ predecessorId: '', successorId: '' });
const holidayDate = ref('');
const holidayName = ref('');
const importJob = ref(null);
const importing = ref(false);
const members = ref([]);
const selectedIds = ref([]);
const bulkStatus = ref('planned');
const bulkProgress = ref(0);
const assignmentForm = reactive({ responsible: '', executor: '', coExecutor: '' });
const projectForm = reactive({ name: '' });
const diagramForm = reactive({ name: '' });
const directionForm = reactive({ name: '' });
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
  members.value = (await api(`/projects/${projectId.value}/members?limit=200`)).items ?? [];
  await loadDiagrams(query.get('diagram'));
}

function focusNewTask() {
  document.querySelector('.manage-card')?.setAttribute('open', '');
  setTimeout(() => document.querySelector('.manage-card input[placeholder="Название задачи"]')?.focus(), 0);
}

async function createProject() {
  if (!projectForm.name.trim()) return;
  try {
    await api('/projects', { method: 'POST', body: { name: projectForm.name, description: '' } });
    projectForm.name = '';
    await loadProjects();
  } catch (reason) {
    error.value = reason.message;
  }
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
    fillAssignments(fresh);
  }
}

function fillAssignments(task) {
  const userAssignment = (role) =>
    (task.assignments ?? []).find((item) => item.role === role && item.assigneeType === 'user')
      ?.assigneeId ?? '';
  assignmentForm.responsible = userAssignment('responsible');
  assignmentForm.executor = userAssignment('executor');
  assignmentForm.coExecutor = userAssignment('co_executor');
}

async function saveAssignments() {
  if (!selectedTask.value) return;
  const preserved = (selectedTask.value.assignments ?? [])
    .filter((item) => item.assigneeType !== 'user')
    .map((item) => ({ role: item.role, assigneeType: item.assigneeType, assigneeId: item.assigneeId }));
  const users = [
    ['responsible', assignmentForm.responsible],
    ['executor', assignmentForm.executor],
    ['co_executor', assignmentForm.coExecutor],
  ]
    .filter(([, id]) => id)
    .map(([role, assigneeId]) => ({ role, assigneeType: 'user', assigneeId }));
  try {
    await api(`/tasks/${selectedTask.value.id}/assignments`, {
      method: 'PUT',
      body: {
        assignments: [...preserved, ...users],
        baseRevision: snapshot.value?.currentRevision ?? 0,
      },
    });
    await loadSnapshot(true);
  } catch (reason) {
    error.value = reason.message;
  }
}

async function applyBulk() {
  const tasks = (snapshot.value?.tasks ?? []).filter((task) => selectedIds.value.includes(task.id));
  try {
    for (const task of tasks) {
      await api(`/tasks/${task.id}/progress`, {
        method: 'PATCH',
        body: {
          status: bulkStatus.value,
          progress: Number(bulkProgress.value),
          expectedVersion: task.version,
        },
      });
    }
    selectedIds.value = [];
    await loadSnapshot(true);
  } catch (reason) {
    error.value = reason.message;
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
  fillAssignments(task);
  comments.value = (await api(`/comments?entityType=task&entityId=${task.id}`)).items ?? [];
}

async function createDiagram() {
  if (!diagramForm.name.trim() || !projectId.value) return;
  try {
    const diagram = await api(`/projects/${projectId.value}/diagrams`, {
      method: 'POST',
      body: { name: diagramForm.name, dayMode: 'working' },
    });
    diagramForm.name = '';
    await loadDiagrams(diagram.id);
  } catch (reason) {
    error.value = reason.message;
  }
}

async function createDirection() {
  if (!directionForm.name.trim() || !diagramId.value) return;
  try {
    await api(`/diagrams/${diagramId.value}/directions`, {
      method: 'POST',
      body: { name: directionForm.name },
    });
    directionForm.name = '';
    await loadSnapshot(true);
  } catch (reason) {
    error.value = reason.message;
  }
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

const projectName = computed(
  () => projects.value.find((project) => project.id === projectId.value)?.name ?? 'Проект',
);

const timelineBars = computed(() => {
  const tasks = snapshot.value?.tasks ?? [];
  const dates = tasks
    .flatMap((task) => [task.startDate, task.endDate])
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter((value) => !Number.isNaN(value));
  const min = dates.length ? Math.min(...dates) : Date.now();
  const max = dates.length ? Math.max(...dates) : min + 1000 * 60 * 60 * 24 * 30;
  const span = Math.max(max - min, 1000 * 60 * 60 * 24);
  return tasks.map((task, index) => {
    const start = task.startDate ? new Date(task.startDate).getTime() : min + (span / tasks.length) * index;
    const end = task.endDate ? new Date(task.endDate).getTime() : start + span / Math.max(tasks.length, 1);
    return {
      task,
      style: {
        top: `${index * 38 + 8}px`,
        left: `${Math.min(96, Math.max(0, ((start - min) / span) * 100))}%`,
        width: `${Math.max(6, Math.min(100, ((end - start) / span) * 100))}%`,
      },
    };
  });
});

function statusBadgeClass(statusValue) {
  return (
    {
      done: 'badge-success',
      in_progress: 'badge-primary',
      blocked: 'badge-warning',
      planned: 'badge-neutral',
    }[statusValue] ?? 'badge-neutral'
  );
}

function initials(user) {
  const name = user?.displayName || user?.firstName || user?.email || '';
  return String(name).slice(0, 2).toUpperCase();
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
    const session = await api('/auth/session');
    currentUser.value = session?.user ?? session;
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
  <div class="app-shell gantt-shell">
    <header class="app-header">
      <a class="app-brand" href="/gantt"><span class="brand-mark">▥</span><span>SMART OATI</span></a>
      <nav class="app-nav">
        <a class="active" href="/gantt">Проекты</a>
        <a href="/members">Участники</a>
        <a href="/notifications">Уведомления</a>
        <a href="/admin">Админка</a>
      </nav>
      <div class="app-header-right">
        <span class="sync-status" :class="{ online: syncConnected }">{{ syncConnected ? 'Синхронизировано' : 'Офлайн' }}</span>
        <a class="header-icon" href="/notifications" aria-label="Уведомления">🔔</a>
        <div class="user-chip"><span class="avatar">{{ initials(currentUser) || 'СО' }}</span><span>{{ currentUser?.displayName || currentUser?.email || 'Пользователь' }}</span></div>
      </div>
    </header>

    <main class="page gantt-page">
      <div class="breadcrumbs"><a href="/gantt">Рабочее пространство</a><span class="sep">/</span><span>{{ projectName }}</span><span class="sep">/</span><strong>{{ snapshot?.diagram?.name || 'Gantt' }}</strong></div>

      <div v-if="snapshot" class="gantt-topline">
        <div class="gantt-title-row">
          <div>
            <div class="title-line"><h1 class="gantt-title">{{ snapshot.diagram?.name }}</h1><span class="badge badge-primary badge-dot">В работе</span></div>
            <div class="muted small">Ревизия {{ snapshot.currentRevision }} · {{ snapshot.tasks?.length || 0 }} задач · {{ members.length }} участников</div>
          </div>
        </div>
        <div class="gantt-top-actions">
          <span class="sync-state">{{ syncConnected ? 'Синхронизировано' : 'Не синхронизировано' }}</span>
          <a class="btn btn-secondary btn-sm" href="/members">Участники</a>
          <div class="user-chip"><span class="avatar sm">{{ initials(currentUser) || 'СО' }}</span><span>{{ currentUser?.firstName || 'Вы' }}</span></div>
        </div>
      </div>

      <div v-if="snapshot" class="gantt-toolbar">
        <button class="btn btn-primary btn-sm" type="button" @click="focusNewTask">＋ Направление / задача</button>
        <div class="divider"></div>
        <span class="gantt-chip active">Все статусы</span>
        <span class="gantt-chip">Ответственный</span>
        <span class="gantt-chip">Рабочие дни</span>
        <div class="toolbar-spacer"></div>
        <label class="gantt-chip file-chip">Импорт<input type="file" accept=".json,.csv" :disabled="importing" @change="importFile" /></label>
        <a class="gantt-chip" :href="`/api/v1/diagrams/${diagramId}/export?format=json`">Экспорт JSON</a>
        <a class="gantt-chip" :href="`/api/v1/diagrams/${diagramId}/export?format=csv`">CSV</a>
      </div>

      <p v-if="loading" class="muted">Загрузка...</p>
      <p v-if="error" class="error">{{ error }}</p>

      <section v-if="!loading && !projects.length" class="card empty-project">
        <h2>Создайте первый проект</h2>
        <form class="stack" @submit.prevent="createProject">
          <input v-model="projectForm.name" class="input" placeholder="Название проекта" required />
          <button class="btn btn-primary" type="submit">Создать проект</button>
        </form>
      </section>

      <section v-if="!loading && projectId && !snapshot" class="card empty-project">
        <h2>Создайте первую диаграмму</h2>
        <form class="stack" @submit.prevent="createDiagram">
          <input v-model="diagramForm.name" class="input" placeholder="Название диаграммы" required />
          <button class="btn btn-primary" type="submit">Создать диаграмму</button>
        </form>
      </section>

      <div v-if="snapshot" class="gantt-frame">
        <div class="gantt-labels">
          <div class="gantt-label-head"><span>Структура работ</span><span class="wbs">WBS</span></div>
          <div
            v-for="task in snapshot.tasks"
            :key="task.id"
            class="gantt-row-label task"
            :class="{ selected: selectedTask?.id === task.id }"
            @click="selectTask(task)"
          >
            <span class="caret">›</span>
            <span class="label-name">{{ task.wbsCode }}. {{ task.name }}</span>
            <span class="label-meta">
              <span class="badge badge-dot" :class="statusBadgeClass(task.status)">{{ statusLabel(task.status) }}</span>
              <span class="badge badge-neutral">{{ task.progress }}%</span>
            </span>
          </div>
        </div>
        <div class="gantt-timeline">
          <div class="gantt-time-head">
            <div class="gantt-month">План</div>
            <div class="gantt-week" v-for="week in 7" :key="week">Неделя {{ week }}</div>
          </div>
          <div class="gantt-canvas" :style="{ minHeight: `${Math.max(320, (snapshot.tasks?.length || 0) * 38 + 24)}px` }">
            <span class="gantt-today"></span>
            <div
              v-for="bar in timelineBars"
              :key="bar.task.id"
              class="gantt-bar"
              :class="bar.task.status"
              :style="bar.style"
              @click="selectTask(bar.task)"
            >
              <span class="gantt-bar-label">{{ bar.task.wbsCode }} · {{ bar.task.progress }}%</span>
              <span class="fill" :style="{ width: `${bar.task.progress}%` }"></span>
            </div>
          </div>
        </div>
      </div>

      <section v-if="snapshot" class="card manage-card manage">
        <h2>Управление задачами, связями и календарём</h2>
        <div class="manage-grid">
          <div>
            <h3>Новая диаграмма</h3>
            <form class="stack" @submit.prevent="createDiagram">
              <input v-model="diagramForm.name" class="input" placeholder="Название диаграммы" required />
              <button class="btn btn-secondary" type="submit">Создать диаграмму</button>
            </form>
            <h3>Новое направление</h3>
            <form class="stack" @submit.prevent="createDirection">
              <input v-model="directionForm.name" class="input" placeholder="Название направления" required />
              <button class="btn btn-secondary" type="submit">Создать направление</button>
            </form>
            <h3>Новая задача</h3>
            <form class="stack" @submit.prevent="createTask">
              <select v-model="taskForm.directionId" class="input task-direction" required>
                <option value="" disabled>Направление</option>
                <option v-for="direction in snapshot.directions" :key="direction.id" :value="direction.id">{{ direction.name }}</option>
              </select>
              <input v-model="taskForm.name" class="input" placeholder="Название задачи" required />
              <button class="btn btn-primary" type="submit">Создать задачу</button>
            </form>
          </div>
          <div>
            <h3>Зависимости</h3>
            <div class="manage-list">
              <div v-for="dependency in snapshot.dependencies" :key="dependency.id" class="manage-item">
                <span>{{ taskLabel(dependency.predecessorId) }} → {{ taskLabel(dependency.successorId) }}</span>
                <button type="button" class="btn btn-ghost btn-sm" @click="deleteDependency(dependency.id)">Удалить</button>
              </div>
              <p v-if="!snapshot.dependencies?.length" class="muted small">Связей пока нет.</p>
            </div>
            <form class="stack" @submit.prevent="addDependency">
              <select v-model="dependencyForm.predecessorId" class="input dep-predecessor" required>
                <option value="" disabled>Предшественник</option>
                <option v-for="task in snapshot.tasks" :key="task.id" :value="task.id">{{ task.wbsCode }} {{ task.name }}</option>
              </select>
              <select v-model="dependencyForm.successorId" class="input dep-successor" required>
                <option value="" disabled>Последователь</option>
                <option v-for="task in snapshot.tasks" :key="task.id" :value="task.id">{{ task.wbsCode }} {{ task.name }}</option>
              </select>
              <button class="btn btn-secondary" type="submit">Добавить связь</button>
            </form>
          </div>
          <div>
            <h3>Производственный календарь</h3>
            <div class="manage-list">
              <div v-for="holiday in snapshot.holidays" :key="holiday.id" class="manage-item">
                <span>{{ holiday.holidayDate }} — {{ holiday.name || 'Праздник' }}</span>
                <button type="button" class="btn btn-ghost btn-sm" @click="deleteHoliday(holiday.holidayDate)">Удалить</button>
              </div>
              <p v-if="!snapshot.holidays?.length" class="muted small">Праздников пока нет.</p>
            </div>
            <form class="stack" @submit.prevent="addHoliday">
              <input v-model="holidayDate" class="input" type="date" required />
              <input v-model="holidayName" class="input" placeholder="Название" />
              <button class="btn btn-secondary" type="submit">Добавить праздник</button>
            </form>
            <p v-if="importing" class="muted small">Импорт выполняется...</p>
            <p v-else-if="importJob" class="muted small">{{ importJob.fileName }}: {{ importJob.status }}</p>
          </div>
        </div>
      </section>
    </main>

    <aside v-if="selectedTask" class="gantt-drawer drawer">
      <div class="drawer-head">
        <div><h3>Задача</h3><p class="muted small">{{ selectedTask.wbsCode }}. {{ selectedTask.name }}</p></div>
        <button class="btn btn-icon btn-ghost" type="button" @click="selectedTask = null">✕</button>
      </div>
      <div class="drawer-body">
        <div class="inline">
          <select v-model="status" class="input">
            <option value="planned">Планируется</option>
            <option value="in_progress">В работе</option>
            <option value="done">Готово</option>
            <option value="blocked">Блокировано</option>
          </select>
          <input v-model.number="progress" class="input" type="number" min="0" max="100" step="5" />
          <button class="btn btn-primary btn-sm" type="button" @click="saveProgress">Сохранить</button>
        </div>
        <div class="stack task-edit">
          <input v-model="taskEdit.name" class="input" placeholder="Название задачи" />
          <textarea v-model="taskEdit.description" class="textarea" rows="2" placeholder="Описание" />
          <select v-model="taskEdit.priority" class="input">
            <option value="low">Низкий приоритет</option>
            <option value="medium">Средний приоритет</option>
            <option value="high">Высокий приоритет</option>
            <option value="critical">Критический</option>
          </select>
          <input v-model="taskEdit.jiraNumber" class="input" placeholder="Jira" />
          <div class="dates"><input v-model="taskEdit.startDate" class="input" type="date" /><input v-model="taskEdit.endDate" class="input" type="date" /></div>
          <button class="btn btn-secondary" type="button" @click="saveTask">Сохранить задачу</button>
          <button class="btn btn-ghost danger" type="button" @click="deleteTask">Удалить задачу</button>
        </div>
        <h3>Назначения</h3>
        <div class="stack">
          <select v-model="assignmentForm.responsible" class="input"><option value="">Ответственный не назначен</option><option v-for="member in members" :key="member.userId" :value="member.userId">{{ member.user?.displayName || member.user?.email || member.userId }}</option></select>
          <select v-model="assignmentForm.executor" class="input"><option value="">Исполнитель не назначен</option><option v-for="member in members" :key="member.userId" :value="member.userId">{{ member.user?.displayName || member.user?.email || member.userId }}</option></select>
          <select v-model="assignmentForm.coExecutor" class="input"><option value="">Соисполнитель не назначен</option><option v-for="member in members" :key="member.userId" :value="member.userId">{{ member.user?.displayName || member.user?.email || member.userId }}</option></select>
          <button class="btn btn-secondary" type="button" @click="saveAssignments">Сохранить назначения</button>
        </div>
        <h3>Комментарии</h3>
        <div class="comments">
          <div v-for="comment in comments" :key="comment.id" class="comment">
            <span class="avatar sm">К</span>
            <div><div class="comment-head"><span class="comment-name">{{ comment.authorUserId }}</span></div><p class="comment-text">{{ comment.body }}</p></div>
          </div>
          <p v-if="!comments.length" class="muted small">Комментариев пока нет.</p>
        </div>
        <form class="comment-form composer" @submit.prevent="addComment">
          <textarea v-model="commentBody" class="textarea" rows="3" placeholder="Написать комментарий..." />
          <div class="composer-footer"><button class="btn btn-primary btn-sm" type="submit">Добавить</button></div>
        </form>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.gantt-shell { min-height: 100vh; }
.gantt-page { padding-bottom: 120px; }
.gantt-page.has-drawer { padding-right: 420px; }
.brand-mark { display: inline-grid; place-items: center; }
.sync-status { font-size: 12px; color: var(--color-text-muted); }
.sync-status.online { color: var(--color-success); }
.gantt-topline { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; margin-bottom: 18px; }
.gantt-title-row { display: flex; gap: 12px; align-items: center; }
.title-line { display: flex; gap: 10px; align-items: center; }
.gantt-title { margin: 0; font-size: 26px; letter-spacing: -0.02em; }
.gantt-top-actions { display: flex; gap: 10px; align-items: center; }
.small { font-size: 12px; }
.gantt-toolbar { display: flex; gap: 8px; align-items: center; padding: 10px 12px; margin-bottom: 14px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); flex-wrap: wrap; }
.gantt-chip { display: inline-flex; gap: 6px; align-items: center; min-height: 32px; padding: 6px 11px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); color: var(--color-text); font-size: 12px; cursor: pointer; text-decoration: none; }
.gantt-chip.active { background: var(--color-primary-soft); border-color: #bfdbfe; color: var(--color-primary); }
.file-chip input { display: none; }
.gantt-frame { display: grid; grid-template-columns: minmax(380px, 46%) 1fr; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); overflow: hidden; box-shadow: var(--shadow-sm); }
.gantt-labels { border-right: 1px solid var(--color-border); min-width: 0; }
.gantt-label-head, .gantt-row-label { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; gap: 8px; align-items: center; min-height: 38px; padding: 0 12px; border-bottom: 1px solid var(--color-border); }
.gantt-label-head { background: var(--color-surface-subtle); color: var(--color-text-muted); font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
.gantt-label-head .wbs { margin-left: auto; }
.gantt-row-label { cursor: pointer; font-size: 13px; }
.gantt-row-label:hover, .gantt-row-label.selected { background: #eff6ff; }
.gantt-row-label .caret { color: var(--color-text-muted); }
.label-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.label-meta { display: flex; gap: 5px; align-items: center; }
.gantt-timeline { min-width: 420px; overflow: hidden; }
.gantt-time-head { display: grid; grid-template-columns: 1.2fr repeat(7, 1fr); min-height: 38px; border-bottom: 1px solid var(--color-border); background: var(--color-surface-subtle); font-size: 11px; color: var(--color-text-muted); }
.gantt-time-head > * { display: flex; align-items: center; padding: 0 8px; border-right: 1px solid var(--color-border); }
.gantt-canvas { position: relative; background-image: repeating-linear-gradient(to right, transparent 0, transparent calc(14.285% - 1px), var(--color-border) calc(14.285% - 1px), var(--color-border) 14.285%); }
.gantt-today { position: absolute; top: 0; bottom: 0; left: 50%; border-left: 2px solid var(--color-danger); z-index: 1; }
.gantt-bar { position: absolute; height: 28px; border-radius: var(--radius-md); background: #dbeafe; color: #1d4ed8; border: 1px solid #93c5fd; cursor: pointer; overflow: hidden; z-index: 2; }
.gantt-bar .fill { position: absolute; inset: 0 auto 0 0; background: rgb(37 99 235 / 18%); }
.gantt-bar-label { position: relative; z-index: 1; display: block; padding: 5px 8px; font-size: 11px; white-space: nowrap; }
.gantt-bar.done { background: #dcfce7; border-color: #86efac; color: #15803d; }
.gantt-bar.blocked { background: #fee2e2; border-color: #fca5a5; color: #b91c1c; }
.gantt-bar.planned { background: #f1f5f9; border-color: #cbd5e1; color: #64748b; }
.manage-card { margin-top: 18px; padding: 14px 18px; }
.manage-card summary { cursor: pointer; font-weight: 600; }
.manage-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; margin-top: 18px; }
.manage-list { display: grid; gap: 8px; }
.manage-item { display: flex; justify-content: space-between; gap: 8px; padding: 8px; border-radius: var(--radius-md); background: var(--color-surface-subtle); font-size: 12px; }
.stack { display: grid; gap: 8px; margin-top: 8px; }
.dates { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.task-edit { padding-bottom: 12px; border-bottom: 1px solid var(--color-border); }
.danger { color: var(--color-danger); }
.gantt-drawer { position: fixed; top: 0; right: 0; z-index: 30; width: 400px; height: 100vh; overflow: auto; background: var(--color-surface); border-left: 1px solid var(--color-border); box-shadow: -20px 0 60px rgb(15 35 64 / 12%); }
.drawer-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; padding: 18px; border-bottom: 1px solid var(--color-border); }
.drawer-head h3 { margin: 0 0 3px; }
.drawer-body { padding: 18px; }
.inline { display: flex; gap: 8px; flex-wrap: wrap; }
.comments { display: grid; gap: 12px; margin-top: 10px; }
.comment { display: flex; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--color-border); }
.comment-head { display: flex; gap: 8px; align-items: baseline; }
.comment-name { font-size: 12px; font-weight: 600; }
.comment-text { margin: 4px 0 0; font-size: 13px; color: var(--color-text); }
.composer { margin-top: 12px; }
.composer-footer { display: flex; justify-content: flex-end; margin-top: 8px; }
.empty-project { max-width: 440px; margin: 40px auto; }
@media (max-width: 1180px) {
  .gantt-page.has-drawer { padding-right: 0; }
  .gantt-drawer { position: static; width: auto; height: auto; margin: 16px; }
  .gantt-frame { grid-template-columns: 1fr; }
  .gantt-labels { border-right: 0; }
  .manage-grid { grid-template-columns: 1fr; }
}
</style>
