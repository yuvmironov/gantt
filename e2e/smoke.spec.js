import { expect, test } from '@playwright/test';

test('local Vue MVP workflow', async ({ page }) => {
  const suffix = Date.now();
  const email = `mvp-${suffix}@smart-oati.test`;
  const password = 'MvpPassword123!';
  const projectName = `MVP project ${suffix}`;
  const diagramName = `MVP diagram ${suffix}`;
  const directionName = `MVP direction ${suffix}`;
  const taskName = `MVP task ${suffix}`;

  await page.goto('/login');
  await page.locator('#register-tab').click();
  await page.locator('#register-form input[name=email]').fill(email);
  await page.locator('#register-form input[name=lastName]').fill('MVP');
  await page.locator('#register-form input[name=firstName]').fill('Tester');
  await page.locator('#register-form input[name=password]').fill(password);
  await page.locator('#register-form button[type=submit]').click();
  await expect(page.locator('.gantt-page')).toBeVisible({ timeout: 20_000 });

  await page.getByPlaceholder('Название проекта').fill(projectName);
  await page.locator('.empty-project button').click();
  await expect(page.locator('.empty-project')).toContainText('диаграмму');
  await page.getByPlaceholder('Название диаграммы').fill(diagramName);
  await page.locator('.empty-project button').click();
  await expect(page.locator('.gantt-page')).toContainText(diagramName);

  await page.locator('.manage input[placeholder="Название направления"]').fill(directionName);
  await page.locator('.manage button').filter({ hasText: 'Создать направление' }).click();
  await expect(page.locator('.task-direction')).toContainText(directionName);

  const directionValue = await page.locator('.task-direction option').nth(1).getAttribute('value');
  await page.locator('.task-direction').selectOption(directionValue);
  await page.locator('.manage input[placeholder="Название задачи"]').fill(taskName);
  await page.locator('.manage button').filter({ hasText: 'Создать задачу' }).click();
  await expect(page.locator('.gantt-labels')).toContainText(taskName);

  await page
    .locator('.gantt-row-label')
    .filter({ hasText: taskName })
    .locator('.label-name')
    .click();
  await expect(page.locator('.drawer')).toBeVisible();
  await expect(page.locator('.drawer')).toContainText(taskName);
});
