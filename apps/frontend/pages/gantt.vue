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

async function loadSnapshot() {
  snapshot.value = null;
  selectedTask.value = null;
  if (!diagramId.value) return;
  snapshot.value = await api(`/diagrams/${diagramId.value}/snapshot`);
}

async function selectTask(task) {
  selectedTask.value = task;
  progress.value = Number(task.progress) || 0;
  status.value = task.status ?? 'planned';
  comments.value = (await api(`/comments?entityType=task&entityId=${task.id}`)).items ?? [];
}

async function saveProgress() {
  if (!selectedTask.value) return;
  try {
    const updated = await api(`/tasks/${selectedTask.value.id}/progress`, {
      method: 'POST',
      body: {
        status: status.value,
        progress: Number(progress.value),
        expectedVersion: selectedTask.value.version,
      },
    });
    await loadSnapshot();
    const fresh = (snapshot.value?.tasks ?? []).find((item) => item.id === updated.id);
    if (fresh) await selectTask(fresh);
  } catch (reason) {
    error.value = reason.message;
  }
}

async function addComment() {
  if (!selectedTask.value || !commentBody.value.trim()) return;
  try {
    await api('/comments', {
      method: 'POST',
      body: {
        entityType: 'task',
        entityId: selectedTask.value.id,
        body: commentBody.value,
      },
    });
    commentBody.value = '';
    await selectTask(selectedTask.value);
  } catch (reason) {
    error.value = reason.message;
  }
}

onMounted(async () => {
  try {
    await api('/auth/session');
    await loadProjects();
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
        <select v-model="diagramId" @change="loadSnapshot">
          <option v-for="diagram in diagrams" :key="diagram.id" :value="diagram.id">{{ diagram.name }}</option>
        </select>
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
    </div>
  </main>
</template>

<style scoped>
.gantt-page { max-width: 1400px; margin: 0 auto; padding: 24px; color: #1f2937; font-family: Inter, system-ui, sans-serif; }
.gantt-header { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
.back { color: #2563eb; text-decoration: none; font-size: 14px; }
h1 { margin: 4px 0 0; font-size: 28px; }
.selectors { display: flex; gap: 10px; flex-wrap: wrap; }
.gantt-layout { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 20px; align-items: start; }
.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 18px; }
.table-card { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { text-align: left; padding: 9px 8px; border-bottom: 1px solid #e5e7eb; }
tbody tr { cursor: pointer; }
tbody tr:hover, tbody tr.selected { background: #eff6ff; }
.drawer { position: sticky; top: 20px; }
.drawer-head { display: flex; justify-content: space-between; gap: 12px; align-items: start; }
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
  .drawer { position: static; }
}
</style>
