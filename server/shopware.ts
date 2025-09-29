import axios, { AxiosResponse, AxiosError } from 'axios';

// Custom error class for Shopware API errors
export class ShopwareApiError extends Error {
  response?: any;
  status?: number;
  code?: string | number;
  
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
const ACCESS_KEY = process.env.SHOPWARE_ACCESS_KEY || process.env.VITE_SHOPWARE_ACCESS_KEY || '';

const LANGUAGE_ID = '2fbb5fe2e29a472d9ceacaa9a841cd51';
const VERSION_ID = '0fa91ce3e96a4bc2be4bd9ce752c3425';

const normaliseHeaderValue = (value: string | string[] | undefined): string | undefined => {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
};

const createGuestSession = async (): Promise<string> => {
  const url = `${BASE_URL}/store-api/checkout/cart`;
  const headers = {
    'sw-access-key': ACCESS_KEY,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'sw-language-id': LANGUAGE_ID,
    'sw-version-id': VERSION_ID
  };

  console.log('Creating guest session in Shopware:', {
    url,
    headers: {
      ...headers,
      'sw-access-key': '***REDACTED***'
    }
  });

  const response = await axios.post(
    url,
    {},
    {
      headers,
      timeout: 10000,
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 500
    }
  );

  const headerToken = normaliseHeaderValue(response.headers['sw-context-token']);
  const bodyToken = (response.data as any)?.token as string | undefined;
  const contextToken = headerToken || bodyToken;

  if (!contextToken) {
    console.error('Failed to obtain guest session context token', {
      status: response.status,
      headers: response.headers,
      data: response.data
    });
    throw new ShopwareApiError('No context token received while creating guest session', response.data, response.status);
  }

  return contextToken;
};

/**
 * Login a customer using email and password
 */
export const loginCustomer = async (email: string, password: string): Promise<LoginResponse> => {
  const url = `${BASE_URL}/store-api/account/login`;
  const requestData = {
    username: email,
    email,
    password,
    include: ['customer', 'contextToken']
  };

  let guestContextToken: string | undefined;
  try {
    guestContextToken = await createGuestSession();
  } catch (error) {
    const err = error as ShopwareApiError;
    console.warn('Guest session could not be created, continuing without it', {
      message: err.message,
      status: err.status
    });
  }

  const headers: Record<string, string> = {
    'sw-access-key': ACCESS_KEY,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'sw-language-id': LANGUAGE_ID,
    'sw-version-id': VERSION_ID
  };

  if (guestContextToken) {
    headers['sw-context-token'] = guestContextToken;
  }

  console.log('Sending login request to Shopware:', {
    url,
    headers: {
      ...headers,
      'sw-access-key': '***REDACTED***' // Don't log the actual access key
    },
    data: { ...requestData, password: '***REDACTED***' },
    timeout: 10000 // 10 seconds timeout
  });

  try {
    const response = await axios.post<LoginResponse>(
      url,
      requestData,
      {
        headers,
        timeout: 10000, // 10 seconds timeout
        maxRedirects: 5,
        validateStatus: (status) => status >= 200 && status < 500 // Don't throw for 4xx errors
      }
    );
    
    console.log('Shopware login response:', {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: {
        ...response.data,
        contextToken: response.data?.contextToken ? '***REDACTED***' : 'MISSING'
      }
    });
    
    const contextToken = response.data?.contextToken || normaliseHeaderValue(response.headers['sw-context-token']);

    if (!contextToken) {
      throw new ShopwareApiError(
        'No context token received from Shopware',
        response.data,
        response.status
      );
    }

    return {
      ...response.data,
      contextToken
    };
  } catch (error: any) {
    const errorDetails = {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      statusText: error.response?.statusText,
      response: error.response?.data,
      config: {
        url: error.config?.url,
        method: error.config?.method,
        headers: {
          ...error.config?.headers,
          'sw-access-key': '***REDACTED***'
        },
        timeout: error.config?.timeout,
        timeoutErrorMessage: error.config?.timeoutErrorMessage
      },
      stack: error.stack
    };
    
    console.error('Shopware login error:', errorDetails);
    
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
  const url = `${BASE_URL}/store-api/account/customer`;
  const headers = {
    'sw-access-key': ACCESS_KEY,
    'sw-context-token': contextToken,
    'Accept': 'application/json',
    'sw-language-id': '2fbb5fe2e29a472d9ceacaa9a841cd51', // Default language ID
    'sw-version-id': '0fa91ce3e96a4bc2be4bd9ce752c3425' // Default sales channel version ID
  };

  console.log('Fetching customer data from Shopware:', {
    url,
    headers: {
      ...headers,
      'sw-access-key': '***REDACTED***',
      'sw-context-token': contextToken ? '***REDACTED***' : 'MISSING'
    },
    timeout: 10000 // 10 seconds timeout
  });

  try {
    const response = await axios.get(
      url,
      {
        headers,
        timeout: 10000, // 10 seconds timeout
        maxRedirects: 5,
        validateStatus: (status) => status >= 200 && status < 500 // Don't throw for 4xx errors
      }
    );
    
    console.log('Customer data response:', {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: response.data ? '***DATA_RECEIVED***' : 'NO_DATA'
    });
    
    const customerData = (response.data as { data?: CustomerData })?.data ?? response.data;

    if (!customerData || !customerData.id) {
      throw new ShopwareApiError(
        'No customer data received from Shopware',
        response.data,
        response.status
      );
    }
    
    return customerData as CustomerData;
  } catch (error: any) {
    const errorDetails = {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      statusText: error.response?.statusText,
      response: error.response?.data,
      config: {
        url: error.config?.url,
        method: error.config?.method,
        headers: {
          ...error.config?.headers,
          'sw-access-key': '***REDACTED***',
          'sw-context-token': '***REDACTED***'
        },
        timeout: error.config?.timeout,
        timeoutErrorMessage: error.config?.timeoutErrorMessage
      },
      stack: error.stack
    };
    
    console.error('Error fetching customer data:', errorDetails);
    
    // Create a more detailed error
    const errorMessage = error.response?.data?.errors?.[0]?.detail || 
                        error.response?.data?.message ||
                        error.message;
    
    throw new ShopwareApiError(
      `Failed to fetch customer data: ${errorMessage}`,
      error.response?.data,
      error.response?.status
    );
  }
};

/**
 * Logout customer by invalidating the context token
 */
export const logoutCustomer = async (contextToken: string): Promise<boolean> => {
  const url = `${BASE_URL}/store-api/account/logout`;
  const headers = {
    'sw-access-key': ACCESS_KEY,
    'sw-context-token': contextToken,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'sw-language-id': '2fbb5fe2e29a472d9ceacaa9a841cd51', // Default language ID
    'sw-version-id': '0fa91ce3e96a4bc2be4bd9ce752c3425' // Default sales channel version ID
  };

  console.log('Logging out customer from Shopware:', {
    url,
    headers: {
      ...headers,
      'sw-access-key': '***REDACTED***',
      'sw-context-token': contextToken ? '***REDACTED***' : 'MISSING'
    },
    timeout: 10000 // 10 seconds timeout
  });

  try {
    const response = await axios.post(
      url,
      {},
      {
        headers,
        timeout: 10000, // 10 seconds timeout
        maxRedirects: 5,
        validateStatus: (status) => status >= 200 && status < 500 // Don't throw for 4xx errors
      }
    );
    
    console.log('Logout response:', {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: response.data || 'NO_DATA'
    });
    
    // Consider any 2xx status code as success
    return response.status >= 200 && response.status < 300;
  } catch (error: any) {
    const errorDetails = {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      statusText: error.response?.statusText,
      response: error.response?.data,
      config: {
        url: error.config?.url,
        method: error.config?.method,
        headers: {
          ...error.config?.headers,
          'sw-access-key': '***REDACTED***',
          'sw-context-token': '***REDACTED***'
        },
        timeout: error.config?.timeout,
        timeoutErrorMessage: error.config?.timeoutErrorMessage
      },
      stack: error.stack
    };
    
    console.error('Logout error:', errorDetails);
    
    // Even if logout fails, we should still consider it successful from our side
    // since the session will expire eventually on the server
    return true;
  }
};
