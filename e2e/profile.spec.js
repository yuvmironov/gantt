import { expect, test } from '@playwright/test';

test('profile, notification preferences and telegram linking', async ({ page }) => {
  const suffix = Date.now();
  const email = `profile-${suffix}@smart-oati.test`;
  const password = 'ProfilePassword123!';

  await page.goto('/');
  await page.waitForFunction(() => window.__smartOatiReady);
  await page.locator('#register-tab').click();
  await page.locator('#register-form input[name=email]').fill(email);
  await page.locator('#register-form input[name=lastName]').fill('Profile');
  await page.locator('#register-form input[name=firstName]').fill('Tester');
  await page.locator('#register-form input[name=password]').fill(password);
  await page.locator('#register-form button[type=submit]').click();
  await expect(page.locator('#app-view')).toBeVisible({ timeout: 20_000 });

  await page.locator('#profile-toggle').click();
  await expect(page.locator('#profile-modal')).toBeVisible();
  await expect(page.locator('#profile-form input[name=displayName]')).toHaveValue('Profile Tester');
  await page.locator('#profile-form input[name=displayName]').fill('Profile Updated');
  await page.locator('#profile-form button[type=submit]').click();
  await expect
    .poll(async () => {
      const profile = await page.evaluate(async () => {
        const response = await fetch('/api/v1/users/me', { cache: 'no-store' });
        return response.json();
      });
      return profile.displayName;
    })
    .toBe('Profile Updated');

  await page.locator('#preferences-form input[name=email]').check();
  await page.locator('#preferences-form button[type=submit]').click();
  await expect
    .poll(async () => {
      const preferences = await page.evaluate(async () => {
        const response = await fetch('/api/v1/notifications/preferences', { cache: 'no-store' });
        return response.json();
      });
      return preferences.items.some((item) => item.channel === 'email' && item.enabled);
    })
    .toBe(true);

  page.once('dialog', (dialog) => dialog.accept(String(suffix)));
  await page.locator('#telegram-code').click();
  await expect
    .poll(async () => {
      const linked = await page.evaluate(async () => {
        const response = await fetch('/api/v1/users/me/contacts', { cache: 'no-store' });
        return response.json();
      });
      return linked.telegramLinked;
    })
    .toBe(true);

  await page.locator('#telegram-unlink').click();
  await expect
    .poll(async () => {
      const unlinked = await page.evaluate(async () => {
        const response = await fetch('/api/v1/users/me/contacts', { cache: 'no-store' });
        return response.json();
      });
      return unlinked.telegramLinked;
    })
    .toBe(false);

  await page.locator('#profile-close').click();
  await page.locator('#logout').click();
});
