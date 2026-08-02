import { randomUUID } from 'crypto';
import type { Database } from 'better-sqlite3';

export type ParcelSyncStatus = 'pending' | 'failed';

export interface ParcelSyncJob {
  id: string;
  packageId: string;
  attempts: number;
  status: ParcelSyncStatus;
  nextAttemptAt: Date;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

const RETRY_DELAYS_MS = [60 * 60 * 1000, 4 * 60 * 60 * 1000, 24 * 60 * 60 * 1000];
const MAX_ATTEMPTS = 5;

export class ParcelSyncRepository {
  constructor(private db: Database) {}

  recordFailure(packageId: string, error: string, now: Date = new Date()): ParcelSyncJob {
    const existing = this.findByPackageId(packageId);
    const attempts = (existing?.attempts || 0) + 1;
    const status: ParcelSyncStatus = attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
    const delayIndex = Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1);
    const nextAttemptAt = new Date(now.getTime() + RETRY_DELAYS_MS[delayIndex]);
    const timestamp = now.toISOString();

    this.db.prepare(`
      INSERT INTO parcel_sync_jobs
        (id, package_id, attempts, status, next_attempt_at, last_error, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(package_id) DO UPDATE SET
        attempts = excluded.attempts,
        status = excluded.status,
        next_attempt_at = excluded.next_attempt_at,
        last_error = excluded.last_error,
        updated_at = excluded.updated_at
    `).run(
      existing?.id || randomUUID(),
      packageId,
      attempts,
      status,
      nextAttemptAt.toISOString(),
      error,
      existing?.createdAt.toISOString() || timestamp,
      timestamp
    );

    return this.findByPackageId(packageId)!;
  }

  findByPackageId(packageId: string): ParcelSyncJob | undefined {
    const row = this.db.prepare(
      'SELECT * FROM parcel_sync_jobs WHERE package_id = ?'
    ).get(packageId);
    return row ? this.mapRow(row) : undefined;
  }

  findDue(now: Date = new Date(), limit: number = 20): ParcelSyncJob[] {
    const rows = this.db.prepare(`
      SELECT * FROM parcel_sync_jobs
      WHERE status = 'pending' AND next_attempt_at <= ?
      ORDER BY next_attempt_at ASC
      LIMIT ?
    `).all(now.toISOString(), limit);
    return rows.map(row => this.mapRow(row));
  }

  markSucceeded(packageId: string): void {
    this.db.prepare('DELETE FROM parcel_sync_jobs WHERE package_id = ?').run(packageId);
  }

  retryNow(packageId: string, now: Date = new Date()): boolean {
    const result = this.db.prepare(`
      UPDATE parcel_sync_jobs
      SET status = 'pending', next_attempt_at = ?, updated_at = ?
      WHERE package_id = ?
    `).run(now.toISOString(), now.toISOString(), packageId);
    return result.changes > 0;
  }

  countPending(): number {
    const row = this.db.prepare(
      "SELECT COUNT(*) AS count FROM parcel_sync_jobs WHERE status = 'pending'"
    ).get() as { count: number };
    return row.count;
  }

  countFailed(): number {
    const row = this.db.prepare(
      "SELECT COUNT(*) AS count FROM parcel_sync_jobs WHERE status = 'failed'"
    ).get() as { count: number };
    return row.count;
  }

  private mapRow(row: any): ParcelSyncJob {
    return {
      id: row.id,
      packageId: row.package_id,
      attempts: row.attempts,
      status: row.status,
      nextAttemptAt: new Date(row.next_attempt_at),
      lastError: row.last_error || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
