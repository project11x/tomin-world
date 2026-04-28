import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('mobile: iOS screen is visible, desktop hidden', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#ios-screen')).toBeVisible();
});

test('mobile: dock has visible items', async ({ page }) => {
  await page.goto('/');
  const dockItems = page.locator('.ios-dock-item:visible');
  expect(await dockItems.count()).toBeGreaterThanOrEqual(3);
});

async function clickDockApp(page, app) {
  await page.locator(`[data-ios-app="${app}"]`).click();
  await page.waitForTimeout(700);
}

async function getDisplay(page, selector) {
  return page.locator(selector).evaluate((el) => getComputedStyle(el).display);
}

test('mobile: opening Magazines app reveals it', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(500);
  await clickDockApp(page, 'magazines');
  expect(await getDisplay(page, '#ios-magazines-app')).not.toBe('none');
});

test('mobile: opening Edits app reveals it', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(500);
  await clickDockApp(page, 'edits');
  expect(await getDisplay(page, '#ios-edits-app')).not.toBe('none');
});

test('mobile: opening Contact app reveals it', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(500);
  await clickDockApp(page, 'contact');
  expect(await getDisplay(page, '#ios-contact-app')).not.toBe('none');
});

test('mobile: opening BTS app reveals it', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(500);
  await clickDockApp(page, 'bts');
  expect(await getDisplay(page, '#ios-bts-app')).not.toBe('none');
});
