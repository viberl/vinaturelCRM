
import type { Customer, InsertCustomer } from "@shared/schema";

export interface ShopwareConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
}

export interface ShopwareCustomer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  defaultBillingAddress?: {
    street: string;
    city: string;
    zipcode: string;
    country: { name: string };
  };
  orderCount?: number;
  orderTotalAmount?: number;
  createdAt: string;
}

export class ShopwareClient {
  private config: ShopwareConfig;
  private accessToken?: string;
  private tokenExpiry?: Date;

  constructor(config: ShopwareConfig) {
    this.config = config;
  }

  private async authenticate(): Promise<string> {
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }

    const response = await fetch(`${this.config.baseUrl}/api/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }),
    });

    if (!response.ok) {
      throw new Error(`Authentication failed: ${response.statusText}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = new Date(Date.now() + (data.expires_in * 1000));
    
    return this.accessToken;
  }

  private async apiRequest(endpoint: string, options?: RequestInit): Promise<any> {
    const token = await this.authenticate();
    
    const response = await fetch(`${this.config.baseUrl}/api${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    return response.json();
  }

  async getCustomers(limit: number = 50, page: number = 1): Promise<ShopwareCustomer[]> {
    const response = await this.apiRequest(`/customer?limit=${limit}&page=${page}&associations[defaultBillingAddress][associations][country]=[]`);
    return response.data || [];
  }

  async getCustomer(customerId: string): Promise<ShopwareCustomer | null> {
    try {
      const response = await this.apiRequest(`/customer/${customerId}?associations[defaultBillingAddress][associations][country]=[]`);
      return response.data;
    } catch (error) {
      return null;
    }
  }

  convertToAppCustomer(shopwareCustomer: ShopwareCustomer): InsertCustomer {
    const address = shopwareCustomer.defaultBillingAddress
      ? `${shopwareCustomer.defaultBillingAddress.street}, ${shopwareCustomer.defaultBillingAddress.zipcode} ${shopwareCustomer.defaultBillingAddress.city}, ${shopwareCustomer.defaultBillingAddress.country.name}`
      : undefined;

    return {
      name: `${shopwareCustomer.firstName} ${shopwareCustomer.lastName}`,
      email: shopwareCustomer.email,
      phone: shopwareCustomer.phoneNumber || null,
      address: address || null,
      lat: null,
      lng: null,
      status: 'active',
      totalRevenue: shopwareCustomer.orderTotalAmount?.toString() || '0',
      orderCount: shopwareCustomer.orderCount || 0,
      lastContact: null,
      memberSince: new Date(shopwareCustomer.createdAt).toLocaleDateString('de-DE', { 
        month: 'short', 
        year: 'numeric' 
      }),
      discountLevel: 'Standard',
    };
  }
}
