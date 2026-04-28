import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 900 } });

const ignoredErrors = [
  /OneSignal/i,
  /onesignal\.com/i,
  /Failed to load resource/i,
];

function attachConsoleSentinel(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (ignoredErrors.some((re) => re.test(text))) return;
    errors.push(`console.error: ${text}`);
  });
  return errors;
}

test('desktop: page loads with no unexpected errors', async ({ page }) => {
  const errors = attachConsoleSentinel(page);
  await page.goto('/');
  await expect(page.locator('#desktop-main')).toBeVisible();
  await expect(page.locator('.desktop-icon').first()).toBeVisible();
  expect(await page.locator('.desktop-icon').count()).toBeGreaterThanOrEqual(10);
  await page.waitForTimeout(500);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('desktop: portfolio data is loaded (verified via dynamic import)', async ({ page }) => {
  await page.goto('/');
  const ok = await page.evaluate(async () => {
    const mod = await import('/data.js');
    return typeof mod.portfolioData === 'object' && Object.keys(mod.portfolioData).length > 5;
  });
  expect(ok).toBe(true);
});

test('desktop: theme toggle switches dark class', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
  });
  await page.click('#theme-toggle');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.click('#theme-toggle');
  await expect(page.locator('html')).not.toHaveClass(/dark/);
});

test('desktop: double-click icon opens finder window', async ({ page }) => {
  await page.goto('/');
  const icon = page.locator('.desktop-icon[data-name="LDN x UKG"]');
  await icon.dblclick();
  const win = page.locator('#desktop-main .app-window').first();
  await expect(win).toBeVisible();
  await expect(win.locator('.finder-title')).toHaveText('LDN x UKG');
});

test('desktop: clicking Hide Dock menu item flips dock visibility', async ({ page }) => {
  await page.goto('/');
  const before = await page.locator('#macos-dock').evaluate((el) => getComputedStyle(el).opacity);
  await page.locator('#btn-toggle-dock').dispatchEvent('click');
  await page.waitForTimeout(400);
  const after = await page.locator('#macos-dock').evaluate((el) => getComputedStyle(el).opacity);
  expect(after).not.toBe(before);
});
