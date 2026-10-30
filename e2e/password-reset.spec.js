import { expect, test } from '@playwright/test';

test('password reset through local mail', async ({ page, context }) => {
  const suffix = Date.now();
  const email = `reset-${suffix}@smart-oati.test`;
  const password = 'ResetPassword123!';
  const newPassword = 'ResetPassword456!';
  const mailPage = await context.newPage();

  await page.goto('/');
  await page.waitForFunction(() => window.__smartOatiReady);
  await page.locator('#register-tab').click();
  await page.locator('#register-form input[name=email]').fill(email);
  await page.locator('#register-form input[name=lastName]').fill('Reset');
  await page.locator('#register-form input[name=firstName]').fill('Tester');
  await page.locator('#register-form input[name=password]').fill(password);
  await page.locator('#register-form button[type=submit]').click();
  await expect(page.locator('#app-view')).toBeVisible({ timeout: 20_000 });
  await page.locator('#logout').click();
  await expect(page.locator('#auth-view')).toBeVisible();

  await page.evaluate(async (userEmail) => {
    const response = await fetch('/api/v1/auth/password/forgot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail }),
    });
    if (!response.ok) throw new Error(await response.text());
  }, email);

  let token;
  await expect
    .poll(
      async () => {
        await mailPage.goto('https://mail.localhost/api/v1/messages');
        const body = JSON.parse(await mailPage.locator('body').innerText());
        const message = body.messages?.find((item) =>
          item.To?.some((recipient) => recipient.Address === email),
        );
        if (!message) return false;
        await mailPage.goto(`https://mail.localhost/api/v1/message/${message.ID}`);
        const payload = JSON.parse(await mailPage.locator('body').innerText());
        token = payload.Text?.match(/reset=([^\s]+)/)?.[1];
        return Boolean(token);
      },
      { timeout: 20_000 },
    )
    .toBe(true);

  await page.evaluate(
    async ({ resetToken, nextPassword }) => {
      const response = await fetch('/api/v1/auth/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, newPassword: nextPassword }),
      });
      if (!response.ok) throw new Error(await response.text());
    },
    { resetToken: token, nextPassword: newPassword },
  );

  await page.locator('#login-tab').click();
  await page.locator('#login-form input[name=email]').fill(email);
  await page.locator('#login-form input[name=password]').fill(newPassword);
  await page.locator('#login-form button[type=submit]').click();
  await expect(page.locator('#app-view')).toBeVisible();
});
