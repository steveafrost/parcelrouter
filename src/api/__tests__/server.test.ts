import request from 'supertest';
import { createServer } from '../server';
import { getDb, initDb, closeDb } from '../../db/connection';
import { ReviewRepository } from '../../db/repositories/review-repository';

describe('API Server', () => {
  let app: ReturnType<typeof createServer>;
  const originalWebhookUrl = process.env.WEBHOOK_URL;
  const originalAuthToken = process.env.PARCEL_TRACKER_AUTH_TOKEN;

  beforeEach(() => {
    delete process.env.WEBHOOK_URL;
    process.env.PARCEL_TRACKER_AUTH_TOKEN = 'test-token';
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
    if (originalAuthToken) {
      process.env.PARCEL_TRACKER_AUTH_TOKEN = originalAuthToken;
    } else {
      delete process.env.PARCEL_TRACKER_AUTH_TOKEN;
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
      .set('Authorization', 'Bearer test-token')
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });

  test('dashboard API rejects missing or invalid bearer tokens', async () => {
    await request(app)
      .get('/packages')
      .expect(401);

    await request(app)
      .get('/packages')
      .set('Authorization', 'Bearer wrong-token')
      .expect(401);
  });

  test('dashboard API fails closed when auth token is not configured', async () => {
    delete process.env.PARCEL_TRACKER_AUTH_TOKEN;
    const unauthenticatedApp = createServer();

    await request(unauthenticatedApp)
      .get('/packages')
      .expect(503);
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
      .set('Authorization', 'Bearer test-token')
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
      .set('Authorization', 'Bearer test-token')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.package.trackingNumber).toBe('123456789012');

    const packages = await request(app)
      .get('/packages')
      .set('Authorization', 'Bearer test-token')
      .expect(200);
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
      .set('Authorization', 'Bearer test-token')
      .expect(200);

    expect(response.body.success).toBe(true);

    const review = await request(app)
      .get('/review')
      .set('Authorization', 'Bearer test-token')
      .expect(200);
    expect(review.body).toHaveLength(0);
  });
});
