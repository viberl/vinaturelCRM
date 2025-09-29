import axios from 'axios';

interface GeocodeAddressOptions {
  street?: string | null;
  city?: string | null;
  zip?: string | null;
  country?: string | null;
}

interface GeocodeResult {
  lat: number;
  lon: number;
}

const geocodeCache = new Map<string, GeocodeResult>();
let lastRequestTimestamp = 0;

const DEFAULT_USER_AGENT = 'VinaturelCRM/1.0 (info@vinaturel.de)';
const MIN_DELAY_MS = Number(process.env.GEOCODING_REQUEST_INTERVAL_MS || 1200);

function buildQuery({ street, zip, city, country }: GeocodeAddressOptions): string | null {
  const parts = [street, zip, city, country]
    .map((part) => (part ?? '').toString().trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) {
    return null;
  }
  return parts.join(', ');
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function geocodeAddress(options: GeocodeAddressOptions): Promise<GeocodeResult | null> {
  const query = buildQuery(options);
  if (!query) {
    return null;
  }

  const cached = geocodeCache.get(query);
  if (cached) {
    return cached;
  }

  const now = Date.now();
  const waitFor = Math.max(0, MIN_DELAY_MS - (now - lastRequestTimestamp));
  if (waitFor > 0) {
    await delay(waitFor);
  }

  try {
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        format: 'json',
        q: query,
        limit: 1,
      },
      headers: {
        'User-Agent': process.env.GEOCODING_USER_AGENT || DEFAULT_USER_AGENT,
        'Accept-Language': 'de',
      },
      timeout: Number(process.env.GEOCODING_TIMEOUT_MS || 6000),
    });

    lastRequestTimestamp = Date.now();

    if (Array.isArray(response.data) && response.data.length > 0) {
      const candidate = response.data[0];
      const lat = Number.parseFloat(candidate.lat);
      const lon = Number.parseFloat(candidate.lon);

      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        const result = { lat, lon };
        geocodeCache.set(query, result);
        return result;
      }
    }
  } catch (error) {
    console.warn('[geocoding] Failed to geocode address', {
      query,
      error: error instanceof Error ? error.message : error,
    });
  }

  return null;
}
