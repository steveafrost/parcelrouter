import type { Database } from 'better-sqlite3';
import { randomUUID } from 'crypto';

export interface Package {
  id: string;
  trackingNumber: string;
  carrier: string;
  retailer?: string;
  productName?: string;
  orderNumber?: string;
  emailMessageId?: string;
  parcelPackageId?: string;
  confidence?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePackageInput {
  trackingNumber: string;
  carrier: string;
  retailer?: string;
  productName?: string;
  orderNumber?: string;
  emailMessageId?: string;
  parcelPackageId?: string;
  confidence?: string;
}

export class PackageRepository {
  constructor(private db: Database) {}

  create(input: CreatePackageInput): Package {
    const id = randomUUID();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO tracked_packages 
      (id, tracking_number, carrier, retailer, product_name, order_number, email_message_id, parcel_package_id, confidence, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.trackingNumber,
      input.carrier,
      input.retailer || null,
      input.productName || null,
      input.orderNumber || null,
      input.emailMessageId || null,
      input.parcelPackageId || null,
      input.confidence || 'medium',
      now,
      now
    );

    return this.findById(id)!;
  }

  findById(id: string): Package | undefined {
    const row = this.db.prepare('SELECT * FROM tracked_packages WHERE id = ?').get(id);
    return row ? this.mapRow(row) : undefined;
  }

  findByTrackingNumber(trackingNumber: string): Package | undefined {
    const row = this.db.prepare('SELECT * FROM tracked_packages WHERE tracking_number = ?').get(trackingNumber);
    return row ? this.mapRow(row) : undefined;
  }

  findByMessageId(messageId: string): Package | undefined {
    const row = this.db.prepare('SELECT * FROM tracked_packages WHERE email_message_id = ?').get(messageId);
    return row ? this.mapRow(row) : undefined;
  }

  exists(trackingNumber: string): boolean {
    const row = this.db.prepare('SELECT 1 FROM tracked_packages WHERE tracking_number = ?').get(trackingNumber);
    return !!row;
  }

  updateParcelId(id: string, parcelPackageId: string): void {
    this.db.prepare('UPDATE tracked_packages SET parcel_package_id = ?, updated_at = ? WHERE id = ?')
      .run(parcelPackageId, new Date().toISOString(), id);
  }

  findAll(): Package[] {
    const rows = this.db.prepare('SELECT * FROM tracked_packages ORDER BY created_at DESC').all();
    return rows.map(r => this.mapRow(r));
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM tracked_packages WHERE id = ?').run(id);
    return result.changes > 0;
  }

  private mapRow(row: any): Package {
    return {
      id: row.id,
      trackingNumber: row.tracking_number,
      carrier: row.carrier,
      retailer: row.retailer,
      productName: row.product_name,
      orderNumber: row.order_number,
      emailMessageId: row.email_message_id,
      parcelPackageId: row.parcel_package_id,
      confidence: row.confidence,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
