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

export class ParcelClient {
  private baseUrl = 'https://api.parcel.app/v1';

  constructor(private apiKey: string) {}

  async createPackage(input: ParcelPackageInput): Promise<ParcelPackage> {
    const response = await fetch(`${this.baseUrl}/packages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tracking_number: input.trackingNumber,
        carrier: input.carrier,
        name: input.name,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Parcel API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as { id: string; tracking_number: string; carrier: string; name: string; status?: string };
    return {
      id: data.id,
      trackingNumber: data.tracking_number,
      carrier: data.carrier,
      name: data.name,
      status: data.status,
    };
  }

  async getPackage(id: string): Promise<ParcelPackage> {
    const response = await fetch(`${this.baseUrl}/packages/${id}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Parcel API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as { id: string; tracking_number: string; carrier: string; name: string; status?: string };
    return {
      id: data.id,
      trackingNumber: data.tracking_number,
      carrier: data.carrier,
      name: data.name,
      status: data.status,
    };
  }

  async deletePackage(id: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/packages/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Parcel API error: ${response.status} - ${error}`);
    }
  }
}
