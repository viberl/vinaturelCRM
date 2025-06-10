const BASE_URL = process.env.SHOPWARE_BASE_URL;
const CLIENT_ID = process.env.SHOPWARE_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPWARE_CLIENT_SECRET;

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  refresh_token?: string;
}

export async function loginShopware(
  username: string,
  password: string,
): Promise<TokenResponse> {
  if (!BASE_URL || !CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("Shopware credentials are not configured");
  }

  const res = await fetch(`${BASE_URL}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "password",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scopes: "write",
      username,
      password,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopware login failed: ${res.status} ${text}`);
  }

  return res.json() as Promise<TokenResponse>;
}

export function getAuthorizeUrl(redirectUri: string, state: string) {
  if (!BASE_URL || !CLIENT_ID) {
    throw new Error("Shopware credentials are not configured");
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    scope: "write",
    state,
  });

  return `${BASE_URL}/admin/oauth/authorize?${params.toString()}`;
}

export async function exchangeAuthorizationCode(
  code: string,
  redirectUri: string,
): Promise<TokenResponse> {
  if (!BASE_URL || !CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("Shopware credentials are not configured");
  }

  const res = await fetch(`${BASE_URL}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopware code exchange failed: ${res.status} ${text}`);
  }

  return res.json() as Promise<TokenResponse>;
}

export async function getCurrentUser(token: string) {
  if (!BASE_URL) throw new Error("Shopware base URL missing");
  const res = await fetch(`${BASE_URL}/api/search/user`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      filter: [],
      includes: {
        user: ["id", "username", "firstName", "lastName"],
      },
      limit: 1,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fetching user failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data?.data?.[0];
}

export async function getCustomersForUser(token: string, userId: string) {
  if (!BASE_URL) throw new Error("Shopware base URL missing");
  const res = await fetch(`${BASE_URL}/api/search/customer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      filter: [
        {
          type: "equals",
          field: "salesRepId",
          value: userId,
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fetching customers failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data?.data ?? [];
}
