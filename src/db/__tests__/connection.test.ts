import { getDb, initDb, closeDb } from '../connection';

describe('Database Connection', () => {
  afterEach(() => {
    closeDb();
  });

  test('initDb creates tables', () => {
    const db = initDb(':memory:');
    expect(db).toBeDefined();
    expect(typeof db.prepare).toBe('function');
    
    // Check tables exist
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all() as { name: string }[];
    
    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('tracked_packages');
    expect(tableNames).toContain('tracking_events');
    expect(tableNames).toContain('last_poll');
  });

  test('getDb returns same instance', () => {
    initDb(':memory:');
    const db1 = getDb();
    const db2 = getDb();
    expect(db1).toBe(db2);
  });
});
