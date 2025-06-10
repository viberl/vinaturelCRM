import axios, { AxiosResponse, AxiosError } from 'axios';

// Custom error class for Shopware API errors
class ShopwareApiError extends Error {
  response?: any;
  status?: number;
  
  constructor(message: string, response?: any, status?: number) {
    super(message);
    this.name = 'ShopwareApiError';
    this.response = response;
    this.status = status;
    
    // Set the prototype explicitly for proper instanceof checks
    Object.setPrototypeOf(this, ShopwareApiError.prototype);
  }
}

// Types
export interface LoginResponse {
  contextToken: string;
  redirectUrl?: string;
  apiAlias: string;
}

export interface CustomerData {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  customerNumber: string;
  groupId: string;
  group: {
    name: string;
    displayGross: boolean;
  };
  defaultBillingAddressId: string;
  defaultShippingAddressId: string;
  salutationId: string;
  salutation: {
    id: string;
    salutationKey: string;
    displayName: string;
    letterName: string;
  };
  defaultPaymentMethodId: string;
  company: string | null;
  vatIds: string[] | null;
  active: boolean;
  guest: boolean;
  firstLogin: string;
  lastLogin: string;
  birthday: string | null;
  lastOrderDate: string | null;
  orderCount: number;
  orderTotalAmount: number;
  tagIds: string[];
  requestedGroupId: string | null;
  boundSalesChannelId: string | null;
  accountType: string;
  customFields: Record<string, any> | null;
  remoteAddress: string | null;
  tagCount: number;
  autoIncrement: number;
  admin: boolean;
  apiAlias: string;
}

const BASE_URL = process.env.SHOPWARE_URL || 'https://vinaturel.de';
const ACCESS_KEY = process.env.SHOPWARE_ACCESS_KEY || '';

/**
 * Login a customer using email and password
 */
export const loginCustomer = async (email: string, password: string): Promise<LoginResponse> => {
  try {
    const response = await axios.post<LoginResponse>(
      `${BASE_URL}/store-api/account/login`,
      { username: email, password },
      {
        headers: {
          'sw-access-key': ACCESS_KEY,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
      }
    );
    
    if (!response.data?.contextToken) {
      throw new Error('No context token received from Shopware');
    }
    
    return response.data;
  } catch (error: any) {
    console.error('Shopware login error details:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      headers: error.response?.headers
    });
    
    // Create a more detailed error
    const errorMessage = error.response?.data?.errors?.[0]?.detail || 
                       error.response?.data?.message || 
                       error.message || 
                       'Login fehlgeschlagen';
    
    throw new ShopwareApiError(
      errorMessage,
      error.response?.data,
      error.response?.status
    );
  }
};

/**
 * Get current customer data using context token
 */
export const getCurrentCustomer = async (contextToken: string): Promise<CustomerData> => {
  try {
    const response = await axios.get<{ data: CustomerData }>(
      `${BASE_URL}/store-api/account/customer`,
      {
        headers: {
          'sw-access-key': ACCESS_KEY,
          'sw-context-token': contextToken,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
      }
    );
    
    return response.data.data;
  } catch (error: any) {
    console.error('Error fetching customer data:', error.response?.data || error.message);
    throw new Error('Kundendaten konnten nicht abgerufen werden');
  }
};

/**
 * Logout customer by invalidating the context token
 */
export const logoutCustomer = async (contextToken: string): Promise<boolean> => {
  try {
    await axios.post(
      `${BASE_URL}/store-api/account/logout`,
      {},
      {
        headers: {
          'sw-access-key': ACCESS_KEY,
          'sw-context-token': contextToken,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
      }
    );
    return true;
  } catch (error: any) {
    console.error('Logout error:', error.response?.data || error.message);
    return false;
  }
};
