export interface TrackingPattern {
  carrier: string;
  pattern: RegExp;
}

// Order matters - more specific patterns first
export const TRACKING_PATTERNS: TrackingPattern[] = [
  // UPS - starts with 1Z followed by 16 alphanumeric
  { carrier: 'UPS', pattern: /\b(1Z[A-Z0-9]{16})\b/i },
  
  // Amazon Logistics
  { carrier: 'Amazon', pattern: /\b(TBA[A-Z0-9]{12})\b/i },
  { carrier: 'Amazon', pattern: /\b(TBC[A-Z0-9]{12})\b/i },
  { carrier: 'Amazon', pattern: /\b(TBM[A-Z0-9]{12})\b/i },
  
  // FedEx - 12 or 15 digits
  { carrier: 'FedEx', pattern: /\b(\d{12})\b/ },
  { carrier: 'FedEx', pattern: /\b(\d{15})\b/ },
  
  // USPS - 20-22 digits or XX123456789XX format
  { carrier: 'USPS', pattern: /\b(\d{20,22})\b/ },
  { carrier: 'USPS', pattern: /\b([A-Z]{2}\d{9}[A-Z]{2})\b/i },
  
  // DHL - 10 or 11 digits
  { carrier: 'DHL', pattern: /\b(\d{10,11})\b/ },
  
  // OnTrac - starts with C followed by 14 alphanumeric
  { carrier: 'OnTrac', pattern: /\b(C[A-Z0-9]{14})\b/i },
  
  // Lasership - starts with 1LS or LX or LS followed by alphanumeric
  { carrier: 'LaserShip', pattern: /\b(1LS[A-Z0-9]{12})\b/i },
  { carrier: 'LaserShip', pattern: /\b(LX[A-Z0-9]{10,14})\b/i },
  { carrier: 'LaserShip', pattern: /\b(LS[0-9]{8,12})\b/i },
];

export function extractTrackingNumber(text: string): string | null {
  for (const { pattern } of TRACKING_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

export function detectCarrier(trackingNumber: string): string {
  for (const { carrier, pattern } of TRACKING_PATTERNS) {
    if (pattern.test(trackingNumber)) {
      return carrier;
    }
  }
  return 'Unknown';
}

// Map sender domains to likely carriers
export const SENDER_CARRIER_MAP: Record<string, string> = {
  'ups.com': 'UPS',
  'fedex.com': 'FedEx',
  'usps.com': 'USPS',
  'dhl.com': 'DHL',
  'amazon.com': 'Amazon',
  'amazon.co.uk': 'Amazon',
  'amazon.ca': 'Amazon',
  'ontrac.com': 'OnTrac',
  'lasership.com': 'LaserShip',
  'shop.app': 'Shopify',
};

export function detectCarrierFromSender(email: string): string | null {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return null;
  
  // Direct match
  if (SENDER_CARRIER_MAP[domain]) {
    return SENDER_CARRIER_MAP[domain];
  }
  
  // Partial match for subdomains
  for (const [senderDomain, carrier] of Object.entries(SENDER_CARRIER_MAP)) {
    if (domain.endsWith('.' + senderDomain) || domain === senderDomain) {
      return carrier;
    }
  }
  
  return null;
}
