import { extractTrackingNumber, detectCarrier } from '../tracking-patterns';

describe('Tracking Pattern Extraction', () => {
  describe('extractTrackingNumber', () => {
    test('extracts UPS tracking', () => {
      const text = 'Your UPS tracking number is 1Z999AA10123456784';
      expect(extractTrackingNumber(text)).toBe('1Z999AA10123456784');
    });

    test('extracts FedEx 12-digit', () => {
      const text = 'Track: 123456789012';
      expect(extractTrackingNumber(text)).toBe('123456789012');
    });

    test('extracts FedEx 15-digit', () => {
      const text = 'Tracking: 123456789012345';
      expect(extractTrackingNumber(text)).toBe('123456789012345');
    });

    test('extracts USPS', () => {
      const text = 'USPS Tracking # 9400100000000000000000';
      expect(extractTrackingNumber(text)).toBe('9400100000000000000000');
    });

    test('extracts Amazon TBA', () => {
      const text = 'Your Amazon order TBA123456789012';
      expect(extractTrackingNumber(text)).toBe('TBA123456789012');
    });

    test('returns null for no match', () => {
      expect(extractTrackingNumber('No tracking here')).toBeNull();
    });

    test('prefers first match when multiple', () => {
      const text = 'UPS: 1Z999AA10123456784 and FedEx: 123456789012';
      expect(extractTrackingNumber(text)).toBe('1Z999AA10123456784');
    });
  });

  describe('detectCarrier', () => {
    test('detects UPS from number', () => {
      expect(detectCarrier('1Z999AA10123456784')).toBe('UPS');
    });

    test('detects FedEx from 12-digit', () => {
      expect(detectCarrier('123456789012')).toBe('FedEx');
    });

    test('detects USPS', () => {
      expect(detectCarrier('9400100000000000000000')).toBe('USPS');
    });

    test('detects Amazon', () => {
      expect(detectCarrier('TBA123456789012')).toBe('Amazon');
    });

    test('returns Unknown for unmatched', () => {
      expect(detectCarrier('ABC123')).toBe('Unknown');
    });
  });
});
