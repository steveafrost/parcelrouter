import type { Database } from 'better-sqlite3';
import { ParcelClient } from '../parcel/client';
import { Package, PackageRepository } from '../db/repositories/package-repository';
import { ParcelSyncRepository } from '../db/repositories/parcel-sync-repository';

export type ParcelSyncResult =
  | { status: 'disabled'; package: Package }
  | { status: 'synced'; package: Package }
  | { status: 'queued'; package: Package; error: string };

export class ParcelSyncService {
  private client: ParcelClient | null;
  private packageRepo: PackageRepository;
  private syncRepo: ParcelSyncRepository;

  constructor(db: Database, apiKey?: string, client?: ParcelClient) {
    this.client = client || (apiKey ? new ParcelClient(apiKey) : null);
    this.packageRepo = new PackageRepository(db);
    this.syncRepo = new ParcelSyncRepository(db);
  }

  get enabled(): boolean {
    return Boolean(this.client);
  }

  async syncPackage(pkg: Package, now: Date = new Date()): Promise<ParcelSyncResult> {
    if (!this.client) return { status: 'disabled', package: pkg };

    try {
      const parcelPackage = await this.client.createPackage({
        trackingNumber: pkg.trackingNumber,
        carrier: pkg.carrier,
        name: pkg.productName || `${pkg.carrier} package`,
      });
      this.packageRepo.updateParcelId(pkg.id, parcelPackage.id);
      this.syncRepo.markSucceeded(pkg.id);
      return { status: 'synced', package: this.packageRepo.findById(pkg.id)! };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.syncRepo.recordFailure(pkg.id, message, now);
      return { status: 'queued', package: pkg, error: message };
    }
  }

  async retryDue(now: Date = new Date()): Promise<ParcelSyncResult[]> {
    if (!this.client) return [];

    const results: ParcelSyncResult[] = [];
    for (const job of this.syncRepo.findDue(now, 5)) {
      const pkg = this.packageRepo.findById(job.packageId);
      if (!pkg) {
        this.syncRepo.markSucceeded(job.packageId);
        continue;
      }
      results.push(await this.syncPackage(pkg, now));
    }
    return results;
  }
}
