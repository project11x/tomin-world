import { test, expect } from '@playwright/test';

// Critical user-flow coverage. The smoke tests in desktop.spec / mobile.spec
// confirm pages load and apps open; these probe deeper into the actual
// interactions that have historically broken when the JS was refactored.

test.describe('desktop deep flows', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('open finder, switch to list view, switch back to grid', async ({ page }) => {
    await page.goto('/');
    await page.locator('.desktop-icon[data-name="LDN x UKG"]').dblclick();
    const win = page.locator('#desktop-main .app-window').first();
    await expect(win).toBeVisible();

    const btnGrid = win.locator('#btn-view-grid');
    const btnList = win.locator('#btn-view-list');
    await expect(btnGrid).toHaveAttribute('data-active', 'true');
    await expect(btnList).toHaveAttribute('data-active', 'false');

    await btnList.click();
    await expect(btnList).toHaveAttribute('data-active', 'true');
    await expect(btnGrid).toHaveAttribute('data-active', 'false');

    await btnGrid.click();
    await expect(btnGrid).toHaveAttribute('data-active', 'true');
  });

  test('open finder, navigate via favorites sidebar', async ({ page }) => {
    await page.goto('/');
    await page.locator('.desktop-icon[data-name="LDN x UKG"]').dblclick();
    const win = page.locator('#desktop-main .app-window').first();
    await expect(win.locator('.finder-title')).toHaveText('LDN x UKG');

    const milanoLink = win.locator('.favorites-nav a').filter({ hasText: 'milano' }).first();
    await milanoLink.click();
    await expect(win.locator('.finder-title')).toHaveText('milano');
  });

  test('clicking a desktop icon selects it, dblclick opens window', async ({ page }) => {
    await page.goto('/');
    const icon = page.locator('.desktop-icon[data-name="milano"]');
    await icon.click();
    await expect(icon).toHaveClass(/selected/);
    await icon.dblclick();
    await expect(page.locator('#desktop-main .app-window').first()).toBeVisible();
  });

  test('dock contact button opens about-me modal', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-dock="contact"]').dispatchEvent('click');
    await page.waitForTimeout(200);
    const visible = await page
      .locator('#about-me-modal')
      .evaluate((el) => !el.classList.contains('hidden'));
    expect(visible).toBe(true);
  });

  test('multiple windows can be open simultaneously', async ({ page }) => {
    await page.goto('/');
    await page.locator('.desktop-icon[data-name="LDN x UKG"]').dblclick();
    // Second icon may be covered by the first window — bypass hit-testing.
    await page.locator('.desktop-icon[data-name="milano"]').dispatchEvent('dblclick');
    const count = await page.locator('#desktop-main .app-window').count();
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

test.describe('mobile deep flows', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('open Magazines app and close it returns to home', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);
    await page.locator('[data-ios-app="magazines"]').click();
    await page.waitForTimeout(700);
    await expect(page.locator('#ios-magazines-app')).not.toHaveCSS('display', 'none');

    await page.locator('[data-ios-close="magazines"]').click();
    await page.waitForTimeout(800);
    const display = await page
      .locator('#ios-magazines-app')
      .evaluate((el) => getComputedStyle(el).display);
    expect(display).toBe('none');
  });

  test('open Edits app and close it', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);
    await page.locator('[data-ios-app="edits"]').click();
    await page.waitForTimeout(700);
    await expect(page.locator('#ios-edits-app')).not.toHaveCSS('display', 'none');

    await page.locator('[data-ios-close="edits"]').click();
    await page.waitForTimeout(800);
    const display = await page
      .locator('#ios-edits-app')
      .evaluate((el) => getComputedStyle(el).display);
    expect(display).toBe('none');
  });

  test('iOS theme picker switches html.ios-dark class', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);
    // Theme picker lives inside the Contact app — open it first.
    await page.locator('[data-ios-app="contact"]').click();
    await page.waitForTimeout(700);
    await page.locator('[data-ios-theme="dark"]').click();
    await page.waitForTimeout(200);
    await expect(page.locator('html')).toHaveClass(/ios-dark/);

    await page.locator('[data-ios-theme="light"]').click();
    await page.waitForTimeout(200);
    await expect(page.locator('html')).not.toHaveClass(/ios-dark/);
  });

  test('app-icon picker stores choice in localStorage', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);
    // Icon picker also lives inside the Contact app.
    await page.locator('[data-ios-app="contact"]').click();
    await page.waitForTimeout(700);
    await page.locator('[data-app-icon="icons/icon%20alts/MugEddie.png"]').click();
    const stored = await page.evaluate(() => localStorage.getItem('app-icon-choice'));
    expect(stored).toBe('eddie');
  });
});

test.describe('admin page', () => {
  test('admin.html renders panel without passcode', async ({ page }) => {
    await page.goto('/admin.html');
    await expect(page.locator('#adm-save-btn')).toBeVisible();
    await expect(page.locator('#adm-doing-chips .admin-chip').first()).toBeVisible();
    // Old passcode UI is gone.
    expect(await page.locator('.passcode-dot').count()).toBe(0);
  });

  test('admin.html no longer exposes a GitHub PAT field', async ({ page }) => {
    await page.goto('/admin.html');
    // The token now lives server-side as a Pages secret. The form must not ask for it.
    expect(await page.locator('#adm-gh-token').count()).toBe(0);
    expect(await page.locator('#adm-gh-repo').count()).toBe(0);
  });
});
