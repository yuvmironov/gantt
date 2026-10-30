import { expect, test } from '@playwright/test';

test('local Gantt workflow', async ({ page, browser }) => {
  const suffix = Date.now();
  const email = `e2e-${suffix}@smart-oati.test`;
  const password = 'E2ePassword123!';
  const projectName = `E2E project ${suffix}`;
  const diagramName = `E2E diagram ${suffix}`;
  const directionName = `E2E direction ${suffix}`;
  const firstTask = `E2E task A ${suffix}`;
  const secondTask = `E2E task B ${suffix}`;

  await page.goto('/');
  await expect(page.locator('#auth-view')).toBeVisible();

  await page.locator('#register-tab').click();
  await page.locator('#register-form input[name=email]').fill(email);
  await page.locator('#register-form input[name=lastName]').fill('E2E');
  await page.locator('#register-form input[name=firstName]').fill('Tester');
  await page.locator('#register-form input[name=password]').fill(password);
  await page.locator('#register-form button[type=submit]').click();

  await expect(page.locator('#app-view')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#current-user')).toContainText('E2E');
  await expect(page.locator('#diagram-title')).toHaveText('Диаграмма');
  await expect(page.locator('#diagram-hint')).toHaveText('Выберите диаграмму');

  await page.locator('#new-project-toggle').click();
  await page.locator('#project-form input[name=name]').fill(projectName);
  await page.locator('#project-form button[type=submit]').click();
  const project = page.locator('[data-project]').filter({ hasText: projectName });
  await expect(project).toBeVisible();
  await project.click();
  await expect(page.locator('#project-title')).toHaveText(projectName);

  await page.locator('#new-diagram-toggle').click();
  await page.locator('#diagram-form input[name=name]').fill(diagramName);
  await page.locator('#diagram-form button[type=submit]').click();
  const diagram = page.locator('[data-diagram]').filter({ hasText: diagramName });
  await expect(diagram).toBeVisible();
  await diagram.click();
  await expect(page.locator('#diagram-title')).toHaveText(diagramName);
  await expect(page.locator('#gantt-table')).toBeVisible();

  await page.locator('#direction-form input[name=name]').fill(directionName);
  await page.locator('#direction-form button[type=submit]').click();
  await expect(page.locator('.direction-row')).toContainText(directionName);

  const taskForm = page.locator('#task-form');
  await taskForm.locator('input[name=name]').fill(firstTask);
  await taskForm.locator('button[type=submit]').click();
  await expect(
    page.locator('[data-task-open]').filter({ hasText: firstTask }).first(),
  ).toBeVisible();
  await taskForm.locator('input[name=name]').fill(secondTask);
  await taskForm.locator('button[type=submit]').click();
  await expect(
    page.locator('[data-task-open]').filter({ hasText: secondTask }).first(),
  ).toBeVisible();

  await page.locator('[data-task-open]').filter({ hasText: firstTask }).first().click();
  await expect(page.locator('#task-drawer')).toBeVisible();
  await expect(page.locator('#task-drawer-title')).toContainText(firstTask);
  await expect(page.locator('#assignment-person option').first()).toBeAttached();
  await page.locator('#assignment-person').selectOption({ index: 0 });
  await page.locator('#assignment-add').click();
  await expect(page.locator('#assignment-list .assignment-item')).toBeVisible();

  await page.locator('#task-progress').fill('25');
  await page.locator('#task-status').selectOption('in_progress');
  await page.locator('#task-progress-save').click();
  await expect(page.locator('#toast')).toContainText('Прогресс');

  await page.locator('#comment-form textarea').fill('E2E comment');
  await page.locator('#comment-form button[type=submit]').click();
  await expect(page.locator('#comment-list')).toContainText('E2E comment');
  await page.locator('#task-drawer-close').click();

  await page.locator('#dependency-predecessor').selectOption({ index: 0 });
  await page.locator('#dependency-successor').selectOption({ index: 1 });
  await page.locator('#dependency-form button[type=submit]').click();
  await expect(page.locator('#dependency-list .dependency-item')).toBeVisible();

  await page.locator('#holiday-form input[name=date]').fill('2030-12-31');
  await page.locator('#holiday-form input[name=name]').fill('E2E holiday');
  await page.locator('#holiday-form button[type=submit]').click();
  await expect(page.locator('#holiday-list')).toContainText('2030-12-31');

  await page.locator('#task-search').fill(firstTask);
  await expect(
    page.locator('[data-task-open]').filter({ hasText: firstTask }).first(),
  ).toBeVisible();
  await expect(page.locator('[data-task-open]').filter({ hasText: secondTask })).toBeHidden();
  await page.locator('#clear-filters').click();
  await expect(
    page.locator('[data-task-open]').filter({ hasText: secondTask }).first(),
  ).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export-json').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('.json');

  await page.locator('#sessions-toggle').click();
  await expect(page.locator('#sessions-modal')).toBeVisible();
  await expect(page.locator('#session-list .list-item')).toBeVisible();
  await page.locator('#sessions-close').click();

  const secondSession = await page.evaluate(
    async ({ login, secret }) => {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: login, password: secret }),
      });
      return { status: response.status, body: await response.text() };
    },
    { login: email, secret: password },
  );
  expect(secondSession.status, secondSession.body).toBe(200);
  const thirdSession = await page.evaluate(
    async ({ login, secret }) => {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: login, password: secret }),
      });
      return { status: response.status, body: await response.text() };
    },
    { login: email, secret: password },
  );
  expect(thirdSession.status, thirdSession.body).toBe(409);

  const limitedContext = await browser.newContext({
    baseURL: 'https://app.localhost',
    ignoreHTTPSErrors: true,
  });
  const limitedPage = await limitedContext.newPage();
  await limitedPage.goto('/');
  await limitedPage.locator('#login-form input[name=email]').fill(email);
  await limitedPage.locator('#login-form input[name=password]').fill(password);
  await limitedPage.locator('#login-form button[type=submit]').click();
  await expect(limitedPage.locator('#toast')).toContainText('Достигнут лимит двух активных сессий');
  await limitedContext.close();
});
