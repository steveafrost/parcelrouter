import { initDb, closeDb } from '../connection';
import { ReviewRepository } from '../repositories/review-repository';

describe('ReviewRepository', () => {
  let repo: ReviewRepository;

  beforeEach(() => {
    const db = initDb(':memory:');
    repo = new ReviewRepository(db);
  });

  afterEach(() => {
    closeDb();
  });

  test('create inserts pending review item', () => {
    const item = repo.create({
      trackingNumber: '123456789012',
      carrier: 'FedEx',
      productName: 'Possible delivery',
      emailMessageId: '<review@example.com>',
      sourceFrom: 'shipper@example.com',
      sourceSubject: 'Tracking update',
      confidence: 'medium',
      reason: 'Medium confidence detections require review before sync.',
    });

    expect(item.id).toBeDefined();
    expect(item.status).toBe('pending');
    expect(item.trackingNumber).toBe('123456789012');
  });

  test('pendingExists checks message id and tracking number', () => {
    repo.create({
      trackingNumber: '123456789012',
      carrier: 'FedEx',
      confidence: 'medium',
      reason: 'Needs review',
      emailMessageId: '<review@example.com>',
    });

    expect(repo.pendingExists({ trackingNumber: '123456789012' })).toBe(true);
    expect(repo.pendingExists({ trackingNumber: '999999999999', emailMessageId: '<review@example.com>' })).toBe(true);
    expect(repo.pendingExists({ trackingNumber: '999999999999' })).toBe(false);
  });

  test('updateStatus marks item approved', () => {
    const item = repo.create({
      trackingNumber: '123456789012',
      carrier: 'FedEx',
      confidence: 'medium',
      reason: 'Needs review',
    });

    const updated = repo.updateStatus(item.id, 'approved');
    expect(updated?.status).toBe('approved');
    expect(repo.findPending()).toHaveLength(0);
  });
});
