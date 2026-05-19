import { extractTrackingNumberWithConfidence, detectCarrierFromSender, ConfidenceLevel } from './tracking-patterns';

export interface ParsedEmail {
  messageId: string;
  from: string;
  fromName?: string;
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
  confidence: ConfidenceLevel;
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
  const trackingResult = extractTrackingNumberWithConfidence(searchText);
  
  if (!trackingResult) {
    return null;
  }

  const { number: trackingNumber, carrier: detectedCarrier, confidence } = trackingResult;

  // Detect carrier from tracking number
  let carrier = detectedCarrier;
  
  // If unknown, try from sender
  if (carrier === 'Unknown') {
    const fromCarrier = detectCarrierFromSender(email.from);
    if (fromCarrier) {
      carrier = fromCarrier;
    }
  }

  // Extract retailer from sender domain
  const retailer = extractRetailer(email.from);

  // Generate a clean Parcel description from the sender and subject.
  const productName = generatePackageTitle(email, {
    retailer,
    carrier,
    trackingNumber,
  });

  // Try to extract order number from subject
  const orderNumber = extractOrderNumber(email.subject);

  return {
    messageId: email.messageId,
    trackingNumber,
    carrier,
    retailer,
    productName,
    orderNumber,
    confidence,
  };
}

function extractRetailer(from: string): string | null {
  const domain = extractDomain(from);
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
    'homedepot.com': 'Home Depot',
    'costco.com': 'Costco',
    'chewy.com': 'Chewy',
    'gamestop.com': 'GameStop',
    'michaels.com': 'Michaels',
    'scheels.com': 'Scheels',
    'vitaminshoppe.com': 'The Vitamin Shoppe',
  };

  const mainDomain = domain.toLowerCase().split('.').slice(-2).join('.');
  return retailerMap[mainDomain] || null;
}

interface TitleContext {
  retailer: string | null;
  carrier: string;
  trackingNumber: string;
}

function generatePackageTitle(email: ParsedEmail, context: TitleContext): string {
  const senderTitle = context.retailer || extractSenderName(email);
  const subjectTitle = cleanSubjectForTitle(email.subject, context.trackingNumber);

  if (subjectTitle) {
    if (senderTitle && shouldPrefixSubject(subjectTitle, senderTitle, context.carrier)) {
      return `${senderTitle}: ${subjectTitle}`;
    }
    return subjectTitle;
  }

  if (senderTitle) {
    return senderTitle;
  }

  if (context.carrier && context.carrier !== 'Unknown') {
    return `${context.carrier} delivery`;
  }

  return 'Package delivery';
}

function shouldPrefixSubject(subject: string, senderTitle: string, carrier: string): boolean {
  const normalizedSubject = subject.toLowerCase();
  const normalizedSender = senderTitle.toLowerCase();
  const normalizedCarrier = carrier.toLowerCase();

  if (normalizedSubject.includes(normalizedSender) || normalizedSubject.includes(normalizedCarrier)) {
    return false;
  }

  const genericSubjectPatterns = [
    /\byour (order|package|shipment|delivery)\b/i,
    /\b(order|package|shipment) (confirmed|shipped|delivered|received|arriving|arrived)\b/i,
    /\b(delivery|tracking) (notification|update|status)\b/i,
    /\bon its way\b/i,
  ];

  return genericSubjectPatterns.some(pattern => pattern.test(subject));
}

function cleanSubjectForTitle(subject: string, trackingNumber: string): string | null {
  const cleaned = subject
    .replace(/^(re|fwd?):\s*/gi, '')
    .replace(new RegExp(escapeRegExp(trackingNumber), 'gi'), '')
    .replace(/#?\d{3}-\d{7}-\d{7}/g, '')
    .replace(/\((?:\s|#|order|number|\d|-)*\)/gi, '')
    .replace(/\btracking\s*(?:number|#|no\.?)?\s*:?\s*$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([:,.!?])/g, '$1')
    .replace(/[:,-]\s*$/g, '')
    .trim();

  if (!cleaned || cleaned.length < 4) {
    return null;
  }

  return cleaned;
}

function extractSenderName(email: ParsedEmail): string | null {
  const displayName = cleanDisplayName(email.fromName);
  if (displayName) {
    return displayName;
  }

  const inlineNameMatch = email.from.match(/^"?([^"<@]+)"?\s*</);
  const inlineName = cleanDisplayName(inlineNameMatch?.[1]);
  if (inlineName) {
    return inlineName;
  }

  const domain = extractDomain(email.from);
  if (!domain) {
    return null;
  }

  return titleFromDomain(domain);
}

function cleanDisplayName(name: string | undefined): string | null {
  if (!name) return null;

  const cleaned = name
    .replace(/^"+|"+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned || cleaned.includes('@') || /^no[-\s]?reply$/i.test(cleaned)) {
    return null;
  }

  return cleaned;
}

function extractDomain(from: string): string | null {
  const emailMatch = from.match(/@([^>\s]+)/);
  if (!emailMatch) return null;
  return emailMatch[1].toLowerCase().replace(/[),.;]+$/g, '');
}

function titleFromDomain(domain: string): string {
  const labels = domain.split('.').filter(Boolean);
  const secondLevel = labels.length >= 2 ? labels[labels.length - 2] : labels[0] || domain;

  const domainBrandMap: Record<string, string> = {
    apolloautomation: 'Apollo Automation',
    blackwhiteroasters: 'Black & White Roasters',
    methodicalcoffee: 'Methodical Coffee',
    privaterelay: 'Private Relay',
    saviorequipment: 'Savior Equipment',
    shipstation: 'ShipStation',
    steadyrack: 'Steadyrack',
  };

  if (domainBrandMap[secondLevel]) {
    return domainBrandMap[secondLevel];
  }

  return secondLevel
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractOrderNumber(subject: string): string | null {
  // Common order number patterns
  const patterns = [
    /#(\d{3}-\d{7}-\d{7})/,  // Amazon format
    /#(\d{9,})/,              // Generic long number
    /order\s*(?:number|no\.?|#|id)?[:#]\s*([A-Z0-9-]{6,})/i,
    /\border\s+(?:number|no\.?|id)\s+([A-Z0-9-]{6,})/i,
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
