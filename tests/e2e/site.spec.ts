import { expect, test } from '@playwright/test';

test.describe('marketing site', () => {
  test('renders the desktop header with current navigation and generated logo', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/ParcelRouter/);
    await expect(page.getByRole('link', { name: 'ParcelRouter home' })).toBeVisible();

    const logoLoaded = await page.locator('.brand-mark').evaluate((image) => {
      const img = image as HTMLImageElement;
      return img.complete && img.naturalWidth > 0 && img.currentSrc.includes('/assets/parcelrouter-icon.png');
    });
    expect(logoLoaded).toBe(true);

    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toContainText('Compare');
    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).not.toContainText('Why different');

    await page.getByRole('link', { name: 'Compare' }).click();
    await expect(page).toHaveURL(/#different$/);
    await expect(page.getByRole('heading', { name: 'Not a shopping app' })).toBeVisible();
  });

  test('serves browser icon assets and a valid web manifest', async ({ request }) => {
    const favicon = await request.get('/favicon-32.png');
    expect(favicon.ok()).toBe(true);
    expect(favicon.headers()['content-type']).toContain('image/png');

    const icon = await request.get('/assets/parcelrouter-icon.png');
    expect(icon.ok()).toBe(true);
    expect(icon.headers()['content-type']).toContain('image/png');

    const manifest = await request.get('/site.webmanifest');
    expect(manifest.ok()).toBe(true);
    const body = await manifest.json();
    expect(body.icons?.[0]?.src).toBe('/apple-touch-icon.png');
  });

  test('does not introduce horizontal overflow on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const layout = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      badgeHeight: document.querySelector('.status-pill')?.getBoundingClientRect().height || 0
    }));

    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
    expect(layout.badgeHeight).toBeLessThanOrEqual(34);
    await expect(page.getByText('2 to review')).toBeVisible();
  });
});
