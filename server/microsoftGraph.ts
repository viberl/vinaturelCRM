import axios, { AxiosError } from 'axios';
import prisma from './prismaClient';

const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID;
const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID;
const AZURE_REDIRECT_URI = process.env.AZURE_REDIRECT_URI || `${process.env.CLIENT_URL ?? 'http://localhost:3000'}/auth/microsoft/callback`;

const GRAPH_SCOPES = ['offline_access', 'User.Read', 'Calendars.Read'];
const AUTHORITY = AZURE_TENANT_ID ? `https://login.microsoftonline.com/${AZURE_TENANT_ID}` : null;

if (process.env.NODE_ENV !== 'production') {
  if (!AZURE_CLIENT_ID || !AZURE_CLIENT_SECRET || !AZURE_TENANT_ID) {
    console.warn('[MicrosoftGraph] Azure credentials are not fully configured. OAuth endpoints will be disabled until they are provided.');
  }
}

export function isMicrosoftGraphConfigured(): boolean {
  return Boolean(AZURE_CLIENT_ID && AZURE_CLIENT_SECRET && AZURE_TENANT_ID && AZURE_REDIRECT_URI);
}

export function buildMicrosoftAuthUrl(state: string): string {
  if (!isMicrosoftGraphConfigured() || !AUTHORITY) {
    throw new Error('Microsoft OAuth ist nicht konfiguriert');
  }

  const params = new URLSearchParams({
    client_id: AZURE_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: AZURE_REDIRECT_URI,
    response_mode: 'query',
    scope: GRAPH_SCOPES.join(' '),
    state
  });

  return `${AUTHORITY}/oauth2/v2.0/authorize?${params.toString()}`;
}

export type TokenSet = {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string | null;
  scope: string | null;
  expiresAt: Date;
};

async function exchangeToken(params: URLSearchParams): Promise<TokenSet> {
  if (!isMicrosoftGraphConfigured() || !AUTHORITY) {
    throw new Error('Microsoft OAuth ist nicht konfiguriert');
  }

  try {
    const response = await axios.post(`${AUTHORITY}/oauth2/v2.0/token`, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: expiresIn,
      token_type: tokenType,
      scope
    } = response.data;

    if (!accessToken || !expiresIn) {
      throw new Error('Antwort des Tokenendpunkts ist unvollständig');
    }

    const expiresAt = new Date(Date.now() + (Number(expiresIn) - 60) * 1000); // refresh 1 Minute früher

    return {
      accessToken,
      refreshToken: refreshToken ?? null,
      tokenType: tokenType ?? null,
      scope: scope ?? null,
      expiresAt
    };
  } catch (error) {
    const err = error as AxiosError;
    const status = err.response?.status;
    const data = err.response?.data;
    console.error('[MicrosoftGraph] Token exchange failed', {
      status,
      data: data && typeof data === 'object' ? JSON.stringify(data) : data
    });
    throw new Error('Token konnte nicht abgerufen werden');
  }
}

export async function exchangeCodeForToken(code: string): Promise<TokenSet> {
  const params = new URLSearchParams({
    client_id: AZURE_CLIENT_ID!,
    scope: GRAPH_SCOPES.join(' '),
    code,
    redirect_uri: AZURE_REDIRECT_URI,
    grant_type: 'authorization_code',
    client_secret: AZURE_CLIENT_SECRET!
  });

  return exchangeToken(params);
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenSet> {
  const params = new URLSearchParams({
    client_id: AZURE_CLIENT_ID!,
    scope: GRAPH_SCOPES.join(' '),
    refresh_token: refreshToken,
    redirect_uri: AZURE_REDIRECT_URI,
    grant_type: 'refresh_token',
    client_secret: AZURE_CLIENT_SECRET!
  });

  return exchangeToken(params);
}

export async function storeTokenSet(userId: string, tokens: TokenSet) {
  await prisma.microsoftCredential.upsert({
    where: { crmUserId: userId },
    update: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? undefined,
      scope: tokens.scope ?? undefined,
      tokenType: tokens.tokenType ?? undefined,
      expiresAt: tokens.expiresAt
    },
    create: {
      crmUserId: userId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      scope: tokens.scope,
      tokenType: tokens.tokenType,
      expiresAt: tokens.expiresAt
    }
  });
}

export async function getValidAccessToken(userId: string): Promise<{ credentialId: number; accessToken: string; }> {
  const credential = await prisma.microsoftCredential.findUnique({ where: { crmUserId: userId } });

  if (!credential) {
    throw new Error('Microsoft-Konto ist nicht verbunden');
  }

  const needsRefresh = credential.expiresAt.getTime() <= Date.now() + 60 * 1000;

  if (!needsRefresh) {
    return { credentialId: credential.id, accessToken: credential.accessToken };
  }

  if (!credential.refreshToken) {
    throw new Error('Das gespeicherte Token ist abgelaufen und kann nicht aktualisiert werden');
  }

  const updatedTokens = await refreshAccessToken(credential.refreshToken);
  await storeTokenSet(userId, updatedTokens);

  // Reload to obtain the fresh DB id if needed
  const refreshed = await prisma.microsoftCredential.findUnique({ where: { crmUserId: userId } });
  if (!refreshed) {
    throw new Error('Aktualisierte Microsoft-Anmeldedaten konnten nicht gespeichert werden');
  }

  return { credentialId: refreshed.id, accessToken: refreshed.accessToken };
}

export type CalendarEvent = {
  id: string;
  subject: string | null;
  start: { dateTime: string; timeZone: string } | null;
  end: { dateTime: string; timeZone: string } | null;
  location: string | null;
  isOnlineMeeting: boolean;
  onlineMeetingUrl: string | null;
  organizer: string | null;
};

export async function fetchUpcomingEvents(accessToken: string, options?: { daysAhead?: number; maxItems?: number; timezone?: string; }) {
  const daysAhead = options?.daysAhead ?? 14;
  const maxItems = options?.maxItems ?? 25;
  const timezone = options?.timezone ?? 'Europe/Berlin';

  const now = new Date();
  const start = new Date(now.getTime() - 12 * 60 * 60 * 1000); // ab etwas vor jetzt
  const end = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  const params = new URLSearchParams({
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    '$top': maxItems.toString(),
    '$orderby': 'start/dateTime'
  });

  try {
    const response = await axios.get(`https://graph.microsoft.com/v1.0/me/calendarview?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: `outlook.timezone="${timezone}"`
      }
    });

    const events = Array.isArray(response.data?.value) ? response.data.value : [];

    return events.map((event: any): CalendarEvent => ({
      id: event.id,
      subject: event.subject ?? null,
      start: event.start ?? null,
      end: event.end ?? null,
      location: event.location?.displayName ?? null,
      isOnlineMeeting: Boolean(event.isOnlineMeeting),
      onlineMeetingUrl: event.onlineMeeting?.joinUrl ?? event.onlineMeetingUrl ?? null,
      organizer: event.organizer?.emailAddress?.name ?? event.organizer?.emailAddress?.address ?? null
    }));
  } catch (error) {
    const err = error as AxiosError;
    const status = err.response?.status;
    if (status === 401 || status === 403) {
      throw new Error('UNAUTHORIZED_MICROSOFT_ACCESS');
    }

    console.error('[MicrosoftGraph] Failed to fetch calendar events', {
      status,
      data: err.response?.data && typeof err.response.data === 'object'
        ? JSON.stringify(err.response.data)
        : err.response?.data
    });
    throw new Error('Kalenderdaten konnten nicht geladen werden');
  }
}

export async function disconnectMicrosoftAccount(userId: string) {
  await prisma.microsoftCredential.deleteMany({ where: { crmUserId: userId } });
}
