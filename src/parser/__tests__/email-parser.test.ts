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
      expect(result?.productName).toBe('Your Amazon.com order has shipped (#112-1234567-1234567)');
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
