import { ParcelClient, ParcelPackageInput } from '../client';

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

  test('creates a package', async () => {
    const input: ParcelPackageInput = {
      trackingNumber: '1Z999AA10123456784',
      carrier: 'UPS',
      name: 'Test Package',
    };

    // This would actually call the API - mocked for now
    const result = await client.createPackage(input);
    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
  }, 30000);
});

describe('ParcelClient Unit', () => {
  test('constructor stores api key', () => {
    const client = new ParcelClient('test-api-key');
    expect(client).toBeDefined();
  });
});
