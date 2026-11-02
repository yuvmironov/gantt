import { expect, test } from '@playwright/test';

test('nuxt gantt page renders tasks and drawer', async ({ page }) => {
  const suffix = Date.now();
  const email = `gantt-${suffix}@smart-oati.test`;
  const password = 'GanttPassword123!';
  const taskName = `Vue task ${suffix}`;

  await page.goto('/login');
  await page.locator('#register-tab').click();
  await page.locator('#register-form input[name=email]').fill(email);
  await page.locator('#register-form input[name=lastName]').fill('Gantt');
  await page.locator('#register-form input[name=firstName]').fill('Tester');
  await page.locator('#register-form input[name=password]').fill(password);
  await page.locator('#register-form button[type=submit]').click();
  await expect(page.locator('#app-view')).toBeVisible({ timeout: 20_000 });

  const ids = await page.evaluate(async (name) => {
    const csrf = document.cookie
      .split(';')
      .map((item) => item.trim())
      .find((item) => item.startsWith('__Host-csrf='))
      ?.slice('__Host-csrf='.length);
    const headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf ?? '' };
    const post = (path, body) =>
      fetch(`/api/v1${path}`, { method: 'POST', headers, body: JSON.stringify(body) }).then(
        (response) => response.json(),
      );
    const project = await post('/projects', {
      name: `Gantt project ${Date.now()}`,
      description: 'e2e',
    });
    const diagram = await post(`/projects/${project.id}/diagrams`, {
      name: 'Vue Gantt',
      dayMode: 'working',
    });
    const direction = await post(`/diagrams/${diagram.id}/directions`, { name: 'Direction' });
    const task = await post(`/diagrams/${diagram.id}/tasks`, {
      directionId: direction.id,
      name,
      priority: 'medium',
    });
    const successor = await post(`/diagrams/${diagram.id}/tasks`, {
      directionId: direction.id,
      name: `${name} successor`,
      priority: 'medium',
    });
    return {
      projectId: project.id,
      diagramId: diagram.id,
      taskId: task.id,
      successorId: successor.id,
    };
  }, taskName);

  await page.goto(`/gantt?project=${ids.projectId}&diagram=${ids.diagramId}`);
  await expect(page.locator('.gantt-page')).toBeVisible();
  await page.locator('.gantt-page tbody tr').filter({ hasText: taskName }).first().click();
  await expect(page.locator('.drawer')).toBeVisible();
  await page.locator('.drawer input[type=number]').fill('25');
  await page.locator('.drawer button').filter({ hasText: 'Сохранить' }).click();
  await expect(page.locator('.drawer input[type=number]')).toHaveValue('25');
  await page.locator('.comment-form textarea').fill('Vue comment');
  await page.locator('.comment-form button').click();
  await expect(page.locator('.comments')).toContainText('Vue comment');
  await page.locator('.manage select').nth(0).selectOption(ids.taskId);
  await page.locator('.manage select').nth(1).selectOption(ids.successorId);
  await page.locator('.manage button').filter({ hasText: 'Добавить связь' }).click();
  await expect(page.locator('.manage')).toContainText('→');
  await page.locator('.manage input[type=date]').fill('2026-01-02');
  await page.locator('.manage input[placeholder=Название]').fill('E2E holiday');
  await page.locator('.manage button').filter({ hasText: 'Добавить праздник' }).click();
  await expect(page.locator('.manage')).toContainText('E2E holiday');
  await page.locator('.back').click();
  await expect(page.locator('#app-view')).toBeVisible();
  await page.locator('#logout').click();
});
