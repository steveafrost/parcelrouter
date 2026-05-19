import { parseEmail, shouldProcessEmail, ParsedEmail } from '../email-parser';

describe('Email Parser', () => {
  describe('shouldProcessEmail', () => {
    test('returns true for shipping-related subjects', () => {
      expect(shouldProcessEmail('shipping@amazon.com', 'Your order has shipped')).toBe(true);
      expect(shouldProcessEmail('noreply@fedex.com', 'Tracking update')).toBe(true);
    });

    test('returns false for non-shipping emails', () => {
      expect(shouldProcessEmail('news@company.com', 'Monthly newsletter')).toBe(false);
      expect(shouldProcessEmail('billing@unknowncompany.com', 'Your invoice')).toBe(false);
    });

    test('matches known sender domains', () => {
      expect(shouldProcessEmail('tracking@ups.com', 'Package status')).toBe(true);
      expect(shouldProcessEmail('alerts@fedex.com', 'Delivery scheduled')).toBe(true);
    });
  });

  describe('parseEmail', () => {
    test('parses Amazon shipping email', () => {
      const email: ParsedEmail = {
        messageId: '<abc123@amazon.com>',
        from: 'shipping@amazon.com',
        subject: 'Your Amazon.com order has shipped (#112-1234567-1234567)',
        body: 'Your package with TBA123456789012 is on its way!',
        date: new Date(),
      };

      const result = parseEmail(email);
      expect(result).not.toBeNull();
      expect(result?.trackingNumber).toBe('TBA123456789012');
      expect(result?.carrier).toBe('Amazon');
      expect(result?.retailer).toBe('Amazon');
      expect(result?.productName).toBe('Your Amazon.com order has shipped');
    });

    test('parses UPS shipping email', () => {
      const email: ParsedEmail = {
        messageId: '<ups@ups.com>',
        from: 'tracking@ups.com',
        subject: 'UPS Delivery Notification',
        body: 'Tracking Number: 1Z999AA10123456784',
        date: new Date(),
      };

      const result = parseEmail(email);
      expect(result?.trackingNumber).toBe('1Z999AA10123456784');
      expect(result?.carrier).toBe('UPS');
      expect(result?.productName).toBe('UPS Delivery Notification');
    });

    test('uses display sender name for generic shipment subjects', () => {
      const email: ParsedEmail = {
        messageId: '<target@example.com>',
        from: 'noreply@oe.target.com',
        fromName: 'Target',
        subject: 'Your order has shipped',
        body: 'Tracking number 518120992083',
        date: new Date(),
      };

      const result = parseEmail(email);
      expect(result?.trackingNumber).toBe('518120992083');
      expect(result?.carrier).toBe('FedEx');
      expect(result?.retailer).toBe('Target');
      expect(result?.productName).toBe('Target: Your order has shipped');
    });

    test('does not extract order status words as order numbers', () => {
      const email: ParsedEmail = {
        messageId: '<coffee@example.com>',
        from: 'shipping@methodicalcoffee.com',
        subject: 'Your order has been received',
        body: 'USPS Tracking # 9434650899562176786441',
        date: new Date(),
      };

      const result = parseEmail(email);
      expect(result?.trackingNumber).toBe('9434650899562176786441');
      expect(result?.productName).toBe('Methodical Coffee: Your order has been received');
      expect(result?.orderNumber).toBeNull();
    });

    test('falls back to readable domain titles when no display name exists', () => {
      const email: ParsedEmail = {
        messageId: '<ship@example.com>',
        from: 'shipping@blackwhiteroasters.com',
        subject: 'Tracking update',
        body: 'USPS Tracking # 9205590267338801847124',
        date: new Date(),
      };

      const result = parseEmail(email);
      expect(result?.productName).toBe('Black & White Roasters: Tracking update');
    });

    test('returns null when no tracking found', () => {
      const email: ParsedEmail = {
        messageId: '<test@test.com>',
        from: 'test@test.com',
        subject: 'Hello',
        body: 'Just saying hi',
        date: new Date(),
      };

      expect(parseEmail(email)).toBeNull();
    });
  });
});
