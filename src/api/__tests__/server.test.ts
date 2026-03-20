import request from 'supertest';
import { createServer } from '../server';
import { initDb, closeDb } from '../../db/connection';

describe('API Server', () => {
  let app: ReturnType<typeof createServer>;

  beforeEach(() => {
    initDb(':memory:');
    app = createServer();
  });

  afterEach(() => {
    closeDb();
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
});
