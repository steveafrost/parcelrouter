import { closeDb, getDb, initDb } from '../../db/connection';
import { PackageRepository } from '../../db/repositories/package-repository';
import { ParcelSyncRepository } from '../../db/repositories/parcel-sync-repository';
import { ParcelClient } from '../../parcel/client';
import { ParcelSyncService } from '../parcel-sync-service';

describe('ParcelSyncService', () => {
  beforeEach(() => {
    closeDb();
    initDb(':memory:');
  });

  afterEach(() => {
    closeDb();
  });

  test('persists a failed sync and completes it on a later retry', async () => {
    const pkg = new PackageRepository(getDb()).create({
      trackingNumber: '1Z999AA10123456784',
      carrier: 'UPS',
      productName: 'Test package',
    });
    const createPackage = jest.fn()
      .mockRejectedValueOnce(new Error('Parcel unavailable'))
      .mockResolvedValueOnce({ id: 'parcel-delivery-1' });
    const client = { createPackage } as unknown as ParcelClient;
    const service = new ParcelSyncService(getDb(), 'api-key', client);
    const now = new Date('2026-08-01T12:00:00Z');

    await expect(service.syncPackage(pkg, now)).resolves.toEqual(expect.objectContaining({
      status: 'queued',
      error: 'Parcel unavailable',
    }));

    const syncRepo = new ParcelSyncRepository(getDb());
    expect(syncRepo.findByPackageId(pkg.id)).toEqual(expect.objectContaining({
      attempts: 1,
      status: 'pending',
    }));

    const retryTime = new Date('2026-08-01T13:00:01Z');
    await expect(service.retryDue(retryTime)).resolves.toEqual([
      expect.objectContaining({ status: 'synced' }),
    ]);

    expect(syncRepo.findByPackageId(pkg.id)).toBeUndefined();
    expect(new PackageRepository(getDb()).findById(pkg.id)?.parcelPackageId).toBe('parcel-delivery-1');
  });

  test('stops automatically retrying after five failed attempts', () => {
    const pkg = new PackageRepository(getDb()).create({
      trackingNumber: '94001112062119654321',
      carrier: 'USPS',
    });
    const syncRepo = new ParcelSyncRepository(getDb());

    for (let attempt = 0; attempt < 5; attempt++) {
      syncRepo.recordFailure(pkg.id, 'still unavailable', new Date(2026, 7, 1, attempt));
    }

    expect(syncRepo.findByPackageId(pkg.id)).toEqual(expect.objectContaining({
      attempts: 5,
      status: 'failed',
    }));
    expect(syncRepo.findDue(new Date(2027, 0, 1))).toHaveLength(0);
  });
});
