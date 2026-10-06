import type { Request, Response } from 'express';
import { searchSingaporeMalls } from '../src/data/singaporeMallsRegistry.ts';

// Known Singapore fallback destinations for instant autocomplete if OneMap is slow
const COMMON_SG_DESTINATIONS = [
  {
    title: 'Marina Bay Sands',
    address: '10 Bayfront Avenue, Singapore 018956',
    latitude: 1.2842,
    longitude: 103.8596,
    postalCode: '018956'
  },
  {
    title: 'Suntec City',
    address: '3 Temasek Boulevard, Singapore 038983',
    latitude: 1.2938,
    longitude: 103.8572,
    postalCode: '038983'
  },
  {
    title: 'ION Orchard',
    address: '2 Orchard Turn, Singapore 238801',
    latitude: 1.3040,
    longitude: 103.8318,
    postalCode: '238801'
  },
  {
    title: 'Takashimaya Shopping Centre',
    address: '391 Orchard Road, Singapore 238873',
    latitude: 1.3023,
    longitude: 103.8347,
    postalCode: '238873'
  },
  {
    title: 'Ngee Ann City (Takashimaya)',
    address: '391 Orchard Road, Singapore 238873',
    latitude: 1.3023,
    longitude: 103.8347,
    postalCode: '238873'
  },
  {
    title: 'Raffles City',
    address: '252 North Bridge Road, Singapore 179103',
    latitude: 1.2939,
    longitude: 103.8532,
    postalCode: '179103'
  },
  {
    title: 'VivoCity',
    address: '1 HarbourFront Walk, Singapore 098585',
    latitude: 1.2644,
    longitude: 103.8222,
    postalCode: '098585'
  },
  {
    title: 'Bugis Junction',
    address: '200 Victoria Street, Singapore 188021',
    latitude: 1.3002,
    longitude: 103.8553,
    postalCode: '188021'
  },
  {
    title: 'Jewel Changi Airport',
    address: '78 Airport Boulevard, Singapore 819666',
    latitude: 1.3602,
    longitude: 103.9897,
    postalCode: '819666'
  },
  {
    title: 'One Raffles Place',
    address: '1 Raffles Place, Singapore 048616',
    latitude: 1.2845,
    longitude: 103.8510,
    postalCode: '048616'
  },
  {
    title: 'Jem (Jurong East)',
    address: '50 Jurong Gateway Road, Singapore 608549',
    latitude: 1.3331,
    longitude: 103.7436,
    postalCode: '608549'
  },
  {
    title: 'International Business Park (Jurong East)',
    address: 'International Business Park, Singapore 609928',
    latitude: 1.3252,
    longitude: 103.7490,
    postalCode: '609928'
  },
  {
    title: 'The Strategy (International Business Park)',
    address: '2 International Business Park, Singapore 609930',
    latitude: 1.3286,
    longitude: 103.7462,
    postalCode: '609930'
  },
  {
    title: 'The Synergy (International Business Park)',
    address: '1 International Business Park, Singapore 609917',
    latitude: 1.3252,
    longitude: 103.7490,
    postalCode: '609917'
  },
  {
    title: 'The Star Vista',
    address: '1 Vista Exchange Green, Singapore 138617',
    latitude: 1.3070,
    longitude: 103.7884,
    postalCode: '138617'
  },
  {
    title: 'Rochester Mall',
    address: '35 Rochester Drive, Singapore 138639',
    latitude: 1.3056,
    longitude: 103.7880,
    postalCode: '138639'
  }
];

export default async function geocodeHandler(req: Request, res: Response) {
  const query = (req.query.q as string || '').trim();
  if (!query) {
    return res.json({ results: [] });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const oneMapUrl = `https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${encodeURIComponent(query)}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
    const response = await fetch(oneMapUrl, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`OneMap API error: ${response.status}`);
    }

    // First, check local verified Singapore shopping malls & landmarks registry
    const localMalls = searchSingaporeMalls(query).map(m => ({
      title: m.name,
      address: m.address,
      latitude: m.latitude,
      longitude: m.longitude,
      postalCode: m.postalCode
    }));

    const data = await response.json();
    if (data && Array.isArray(data.results) && data.results.length > 0) {
      const oneMapResults = data.results.slice(0, 6).map((item: any) => ({
        title: item.SEARCHVAL || item.BUILDING || item.ROAD_NAME,
        address: item.ADDRESS || `${item.BLK_NO || ''} ${item.ROAD_NAME || ''}`.trim(),
        latitude: parseFloat(item.LATITUDE),
        longitude: parseFloat(item.LONGITUDE),
        postalCode: item.POSTAL || ''
      }));

      // Combine local verified mall (if matched) at top of list
      const combined = [...localMalls];
      for (const item of oneMapResults) {
        if (!combined.some(c => Math.abs(c.latitude - item.latitude) < 0.001 && Math.abs(c.longitude - item.longitude) < 0.001)) {
          combined.push(item);
        }
      }

      return res.json({ results: combined.slice(0, 7), source: localMalls.length > 0 ? 'verified_registry' : 'onemap' });
    }

    // If OneMap yielded no results, return local malls or common SG destinations
    if (localMalls.length > 0) {
      return res.json({ results: localMalls, source: 'verified_registry' });
    }

    const lowerQuery = query.toLowerCase();
    const matched = COMMON_SG_DESTINATIONS.filter(d =>
      d.title.toLowerCase().includes(lowerQuery) ||
      d.address.toLowerCase().includes(lowerQuery)
    );

    return res.json({ results: matched, source: 'fallback' });
  } catch (error: any) {
    clearTimeout(timeoutId);
    console.warn('Geocoding OneMap error, using fallback:', error.message);

    // Check local verified malls first
    const localMalls = searchSingaporeMalls(query).map(m => ({
      title: m.name,
      address: m.address,
      latitude: m.latitude,
      longitude: m.longitude,
      postalCode: m.postalCode
    }));

    if (localMalls.length > 0) {
      return res.json({ results: localMalls, source: 'verified_registry' });
    }

    const lowerQuery = query.toLowerCase();
    const matched = COMMON_SG_DESTINATIONS.filter(d =>
      d.title.toLowerCase().includes(lowerQuery) ||
      d.address.toLowerCase().includes(lowerQuery)
    );

    const results = matched.length > 0 ? matched : COMMON_SG_DESTINATIONS.slice(0, 4);
    return res.json({ results, source: 'fallback' });
  }
}
