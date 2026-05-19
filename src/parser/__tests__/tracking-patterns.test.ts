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

    test('does not treat order status words as order numbers', () => {
      const text = 'Your order has shipped. Tracking number: 518120992083';
      expect(extractTrackingNumber(text)).toBe('518120992083');
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

    test('rejects labeled order numbers near shipping text', () => {
      const text = 'Your order number: 518120992083 has shipped';
      expect(extractTrackingNumber(text)).toBeNull();
    });

    test('does not extract CSS class names as OnTrac tracking', () => {
      // CSS class names like "CssUnusedSymbol" should NOT match
      // because OnTrac tracking numbers are numeric only: C12345678901234
      expect(extractTrackingNumber('class="CssUnusedSymbol"')).toBeNull();
      expect(extractTrackingNumber('.CssUnusedSymbol')).toBeNull();
      expect(extractTrackingNumber('ctYLaNJQQOSKnX6')).toBeNull(); // Mixed case string
      expect(extractTrackingNumber('cl7AzeL1XsYoV9y')).toBeNull(); // Mixed case string
    });

    test('extracts valid OnTrac tracking number', () => {
      // OnTrac numbers: C followed by 14 digits (exactly 15 chars total)
      expect(extractTrackingNumber('C12345678901234')).toBe('C12345678901234');
      expect(extractTrackingNumber('Your OnTrac tracking C98765432109876')).toBe('C98765432109876');
    });

    test('does not match lowercase Amazon prefixes', () => {
      // Amazon tracking numbers must be uppercase: TBA, TBC, TBM
      expect(extractTrackingNumber('tba123456789012')).toBeNull();
      expect(extractTrackingNumber('tbc123456789012')).toBeNull();
      expect(extractTrackingNumber('tbm123456789012')).toBeNull();
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
