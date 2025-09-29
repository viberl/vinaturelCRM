import axios, { AxiosInstance } from 'axios';
import dotenv from 'dotenv';
import util from 'util';

if (!process.env.SHOPWARE_URL) {
  dotenv.config();
}
dotenv.config({ path: '.env.local', override: true });

interface AdminTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  refresh_token?: string;
  scope?: string;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

const SHOPWARE_URL = process.env.SHOPWARE_URL;
const CLIENT_ID = process.env.SHOPWARE_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPWARE_CLIENT_SECRET;
const ADMIN_SCOPE = process.env.SHOPWARE_ADMIN_SCOPE || 'write';

if (!SHOPWARE_URL) {
  throw new Error('SHOPWARE_URL muss gesetzt sein, um die Shopware Admin API zu nutzen.');
}

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.warn('[shopwareAdmin] SHOPWARE_CLIENT_ID oder SHOPWARE_CLIENT_SECRET fehlen. Admin-API-Aufrufe werden fehlschlagen.');
}

const ADMIN_BASE_URL = `${SHOPWARE_URL.replace(/\/$/, '')}/api`;

let cachedToken: CachedToken | null = null;
let inflightTokenRequest: Promise<string> | null = null;

const TOKEN_LEEWAY_MS = 60 * 1000; // 60 Sekunden Puffer

async function requestAdminToken(): Promise<string> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('SHOPWARE_CLIENT_ID oder SHOPWARE_CLIENT_SECRET sind nicht konfiguriert.');
  }

  const url = `${ADMIN_BASE_URL}/oauth/token`;
  try {
    const response = await axios.post<AdminTokenResponse>(
      url,
      {
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'client_credentials',
        scope: ADMIN_SCOPE
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        }
      }
    );

    if (!response.data.access_token) {
      throw new Error('Shopware Admin API lieferte keinen access_token zurück.');
    }

    const expiresInMs = (response.data.expires_in || 600) * 1000;
    cachedToken = {
      accessToken: response.data.access_token,
      expiresAt: Date.now() + expiresInMs - TOKEN_LEEWAY_MS
    };

    return cachedToken.accessToken;
  } catch (error) {
    console.error('[shopwareAdmin] Fehler beim Abrufen des Admin Access Tokens:', error);
    throw error;
  }
}

export async function getAdminAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken;
  }

  if (!inflightTokenRequest) {
    inflightTokenRequest = requestAdminToken()
      .finally(() => {
        inflightTokenRequest = null;
      });
  }

  return inflightTokenRequest;
}

function buildAdminAxiosInstance(token: string): AxiosInstance {
  return axios.create({
    baseURL: ADMIN_BASE_URL,
    timeout: 10000,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    }
  });
}

export async function getAdminAxios(): Promise<AxiosInstance> {
  const token = await getAdminAccessToken();
  return buildAdminAxiosInstance(token);
}

export interface AdminCustomerResponse<T = any> {
  data: T[];
  total?: number;
}

export async function adminSearch<T = any>(endpoint: string, payload: unknown): Promise<AdminCustomerResponse<T>> {
  const client = await getAdminAxios();
  try {
    const response = await client.post<AdminCustomerResponse<T>>(endpoint, payload);
    return response.data;
  } catch (error) {
    const status = (error as any)?.response?.status;
    const data = (error as any)?.response?.data;
    const errors = Array.isArray(data?.errors)
      ? data.errors.map((err: any) => ({
          code: err.code,
          status: err.status,
          title: err.title,
          detail: err.detail,
          meta: err.meta
        }))
      : data?.errors;

    console.error('[shopwareAdmin] Admin search request failed:', {
      endpoint,
      status,
      detail: errors,
      raw: util.inspect(data, { depth: null }),
      payload
    });
    throw error;
  }
}

export interface ShopwareAdminCustomer {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  password?: string | null;
  legacyPassword?: string | null;
  legacyEncoder?: string | null;
  legacySalt?: string | null;
  customerNumber?: string | null;
  active?: boolean;
  customFields?: Record<string, unknown> | null;
  defaultBillingAddress?: any;
  defaultShippingAddress?: any;
  salesRepresentative?: any;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export async function findCustomerByEmail(email: string): Promise<ShopwareAdminCustomer | null> {
  const payload = {
    filter: [
      {
        type: 'equals',
        field: 'email',
        value: email.toLowerCase()
      }
    ],
    limit: 1,
    includes: {
      customer: [
        'id',
        'email',
        'firstName',
        'lastName',
        'customerNumber',
        'active',
        'customFields',
        'createdAt',
        'updatedAt'
      ],
      customer_address: [
        'id',
        'firstName',
        'lastName',
        'street',
        'zipcode',
        'city',
        'phoneNumber',
        'latitude',
        'longitude',
        'customFields',
        'countryId'
      ],
      country: ['id', 'name'],
      customer_group: ['id', 'name'],
      sales_channel: ['id', 'name']
    },
    associations: {
      defaultBillingAddress: {
        associations: {
          country: {}
        }
      },
      defaultShippingAddress: {
        associations: {
          country: {}
        }
      }
      // salesRepresentative: {}
    }
  };

  const result = await adminSearch<ShopwareAdminCustomer>('/search/customer', payload);
  return result?.data?.[0] ?? null;
}
