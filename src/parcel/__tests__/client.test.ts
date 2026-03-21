import { ParcelClient } from '../client';

// Note: These tests require real Parcel API key
// Set SKIP_PARCEL_TESTS=true to skip
const skipTests = process.env.SKIP_PARCEL_TESTS === 'true';

(skipTests ? describe.skip : describe)('ParcelClient Integration', () => {
  let client: ParcelClient;

  beforeEach(() => {
    const apiKey = process.env.PARCEL_API_KEY;
    if (!apiKey) {
      throw new Error('PARCEL_API_KEY must be set for integration tests');
    }
    client = new ParcelClient(apiKey);
  });

  test('constructor stores api key', () => {
    expect(client).toBeDefined();
  });

  test('throws error for unsupported getPackage', async () => {
    await expect(client.getPackage('123')).rejects.toThrow('does not support');
  });

  test('throws error for unsupported deletePackage', async () => {
    await expect(client.deletePackage('123')).rejects.toThrow('does not support');
  });
});

describe('ParcelClient Unit', () => {
  test('constructor stores api key', () => {
    const client = new ParcelClient('test-api-key');
    expect(client).toBeDefined();
  });
});
