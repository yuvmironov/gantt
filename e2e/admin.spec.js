import { expect, test } from '@playwright/test';

test('admin manages executors and blocked users', async ({ page, browser }) => {
  const suffix = Date.now();
  const blockedEmail = `blocked-${suffix}@smart-oati.test`;
  const password = 'BlockedPassword123!';
  const executorName = `Executor${suffix}`;
  const managedEmail = `managed-${suffix}@smart-oati.test`;

  await page.goto('/');
  await page.waitForFunction(() => window.__smartOatiReady);
  await page.locator('#login-form input[name=email]').fill('admin@smart-oati.local');
  await page.locator('#login-form input[name=password]').fill('ChangeMeDevOnly!');
  await page.locator('#login-form button[type=submit]').click();
  await expect(page.locator('#app-view')).toBeVisible();
  await expect(page.locator('#admin-toggle')).toBeVisible();
  await expect(page.locator('#executors-toggle')).toBeVisible();

  const realtimeRejected = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const socket = new window.WebSocket('wss://sync.localhost/ws');
        const timer = setTimeout(() => resolve(false), 5000);
        socket.addEventListener('open', () => {
          clearTimeout(timer);
          resolve(false);
        });
        socket.addEventListener('error', () => {
          clearTimeout(timer);
          resolve(true);
        });
      }),
  );
  expect(realtimeRejected).toBe(true);

  await page.locator('#executors-toggle').click();
  await expect(page.locator('#executors-modal')).toBeVisible();
  await page.locator('#executor-form input[name=lastName]').fill(executorName);
  await page.locator('#executor-form input[name=firstName]').fill('Admin');
  await page.locator('#executor-form input[name=position]').fill('Tester');
  await page.locator('#executor-form button[type=submit]').click();
  await expect(page.locator('#executor-list')).toContainText(executorName);
  await page.locator('#executors-close').click();

  await page.locator('#admin-toggle').click();
  await page.locator('#admin-create-form input[name=email]').fill(managedEmail);
  await page.locator('#admin-create-form input[name=lastName]').fill('Managed');
  await page.locator('#admin-create-form input[name=firstName]').fill('User');
  await page.locator('#admin-create-form button[type=submit]').click();
  const managedRow = page.locator('#admin-user-list .list-item').filter({ hasText: managedEmail });
  await expect(managedRow).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await managedRow.locator('[data-admin-delete]').click();
  await expect(managedRow.locator('[data-admin-block]')).toHaveAttribute(
    'data-admin-block-action',
    'unblock',
  );

  await page.evaluate(
    async ({ email, secret }) => {
      const response = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password: secret,
          lastName: 'Blocked',
          firstName: 'User',
          displayName: 'Blocked User',
        }),
      });
      if (!response.ok) throw new Error(await response.text());
    },
    { email: blockedEmail, secret: password },
  );

  await page.locator('#admin-user-search').fill(blockedEmail);
  const blockedRow = page.locator('#admin-user-list .list-item').filter({ hasText: blockedEmail });
  await expect(blockedRow).toBeVisible();
  await blockedRow.locator('[data-admin-block]').click();
  await expect(blockedRow.locator('[data-admin-block]')).toHaveAttribute(
    'data-admin-block-action',
    'unblock',
  );

  const blockedContext = await browser.newContext({
    baseURL: 'https://app.localhost',
    ignoreHTTPSErrors: true,
  });
  const blockedPage = await blockedContext.newPage();
  await blockedPage.goto('/');
  await blockedPage.waitForFunction(() => window.__smartOatiReady);
  await blockedPage.locator('#login-form input[name=email]').fill(blockedEmail);
  await blockedPage.locator('#login-form input[name=password]').fill(password);
  await blockedPage.locator('#login-form button[type=submit]').click();
  await expect(blockedPage.locator('#auth-view')).toBeVisible();
  await expect(blockedPage.locator('#toast')).toContainText('account_blocked');
  await blockedContext.close();

  await blockedRow.locator('[data-admin-block]').click();
  await expect(blockedRow.locator('[data-admin-block]')).toHaveAttribute(
    'data-admin-block-action',
    'block',
  );
  await page.locator('#admin-close').click();
  await page.locator('#logout').click();
});
