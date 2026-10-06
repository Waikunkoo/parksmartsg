/**
 * Serverless Health Check Endpoint
 * Path: /api/health.ts
 *
 * Supports both Express/Node Serverless Function signatures: (req, res)
 * and Web API / Edge runtime signatures: GET(request)
 */

export interface HealthResponse {
  status: 'ok' | 'degraded';
  service: string;
  timestamp: string;
  uptimeSeconds: number;
  environment: string;
  ltaAccountKeyConfigured: boolean;
  endpoints: {
    carpark: string;
    health: string;
  };
}

export function getHealthStatus(): HealthResponse {
  const hasLtaKey = Boolean(process.env.LTA_ACCOUNT_KEY && process.env.LTA_ACCOUNT_KEY.trim().length > 0);

  return {
    status: 'ok',
    service: 'ParkSmart SG - LTA DataMall Connector',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime ? process.uptime() : 0),
    environment: process.env.NODE_ENV || 'development',
    ltaAccountKeyConfigured: hasLtaKey,
    endpoints: {
      carpark: '/api/carpark',
      health: '/api/health'
    }
  };
}

/**
 * Standard Serverless / Express / Node.js handler
 */
export default async function healthHandler(req?: any, res?: any) {
  const healthData = getHealthStatus();

  // If Express / Vercel Node handler (res.status / res.json available)
  if (res && typeof res.status === 'function') {
    return res.status(200).json(healthData);
  } else if (res && typeof res.json === 'function') {
    return res.json(healthData);
  }

  // Fallback Web API Response (Edge / Next.js App Router / Cloudflare)
  return new Response(JSON.stringify(healthData, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
}

/**
 * Web Standard / Edge Serverless GET handler
 */
export async function GET() {
  const healthData = getHealthStatus();
  return new Response(JSON.stringify(healthData, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
}
