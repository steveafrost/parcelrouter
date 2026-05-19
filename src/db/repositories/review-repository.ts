import type { Database } from 'better-sqlite3';
import { randomUUID } from 'crypto';

export type ReviewStatus = 'pending' | 'approved' | 'ignored';

export interface ReviewItem {
  id: string;
  trackingNumber: string;
  carrier: string;
  retailer?: string;
  productName?: string;
  orderNumber?: string;
  emailMessageId?: string;
  sourceFrom?: string;
  sourceSubject?: string;
  confidence: string;
  reason: string;
  status: ReviewStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateReviewItemInput {
  trackingNumber: string;
  carrier: string;
  retailer?: string;
  productName?: string;
  orderNumber?: string;
  emailMessageId?: string;
  sourceFrom?: string;
  sourceSubject?: string;
  confidence: string;
  reason: string;
}

export class ReviewRepository {
  constructor(private db: Database) {}

  create(input: CreateReviewItemInput): ReviewItem {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO review_items
      (id, tracking_number, carrier, retailer, product_name, order_number, email_message_id, source_from, source_subject, confidence, reason, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(
      id,
      input.trackingNumber,
      input.carrier,
      input.retailer || null,
      input.productName || null,
      input.orderNumber || null,
      input.emailMessageId || null,
      input.sourceFrom || null,
      input.sourceSubject || null,
      input.confidence,
      input.reason,
      now,
      now
    );

    return this.findById(id)!;
  }

  findById(id: string): ReviewItem | undefined {
    const row = this.db.prepare('SELECT * FROM review_items WHERE id = ?').get(id);
    return row ? this.mapRow(row) : undefined;
  }

  findPendingByTrackingNumber(trackingNumber: string): ReviewItem | undefined {
    const row = this.db.prepare(
      "SELECT * FROM review_items WHERE tracking_number = ? AND status = 'pending'"
    ).get(trackingNumber);
    return row ? this.mapRow(row) : undefined;
  }

  findPendingByMessageId(messageId: string): ReviewItem | undefined {
    const row = this.db.prepare(
      "SELECT * FROM review_items WHERE email_message_id = ? AND status = 'pending'"
    ).get(messageId);
    return row ? this.mapRow(row) : undefined;
  }

  pendingExists(input: { trackingNumber: string; emailMessageId?: string }): boolean {
    if (input.emailMessageId && this.findPendingByMessageId(input.emailMessageId)) {
      return true;
    }
    return Boolean(this.findPendingByTrackingNumber(input.trackingNumber));
  }

  findPending(): ReviewItem[] {
    const rows = this.db.prepare(
      "SELECT * FROM review_items WHERE status = 'pending' ORDER BY created_at DESC"
    ).all();
    return rows.map(row => this.mapRow(row));
  }

  updateStatus(id: string, status: ReviewStatus): ReviewItem | undefined {
    this.db.prepare('UPDATE review_items SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, new Date().toISOString(), id);
    return this.findById(id);
  }

  private mapRow(row: any): ReviewItem {
    return {
      id: row.id,
      trackingNumber: row.tracking_number,
      carrier: row.carrier,
      retailer: row.retailer,
      productName: row.product_name,
      orderNumber: row.order_number,
      emailMessageId: row.email_message_id,
      sourceFrom: row.source_from,
      sourceSubject: row.source_subject,
      confidence: row.confidence,
      reason: row.reason,
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
