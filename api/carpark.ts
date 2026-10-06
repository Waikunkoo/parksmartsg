/**
 * Serverless LTA DataMall Live Carpark Availability Endpoint
 * Path: /api/carpark.ts
 *
 * Endpoint: https://datamall2.mytransport.sg/ltaodataservice/CarParkAvailabilityv2
 * Required Header: AccountKey: <LTA_ACCOUNT_KEY>
 *
 * Supports:
 * - Express / Vercel Serverless Function: export default async function handler(req, res)
 * - Web Fetch / Edge Serverless runtime: export async function GET(request)
 * - Automatic pagination ($skip) and optional fetch-all (all=true)
 * - Optional filtering by agency (HDB, LTA, URA), lotType (C, H, Y), and geo radius (lat, lng, radius)
 * - 60-second in-memory caching to comply with LTA update cycles
 */

const LTA_ENDPOINT = 'https://datamall2.mytransport.sg/ltaodataservice/CarParkAvailabilityv2';
const CACHE_TTL_MS = 60 * 1000; // 1 minute

export interface LTACarparkItem {
  CarParkID: string;
  Area: string;
  Development: string;
  Location: string;
  AvailableLots: number | string;
  LotType: 'C' | 'H' | 'Y' | string;
  Agency: 'HDB' | 'LTA' | 'URA' | string;
  latitude?: number;
  longitude?: number;
  distanceMeters?: number;
}

interface CacheStore {
  timestamp: number;
  data: LTACarparkItem[];
}

let inMemoryCache: CacheStore | null = null;

/**
 * Calculates Haversine distance in meters between two lat/lng pairs
 */
function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Parses LTA Location string ("1.29375 103.85718") into latitude and longitude
 */
function parseLocation(loc?: string): { latitude?: number; longitude?: number } {
  if (!loc) return {};
  const parts = loc.trim().split(/\s+/);
  if (parts.length >= 2) {
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    if (!isNaN(lat) && !isNaN(lng)) {
      return { latitude: lat, longitude: lng };
    }
  }
  return {};
}

/**
 * Fetches a single page of carpark data from LTA DataMall with AccountKey header
 */
async function fetchLTAPage(accountKey: string, skip: number = 0): Promise<LTACarparkItem[]> {
  const url = skip > 0 ? `${LTA_ENDPOINT}?$skip=${skip}` : LTA_ENDPOINT;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'AccountKey': accountKey,
        'Accept': 'application/json'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`LTA DataMall API error (HTTP ${response.status}): ${errText || response.statusText}`);
    }

    const data = await response.json();
    return Array.isArray(data?.value) ? data.value : [];
  } catch (err: any) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Fetches all available carpark lots across all pages (HDB, LTA, URA)
 */
async function fetchAllLTACarparks(accountKey: string): Promise<LTACarparkItem[]> {
  const allItems: LTACarparkItem[] = [];
  let skip = 0;
  const maxPages = 10; // Safety cap: 500 * 10 = 5,000 carparks

  for (let i = 0; i < maxPages; i++) {
    const batch = await fetchLTAPage(accountKey, skip);
    if (!batch || batch.length === 0) break;
    allItems.push(...batch);

    // LTA DataMall returns up to 500 records per page
    if (batch.length < 500) break;
    skip += 500;
  }

  return allItems;
}

/**
 * Core processor for retrieving and filtering LTA carpark availability
 */
export async function getLTACarparks(options: {
  accountKey?: string;
  skip?: number;
  fetchAll?: boolean;
  agency?: string;
  lotType?: string;
  lat?: number;
  lng?: number;
  radiusMeters?: number;
  noCache?: boolean;
}) {
  const accountKey = (options.accountKey || process.env.LTA_ACCOUNT_KEY || process.env.LTA_API_KEY || '').trim();

  if (!accountKey) {
    return {
      status: 'unauthorized',
      message: 'LTA_ACCOUNT_KEY is missing. Please set the LTA_ACCOUNT_KEY environment variable to pull live data from LTA DataMall.',
      endpoint: LTA_ENDPOINT,
      count: 0,
      value: []
    };
  }

  const now = Date.now();
  let rawList: LTACarparkItem[] = [];

  // Check cache if fetching all and caching is not disabled
  if (!options.noCache && options.fetchAll && inMemoryCache && (now - inMemoryCache.timestamp < CACHE_TTL_MS)) {
    rawList = inMemoryCache.data;
  } else if (options.fetchAll) {
    rawList = await fetchAllLTACarparks(accountKey);
    inMemoryCache = {
      timestamp: now,
      data: rawList
    };
  } else {
    // Single page fetch
    rawList = await fetchLTAPage(accountKey, options.skip || 0);
  }

  // Enrich with parsed coordinates
  let processed = rawList.map(item => {
    const coords = parseLocation(item.Location);
    return {
      ...item,
      latitude: coords.latitude,
      longitude: coords.longitude
    };
  });

  // Filter by Agency (HDB, LTA, URA) if specified
  if (options.agency) {
    const targetAgency = options.agency.toUpperCase();
    processed = processed.filter(item => item.Agency && item.Agency.toUpperCase() === targetAgency);
  }

  // Filter by LotType (C for Cars, H for Heavy, Y for Motorcycles) if specified
  if (options.lotType) {
    const targetLotType = options.lotType.toUpperCase();
    processed = processed.filter(item => item.LotType && item.LotType.toUpperCase() === targetLotType);
  }

  // Geo-radius filtering if lat/lng are provided
  if (typeof options.lat === 'number' && !isNaN(options.lat) && typeof options.lng === 'number' && !isNaN(options.lng)) {
    const radius = options.radiusMeters || 1000;
    const centerLat = options.lat;
    const centerLng = options.lng;

    processed = processed
      .map(item => {
        if (typeof item.latitude === 'number' && typeof item.longitude === 'number') {
          const dist = calculateDistanceMeters(centerLat, centerLng, item.latitude, item.longitude);
          return { ...item, distanceMeters: dist };
        }
        return item;
      })
      .filter(item => typeof item.distanceMeters === 'number' && item.distanceMeters <= radius)
      .sort((a, b) => (a.distanceMeters || 0) - (b.distanceMeters || 0));
  }

  return {
    status: 'ok',
    source: 'LTA DataMall CarParkAvailabilityv2',
    endpoint: LTA_ENDPOINT,
    timestamp: new Date().toISOString(),
    count: processed.length,
    value: processed
  };
}

/**
 * Extracts query parameters from either Express Request or Web Request
 */
function extractParams(req: any) {
  if (!req) return {};

  // Standard Express / Node req.query
  if (req.query && typeof req.query === 'object') {
    return {
      skip: req.query.skip ? parseInt(req.query.skip as string, 10) : undefined,
      all: req.query.all === 'true' || req.query.all === '1' || req.query.fetchAll === 'true',
      agency: (req.query.agency as string) || undefined,
      lotType: (req.query.lotType as string) || (req.query.type as string) || undefined,
      lat: req.query.lat ? parseFloat(req.query.lat as string) : undefined,
      lng: req.query.lng ? parseFloat(req.query.lng as string) : undefined,
      radius: req.query.radius ? parseInt(req.query.radius as string, 10) : undefined,
      nocache: req.query.nocache === 'true' || req.query.nocache === '1',
      accountKey: (req.query.accountKey as string) || undefined
    };
  }

  // Web Request URL searchParams
  if (req.url) {
    try {
      const url = new URL(req.url, 'http://localhost');
      const params = url.searchParams;
      return {
        skip: params.has('skip') ? parseInt(params.get('skip')!, 10) : undefined,
        all: params.get('all') === 'true' || params.get('all') === '1' || params.get('fetchAll') === 'true',
        agency: params.get('agency') || undefined,
        lotType: params.get('lotType') || params.get('type') || undefined,
        lat: params.has('lat') ? parseFloat(params.get('lat')!) : undefined,
        lng: params.has('lng') ? parseFloat(params.get('lng')!) : undefined,
        radius: params.has('radius') ? parseInt(params.get('radius')!, 10) : undefined,
        nocache: params.get('nocache') === 'true' || params.get('nocache') === '1',
        accountKey: params.get('accountKey') || undefined
      };
    } catch {
      return {};
    }
  }

  return {};
}

/**
 * Standard Serverless / Express / Node.js handler
 */
export default async function carparkHandler(req: any, res: any) {
  try {
    const params = extractParams(req);
    // Allow header override if sent by caller, else use environment
    const customHeaderKey = req?.headers?.['accountkey'] || req?.headers?.['account-key'];
    const keyToUse = (typeof customHeaderKey === 'string' ? customHeaderKey : undefined) || params.accountKey;

    const result = await getLTACarparks({
      accountKey: keyToUse,
      skip: params.skip,
      fetchAll: params.all ?? true, // Default to fetching all lots for completeness unless specified
      agency: params.agency,
      lotType: params.lotType,
      lat: params.lat,
      lng: params.lng,
      radiusMeters: params.radius,
      noCache: params.nocache
    });

    const statusCode = result.status === 'unauthorized' ? 401 : 200;

    if (res && typeof res.status === 'function') {
      return res.status(statusCode).json(result);
    } else if (res && typeof res.json === 'function') {
      return res.json(result);
    }

    return new Response(JSON.stringify(result, null, 2), {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60'
      }
    });
  } catch (err: any) {
    const errorResponse = {
      status: 'error',
      message: err.message || 'Failed to pull live carpark data from LTA DataMall',
      endpoint: LTA_ENDPOINT
    };

    if (res && typeof res.status === 'function') {
      return res.status(500).json(errorResponse);
    }

    return new Response(JSON.stringify(errorResponse, null, 2), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Web Standard / Edge Serverless GET handler
 */
export async function GET(request: Request) {
  return carparkHandler(request, null);
}
