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
    return { projectId: project.id, diagramId: diagram.id, taskId: task.id };
  }, taskName);

  await page.goto(`/gantt?project=${ids.projectId}&diagram=${ids.diagramId}`);
  await expect(page.locator('.gantt-page')).toBeVisible();
  await page.locator('.gantt-page tbody tr').filter({ hasText: taskName }).click();
  await expect(page.locator('.drawer')).toBeVisible();
  await page.locator('.drawer input[type=number]').fill('25');
  await page.locator('.drawer button').filter({ hasText: 'Сохранить' }).click();
  await page.locator('.comment-form textarea').fill('Vue comment');
  await page.locator('.comment-form button').click();
  await expect(page.locator('.comments')).toContainText('Vue comment');
  await page.locator('.back').click();
  await expect(page.locator('#app-view')).toBeVisible();
  await page.locator('#logout').click();
});
