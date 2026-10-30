const state = {
  user: null,
  projects: [],
  project: null,
  diagrams: [],
  diagram: null,
  snapshot: null,
};

const $ = (selector) => document.querySelector(selector);
const authView = $('#auth-view');
const appView = $('#app-view');
const toast = $('#toast');

function csrfToken() {
  const prefix = '__Host-csrf=';
  return document.cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix))
    ?.slice(prefix.length);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.add('hidden'), 4000);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function api(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['X-CSRF-Token'] = csrfToken() ?? '';
  const response = await fetch(`/api/v1${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 401) {
    showAuth();
    throw new Error('Требуется вход');
  }
  if (!response.ok) {
    let detail = `Ошибка ${response.status}`;
    try {
      const problem = await response.json();
      detail = problem.detail || problem.title || detail;
    } catch {
      // Keep the HTTP status when the response is not JSON.
    }
    if (detail.includes('session_limit_reached')) {
      detail =
        'Достигнут лимит двух активных сессий. Перезапустите user-service или завершите сессию в другом окне.';
    }
    throw new Error(detail);
  }
  if (response.status === 204) return null;
  return response.json();
}

function showAuth() {
  state.user = null;
  authView.classList.remove('hidden');
  appView.classList.add('hidden');
}

function showApp() {
  authView.classList.add('hidden');
  appView.classList.remove('hidden');
  $('#current-user').textContent = state.user?.displayName ?? state.user?.email ?? '';
}

async function boot() {
  try {
    state.user = await api('/auth/session');
    showApp();
    await loadProjects();
  } catch {
    showAuth();
  }
}

function setTab(registering) {
  $('#login-tab').classList.toggle('active', !registering);
  $('#register-tab').classList.toggle('active', registering);
  $('#login-form').classList.toggle('hidden', registering);
  $('#register-form').classList.toggle('hidden', !registering);
}

async function login(email, password) {
  state.user = (await api('/auth/login', { method: 'POST', body: { email, password } })).user;
  showApp();
  await loadProjects();
}

$('#login-tab').addEventListener('click', () => setTab(false));
$('#register-tab').addEventListener('click', () => setTab(true));

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  try {
    await login(data.get('email'), data.get('password'));
  } catch (error) {
    showToast(error.message);
  }
});

$('#register-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  try {
    await api('/auth/register', {
      method: 'POST',
      body: {
        email: data.get('email'),
        password: data.get('password'),
        lastName: data.get('lastName'),
        firstName: data.get('firstName'),
        displayName: `${data.get('lastName')} ${data.get('firstName')}`.trim(),
      },
    });
    await login(data.get('email'), data.get('password'));
  } catch (error) {
    showToast(error.message);
  }
});

$('#logout').addEventListener('click', async () => {
  try {
    await api('/auth/logout', { method: 'POST' });
  } catch {
    // The local session is discarded even if the server is unavailable.
  }
  showAuth();
});

async function loadProjects() {
  const response = await api('/projects?limit=100');
  state.projects = response.items ?? [];
  renderProjects();
}

function renderProjects() {
  const container = $('#project-list');
  if (state.projects.length === 0) {
    container.innerHTML = '<p class="empty">Проектов пока нет. Создайте первый.</p>';
    return;
  }
  container.innerHTML = state.projects
    .map(
      (project) => `
        <button class="list-item ${state.project?.id === project.id ? 'selected' : ''}" data-project="${escapeHtml(project.id)}" type="button">
          <span class="item-title">${escapeHtml(project.name)}</span>
          <span class="item-meta">${escapeHtml(project.description || project.status)}</span>
        </button>`,
    )
    .join('');
}

$('#project-list').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-project]');
  if (!button) return;
  state.project = state.projects.find((project) => project.id === button.dataset.project) ?? null;
  state.diagram = null;
  state.snapshot = null;
  renderProjects();
  $('#project-title').textContent = state.project?.name ?? 'Выберите проект';
  $('#diagram-title').textContent = 'Диаграмма';
  $('#diagram-hint').textContent = 'Выберите диаграмму';
  $('#gantt-table').classList.add('hidden');
  $('#gantt-forms').classList.add('hidden');
  $('#export-json').classList.add('hidden');
  await loadDiagrams();
});

$('#new-project-toggle').addEventListener('click', () => {
  $('#project-form').classList.toggle('hidden');
});

$('#project-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  try {
    await api('/projects', {
      method: 'POST',
      body: { name: data.get('name'), description: data.get('description') },
    });
    form.reset();
    $('#project-form').classList.add('hidden');
    await loadProjects();
  } catch (error) {
    showToast(error.message);
  }
});

async function loadDiagrams() {
  if (!state.project) return;
  const response = await api(`/projects/${state.project.id}/diagrams?limit=100`);
  state.diagrams = response.items ?? [];
  renderDiagrams();
}

function renderDiagrams() {
  const container = $('#diagram-list');
  if (state.diagrams.length === 0) {
    container.innerHTML = '<p class="empty">В проекте пока нет диаграмм.</p>';
    return;
  }
  container.innerHTML = state.diagrams
    .map(
      (diagram) => `
        <button class="list-item ${state.diagram?.id === diagram.id ? 'selected' : ''}" data-diagram="${escapeHtml(diagram.id)}" type="button">
          <span class="item-title">${escapeHtml(diagram.name)}</span>
          <span class="item-meta">${escapeHtml(diagram.dayMode === 'calendar' ? 'Календарь' : 'Рабочие дни')}</span>
        </button>`,
    )
    .join('');
}

$('#new-diagram-toggle').addEventListener('click', () => {
  if (!state.project) {
    showToast('Сначала выберите проект');
    return;
  }
  $('#diagram-form').classList.toggle('hidden');
});

$('#diagram-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.project) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  try {
    await api(`/projects/${state.project.id}/diagrams`, {
      method: 'POST',
      body: {
        name: data.get('name'),
        description: data.get('description'),
        dayMode: 'working',
      },
    });
    form.reset();
    $('#diagram-form').classList.add('hidden');
    await loadDiagrams();
  } catch (error) {
    showToast(error.message);
  }
});

$('#diagram-list').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-diagram]');
  if (!button) return;
  state.diagram = state.diagrams.find((diagram) => diagram.id === button.dataset.diagram) ?? null;
  renderDiagrams();
  await loadSnapshot();
});

async function loadSnapshot() {
  if (!state.diagram) return;
  state.snapshot = await api(`/diagrams/${state.diagram.id}/snapshot`);
  $('#diagram-title').textContent = state.snapshot.diagram.name;
  $('#diagram-hint').textContent = `Ревизия ${state.snapshot.currentRevision}`;
  $('#export-json').href = `/api/v1/diagrams/${state.diagram.id}/export?format=json`;
  $('#export-json').classList.remove('hidden');
  $('#gantt-forms').classList.remove('hidden');
  $('#gantt-table').classList.remove('hidden');
  renderGantt();
}

function statusLabel(status) {
  return (
    {
      planned: 'План',
      in_progress: 'В работе',
      done: 'Готово',
      blocked: 'Блок',
    }[status] ?? status
  );
}

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit' }).format(
    new Date(value),
  );
}

function renderGantt() {
  const snapshot = state.snapshot;
  if (!snapshot) return;
  const tasks = [...(snapshot.tasks ?? [])].sort((a, b) => a.wbsCode.localeCompare(b.wbsCode));
  const directions = [...(snapshot.directions ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const rows = [];

  for (const direction of directions) {
    rows.push(`
      <tr class="direction-row">
        <td>${escapeHtml(direction.wbsCode)}</td>
        <td colspan="6"><strong>${escapeHtml(direction.name)}</strong></td>
      </tr>`);
    for (const task of tasks.filter((item) => item.directionId === direction.id)) {
      const responsible = (task.assignments ?? []).find((item) => item.role === 'responsible');
      const dates = [formatDate(task.startDate), formatDate(task.endDate)]
        .filter(Boolean)
        .join(' - ');
      rows.push(`
        <tr class="${task.level === 3 ? 'child-row' : ''}">
          <td>${escapeHtml(task.wbsCode)}</td>
          <td>${escapeHtml(task.name)}</td>
          <td><span class="status ${escapeHtml(task.status)}">${escapeHtml(statusLabel(task.status))}</span></td>
          <td>
            <div class="progress">
              <span style="width:${Number(task.progress) || 0}%"></span>
            </div>
            <small>${Number(task.progress) || 0}%</small>
          </td>
          <td>${escapeHtml(dates)}</td>
          <td>${escapeHtml(responsible?.displayName ?? '')}</td>
          <td><button class="ghost small" data-progress="${escapeHtml(task.id)}" type="button">+25%</button></td>
        </tr>`);
    }
  }

  const body = $('#gantt-table tbody');
  body.innerHTML =
    rows.join('') || '<tr><td colspan="7" class="empty">Добавьте направление и задачу.</td></tr>';
  const select = $('#task-direction');
  select.innerHTML = directions
    .map(
      (direction) =>
        `<option value="${escapeHtml(direction.id)}">${escapeHtml(direction.wbsCode)} ${escapeHtml(direction.name)}</option>`,
    )
    .join('');
}

$('#gantt-table').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-progress]');
  if (!button) return;
  const task = (state.snapshot?.tasks ?? []).find((item) => item.id === button.dataset.progress);
  if (!task) return;
  const next = Math.min(100, (Number(task.progress) || 0) + 25);
  const status = next >= 100 ? 'done' : 'in_progress';
  try {
    await api(`/tasks/${task.id}/progress`, {
      method: 'PATCH',
      body: { status, progress: next, expectedVersion: task.version },
    });
    await loadSnapshot();
  } catch (error) {
    showToast(error.message);
  }
});

$('#direction-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.diagram) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  try {
    await api(`/diagrams/${state.diagram.id}/directions`, {
      method: 'POST',
      body: { name: data.get('name') },
    });
    form.reset();
    await loadSnapshot();
  } catch (error) {
    showToast(error.message);
  }
});

$('#task-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.diagram) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  try {
    await api(`/diagrams/${state.diagram.id}/tasks`, {
      method: 'POST',
      body: { directionId: data.get('directionId'), name: data.get('name') },
    });
    form.reset();
    await loadSnapshot();
  } catch (error) {
    showToast(error.message);
  }
});

$('#refresh-diagram').addEventListener('click', () => {
  loadSnapshot().catch((error) => showToast(error.message));
});

boot();
