import { test, expect } from '@playwright/test';

test('index loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Blossom Fire Demo/i })).toBeVisible();
});

test('viewer slideshow boots and shows requested status', async ({ page }) => {
  await page.goto('/view.html?stream=demo1');
  await expect(page.locator('#stream')).toHaveText('demo1');
  await expect(page.locator('#npub')).not.toHaveText('');
  await expect(page.locator('#status')).toContainText(/requested access/i, { timeout: 10_000 });
});

test('viewer video boots and shows requested status', async ({ page, browserName }) => {
  // WebKit can be flaky for MSE/WebM; keep this Chromium/Firefox-oriented.
  test.skip(browserName === 'webkit', 'MSE/WebM support varies');

  await page.goto('/view-video.html?stream=demo1');
  await expect(page.locator('#stream')).toHaveText('demo1');
  await expect(page.locator('#npub')).not.toHaveText('');
  await expect(page.locator('#v')).toBeVisible();
  await expect(page.locator('#status')).toContainText(/requested access/i, { timeout: 10_000 });
});
