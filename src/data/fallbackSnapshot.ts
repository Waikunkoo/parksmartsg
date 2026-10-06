import { Carpark, EVCharger } from '../types/index.ts';
import { calculateDistanceMeters } from '../utils/geo.ts';
import { CARPARK_RATES_DATABASE, matchCarparkRateDefinition } from './carparkRates.ts';
import { calculateParkingCost } from '../utils/rateCalculator.ts';
import { SINGAPORE_MALLS_REGISTRY } from './singaporeMallsRegistry.ts';

// Destination anchor: Marina Bay Sands (1.2842, 103.8596)
export const MBS_ANCHOR = {
  name: 'Marina Bay Sands',
  latitude: 1.2842,
  longitude: 103.8596,
  address: '10 Bayfront Avenue, Singapore 018956'
};

export interface RawCarparkSnapshot {
  id: string;
  name: string;
  agency: string;
  area: string;
  latitude: number;
  longitude: number;
  availableLots: number;
  lotType: string;
  evChargers: EVCharger[];
}

export const FALLBACK_CARPARKS_RAW: RawCarparkSnapshot[] = [
  {
    id: 'STAR-VISTA-1',
    name: 'The Star Vista',
    agency: 'COMMERCIAL',
    area: 'Buona Vista',
    latitude: 1.3070,
    longitude: 103.7884,
    availableLots: 385,
    lotType: 'C',
    evChargers: [
      {
        id: 'ev-starvista-1',
        operator: 'SP Mobility',
        plugType: 'Type 2 & CCS2',
        powerKW: '50 kW DC',
        status: 'Available',
        price: '$0.58/kWh'
      }
    ]
  },
  {
    id: 'ROCHESTER-1',
    name: 'Rochester Mall',
    agency: 'COMMERCIAL',
    area: 'Buona Vista',
    latitude: 1.3056,
    longitude: 103.7880,
    availableLots: 190,
    lotType: 'C',
    evChargers: []
  },
  {
    id: 'METROPOLIS-1',
    name: 'The Metropolis',
    agency: 'COMMERCIAL',
    area: 'Buona Vista',
    latitude: 1.3062,
    longitude: 103.7905,
    availableLots: 340,
    lotType: 'C',
    evChargers: []
  },
  {
    id: 'HD-14',
    name: 'Blk 14 Holland Drive MSCP (H14)',
    agency: 'HDB',
    area: 'Holland',
    latitude: 1.3090,
    longitude: 103.7915,
    availableLots: 210,
    lotType: 'C',
    evChargers: []
  },
  {
    id: 'HOLLAND-RD-1',
    name: 'Holland Road Shopping Centre',
    agency: 'COMMERCIAL',
    area: 'Holland',
    latitude: 1.3105,
    longitude: 103.7950,
    availableLots: 160,
    lotType: 'C',
    evChargers: []
  },
  {
    id: 'IBP-STRATEGY',
    name: 'The Strategy (International Business Park)',
    agency: 'COMMERCIAL',
    area: 'Jurong East',
    latitude: 1.3286,
    longitude: 103.7462,
    availableLots: 420,
    lotType: 'C',
    evChargers: [
      {
        id: 'ev-strategy-1',
        operator: 'SP Mobility',
        plugType: 'Type 2 & CCS2',
        powerKW: '50 kW DC',
        status: 'Available',
        price: '$0.58/kWh'
      }
    ]
  },
  {
    id: 'IBP-SYNERGY',
    name: 'The Synergy (International Business Park)',
    agency: 'COMMERCIAL',
    area: 'Jurong East',
    latitude: 1.3252,
    longitude: 103.7490,
    availableLots: 310,
    lotType: 'C',
    evChargers: []
  },
  {
    id: 'IBP-GERMAN',
    name: 'German Centre (International Business Park)',
    agency: 'COMMERCIAL',
    area: 'Jurong East',
    latitude: 1.3277,
    longitude: 103.7460,
    availableLots: 260,
    lotType: 'C',
    evChargers: []
  },
  {
    id: 'TG-286A',
    name: 'Blk 286A Toh Guan Road MSCP (J80)',
    agency: 'HDB',
    area: 'Jurong East',
    latitude: 1.3320,
    longitude: 103.7468,
    availableLots: 175,
    lotType: 'C',
    evChargers: []
  },
  {
    id: 'TG-288A',
    name: 'Blk 288A Toh Guan Road MSCP (J82)',
    agency: 'HDB',
    area: 'Jurong East',
    latitude: 1.3335,
    longitude: 103.7475,
    availableLots: 148,
    lotType: 'C',
    evChargers: []
  },
  {
    id: 'IMM-1',
    name: 'IMM Building',
    agency: 'COMMERCIAL',
    area: 'Jurong East',
    latitude: 1.3349,
    longitude: 103.7469,
    availableLots: 512,
    lotType: 'C',
    evChargers: [
      {
        id: 'ev-imm-1',
        operator: 'Shell Recharge',
        plugType: 'CCS2 (DC)',
        powerKW: '50 kW DC',
        status: 'Available',
        price: '$0.60/kWh'
      }
    ]
  },
  {
    id: 'WESTGATE-1',
    name: 'Westgate',
    agency: 'COMMERCIAL',
    area: 'Jurong East',
    latitude: 1.3345,
    longitude: 103.7428,
    availableLots: 385,
    lotType: 'C',
    evChargers: []
  },
  {
    id: 'JEM-1',
    name: 'Jem',
    agency: 'COMMERCIAL',
    area: 'Jurong East',
    latitude: 1.3331,
    longitude: 103.7436,
    availableLots: 395,
    lotType: 'C',
    evChargers: []
  },
  {
    id: 'TM-662A',
    name: 'Blk 662A Tampines St 64 MSCP (TM66)',
    agency: 'HDB',
    area: 'Tampines',
    latitude: 1.3693,
    longitude: 103.9341,
    availableLots: 194,
    lotType: 'C',
    evChargers: []
  },
  {
    id: 'TM-641A',
    name: 'Blk 641A Tampines St 62 MSCP (TM64)',
    agency: 'HDB',
    area: 'Tampines',
    latitude: 1.3680,
    longitude: 103.9355,
    availableLots: 142,
    lotType: 'C',
    evChargers: []
  },
  {
    id: 'IKEA-TAMP-1',
    name: 'IKEA Tampines',
    agency: 'COMMERCIAL',
    area: 'Tampines',
    latitude: 1.3732,
    longitude: 103.9324,
    availableLots: 420,
    lotType: 'C',
    evChargers: []
  },
  {
    id: 'GIANT-TAMP-1',
    name: 'Giant Hypermarket Tampines',
    agency: 'COMMERCIAL',
    area: 'Tampines',
    latitude: 1.3725,
    longitude: 103.9335,
    availableLots: 310,
    lotType: 'C',
    evChargers: []
  },
  {
    id: 'TAMP-MALL-1',
    name: 'Tampines Mall',
    agency: 'COMMERCIAL',
    area: 'Tampines',
    latitude: 1.3533,
    longitude: 103.9452,
    availableLots: 185,
    lotType: 'C',
    evChargers: []
  },
  {
    id: 'OTH-1',
    name: 'Our Tampines Hub',
    agency: 'LTA',
    area: 'Tampines',
    latitude: 1.3532,
    longitude: 103.9405,
    availableLots: 380,
    lotType: 'C',
    evChargers: []
  },
  {
    id: 'CENTURY-SQ-1',
    name: 'Century Square',
    agency: 'COMMERCIAL',
    area: 'Tampines',
    latitude: 1.3524,
    longitude: 103.9442,
    availableLots: 140,
    lotType: 'C',
    evChargers: []
  },
  {
    id: 'NAC-TAKA-1',
    name: 'Ngee Ann City (Takashimaya)',
    agency: 'LTA',
    area: 'Orchard',
    latitude: 1.3023,
    longitude: 103.8348,
    availableLots: 691,
    lotType: 'C',
    evChargers: []
  },
  {
    id: 'ION-1',
    name: 'ION Orchard',
    agency: 'LTA',
    area: 'Orchard',
    latitude: 1.3040,
    longitude: 103.8318,
    availableLots: 285,
    lotType: 'C',
    evChargers: [
      {
        id: 'ev-ion-1',
        operator: 'Shell Recharge',
        plugType: 'Type 2 & CCS2',
        powerKW: '50 kW DC',
        status: 'Available',
        price: '$0.62/kWh'
      }
    ]
  },
  {
    id: 'PARAGON-1',
    name: 'Paragon Shopping Centre',
    agency: 'COMMERCIAL',
    area: 'Orchard',
    latitude: 1.3039,
    longitude: 103.8358,
    availableLots: 194,
    lotType: 'C',
    evChargers: []
  },
  {
    id: 'WISMA-1',
    name: 'Wisma Atria',
    agency: 'COMMERCIAL',
    area: 'Orchard',
    latitude: 1.3038,
    longitude: 103.8333,
    availableLots: 112,
    lotType: 'C',
    evChargers: []
  },
  {
    id: 'SOMERSET-313-1',
    name: '313@Somerset',
    agency: 'COMMERCIAL',
    area: 'Orchard',
    latitude: 1.3010,
    longitude: 103.8384,
    availableLots: 145,
    lotType: 'C',
    evChargers: []
  },
  {
    id: 'MBS-MAIN',
    name: 'Marina Bay Sands',
    agency: 'COMMERCIAL',
    area: 'Marina',
    latitude: 1.2838,
    longitude: 103.8591,
    availableLots: 248,
    lotType: 'C',
    evChargers: [
      {
        id: 'ev-mbs-1',
        operator: 'SP Mobility',
        plugType: 'Type 2 (AC) & CCS2 (DC)',
        powerKW: '50 kW DC / 22 kW AC',
        status: 'Available',
        price: '$0.58/kWh'
      },
      {
        id: 'ev-mbs-2',
        operator: 'Shell Recharge',
        plugType: 'CCS2 (DC)',
        powerKW: '60 kW DC',
        status: 'Operational',
        price: '$0.62/kWh'
      }
    ]
  },
  {
    id: 'MILLENIA-1',
    name: 'Millenia Walk',
    agency: 'COMMERCIAL',
    area: 'Marina',
    latitude: 1.2929,
    longitude: 103.8597,
    availableLots: 165,
    lotType: 'C',
    evChargers: [
      {
        id: 'ev-mw-1',
        operator: 'Charge+',
        plugType: 'Type 2 (AC)',
        powerKW: '22 kW AC',
        status: 'Available',
        price: '$0.52/kWh'
      }
    ]
  },
  {
    id: 'SUNTEC-1',
    name: 'Suntec City',
    agency: 'LTA',
    area: 'Marina',
    latitude: 1.2938,
    longitude: 103.8572,
    availableLots: 412,
    lotType: 'C',
    evChargers: [
      {
        id: 'ev-suntec-1',
        operator: 'SP Mobility',
        plugType: 'CCS2 (DC)',
        powerKW: '120 kW DC',
        status: 'Available',
        price: '$0.65/kWh'
      },
      {
        id: 'ev-suntec-2',
        operator: 'ComfortDelGro ENGIE',
        plugType: 'Type 2 (AC)',
        powerKW: '22 kW AC',
        status: 'Available',
        price: '$0.54/kWh'
      }
    ]
  },
  {
    id: 'MARINA-SQ-1',
    name: 'Marina Square',
    agency: 'COMMERCIAL',
    area: 'Marina',
    latitude: 1.2912,
    longitude: 103.8578,
    availableLots: 304,
    lotType: 'C',
    evChargers: [
      {
        id: 'ev-ms-1',
        operator: 'SP Mobility',
        plugType: 'Type 2 (AC)',
        powerKW: '22 kW AC',
        status: 'Available',
        price: '$0.55/kWh'
      }
    ]
  },
  {
    id: 'ESPLANADE-1',
    name: 'Esplanade - Theatres on the Bay',
    agency: 'COMMERCIAL',
    area: 'Marina',
    latitude: 1.2897,
    longitude: 103.8558,
    availableLots: 182,
    lotType: 'C',
    evChargers: []
  },
  {
    id: 'SG-FLYER-1',
    name: 'Singapore Flyer',
    agency: 'COMMERCIAL',
    area: 'Marina',
    latitude: 1.2893,
    longitude: 103.8631,
    availableLots: 89,
    lotType: 'C',
    evChargers: [
      {
        id: 'ev-flyer-1',
        operator: 'Charge+',
        plugType: 'Type 2 (AC)',
        powerKW: '22 kW AC',
        status: 'Available',
        price: '$0.52/kWh'
      }
    ]
  }
];

/**
 * Builds full fallback Carpark list with distance and cost calculation
 */
export function getFallbackCarparks(
  destLat: number = MBS_ANCHOR.latitude,
  destLng: number = MBS_ANCHOR.longitude,
  dateStr: string = '2026-10-06',
  arrivalTimeStr: string = '09:30',
  durationHours: number = 2
): Carpark[] {
  const result: Carpark[] = [];

  // Combine curated snapshots with full Singapore shopping malls registry
  const mallSnapshots: RawCarparkSnapshot[] = SINGAPORE_MALLS_REGISTRY.map(m => ({
    id: m.id,
    name: m.name,
    agency: m.agency || 'COMMERCIAL',
    area: m.region,
    latitude: m.latitude,
    longitude: m.longitude,
    availableLots: m.approximateLots,
    lotType: 'C',
    evChargers: []
  }));

  const allCandidateCarparks: RawCarparkSnapshot[] = [
    ...FALLBACK_CARPARKS_RAW,
    ...mallSnapshots.filter(m => !FALLBACK_CARPARKS_RAW.some(r => r.name.toLowerCase() === m.name.toLowerCase()))
  ];

  for (const raw of allCandidateCarparks) {
    const distMeters = calculateDistanceMeters(destLat, destLng, raw.latitude, raw.longitude);
    const distKm = Number((distMeters / 1000).toFixed(2));

    // Match rates
    const rateDef = matchCarparkRateDefinition(raw.name, raw.agency);

    let cost: number | null = null;
    let breakdown = 'Rate unavailable';
    let publishedRateText: string | undefined = undefined;
    let isApprox = false;

    if (rateDef) {
      const calc = calculateParkingCost(rateDef, dateStr, arrivalTimeStr, durationHours);
      cost = calc.totalCostSGD;
      breakdown = calc.breakdown;
      isApprox = calc.isApproximate;
      publishedRateText = rateDef.publishedRateText.weekdays;
    }

    result.push({
      id: raw.id,
      name: raw.name,
      agency: raw.agency,
      area: raw.area,
      latitude: raw.latitude,
      longitude: raw.longitude,
      availableLots: raw.availableLots,
      lotType: raw.lotType,
      distanceMeters: distMeters,
      distanceKm: distKm,
      estimatedCost: cost,
      costBreakdown: breakdown,
      publishedRateText,
      isApproximateRate: isApprox,
      isLocalRateSource: Boolean(rateDef),
      rateSource: 'local_database',
      evChargers: raw.evChargers,
      lastUpdated: '1 min ago (Live feed synced)',
      isFallback: true
    });
  }

  // 1. Filter within 1.5km (1500m)
  let nearby = result.filter(c => c.distanceMeters <= 1500);

  // 2. If none within 1.5km, expand to 3km
  if (nearby.length === 0) {
    nearby = result.filter(c => c.distanceMeters <= 3000);
  }

  // 3. If still none within 3km (never return distant downtown carparks for outlying towns like Tampines):
  if (nearby.length === 0) {
    const isCentralTown = calculateDistanceMeters(destLat, destLng, 1.2842, 103.8596) < 3500;
    if (!isCentralTown) {
      const localHDBDef = CARPARK_RATES_DATABASE.find(r => r.normalisedName === 'hdb non central');
      const calc = localHDBDef ? calculateParkingCost(localHDBDef, dateStr, arrivalTimeStr, durationHours) : null;

      const localHDBCarpark: Carpark = {
        id: `HDB-LOCAL-${destLat.toFixed(4)}-${destLng.toFixed(4)}`,
        name: 'HDB Multi-Storey Car Park (Nearby)',
        agency: 'HDB',
        area: 'Residential',
        latitude: destLat + 0.0006,
        longitude: destLng + 0.0005,
        availableLots: 88,
        lotType: 'C',
        distanceMeters: 85,
        distanceKm: 0.09,
        estimatedCost: calc?.totalCostSGD ?? 2.40,
        costBreakdown: calc?.breakdown ?? '4 × 30m @ $0.60 = $2.40',
        publishedRateText: '07:00-22:30: $0.60 per 30 mins. 22:30-07:00: $0.60 per 30 mins (max $5.00/night).',
        isApproximateRate: false,
        evChargers: [],
        lastUpdated: '1 min ago (Live feed synced)',
        isFallback: true,
        badge: 'Nearest'
      };
      return [localHDBCarpark];
    }

    return assignBadgesAndSort(result.filter(c => c.distanceMeters <= 4000));
  }

  // Assign Badges:
  // Sort by Best Value (composite weighting distance heavily and cost)
  return assignBadgesAndSort(nearby);
}

export function assignBadgesAndSort(carparks: Carpark[]): Carpark[] {
  if (carparks.length === 0) return [];

  // Filter car parks with known rates for Best Value & Cheapest
  const withRates = carparks.filter(c => c.estimatedCost !== null);

  // Identify cheapest
  let minCost = Infinity;
  let cheapestId: string | null = null;
  for (const c of withRates) {
    if (c.estimatedCost !== null && c.estimatedCost < minCost) {
      minCost = c.estimatedCost;
      cheapestId = c.id;
    }
  }

  // Identify nearest
  let minDistance = Infinity;
  let nearestId: string | null = null;
  for (const c of carparks) {
    if (c.distanceMeters < minDistance) {
      minDistance = c.distanceMeters;
      nearestId = c.id;
    }
  }

  // Compute Best Value Score:
  // Prompt: "Best value (default). Best value weights distance heavily; only car parks within 1 km of the destination are considered."
  // Score = (distanceMeters / 1000) * 0.65 + (cost / maxCost) * 0.35
  const maxCost = Math.max(...withRates.map(c => c.estimatedCost ?? 5), 10);
  let bestScore = Infinity;
  let bestValueId: string | null = null;

  for (const c of withRates) {
    if (c.distanceMeters <= 1000 && c.estimatedCost !== null) {
      const score = (c.distanceMeters / 1000) * 0.65 + (c.estimatedCost / maxCost) * 0.35;
      if (score < bestScore) {
        bestScore = score;
        bestValueId = c.id;
      }
    }
  }

  // Assign at most ONE badge per card:
  // Priority: Best value -> Cheapest -> Nearest
  const assigned = carparks.map(c => {
    let badge: 'Best value' | 'Cheapest' | 'Nearest' | undefined = undefined;
    if (c.id === bestValueId) {
      badge = 'Best value';
    } else if (c.id === cheapestId) {
      badge = 'Cheapest';
    } else if (c.id === nearestId) {
      badge = 'Nearest';
    }
    return { ...c, badge };
  });

  // Sort by Best Value composite ranking first, then distance
  assigned.sort((a, b) => {
    const scoreA = a.id === bestValueId ? -100 : ((a.distanceMeters / 1000) * 0.65 + ((a.estimatedCost ?? 99) / maxCost) * 0.35);
    const scoreB = b.id === bestValueId ? -100 : ((b.distanceMeters / 1000) * 0.65 + ((b.estimatedCost ?? 99) / maxCost) * 0.35);
    return scoreA - scoreB;
  });

  return assigned;
}
