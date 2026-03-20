import { initDb, closeDb } from '../connection';
import { PackageRepository } from '../repositories/package-repository';

describe('PackageRepository', () => {
  let repo: PackageRepository;

  beforeEach(() => {
    const db = initDb(':memory:');
    repo = new PackageRepository(db);
  });

  afterEach(() => {
    closeDb();
  });

  test('create inserts package', () => {
    const pkg = repo.create({
      trackingNumber: '1Z999AA10123456784',
      carrier: 'UPS',
      retailer: 'Amazon',
      productName: 'Your order has shipped',
      emailMessageId: '<abc123@amazon.com>',
    });

    expect(pkg.id).toBeDefined();
    expect(pkg.trackingNumber).toBe('1Z999AA10123456784');
    expect(pkg.carrier).toBe('UPS');
  });

  test('findByTrackingNumber returns package', () => {
    repo.create({
      trackingNumber: '1Z999AA10123456784',
      carrier: 'UPS',
    });

    const found = repo.findByTrackingNumber('1Z999AA10123456784');
    expect(found).toBeDefined();
    expect(found?.carrier).toBe('UPS');
  });

  test('findByMessageId returns package', () => {
    repo.create({
      trackingNumber: '1Z999AA10123456784',
      carrier: 'UPS',
      emailMessageId: '<unique@email.com>',
    });

    const found = repo.findByMessageId('<unique@email.com>');
    expect(found).toBeDefined();
  });

  test('exists returns true for existing tracking', () => {
    repo.create({
      trackingNumber: '1Z999AA10123456784',
      carrier: 'UPS',
    });

    expect(repo.exists('1Z999AA10123456784')).toBe(true);
    expect(repo.exists('NONEXISTENT')).toBe(false);
  });
});
