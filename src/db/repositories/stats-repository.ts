import type { Database } from 'better-sqlite3';

export interface Stats {
  emailsRead: number;
  packagesCreated: number;
  updatedAt: Date;
}

export class StatsRepository {
  constructor(private db: Database) {}

  getStats(): Stats {
    const row = this.db.prepare('SELECT emails_read, packages_created, updated_at FROM stats WHERE id = 1').get() as {
      emails_read: number;
      packages_created: number;
      updated_at: string;
    } | undefined;

    if (!row) {
      // Initialize if not exists
      this.db.prepare('INSERT OR IGNORE INTO stats (id, emails_read, packages_created) VALUES (1, 0, 0)').run();
      return { emailsRead: 0, packagesCreated: 0, updatedAt: new Date() };
    }

    return {
      emailsRead: row.emails_read,
      packagesCreated: row.packages_created,
      updatedAt: new Date(row.updated_at),
    };
  }

  incrementEmailsRead(count: number = 1): void {
    this.db.prepare(
      'UPDATE stats SET emails_read = emails_read + ?, updated_at = ? WHERE id = 1'
    ).run(count, new Date().toISOString());
  }

  incrementPackagesCreated(count: number = 1): void {
    this.db.prepare(
      'UPDATE stats SET packages_created = packages_created + ?, updated_at = ? WHERE id = 1'
    ).run(count, new Date().toISOString());
  }

  reset(): void {
    this.db.prepare(
      'UPDATE stats SET emails_read = 0, packages_created = 0, updated_at = ? WHERE id = 1'
    ).run(new Date().toISOString());
  }
}
