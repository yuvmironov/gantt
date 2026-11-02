import { expect, test } from '@playwright/test';

test('nuxt members page renders project owner', async ({ page }) => {
  const suffix = Date.now();
  const email = `members-${suffix}@smart-oati.test`;
  const password = 'MembersPassword123!';
  const projectName = `Members project ${suffix}`;

  await page.goto('/login');
  await page.locator('#register-tab').click();
  await page.locator('#register-form input[name=email]').fill(email);
  await page.locator('#register-form input[name=lastName]').fill('Members');
  await page.locator('#register-form input[name=firstName]').fill('Tester');
  await page.locator('#register-form input[name=password]').fill(password);
  await page.locator('#register-form button[type=submit]').click();
  await expect(page.locator('.gantt-page')).toBeVisible({ timeout: 20_000 });

  const project = await page.evaluate(async (name) => {
    const csrf = document.cookie
      .split(';')
      .map((item) => item.trim())
      .find((item) => item.startsWith('__Host-csrf='))
      ?.slice('__Host-csrf='.length);
    const response = await fetch('/api/v1/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf ?? '' },
      body: JSON.stringify({ name, description: 'members e2e' }),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }, projectName);

  await page.goto(`/members?project=${project.id}`);
  await expect(page.locator('.members-page')).toBeVisible();
  await expect(page.locator('.members-page .list-item')).toContainText(email);
  await expect(page.locator('.members-page h1')).toContainText('Участники');
  await page.locator('.back').click();
  await expect(page.locator('.gantt-page')).toBeVisible();
});
