import { expect, test } from '@playwright/test';

test('projects page creates and archives a project', async ({ page }) => {
  const suffix = Date.now();
  const email = `projects-${suffix}@smart-oati.test`;
  const projectName = `Projects UI ${suffix}`;

  await page.goto('/login');
  await page.locator('#register-tab').click();
  await page.locator('#register-form input[name=email]').fill(email);
  await page.locator('#register-form input[name=lastName]').fill('Projects');
  await page.locator('#register-form input[name=firstName]').fill('Tester');
  await page.locator('#register-form input[name=password]').fill('Projects123!');
  await page.locator('#register-form button[type=submit]').click();
  await expect(page.locator('.projects-page')).toBeVisible({ timeout: 20_000 });

  await page.goto('/projects');
  await expect(page.locator('.projects-page')).toBeVisible();
  await page.getByRole('button', { name: '＋ Создать проект' }).click();
  await page.locator('.modal-card input').fill(projectName);
  await page.locator('.modal-card textarea').fill('Описание проекта');
  await page.locator('.modal-card button[type=submit]').click();
  await expect(page.locator('.project-row')).toContainText(projectName);

  page.once('dialog', (dialog) => dialog.accept());
  await page
    .locator('.project-row')
    .filter({ hasText: projectName })
    .locator('.actions-cell button')
    .click();
  await page.locator('.project-menu button').filter({ hasText: 'Архивировать' }).click();
  await expect(page.locator('.project-row')).toHaveCount(0);
  await page.getByRole('button', { name: /Архив/ }).click();
  await expect(page.locator('.project-row')).toContainText(projectName);
});
