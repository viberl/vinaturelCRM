import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: '.env.local', override: true });

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

let cachedToken = null;
let inflightTokenRequest = null;
const TOKEN_LEEWAY_MS = 60 * 1000;

async function requestAdminToken() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('SHOPWARE_CLIENT_ID oder SHOPWARE_CLIENT_SECRET sind nicht konfiguriert.');
  }

  const url = `${ADMIN_BASE_URL}/oauth/token`;
  try {
    const response = await axios.post(
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

export async function getAdminAccessToken() {
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

function buildAdminAxiosInstance(token) {
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

export async function getAdminAxios() {
  const token = await getAdminAccessToken();
  return buildAdminAxiosInstance(token);
}

export async function adminSearch(endpoint, payload) {
  const client = await getAdminAxios();
  try {
    const response = await client.post(endpoint, payload);
    return response.data;
  } catch (error) {
    console.error('[shopwareAdmin] Admin search request failed:', {
      endpoint,
      payload,
      error
    });
    throw error;
  }
}

export async function findCustomerByEmail(email) {
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
        'password',
        'legacyPassword',
        'legacyEncoder',
        'legacySalt',
        'customerNumber',
        'active',
        'customFields',
        'createdAt',
        'updatedAt'
      ],
      customer_address: [
        'id',
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
      },
      salesRepresentative: {}
    }
  };

  const result = await adminSearch('/search/customer', payload);
  return result?.data?.[0] ?? null;
}

