/**
 * Serverless Carpark Rates Search & Lookup Endpoint
 * Path: /api/rates.ts
 *
 * Provides direct lookup and search across all 357 carpark rates from
 * official data.gov.sg dataset d_9f6056bdb6b1dfba57f063593e4f34ae.
 */

import { CARPARK_RATES_DATABASE, LTA_DATASET_INFO, matchCarparkRateDefinition } from '../src/data/carparkRates.ts';

export default async function ratesHandler(req: any, res: any) {
  try {
    const url = req?.url ? new URL(req.url, 'http://localhost') : null;
    const query = (req?.query?.q || req?.query?.search || url?.searchParams.get('q') || url?.searchParams.get('search') || '').trim();
    const category = (req?.query?.category || url?.searchParams.get('category') || '').trim();

    if (query) {
      const match = matchCarparkRateDefinition(query);
      if (match) {
        const responseData = {
          status: 'ok',
          found: true,
          carpark: match
        };
        return sendResponse(res, 200, responseData);
      }

      // Fuzzy search across all rates
      const lowerQ = query.toLowerCase();
      const results = CARPARK_RATES_DATABASE.filter(cp =>
        cp.name.toLowerCase().includes(lowerQ) ||
        cp.normalisedName.includes(lowerQ) ||
        cp.aliases.some(a => a.toLowerCase().includes(lowerQ))
      );

      return sendResponse(res, 200, {
        status: 'ok',
        found: results.length > 0,
        count: results.length,
        results
      });
    }

    // Filter by category if requested
    let list = CARPARK_RATES_DATABASE;
    if (category) {
      list = list.filter(cp => cp.category && cp.category.toLowerCase() === category.toLowerCase());
    }

    return sendResponse(res, 200, {
      status: 'ok',
      dataset: LTA_DATASET_INFO,
      total: list.length,
      carparks: list
    });
  } catch (err: any) {
    return sendResponse(res, 500, {
      status: 'error',
      message: err.message || 'Failed to retrieve rates'
    });
  }
}

function sendResponse(res: any, status: number, data: any) {
  if (res && typeof res.status === 'function') {
    return res.status(status).json(data);
  } else if (res && typeof res.json === 'function') {
    return res.json(data);
  }
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function GET(request: Request) {
  return ratesHandler(request, null);
}
