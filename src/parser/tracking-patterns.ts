export interface TrackingPattern {
  carrier: string;
  pattern: RegExp;
  strict?: boolean; // If true, only match if near tracking keywords
  confidence?: 'high' | 'medium' | 'low';
}

// Order matters - more specific patterns first
export const TRACKING_PATTERNS: TrackingPattern[] = [
  // UPS - starts with 1Z followed by 16 alphanumeric (very specific)
  { carrier: 'UPS', pattern: /\b(1Z[A-Z0-9]{16})\b/i, confidence: 'high' },
  
  // Amazon Logistics (very specific) - case sensitive, uppercase only
  { carrier: 'Amazon', pattern: /\b(TBA[A-Z0-9]{12})\b/, confidence: 'high' },
  { carrier: 'Amazon', pattern: /\b(TBC[A-Z0-9]{12})\b/, confidence: 'high' },
  { carrier: 'Amazon', pattern: /\b(TBM[A-Z0-9]{12})\b/, confidence: 'high' },
  
  // USPS - 20-22 digits or XX123456789XX format (unlikely to be order numbers)
  { carrier: 'USPS', pattern: /\b(\d{20,22})\b/, confidence: 'high' },
  { carrier: 'USPS', pattern: /\b([A-Z]{2}\d{9}[A-Z]{2})\b/i, confidence: 'high' },
  
  // OnTrac - starts with C followed by 14 alphanumeric (must be uppercase, no /i flag)
  // Tracking numbers are uppercase only like C12345678901234
  { carrier: 'OnTrac', pattern: /\b(C[0-9]{14})\b/, confidence: 'high' },
  
  // Lasership - tracking numbers are alphanumeric uppercase only
  { carrier: 'LaserShip', pattern: /\b(1LS[A-Z0-9]{12})\b/, confidence: 'high' },
  { carrier: 'LaserShip', pattern: /\b(LX[0-9]{10,14})\b/, confidence: 'medium' },
  { carrier: 'LaserShip', pattern: /\b(LS[0-9]{8,12})\b/, confidence: 'medium' },
  
  // FedEx - 12 or 15 digits (need context to avoid order numbers)
  { carrier: 'FedEx', pattern: /\b(\d{12})\b/, strict: true, confidence: 'medium' },
  { carrier: 'FedEx', pattern: /\b(\d{15})\b/, strict: true, confidence: 'medium' },
  
  // DHL - 10 or 11 digits (need context to avoid order numbers)
  { carrier: 'DHL', pattern: /\b(\d{10,11})\b/, strict: true, confidence: 'low' },
];

export type ConfidenceLevel = 'high' | 'medium' | 'low';

// Keywords that should be near a tracking number
const TRACKING_CONTEXT_KEYWORDS = [
  'tracking',
  'track',
  'shipment',
  'ship',
  'delivery',
  'package',
  'parcel',
  ' waybill',
  'reference',
  'trace',
];

// Patterns that indicate an order number (should be excluded)
const ORDER_NUMBER_PATTERNS = [
  /order[:\s#]*([A-Z0-9-]+)/i,
  /po[:\s#]*([A-Z0-9-]+)/i,
  /purchase[:\s#]*([A-Z0-9-]+)/i,
  /#\s*(\d{3}-\d{7}-\d{7})/, // Amazon order format
];

/**
 * Check if a number appears in a tracking context
 */
function isInTrackingContext(text: string, number: string): boolean {
  // Find the position of the number in the text
  const index = text.indexOf(number);
  if (index === -1) return false;
  
  // Get surrounding context (100 chars before and after)
  const contextStart = Math.max(0, index - 100);
  const contextEnd = Math.min(text.length, index + number.length + 100);
  const context = text.substring(contextStart, contextEnd).toLowerCase();
  
  // Check for tracking keywords in context
  return TRACKING_CONTEXT_KEYWORDS.some(keyword => context.includes(keyword));
}

/**
 * Check if a number looks like an order number
 */
function looksLikeOrderNumber(text: string, number: string): boolean {
  // If it starts with tracking-specific prefixes, it's not an order number
  const trackingPrefixes = ['1Z', 'TBA', 'TBC', 'TBM', 'C', '1LS', 'LX', 'LS'];
  const upperNumber = number.toUpperCase();
  for (const prefix of trackingPrefixes) {
    if (upperNumber.startsWith(prefix)) {
      return false;
    }
  }
  
  // Check if it's explicitly labeled as an order number
  const index = text.indexOf(number);
  if (index === -1) return false;
  
  const contextStart = Math.max(0, index - 50);
  const contextEnd = Math.min(text.length, index + number.length + 20);
  const context = text.substring(contextStart, contextEnd);
  
  // Check for order number labels nearby
  return ORDER_NUMBER_PATTERNS.some(pattern => pattern.test(context));
}

export interface TrackingResult {
  number: string;
  carrier: string;
  confidence: ConfidenceLevel;
}

export function extractTrackingNumberWithConfidence(text: string): TrackingResult | null {
  for (const { carrier, pattern, strict, confidence = 'medium' } of TRACKING_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const number = match[1];
      
      // Skip if it looks like an order number
      if (looksLikeOrderNumber(text, number)) {
        console.log(`Skipping potential order number: ${number}`);
        continue;
      }
      
      // For strict patterns, require tracking context
      if (strict && !isInTrackingContext(text, number)) {
        console.log(`Skipping ${number} - no tracking context found`);
        continue;
      }
      
      return { number, carrier, confidence };
    }
  }
  return null;
}

export function extractTrackingNumber(text: string): string | null {
  const result = extractTrackingNumberWithConfidence(text);
  return result ? result.number : null;
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

/**
 * Validate that a tracking number is properly formatted for submission
 */
export function isValidTrackingNumber(number: string): boolean {
  // Must match at least one pattern
  for (const { pattern } of TRACKING_PATTERNS) {
    if (pattern.test(number)) {
      return true;
    }
  }
  return false;
}
