import { expect, test } from '@playwright/test';

test('nuxt admin page renders users and settings', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__smartOatiReady);
  await page.locator('#login-form input[name=email]').fill('admin@smart-oati.local');
  await page.locator('#login-form input[name=password]').fill('ChangeMeDevOnly!');
  await page.locator('#login-form button[type=submit]').click();
  await expect(page.locator('#app-view')).toBeVisible();

  await page.goto('/admin');
  await expect(page.locator('.admin-page')).toBeVisible();
  await expect(page.locator('.admin-page table')).toBeVisible();
  await expect(page.locator('.admin-page textarea')).toBeVisible();
  await expect(page.locator('.admin-page .list')).toBeVisible();
  await page.locator('.admin-page .back').click();
  await expect(page.locator('#app-view')).toBeVisible();
  await page.locator('#logout').click();
});
