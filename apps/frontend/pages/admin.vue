<script setup>
const user = ref(null);
const users = ref([]);
const audit = ref([]);
const settings = ref('[]');
const error = ref('');
const loading = ref(true);
const search = ref('');
const auditAction = ref('');
const auditActor = ref('');
const newUser = ref({ email: '', lastName: '', firstName: '', appAdmin: false });
const executors = ref([]);
const newExecutor = ref({ lastName: '', firstName: '', middleName: '', position: '' });

function csrfToken() {
  return document.cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith('__Host-csrf='))
    ?.slice('__Host-csrf='.length);
}

async function api(path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers ?? {}) };
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

async function loadUsers() {
  const query = new URLSearchParams({ limit: '200' });
  if (search.value) query.set('query', search.value);
  users.value = (await api(`/users?${query}`)).items ?? [];
}

async function loadAudit() {
  const query = new URLSearchParams({ limit: '50' });
  if (auditAction.value) query.set('actionCode', auditAction.value);
  if (auditActor.value) query.set('actorUserId', auditActor.value);
  audit.value = (await api(`/audit/events?${query}`)).items ?? [];
}

async function loadExecutors() {
  executors.value = (await api('/executors?limit=200&includeInactive=true')).items ?? [];
}

async function createExecutor() {
  await run(async () => {
    await api('/executors', { method: 'POST', body: newExecutor.value });
    newExecutor.value = { lastName: '', firstName: '', middleName: '', position: '' };
    await loadExecutors();
  });
}

async function deactivateExecutor(item) {
  await run(async () => {
    await api(`/executors/${item.id}`, { method: 'DELETE' });
    await loadExecutors();
  });
}

async function loadSettings() {
  settings.value = JSON.stringify((await api('/settings')).items ?? [], null, 2);
}

async function boot() {
  try {
    user.value = await api('/auth/session');
    if (!(user.value.globalRoles ?? []).includes('app_admin')) {
      window.location.href = '/';
      return;
    }
    await Promise.all([loadUsers(), loadAudit(), loadSettings(), loadExecutors()]);
  } catch (reason) {
    error.value = reason.message;
  } finally {
    loading.value = false;
  }
}

async function run(action) {
  error.value = '';
  try {
    await action();
  } catch (reason) {
    error.value = reason.message;
  }
}

async function createUser() {
  await run(async () => {
    const created = await api('/admin/users', { method: 'POST', body: newUser.value });
    search.value = created.email;
    newUser.value = { email: '', lastName: '', firstName: '', appAdmin: false };
    await loadUsers();
  });
}

async function toggleAdmin(item) {
  await run(async () => {
    await api(`/admin/users/${item.id}/roles`, {
      method: 'PATCH',
      body: { appAdmin: !(item.globalRoles ?? []).includes('app_admin') },
    });
    await loadUsers();
  });
}

async function toggleBlock(item) {
  await run(async () => {
    await api(`/admin/users/${item.id}/${item.status === 'blocked' ? 'unblock' : 'block'}`, {
      method: 'PATCH',
      body: {},
    });
    await loadUsers();
  });
}

async function deleteUser(item) {
  if (!window.confirm(`Delete ${item.email}?`)) return;
  await run(async () => {
    await api(`/admin/users/${item.id}`, { method: 'DELETE' });
    await loadUsers();
  });
}

async function saveSettings() {
  await run(async () => {
    await api('/settings', { method: 'PUT', body: { items: JSON.parse(settings.value) } });
  });
}

onMounted(boot);
</script>

<template>
  <main class="admin-page">
    <header class="admin-header">
      <div>
        <a href="/" class="back">← Gantt</a>
        <h1>Администрирование</h1>
      </div>
      <span>{{ user?.displayName ?? user?.email }}</span>
    </header>

    <p v-if="loading">Загрузка...</p>
    <p v-if="error" class="error">{{ error }}</p>

    <section class="card">
      <h2>Пользователи</h2>
      <form class="inline" @submit.prevent="createUser">
        <input v-model="newUser.email" type="email" placeholder="Email" required />
        <input v-model="newUser.lastName" placeholder="Фамилия" required />
        <input v-model="newUser.firstName" placeholder="Имя" required />
        <label><input v-model="newUser.appAdmin" type="checkbox" /> Админ</label>
        <button type="submit">Создать</button>
      </form>
      <div class="inline">
        <input v-model="search" placeholder="Поиск" @keyup.enter="loadUsers" />
        <button type="button" @click="loadUsers">Найти</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Пользователь</th><th>Email</th><th>Статус</th><th>Роль</th><th /></tr>
          </thead>
          <tbody>
            <tr v-for="item in users" :key="item.id">
              <td>{{ item.displayName }}</td>
              <td>{{ item.email }}</td>
              <td>{{ item.status === 'blocked' ? 'заблокирован' : 'активен' }}</td>
              <td>{{ (item.globalRoles ?? []).includes('app_admin') ? 'админ' : 'пользователь' }}</td>
              <td class="actions">
                <button type="button" @click="toggleAdmin(item)">
                  {{ (item.globalRoles ?? []).includes('app_admin') ? 'Снять админа' : 'Сделать админом' }}
                </button>
                <button type="button" @click="toggleBlock(item)">
                  {{ item.status === 'blocked' ? 'Разблокировать' : 'Заблокировать' }}
                </button>
                <button type="button" @click="deleteUser(item)">Удалить</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <h2>Каталог исполнителей</h2>
      <form class="inline" @submit.prevent="createExecutor">
        <input v-model="newExecutor.lastName" placeholder="Фамилия" required />
        <input v-model="newExecutor.firstName" placeholder="Имя" required />
        <input v-model="newExecutor.middleName" placeholder="Отчество" />
        <input v-model="newExecutor.position" placeholder="Должность" />
        <button type="submit">Добавить</button>
      </form>
      <div class="table-wrap">
        <table>
          <thead><tr><th>ФИО</th><th>Должность</th><th>Связан с пользователем</th><th /></tr></thead>
          <tbody>
            <tr v-for="item in executors" :key="item.id">
              <td>{{ item.fullName }}</td>
              <td>{{ item.position || '—' }}</td>
              <td>{{ item.linkedUserId || '—' }}</td>
              <td class="actions">
                <button type="button" @click="deactivateExecutor(item)">Деактивировать</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <h2>Audit</h2>
      <div class="inline">
        <input v-model="auditAction" placeholder="Action code" />
        <input v-model="auditActor" placeholder="Actor user id" />
        <button type="button" @click="loadAudit">Применить</button>
      </div>
      <div class="list">
        <div v-for="item in audit" :key="item.id" class="list-item">
          <strong>{{ item.actionCode }}</strong>
          <span>{{ item.actorUserId || 'system' }} · {{ item.severity }} · {{ item.occurredAt }}</span>
        </div>
      </div>
    </section>

    <section class="card">
      <h2>Системные настройки</h2>
      <textarea v-model="settings" rows="12" />
      <button type="button" @click="saveSettings">Сохранить</button>
    </section>
  </main>
</template>

<style scoped>
.admin-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
  color: #1f2937;
  font-family: Inter, system-ui, sans-serif;
}
.admin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}
.back {
  color: #2563eb;
  text-decoration: none;
  font-size: 14px;
}
h1 { margin: 4px 0 0; font-size: 28px; }
h2 { margin: 0 0 16px; font-size: 18px; }
.card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 1px 2px rgb(0 0 0 / 4%);
}
.inline {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 14px;
}
input, textarea, button {
  font: inherit;
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
}
textarea { width: 100%; box-sizing: border-box; font-family: ui-monospace, monospace; }
button {
  background: #111827;
  color: #fff;
  cursor: pointer;
  border-color: #111827;
}
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #e5e7eb; }
.actions { display: flex; gap: 6px; flex-wrap: wrap; }
.actions button { padding: 5px 8px; font-size: 12px; }
.list { display: grid; gap: 8px; max-height: 360px; overflow: auto; }
.list-item { display: grid; gap: 3px; padding: 10px; background: #f9fafb; border-radius: 8px; }
.list-item span { color: #6b7280; font-size: 12px; }
.error { color: #b91c1c; }
@media (max-width: 720px) {
  .admin-page { padding: 14px; }
  .admin-header { align-items: flex-start; flex-direction: column; }
  th:nth-child(4), td:nth-child(4) { display: none; }
}
</style>
