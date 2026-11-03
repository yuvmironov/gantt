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
  await expect(page.locator('.gantt-page')).toBeVisible({ timeout: 20_000 });

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
      directionId: direction.id,
      taskId: task.id,
      successorId: successor.id,
    };
  }, taskName);

  await page.goto(`/gantt?project=${ids.projectId}&diagram=${ids.diagramId}`);
  await expect(page.locator('.gantt-page')).toBeVisible();
  await expect(page.locator('.sync-status')).toHaveText('Синхронизировано');
  await page.locator('.gantt-row-label').filter({ hasText: taskName }).first().click();
  await expect(page.locator('.drawer')).toBeVisible();
  await page.locator('.drawer .inline input[type=number]').fill('25');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.locator('.drawer .inline input[type=number]')).toHaveValue('25');
  await page.locator('.comment-form textarea').fill('Vue comment');
  await page.locator('.comment-form button').click();
  await expect(page.locator('.comments')).toContainText('Vue comment');
  await page.locator('.gantt-drawer .btn-icon').click();
  await page.locator('.dep-predecessor').selectOption(ids.taskId);
  await page.locator('.dep-successor').selectOption(ids.successorId);
  await page.locator('.manage button').filter({ hasText: 'Добавить связь' }).click();
  await expect(page.locator('.manage')).toContainText('→');
  await page.locator('.manage input[type=date]').fill('2026-01-02');
  await page.locator('.manage input[placeholder=Название]').fill('E2E holiday');
  await page.locator('.manage button').filter({ hasText: 'Добавить праздник' }).click();
  await expect(page.locator('.manage')).toContainText('E2E holiday');
  const createdName = `Created ${suffix}`;
  await page.locator('.task-direction').selectOption(ids.directionId);
  await page.locator('.manage input[placeholder="Название задачи"]').fill(createdName);
  await page.locator('.manage button').filter({ hasText: 'Создать задачу' }).click();
  await expect(page.locator('.gantt-labels')).toContainText(createdName);
  await page.locator('.gantt-row-label').filter({ hasText: createdName }).click();
  await page.locator('.drawer input[placeholder="Название задачи"]').fill(`${createdName} edited`);
  await page.locator('.drawer button').filter({ hasText: 'Сохранить задачу' }).click();
  await expect(page.locator('.gantt-labels')).toContainText(`${createdName} edited`);
  await page
    .locator('.gantt-row-label')
    .filter({ hasText: `${createdName} edited` })
    .click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('.drawer button').filter({ hasText: 'Удалить задачу' }).click();
  await expect(page.locator('.gantt-labels')).not.toContainText(`${createdName} edited`);
  await expect(page.locator('nav')).toContainText('Участники');
});
