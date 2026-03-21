export interface ParcelPackageInput {
  trackingNumber: string;
  carrier: string;
  name: string;
}

export interface ParcelPackage {
  id: string;
  trackingNumber: string;
  carrier: string;
  name: string;
  status?: string;
}

// Map our carrier names to Parcel carrier codes
// Full list: https://api.parcel.app/external/supported_carriers.json
const CARRIER_CODE_MAP: Record<string, string> = {
  'UPS': 'ups',
  'FedEx': 'fedex',
  'USPS': 'usps',
  'Amazon': 'amazon',
  'DHL': 'dhl',
  'OnTrac': 'ontrac',
  'LaserShip': 'lasership',
  'Unknown': 'pholder', // Fallback
};

function getCarrierCode(carrier: string): string {
  return CARRIER_CODE_MAP[carrier] || 'pholder';
}

export class ParcelClient {
  private baseUrl = 'https://api.parcel.app/external';

  constructor(private apiKey: string) {}

  async createPackage(input: ParcelPackageInput): Promise<ParcelPackage> {
    const response = await fetch(`${this.baseUrl}/add-delivery/`, {
      method: 'POST',
      headers: {
        'api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tracking_number: input.trackingNumber,
        carrier_code: getCarrierCode(input.carrier),
        description: input.name,
        send_push_confirmation: false,
      }),
    });

    const data = await response.json() as { success: boolean; error_message?: string };

    if (!response.ok || !data.success) {
      throw new Error(`Parcel API error: ${response.status} - ${data.error_message || 'Unknown error'}`);
    }

    // Parcel doesn't return the created package ID, so we return a placeholder
    return {
      id: input.trackingNumber, // Use tracking number as ID since Parcel doesn't return one
      trackingNumber: input.trackingNumber,
      carrier: input.carrier,
      name: input.name,
    };
  }

  // Note: The Parcel "Add Delivery" API doesn't support getting or deleting individual deliveries
  // These methods are placeholders for future API support
  
  async getPackage(id: string): Promise<ParcelPackage> {
    throw new Error('Parcel API does not support getting individual deliveries. Use the Parcel app to view deliveries.');
  }

  async deletePackage(id: string): Promise<void> {
    throw new Error('Parcel API does not support deleting deliveries. Use the Parcel app to manage deliveries.');
  }
}
