import request from 'supertest';
import { createServer } from '../server';
import { getDb, initDb, closeDb } from '../../db/connection';
import { ReviewRepository } from '../../db/repositories/review-repository';

describe('API Server', () => {
  let app: ReturnType<typeof createServer>;
  const originalWebhookUrl = process.env.WEBHOOK_URL;

  beforeEach(() => {
    delete process.env.WEBHOOK_URL;
    initDb(':memory:');
    app = createServer();
  });

  afterEach(() => {
    closeDb();
    if (originalWebhookUrl) {
      process.env.WEBHOOK_URL = originalWebhookUrl;
    } else {
      delete process.env.WEBHOOK_URL;
    }
  });

  test('GET /health returns ok', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.timestamp).toBeDefined();
  });

  test('GET /packages returns array', async () => {
    const response = await request(app)
      .get('/packages')
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });

  test('GET /review returns pending review items', async () => {
    const reviewRepo = new ReviewRepository(getDb());
    reviewRepo.create({
      trackingNumber: '123456789012',
      carrier: 'FedEx',
      confidence: 'medium',
      reason: 'Needs review',
    });

    const response = await request(app)
      .get('/review')
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].trackingNumber).toBe('123456789012');
  });

  test('POST /review/:id/approve creates package', async () => {
    const reviewRepo = new ReviewRepository(getDb());
    const item = reviewRepo.create({
      trackingNumber: '123456789012',
      carrier: 'FedEx',
      confidence: 'medium',
      reason: 'Needs review',
      productName: 'Possible package',
    });

    const response = await request(app)
      .post(`/review/${item.id}/approve`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.package.trackingNumber).toBe('123456789012');

    const packages = await request(app).get('/packages').expect(200);
    expect(packages.body).toHaveLength(1);
  });

  test('POST /review/:id/ignore removes item from pending queue', async () => {
    const reviewRepo = new ReviewRepository(getDb());
    const item = reviewRepo.create({
      trackingNumber: '123456789012',
      carrier: 'FedEx',
      confidence: 'medium',
      reason: 'Needs review',
    });

    const response = await request(app)
      .post(`/review/${item.id}/ignore`)
      .expect(200);

    expect(response.body.success).toBe(true);

    const review = await request(app).get('/review').expect(200);
    expect(review.body).toHaveLength(0);
  });
});
