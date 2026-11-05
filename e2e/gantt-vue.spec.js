import { expect, test } from '@playwright/test';

test('nuxt gantt page renders tasks and edit modal', async ({ page }) => {
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
  const alignment = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect();
    const labelHead = rect('.gantt-label-head');
    const timeHead = rect('.gantt-time-head');
    const row = rect('.gantt-row-label.task');
    const bar = rect('.gantt-bar:not(.direction-bar)');
    return {
      headerDelta: Math.abs(labelHead.height - timeHead.height),
      rowBarDelta: Math.abs(row.top + row.height / 2 - (bar.top + bar.height / 2)),
    };
  });
  expect(alignment.headerDelta).toBeLessThanOrEqual(1);
  expect(alignment.rowBarDelta).toBeLessThanOrEqual(5);
  await page.getByTitle('Создать задачу в направлении').first().click();
  await expect(page.locator('.task-modal')).toBeVisible();
  await expect(page.locator('.task-modal-direction')).toHaveValue(ids.directionId);
  await page.locator('.task-modal-head .btn-icon').click();
  await page.getByTitle('Редактировать направление').first().click();
  await expect(page.locator('.direction-modal')).toBeVisible();
  await page.locator('.direction-modal-name').fill(`Direction ${suffix}`);
  await page.locator('.direction-modal button').filter({ hasText: 'Сохранить' }).click();
  await expect(page.locator('.gantt-labels')).toContainText(`Direction ${suffix}`);
  await page
    .locator('.gantt-row-label')
    .filter({ hasText: taskName })
    .first()
    .locator('.label-name')
    .click();
  await expect(page.locator('.task-modal')).toBeVisible();
  await expect(page.locator('.task-modal')).toContainText('Редактирование задачи');
  await page.locator('.task-modal-progress').fill('25');
  await page.locator('.task-modal-status').selectOption('done');
  await page
    .locator('.task-modal-actions')
    .getByRole('button', { name: 'Сохранить', exact: true })
    .click();
  await expect(page.locator('.task-modal')).toHaveCount(0);
  await expect(page.locator('.gantt-labels')).toContainText('Готово');
  await page
    .locator('.gantt-row-label')
    .filter({ hasText: taskName })
    .first()
    .locator('.label-name')
    .click();
  await page.locator('.task-modal-status').selectOption('postponed');
  await page
    .locator('.task-modal-actions')
    .getByRole('button', { name: 'Сохранить', exact: true })
    .click();
  await expect(page.locator('.task-modal')).toHaveCount(0);
  await expect(page.locator('.gantt-labels')).toContainText('Отложено');
  await page
    .locator('.gantt-row-label')
    .filter({ hasText: taskName })
    .first()
    .locator('.label-name')
    .click();
  await page
    .locator('.task-modal-comments textarea[placeholder="Новый комментарий"]')
    .fill('Vue comment');
  await page.getByRole('button', { name: 'Добавить комментарий' }).click();
  await expect(page.locator('.task-modal-comments')).toContainText('Vue comment');
  await page.locator('.task-modal-head .btn-icon').click();
  const linkButton = page.locator('.gantt-toolbar button').filter({ hasText: 'Связать' });
  await linkButton.click();
  const bars = page.locator('.gantt-bar:not(.direction-bar)');
  await bars.first().click();
  await expect(page.locator('.gantt-bar.link-source')).toHaveCount(1);
  await expect(page.locator('.link-hint')).toContainText('последователя');
  await bars.nth(1).click();
  await expect(linkButton).not.toHaveClass(/active/);
  await expect(page.locator('.gantt-bar.link-source')).toHaveCount(0);
  await page.locator('.dep-hit').first().click({ force: true });
  await expect(page.locator('.dependency-modal')).toBeVisible();
  await page.locator('.dependency-line-style').selectOption('dashed');
  await page.locator('.dependency-modal button').filter({ hasText: 'Сохранить' }).click();
  await expect(page.locator('.dependency-modal')).toHaveCount(0);
  await page.locator('.dep-hit').first().hover({ force: true });
  await expect(page.locator('.gantt-bar.dep-linked')).toHaveCount(2);
  await page.locator('.gantt-toolbar button').filter({ hasText: 'Связи' }).click();
  await expect(page.locator('.dependency-manager')).toBeVisible();
  await expect(page.locator('.dependency-list-item')).toHaveCount(1);
  await page.locator('.dependency-modal-head .btn-icon').click();
  await page.locator('.dep-predecessor').selectOption(ids.taskId);
  await page.locator('.dep-successor').selectOption(ids.successorId);
  await page.locator('.manage button').filter({ hasText: 'Добавить связь' }).click();
  await expect(page.locator('.manage')).toContainText('→');
  await page.locator('.manage input[type=date]').fill('2026-01-02');
  await page.locator('.manage input[placeholder=Название]').fill('E2E holiday');
  await page.locator('.manage button').filter({ hasText: 'Добавить праздник' }).click();
  await expect(page.locator('.manage')).toContainText('E2E holiday');
  const createdName = `Created ${suffix}`;
  await page.locator('.gantt-toolbar button').filter({ hasText: 'Задача' }).click();
  await page.locator('.task-modal-direction').selectOption(ids.directionId);
  await page.locator('.task-modal-name').fill(createdName);
  await page.locator('.task-modal button').filter({ hasText: 'Создать задачу' }).click();
  await expect(page.locator('.task-modal')).toHaveCount(0);
  await expect(page.locator('.gantt-labels')).toContainText(createdName);
  await page
    .locator('.gantt-row-label')
    .filter({ hasText: createdName })
    .locator('.label-name')
    .click();
  await expect(page.locator('.task-modal')).toBeVisible();
  await page.locator('.task-modal-name').fill(`${createdName} edited`);
  await page.locator('.task-modal-actions').getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.locator('.task-modal')).toHaveCount(0);
  await expect(page.locator('.gantt-labels')).toContainText(`${createdName} edited`);
  await page
    .locator('.gantt-row-label')
    .filter({ hasText: `${createdName} edited` })
    .locator('.label-name')
    .click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('.task-modal .btn-danger').click();
  await expect(page.locator('.task-modal')).toHaveCount(0);
  await expect(page.locator('.gantt-labels')).not.toContainText(`${createdName} edited`);
  await expect(page.locator('nav')).toContainText('Участники');
});
