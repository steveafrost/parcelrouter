import { expect, test } from '@playwright/test';
import type { Server } from 'http';
import { createServer } from '../../src/api/server';
import { closeDb, getDb, initDb } from '../../src/db/connection';
import { PackageRepository } from '../../src/db/repositories/package-repository';
import { ReviewRepository } from '../../src/db/repositories/review-repository';
import { StatsRepository } from '../../src/db/repositories/stats-repository';

test.describe('ParcelRouter app dashboard', () => {
  let server: Server;
  let appUrl: string;
  let reviewItemId: string;

  test.beforeEach(async () => {
    delete process.env.WEBHOOK_URL;
    delete process.env.PARCEL_API_KEY;
    closeDb();
    initDb(':memory:');

    const db = getDb();
    const packageRepo = new PackageRepository(db);
    const reviewRepo = new ReviewRepository(db);
    const statsRepo = new StatsRepository(db);

    packageRepo.create({
      trackingNumber: '1Z999AA10123456784',
      carrier: 'UPS',
      retailer: 'Target',
      productName: 'Target shipment',
      confidence: 'high',
    });
    const reviewItem = reviewRepo.create({
      trackingNumber: '94001112062119654321',
      carrier: 'USPS',
      retailer: 'Coffee Co',
      productName: 'Coffee subscription',
      confidence: 'medium',
      reason: 'Medium confidence detections are held for review before sync or automation.',
      sourceFrom: 'shipping@coffee.example',
      sourceSubject: 'Your coffee order shipped',
    });
    reviewItemId = reviewItem.id;
    statsRepo.incrementEmailsRead(2);
    statsRepo.incrementPackagesCreated(1);

    const app = createServer();
    server = await new Promise<Server>((resolve) => {
      const started = app.listen(0, '127.0.0.1', () => resolve(started));
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected test server to listen on a TCP port');
    }
    appUrl = `http://127.0.0.1:${address.port}`;
  });

  test.afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    closeDb();
  });

  test('approves a review item, shows it as a delivery, and deletes a delivery', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());

    await page.goto(appUrl);

    await expect(page.getByText('Online')).toBeVisible();
    await expect(page.locator('#parcelSyncStatus')).toHaveText('Local');
    await expect(page.locator('#emailsRead')).toHaveText('2');
    await expect(page.locator('#packagesCreated')).toHaveText('1');
    await expect(page.getByText('Target shipment')).toBeVisible();
    await expect(page.getByText('Coffee subscription')).toBeVisible();
    await expect(page.getByText('94001112062119654321')).toBeVisible();

    const reviewCard = page.locator('.package-card.low-confidence').filter({
      hasText: '94001112062119654321',
    });
    await reviewCard.getByRole('button', { name: 'Approve' }).click();

    await expect(reviewCard).toHaveCount(0);
    await expect(page.locator('.package-card').filter({ hasText: 'Coffee subscription' })).toBeVisible();

    const packagesResponse = await page.request.get(`${appUrl}/packages`);
    expect(packagesResponse.ok()).toBe(true);
    const packages = await packagesResponse.json();
    expect(packages.map((pkg: { trackingNumber: string }) => pkg.trackingNumber)).toEqual(
      expect.arrayContaining(['1Z999AA10123456784', '94001112062119654321'])
    );

    const approvedPackage = packages.find((pkg: { trackingNumber: string }) => pkg.trackingNumber === '94001112062119654321');
    expect(approvedPackage).toBeTruthy();
    await page.locator('.package-card').filter({ hasText: '94001112062119654321' }).getByRole('button', { name: 'Remove' }).click();

    await expect.poll(async () => {
      const afterDeleteResponse = await page.request.get(`${appUrl}/packages`);
      expect(afterDeleteResponse.ok()).toBe(true);
      const afterDelete = await afterDeleteResponse.json();
      return afterDelete.map((pkg: { trackingNumber: string }) => pkg.trackingNumber);
    }).not.toContain('94001112062119654321');
  });

  test('ignores review items through the API and hides them from pending review', async ({ request }) => {
    const ignoreResponse = await request.post(`${appUrl}/review/${reviewItemId}/ignore`);
    expect(ignoreResponse.ok()).toBe(true);
    await expect.poll(async () => {
      const pendingResponse = await request.get(`${appUrl}/review`);
      const pending = await pendingResponse.json();
      return pending.length;
    }).toBe(0);
  });
});
