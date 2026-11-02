<script setup>
const tab = ref('login');
const email = ref('');
const password = ref('');
const lastName = ref('');
const firstName = ref('');
const error = ref('');
const message = ref('');
const resetToken = ref('');
const newPassword = ref('');
const showReset = ref(false);

function friendlyError(message) {
  return String(message).includes('session_limit_reached')
    ? 'Достигнут лимит двух активных сессий'
    : message;
}

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

async function finishLogin() {
  const invitation = window.localStorage.getItem('pendingInvitation');
  if (invitation) {
    await api('/invitations/accept', { method: 'POST', body: { token: invitation } }).catch(
      () => {},
    );
    window.localStorage.removeItem('pendingInvitation');
  }
  window.location.href = '/';
}

async function submitLogin() {
  error.value = '';
  try {
    await api('/auth/login', {
      method: 'POST',
      body: { email: email.value, password: password.value },
    });
    await finishLogin();
  } catch (reason) {
    error.value = friendlyError(reason.message);
  }
}

async function submitRegister() {
  error.value = '';
  try {
    await api('/auth/register', {
      method: 'POST',
      body: {
        email: email.value,
        password: password.value,
        lastName: lastName.value,
        firstName: firstName.value,
        displayName: `${lastName.value} ${firstName.value}`.trim(),
      },
    });
    await api('/auth/login', {
      method: 'POST',
      body: { email: email.value, password: password.value },
    });
    await finishLogin();
  } catch (reason) {
    error.value = reason.message;
  }
}

async function requestReset() {
  error.value = '';
  message.value = '';
  try {
    await api('/auth/password/forgot', { method: 'POST', body: { email: email.value } });
    showReset.value = true;
    message.value = 'Ссылка отправлена в Mailpit.';
  } catch (reason) {
    error.value = reason.message;
  }
}

async function resetPassword() {
  error.value = '';
  try {
    await api('/auth/password/reset', {
      method: 'POST',
      body: { token: resetToken.value, newPassword: newPassword.value },
    });
    showReset.value = false;
    message.value = 'Пароль сброшен. Войдите с новым паролем.';
  } catch (reason) {
    error.value = reason.message;
  }
}

async function resendVerification() {
  try {
    await api('/auth/email/resend', { method: 'POST', body: { email: email.value } });
    message.value = 'Письмо отправлено, если регистрация не завершена.';
  } catch (reason) {
    error.value = reason.message;
  }
}

onMounted(async () => {
  const params = new URLSearchParams(window.location.search);
  const verify = params.get('verify');
  const reset = params.get('reset');
  const invitation = params.get('invitation');
  if (invitation) window.localStorage.setItem('pendingInvitation', invitation);
  if (verify) {
    try {
      await api('/auth/email/verify', { method: 'POST', body: { token: verify } });
      message.value = 'Email подтверждён. Войдите.';
    } catch (reason) {
      error.value = reason.message;
    }
  }
  if (reset) {
    resetToken.value = reset;
    showReset.value = true;
  }
  if (verify || reset || invitation) window.history.replaceState({}, '', '/login');
  try {
    await api('/auth/session');
    window.location.href = '/';
  } catch {
    // Stay on the login page.
  }
});
</script>

<template>
  <main id="auth-view" class="auth-page">
    <section class="auth-brand">
      <div class="brand">SMART OATI</div>
      <h1>Планирование, задачи, зависимости и контроль сроков.</h1>
      <p>Проекты, участники, Gantt и уведомления в одном рабочем пространстве.</p>
    </section>

    <section class="auth-card">
      <div class="tabs">
        <button id="login-tab" type="button" :class="{ active: tab === 'login' }" @click="tab = 'login'">
          Вход
        </button>
        <button
          id="register-tab"
          type="button"
          :class="{ active: tab === 'register' }"
          @click="tab = 'register'"
        >
          Регистрация
        </button>
      </div>

      <form v-if="tab === 'login'" id="login-form" class="form" @submit.prevent="submitLogin">
        <label>Email <input v-model="email" name="email" type="email" autocomplete="email" required /></label>
        <label>Пароль <input v-model="password" name="password" type="password" autocomplete="current-password" required /></label>
        <button class="primary" type="submit">Войти</button>
        <button type="button" @click="requestReset">Забыли пароль?</button>
        <button type="button" @click="resendVerification">Отправить подтверждение email</button>
      </form>

      <form v-else id="register-form" class="form" @submit.prevent="submitRegister">
        <label>Email <input v-model="email" name="email" type="email" required /></label>
        <label>Фамилия <input v-model="lastName" name="lastName" required /></label>
        <label>Имя <input v-model="firstName" name="firstName" required /></label>
        <label>Пароль <input v-model="password" name="password" type="password" minlength="8" required /></label>
        <button class="primary" type="submit">Создать аккаунт</button>
      </form>

      <form v-if="showReset" class="form" @submit.prevent="resetPassword">
        <label>Токен <input v-model="resetToken" required /></label>
        <label>Новый пароль <input v-model="newPassword" type="password" minlength="8" required /></label>
        <button class="primary" type="submit">Сбросить пароль</button>
      </form>

      <p v-if="message" class="message">{{ message }}</p>
      <p v-if="error" id="toast" class="error">{{ error }}</p>
      <p class="hint">Локальный администратор: admin@smart-oati.local</p>
    </section>
  </main>
</template>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1fr 420px;
  gap: 48px;
  align-items: center;
  padding: 48px;
  box-sizing: border-box;
  background: #f8fafc;
  color: #1f2937;
  font-family: Inter, system-ui, sans-serif;
}
.auth-brand { max-width: 620px; }
.brand { font-size: 14px; font-weight: 700; letter-spacing: 0.14em; color: #2563eb; }
h1 { margin: 18px 0; font-size: clamp(32px, 5vw, 58px); line-height: 1.05; }
.auth-brand p { color: #64748b; font-size: 18px; }
.auth-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; box-shadow: 0 20px 50px rgb(15 23 42 / 8%); }
.tabs { display: flex; gap: 8px; margin-bottom: 18px; }
.tabs button { flex: 1; background: #f1f5f9; color: #334155; border: 1px solid #e2e8f0; }
.tabs button.active { background: #111827; color: #fff; border-color: #111827; }
.form { display: grid; gap: 12px; }
label { display: grid; gap: 6px; font-size: 13px; color: #475569; }
input, button { font: inherit; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 9px; }
button { background: #f1f5f9; color: #334155; cursor: pointer; }
button.primary { background: #111827; color: #fff; border-color: #111827; }
.error { color: #b91c1c; }
.message { color: #047857; }
.hint { color: #94a3b8; font-size: 12px; }
@media (max-width: 900px) {
  .auth-page { grid-template-columns: 1fr; padding: 24px; gap: 24px; }
  .auth-brand h1 { font-size: 36px; }
}
</style>
