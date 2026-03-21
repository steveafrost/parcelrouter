import { extractTrackingNumber, detectCarrier, detectCarrierFromSender } from './tracking-patterns';

export interface ParsedEmail {
  messageId: string;
  from: string;
  subject: string;
  body: string;
  date: Date;
}

export interface TrackingInfo {
  messageId: string;
  trackingNumber: string;
  carrier: string;
  retailer: string | null;
  productName: string;
  orderNumber: string | null;
}

// Keywords that suggest a shipping email
const SHIPPING_KEYWORDS = [
  'shipped',
  'shipping',
  'tracking',
  'delivered',
  'delivery',
  'out for delivery',
  'package',
  'parcel',
  'order',
  'on its way',
  'in transit',
  'arriving',
];

export function shouldProcessEmail(from: string, subject: string): boolean {
  const subjectLower = subject.toLowerCase();
  
  // Check for shipping keywords in subject
  const hasKeyword = SHIPPING_KEYWORDS.some(keyword => 
    subjectLower.includes(keyword)
  );
  
  // Check if sender is a known shipping/retailer domain
  const senderCarrier = detectCarrierFromSender(from);
  
  return hasKeyword || senderCarrier !== null;
}

export function parseEmail(email: ParsedEmail): TrackingInfo | null {
  // Check if we should process this email
  if (!shouldProcessEmail(email.from, email.subject)) {
    return null;
  }

  // Try to extract tracking number from subject and body
  const searchText = `${email.subject} ${email.body}`;
  const trackingNumber = extractTrackingNumber(searchText);
  
  if (!trackingNumber) {
    return null;
  }

  // Detect carrier from tracking number
  let carrier = detectCarrier(trackingNumber);
  
  // If unknown, try from sender
  if (carrier === 'Unknown') {
    const fromCarrier = detectCarrierFromSender(email.from);
    if (fromCarrier) {
      carrier = fromCarrier;
    }
  }

  // Extract retailer from sender domain
  const retailer = extractRetailer(email.from);

  // Extract a clean sender name for the product name
  const senderName = extractSenderName(email.from);

  // Try to extract order number from subject
  const orderNumber = extractOrderNumber(email.subject);

  return {
    messageId: email.messageId,
    trackingNumber,
    carrier,
    retailer,
    productName: senderName,
    orderNumber,
  };
}

function extractSenderName(from: string): string {
  // Handle "Name <email@domain.com>" format
  const nameMatch = from.match(/^"?([^"<]+)"?\s*</);
  if (nameMatch) {
    return nameMatch[1].trim();
  }
  
  // If no display name, extract domain from email
  const emailMatch = from.match(/@([^>]+)/);
  if (emailMatch) {
    const domain = emailMatch[1];
    // Capitalize first letter of domain
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  }
  
  // Fallback to the full from string
  return from;
}

function extractRetailer(from: string): string | null {
  const domain = from.split('@')[1];
  if (!domain) return null;
  
  // Common retailer mappings
  const retailerMap: Record<string, string> = {
    'amazon.com': 'Amazon',
    'amazon.co.uk': 'Amazon UK',
    'amazon.ca': 'Amazon Canada',
    'apple.com': 'Apple',
    'bestbuy.com': 'Best Buy',
    'target.com': 'Target',
    'walmart.com': 'Walmart',
    'ebay.com': 'eBay',
    'etsy.com': 'Etsy',
    'shopify.com': 'Shopify',
  };

  const mainDomain = domain.toLowerCase().split('.').slice(-2).join('.');
  return retailerMap[mainDomain] || null;
}

function extractOrderNumber(subject: string): string | null {
  // Common order number patterns
  const patterns = [
    /#(\d{3}-\d{7}-\d{7})/,  // Amazon format
    /#(\d{9,})/,              // Generic long number
    /order[:\s#]+([A-Z0-9]{6,})/i,  // Order followed by alphanumeric
    /#([A-Z]{2,}\d{6,})/i,    // #XX123456 format
  ];

  for (const pattern of patterns) {
    const match = subject.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return null;
}
