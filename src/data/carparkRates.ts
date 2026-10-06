import { CarparkRateDefinition, DayType, RateRule } from '../types/index.ts';
import { LTA_CARPARK_RATES_DATASET } from './ltaCarparkRatesDatabase.ts';

/**
 * Normalises a car park name for fuzzy matching:
 * - Lowercase
 * - Strip punctuation and non-alphanumeric chars
 * - Trim and collapse multiple spaces
 */
export function normaliseCarparkName(name: string): string {
  if (!name) return '';
  const lower = name
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip boilerplate suffixes only if significant name remains
  const stripped = lower
    .replace(/\b(car park|carpark|cp|centre|center|shopping centre|shopping mall|shopping plaza|retail centre|shopping|mall|tower|towers|building|station|plaza|off street|offstreet)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return stripped.length >= 3 ? stripped : lower;
}

/**
 * Parses textual rate string into structured RateRule array for a given day type
 */
function parseSegmentToRules(str: string, dayType: DayType, defaultStart: string = '07:00', defaultEnd: string = '18:00'): RateRule[] {
  if (!str || str === '-' || str === 'N.A.') return [];
  const rules: RateRule[] = [];

  // 1. Check if first hour is free
  if (/1st\s*(?:hr|hour|1 hr):\s*free/i.test(str) || /free\s*for\s*(?:1st|first)\s*(?:hr|hour|2hrs|2 hrs)/i.test(str)) {
    const hours = /2\s*hrs?/i.test(str) ? 2 : 1;
    rules.push({ dayType, startTime: defaultStart, endTime: defaultEnd, type: 'first_block', blockMinutes: hours * 60, amountSGD: 0 });
  }

  // 2. Per minute rate (e.g. $0.018 /min or per min)
  const perMin = str.match(/\$([0-9.]+)\s*(?:\/|\s*per\s*)min/i);
  if (perMin) {
    rules.push({ dayType, startTime: '00:00', endTime: '24:00', type: 'per_minute', blockMinutes: 1, amountSGD: parseFloat(perMin[1]) });
    return rules;
  }

  // 3. 1st hr / block + subsequent (e.g. "$1.20 for 1st hr; $0.60 for sub. ½ hr")
  const firstMatch = str.match(/(?:(?:1st|first)\s*([0-9.]+)?\s*hrs?.*?\$([0-9.]+))|(?:\$([0-9.]+)\s*(?:for\s*(?:1st|first)\s*([0-9.]+)?\s*hrs?))/i);
  const subMatch = str.match(/(?:sub(?:sequent)?\.?\s*([0-9.]+)?\s*(?:½|half|15|30|hr|hours?|mins?)?.*?\$([0-9.]+))|(?:\$([0-9.]+)\s*(?:for\s*sub(?:sequent)?\.?\s*([0-9.]+)?\s*(?:½|half|15|30|hr|hours?|mins?)?))/i);

  if (firstMatch && rules.length === 0) {
    const hours = parseFloat(firstMatch[1] || firstMatch[4] || '1');
    const amt = parseFloat(firstMatch[2] || firstMatch[3]);
    if (!isNaN(amt)) {
      rules.push({ dayType, startTime: defaultStart, endTime: defaultEnd, type: 'first_block', blockMinutes: Math.round(hours * 60), amountSGD: amt });
    }
  }

  if (subMatch) {
    const amt = parseFloat(subMatch[2] || subMatch[3]);
    let mins = 30;
    if (/15\s*min/i.test(str)) mins = 15;
    else if (/(?:1\s*hr|per\s*hr|sub\.\s*hr)/i.test(str) && !/(?:½|half|30)/i.test(str)) mins = 60;
    else if (/(?:2\s*hrs?)/i.test(str)) mins = 120;
    if (!isNaN(amt)) {
      rules.push({ dayType, startTime: defaultStart, endTime: defaultEnd, type: 'subsequent_block', blockMinutes: mins, amountSGD: amt });
    }
  }

  // 4. Flat hourly (e.g. "$1.20 per hr", "$1.20 for 1 hr", or "$1.20/hr")
  if (rules.length === 0) {
    const hourly = str.match(/\$([0-9.]+)\s*(?:per\s*hr|\/\s*hr|for\s*1?\s*hr|per\s*hour)/i);
    if (hourly) {
      rules.push({ dayType, startTime: defaultStart, endTime: defaultEnd, type: 'flat_hourly', blockMinutes: 60, amountSGD: parseFloat(hourly[1]) });
    }
  }

  // 5. Flat per 30 mins (e.g. "$1.28 for ½ hr", "$1.30 / 30 mins", "$0.60 per ½ hr", "$0.50 /30 mins")
  if (rules.length === 0) {
    const halfHour = str.match(/\$([0-9.]+)\s*(?:\/\s*30\s*mins?|(?:per|for|\/)\s*(?:30\s*mins?|½\s*hr|half\s*hr|half\s*hour))/i);
    if (halfHour) {
      rules.push({ dayType, startTime: defaultStart, endTime: defaultEnd, type: 'flat_hourly', blockMinutes: 30, amountSGD: parseFloat(halfHour[1]) });
    }
  }

  // 6. Per entry (e.g. "$2 per entry" or "$2.50 / entry")
  const perEntry = str.match(/\$([0-9.]+)\s*(?:per|\/)\s*entry/i);
  if (perEntry) {
    rules.push({ dayType, startTime: '18:00', endTime: '07:00', type: 'per_entry', blockMinutes: 720, amountSGD: parseFloat(perEntry[1]) });
  }

  return rules;
}

/**
 * Curated high-precision carparks with detailed day/night multi-bracket rules
 */
const CURATED_CARPARK_RATES: CarparkRateDefinition[] = [
  {
    normalisedName: 'the strategy',
    name: 'The Strategy (International Business Park)',
    category: 'West',
    aliases: ['the strategy', 'strategy', 'strategy ibp', 'international business park', 'ibp', '2 international business park', 'the strategy jurong east'],
    publishedRateText: {
      weekdays: 'Mon-Sat 07:00-22:00: $2.00 for 1st hr, $1.50/subsequent 30 mins | 22:01-07:00: $2.00 per entry',
      saturday: 'Mon-Sat 07:00-22:00: $2.00 for 1st hr, $1.50/subsequent 30 mins | 22:01-07:00: $2.00 per entry',
      sunday_ph: '07:00-07:00 next day: $2.00 per entry'
    },
    rules: [
      { dayType: 'weekday', startTime: '07:00', endTime: '22:00', type: 'first_block', blockMinutes: 60, amountSGD: 2.00 },
      { dayType: 'weekday', startTime: '07:00', endTime: '22:00', type: 'subsequent_block', blockMinutes: 30, amountSGD: 1.50 },
      { dayType: 'weekday', startTime: '22:00', endTime: '07:00', type: 'per_entry', blockMinutes: 540, amountSGD: 2.00 },
      { dayType: 'saturday', startTime: '07:00', endTime: '22:00', type: 'first_block', blockMinutes: 60, amountSGD: 2.00 },
      { dayType: 'saturday', startTime: '07:00', endTime: '22:00', type: 'subsequent_block', blockMinutes: 30, amountSGD: 1.50 },
      { dayType: 'saturday', startTime: '22:00', endTime: '07:00', type: 'per_entry', blockMinutes: 540, amountSGD: 2.00 },
      { dayType: 'sunday_ph', startTime: '00:00', endTime: '24:00', type: 'per_entry', blockMinutes: 1440, amountSGD: 2.00 }
    ],
    defaultAgency: 'COMMERCIAL'
  },
  {
    normalisedName: 'the synergy',
    name: 'The Synergy (International Business Park)',
    category: 'West',
    aliases: ['the synergy', 'synergy', 'synergy ibp', '1 international business park', 'the synergy jurong east'],
    publishedRateText: {
      weekdays: 'Mon-Sat 07:00-22:00: $2.00 for 1st hr, $1.50/subsequent 30 mins | 22:01-07:00: $2.00 per entry',
      saturday: 'Mon-Sat 07:00-22:00: $2.00 for 1st hr, $1.50/subsequent 30 mins | 22:01-07:00: $2.00 per entry',
      sunday_ph: '07:00-07:00 next day: $2.00 per entry'
    },
    rules: [
      { dayType: 'weekday', startTime: '07:00', endTime: '22:00', type: 'first_block', blockMinutes: 60, amountSGD: 2.00 },
      { dayType: 'weekday', startTime: '07:00', endTime: '22:00', type: 'subsequent_block', blockMinutes: 30, amountSGD: 1.50 },
      { dayType: 'weekday', startTime: '22:00', endTime: '07:00', type: 'per_entry', blockMinutes: 540, amountSGD: 2.00 },
      { dayType: 'saturday', startTime: '07:00', endTime: '22:00', type: 'first_block', blockMinutes: 60, amountSGD: 2.00 },
      { dayType: 'saturday', startTime: '07:00', endTime: '22:00', type: 'subsequent_block', blockMinutes: 30, amountSGD: 1.50 },
      { dayType: 'saturday', startTime: '22:00', endTime: '07:00', type: 'per_entry', blockMinutes: 540, amountSGD: 2.00 },
      { dayType: 'sunday_ph', startTime: '00:00', endTime: '24:00', type: 'per_entry', blockMinutes: 1440, amountSGD: 2.00 }
    ],
    defaultAgency: 'COMMERCIAL'
  },
  {
    normalisedName: 'german centre',
    name: 'German Centre (International Business Park)',
    category: 'West',
    aliases: ['german centre', 'german center', 'german centre ibp', '25 international business park'],
    publishedRateText: {
      weekdays: 'Mon-Fri 07:00-17:00: $2.50 per hr | 17:00-07:00: $2.50 per entry',
      saturday: '07:00-01:00 next day: $2.50 per hr',
      sunday_ph: '07:00-07:00 next day: $2.50 per entry'
    },
    rules: [
      { dayType: 'weekday', startTime: '07:00', endTime: '17:00', type: 'flat_hourly', blockMinutes: 60, amountSGD: 2.50 },
      { dayType: 'weekday', startTime: '17:00', endTime: '07:00', type: 'per_entry', blockMinutes: 840, amountSGD: 2.50 },
      { dayType: 'saturday', startTime: '07:00', endTime: '01:00', type: 'flat_hourly', blockMinutes: 60, amountSGD: 2.50 },
      { dayType: 'sunday_ph', startTime: '00:00', endTime: '24:00', type: 'per_entry', blockMinutes: 1440, amountSGD: 2.50 }
    ],
    defaultAgency: 'COMMERCIAL'
  },
  {
    normalisedName: 'ngee ann city',
    name: 'Ngee Ann City (Takashimaya)',
    category: 'Orchard Area',
    aliases: ['takashimaya', 'taka', 'takashimaya shopping centre', 'ngee ann city', '391 orchard road', 'orchard takashimaya', 'takashimaya carpark'],
    publishedRateText: {
      weekdays: '12:01am-12:00pm, 2:01pm-5:00pm: $1.28 for ½ hr | 12:01pm-2:00pm, 5:01pm-7:00pm: $1.82 for ½ hr | Aft 7:00pm: $4.28 per entry',
      saturday: '12:01am-12:00pm, 2:01pm-5:00pm: $2.57 for 1st hr, $1.61/sub ½ hr | 12:01pm-2:00pm, 5:01pm-7:00pm: $3.64 for 1st hr, $2.14/sub ½ hr | Aft 7:00pm: $4.28/entry',
      sunday_ph: 'Same as Saturday'
    },
    rules: [
      // Weekday morning (07:00-12:00) $1.28 / 30 mins
      { dayType: 'weekday', startTime: '07:00', endTime: '12:00', type: 'flat_hourly', blockMinutes: 30, amountSGD: 1.28 },
      // Weekday lunch peak (12:00-14:00) $1.82 / 30 mins
      { dayType: 'weekday', startTime: '12:00', endTime: '14:00', type: 'flat_hourly', blockMinutes: 30, amountSGD: 1.82 },
      // Weekday afternoon (14:00-17:00) $1.28 / 30 mins
      { dayType: 'weekday', startTime: '14:00', endTime: '17:00', type: 'flat_hourly', blockMinutes: 30, amountSGD: 1.28 },
      // Weekday evening peak (17:00-19:00) $1.82 / 30 mins
      { dayType: 'weekday', startTime: '17:00', endTime: '19:00', type: 'flat_hourly', blockMinutes: 30, amountSGD: 1.82 },
      // Weekday overnight (19:00-07:00) $4.28 per entry
      { dayType: 'weekday', startTime: '19:00', endTime: '07:00', type: 'per_entry', blockMinutes: 720, amountSGD: 4.28 },
      // Saturday daytime
      { dayType: 'saturday', startTime: '07:00', endTime: '12:00', type: 'first_block', blockMinutes: 60, amountSGD: 2.57 },
      { dayType: 'saturday', startTime: '07:00', endTime: '12:00', type: 'subsequent_block', blockMinutes: 30, amountSGD: 1.61 },
      { dayType: 'saturday', startTime: '12:00', endTime: '19:00', type: 'first_block', blockMinutes: 60, amountSGD: 3.64 },
      { dayType: 'saturday', startTime: '12:00', endTime: '19:00', type: 'subsequent_block', blockMinutes: 30, amountSGD: 2.14 },
      { dayType: 'saturday', startTime: '19:00', endTime: '07:00', type: 'per_entry', blockMinutes: 720, amountSGD: 4.28 },
      // Sunday & PH
      { dayType: 'sunday_ph', startTime: '07:00', endTime: '12:00', type: 'first_block', blockMinutes: 60, amountSGD: 2.57 },
      { dayType: 'sunday_ph', startTime: '07:00', endTime: '12:00', type: 'subsequent_block', blockMinutes: 30, amountSGD: 1.61 },
      { dayType: 'sunday_ph', startTime: '12:00', endTime: '19:00', type: 'first_block', blockMinutes: 60, amountSGD: 3.64 },
      { dayType: 'sunday_ph', startTime: '12:00', endTime: '19:00', type: 'subsequent_block', blockMinutes: 30, amountSGD: 2.14 },
      { dayType: 'sunday_ph', startTime: '19:00', endTime: '07:00', type: 'per_entry', blockMinutes: 720, amountSGD: 4.28 },
    ]
  },
  {
    normalisedName: 'marina bay sands',
    name: 'Marina Bay Sands',
    category: 'South & CBD',
    aliases: ['mbs', 'shoppes at marina bay sands', 'marina bay sands hotel', 'bayfront'],
    publishedRateText: {
      weekdays: 'Mon-Thu 07:00-19:00: $8.72 for 1st hr, $2.18/subsequent 30 mins (Max $32.70/day). 19:00-07:00: $9.81/entry.',
      saturday: 'Fri-Sun & PH 07:00-19:00: $10.90 for 1st hr, $2.18/subsequent 30 mins (Max $38.15/day). 19:00-07:00: $10.90/entry.',
      sunday_ph: 'Fri-Sun & PH 07:00-19:00: $10.90 for 1st hr, $2.18/subsequent 30 mins. 19:00-07:00: $10.90/entry.'
    },
    rules: [
      { dayType: 'weekday', startTime: '07:00', endTime: '19:00', type: 'first_block', blockMinutes: 60, amountSGD: 8.72 },
      { dayType: 'weekday', startTime: '07:00', endTime: '19:00', type: 'subsequent_block', blockMinutes: 30, amountSGD: 2.18 },
      { dayType: 'weekday', startTime: '19:00', endTime: '07:00', type: 'per_entry', blockMinutes: 720, amountSGD: 9.81 },
      { dayType: 'saturday', startTime: '07:00', endTime: '19:00', type: 'first_block', blockMinutes: 60, amountSGD: 10.90 },
      { dayType: 'saturday', startTime: '07:00', endTime: '19:00', type: 'subsequent_block', blockMinutes: 30, amountSGD: 2.18 },
      { dayType: 'saturday', startTime: '19:00', endTime: '07:00', type: 'per_entry', blockMinutes: 720, amountSGD: 10.90 },
      { dayType: 'sunday_ph', startTime: '07:00', endTime: '19:00', type: 'first_block', blockMinutes: 60, amountSGD: 10.90 },
      { dayType: 'sunday_ph', startTime: '07:00', endTime: '19:00', type: 'subsequent_block', blockMinutes: 30, amountSGD: 2.18 },
      { dayType: 'sunday_ph', startTime: '19:00', endTime: '07:00', type: 'per_entry', blockMinutes: 720, amountSGD: 10.90 },
    ]
  },
  {
    normalisedName: 'suntec city',
    name: 'Suntec City',
    category: 'South & CBD',
    aliases: ['suntec', 'suntec convention', 'suntec towers'],
    publishedRateText: {
      weekdays: '07:00-17:00: $2.40 for 1st hr, $1.20/subsequent 30 mins. 17:00-07:00: $3.20/entry.',
      saturday: '07:00-07:00 next day: $2.60 for 1st 4 hrs, $1.30/subsequent hr (capped at $12.00).',
      sunday_ph: '07:00-07:00 next day: $2.60 for 1st 4 hrs, $1.30/subsequent hr.'
    },
    rules: [
      { dayType: 'weekday', startTime: '07:00', endTime: '17:00', type: 'first_block', blockMinutes: 60, amountSGD: 2.40 },
      { dayType: 'weekday', startTime: '07:00', endTime: '17:00', type: 'subsequent_block', blockMinutes: 30, amountSGD: 1.20 },
      { dayType: 'weekday', startTime: '17:00', endTime: '07:00', type: 'per_entry', blockMinutes: 840, amountSGD: 3.20 },
      { dayType: 'saturday', startTime: '07:00', endTime: '07:00', type: 'first_block', blockMinutes: 240, amountSGD: 2.60 },
      { dayType: 'saturday', startTime: '07:00', endTime: '07:00', type: 'subsequent_block', blockMinutes: 60, amountSGD: 1.30 },
      { dayType: 'sunday_ph', startTime: '07:00', endTime: '07:00', type: 'first_block', blockMinutes: 240, amountSGD: 2.60 },
      { dayType: 'sunday_ph', startTime: '07:00', endTime: '07:00', type: 'subsequent_block', blockMinutes: 60, amountSGD: 1.30 },
    ]
  },
  {
    normalisedName: 'millenia walk',
    name: 'Millenia Walk',
    category: 'South & CBD',
    aliases: ['millenia', 'millenia tower', 'centennial tower'],
    publishedRateText: {
      weekdays: '07:00-18:00: $3.30 for 1st 2 hrs, $1.10/subsequent 30 mins. 18:00-07:00: $3.30/entry.',
      saturday: '07:00-07:00: $3.30 for 1st 2 hrs, $1.10/subsequent 30 mins. Max $8.80 per 24 hrs.',
      sunday_ph: 'Same as Saturday.'
    },
    rules: [
      { dayType: 'weekday', startTime: '07:00', endTime: '18:00', type: 'first_block', blockMinutes: 120, amountSGD: 3.30 },
      { dayType: 'weekday', startTime: '07:00', endTime: '18:00', type: 'subsequent_block', blockMinutes: 30, amountSGD: 1.10 },
      { dayType: 'weekday', startTime: '18:00', endTime: '07:00', type: 'per_entry', blockMinutes: 780, amountSGD: 3.30 },
      { dayType: 'saturday', startTime: '07:00', endTime: '07:00', type: 'first_block', blockMinutes: 120, amountSGD: 3.30 },
      { dayType: 'saturday', startTime: '07:00', endTime: '07:00', type: 'subsequent_block', blockMinutes: 30, amountSGD: 1.10 },
      { dayType: 'sunday_ph', startTime: '07:00', endTime: '07:00', type: 'first_block', blockMinutes: 120, amountSGD: 3.30 },
      { dayType: 'sunday_ph', startTime: '07:00', endTime: '07:00', type: 'subsequent_block', blockMinutes: 30, amountSGD: 1.10 },
    ]
  },
  {
    normalisedName: 'marina square',
    name: 'Marina Square',
    category: 'South & CBD',
    aliases: ['marina sq', 'pan pacific', 'mandarin oriental'],
    publishedRateText: {
      weekdays: '07:00-17:00: $2.40 for 1st 2 hrs, $1.20/subsequent 30 mins. 17:00-07:00: $3.00/entry.',
      saturday: '07:00-07:00: $2.60 for 1st 2 hrs, $1.20/subsequent 30 mins.',
      sunday_ph: '07:00-07:00: $2.60 for 1st 2 hrs, $1.20/subsequent 30 mins.'
    },
    rules: [
      { dayType: 'weekday', startTime: '07:00', endTime: '17:00', type: 'first_block', blockMinutes: 120, amountSGD: 2.40 },
      { dayType: 'weekday', startTime: '07:00', endTime: '17:00', type: 'subsequent_block', blockMinutes: 30, amountSGD: 1.20 },
      { dayType: 'weekday', startTime: '17:00', endTime: '07:00', type: 'per_entry', blockMinutes: 840, amountSGD: 3.00 },
      { dayType: 'saturday', startTime: '07:00', endTime: '07:00', type: 'first_block', blockMinutes: 120, amountSGD: 2.60 },
      { dayType: 'saturday', startTime: '07:00', endTime: '07:00', type: 'subsequent_block', blockMinutes: 30, amountSGD: 1.20 },
      { dayType: 'sunday_ph', startTime: '07:00', endTime: '07:00', type: 'first_block', blockMinutes: 120, amountSGD: 2.60 },
      { dayType: 'sunday_ph', startTime: '07:00', endTime: '07:00', type: 'subsequent_block', blockMinutes: 30, amountSGD: 1.20 },
    ]
  }
];

/**
 * Common known aliases for landmarks and shopping centres
 */
const COMMON_ALIASES: Record<string, string[]> = {
  'the strategy': ['the strategy', 'strategy', 'strategy ibp', 'international business park', 'ibp', '2 international business park'],
  'the synergy': ['the synergy', 'synergy', 'synergy ibp', 'international business park', 'ibp', '1 international business park'],
  'german centre': ['german centre', 'german center', 'german centre ibp', '25 international business park'],
  'ngee ann city': ['takashimaya', 'taka', 'takashimaya shopping centre', 'ngee ann city', '391 orchard road', 'orchard takashimaya'],
  'takashimaya': ['takashimaya', 'taka', 'takashimaya shopping centre', 'ngee ann city', '391 orchard road', 'orchard takashimaya'],
  'ion orchard': ['ion', 'ion orchard'],
  'vivocity': ['vivo', 'harbourfront'],
  'jurong point shopping centre': ['jurong point', 'jp'],
  'ang mo kio hub': ['amk hub', 'ang mo kio hub'],
  'junction 8 shopping centre': ['junction 8', 'j8', 'bishan junction 8'],
  'great world city': ['great world', 'great world city'],
  '313@somerset': ['313 somerset', '313'],
  'orchard central': ['oc', 'orchard central'],
  'plaza singapura': ['ps', 'plaza sing', 'plaza singapura'],
  'paragon shopping centre': ['paragon'],
  'bugis junction': ['bugis', 'parco bugis'],
  'tampines mall': ['tampines 1', 'century square'],
  'imm building': ['imm'],
  'causeway point': ['woodlands causeway point', 'causeway point'],
  'northpoint shopping centre': ['northpoint city', 'northpoint'],
  'jewel changi airport': ['jewel', 'changi jewel'],
  'velocity @ novena square': ['novena square', 'novena sq'],
  'raffles city': ['raffles city shopping', 'swissotel the stamford'],
  'the centrepoint': ['centrepoint'],
  'wheelock place': ['wheelock'],
  'the star vista': ['the star vista', 'star vista', 'star vista mall', 'star vista carpark', '1 vista exchange green', 'the star performing arts centre'],
  'star vista': ['the star vista', 'star vista', 'star vista mall', 'star vista carpark']
};

/**
 * Parses all 357 records from data.gov.sg dataset d_9f6056bdb6b1dfba57f063593e4f34ae
 */
function buildLTARatesDatabase(): CarparkRateDefinition[] {
  const records = LTA_CARPARK_RATES_DATASET.records || [];
  const list: CarparkRateDefinition[] = [];

  for (const r of records) {
    const rawName = r.carpark.trim();
    const norm = normaliseCarparkName(rawName);

    // Skip if already in curated list
    if (CURATED_CARPARK_RATES.some(c => c.normalisedName === norm)) {
      continue;
    }

    const w1 = r.weekdays_rate_1 || '';
    const w2 = r.weekdays_rate_2 || '';
    const sat = r.saturday_rate || '';
    const sun = r.sunday_publicholiday_rate || '';

    // Published text
    const weekdayText = w1 + (w2 && w2 !== '-' ? ` | ${w2}` : '');
    const satText = sat && sat !== '-' ? sat : (w1 ? 'Same as weekdays' : 'Rate unavailable');
    const sunText = sun && sun !== '-' ? sun : (satText !== 'Rate unavailable' ? 'Same as Saturday' : 'Rate unavailable');

    // Parse weekday rules
    let weekdayRules = parseSegmentToRules(w1, 'weekday', '07:00', '18:00');
    if (w2 && w2 !== '-') {
      const eveningRules = parseSegmentToRules(w2, 'weekday', '18:00', '07:00');
      weekdayRules = [...weekdayRules, ...eveningRules];
    }

    // Parse Saturday rules
    let satRules: RateRule[] = [];
    if (/same as (?:wkdays|weekdays)/i.test(sat) || sat === '-') {
      satRules = weekdayRules.map(rule => ({ ...rule, dayType: 'saturday' as DayType }));
    } else {
      satRules = parseSegmentToRules(sat, 'saturday', '07:00', '18:00');
    }

    // Parse Sunday/PH rules
    let sunRules: RateRule[] = [];
    if (/same as saturday/i.test(sun) || sun === '-') {
      sunRules = satRules.map(rule => ({ ...rule, dayType: 'sunday_ph' as DayType }));
    } else if (/same as (?:wkdays|weekdays)/i.test(sun)) {
      sunRules = weekdayRules.map(rule => ({ ...rule, dayType: 'sunday_ph' as DayType }));
    } else {
      sunRules = parseSegmentToRules(sun, 'sunday_ph', '07:00', '18:00');
    }

    const allRules = [...weekdayRules, ...satRules, ...sunRules];

    // Build aliases
    const aliases: string[] = [];
    if (COMMON_ALIASES[norm]) {
      aliases.push(...COMMON_ALIASES[norm]);
    }
    // Add stripped version if different
    const lowerRaw = rawName.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (lowerRaw !== norm && !aliases.includes(lowerRaw)) {
      aliases.push(lowerRaw);
    }

    list.push({
      normalisedName: norm,
      name: rawName,
      category: r.category,
      aliases,
      publishedRateText: {
        weekdays: weekdayText,
        saturday: satText,
        sunday_ph: sunText
      },
      rules: allRules.length > 0 ? allRules : [
        // Fallback approximate rate if text was unstructured
        { dayType: 'weekday', startTime: '07:00', endTime: '18:00', type: 'flat_hourly', blockMinutes: 60, amountSGD: 1.50, isApproximate: true },
        { dayType: 'saturday', startTime: '07:00', endTime: '18:00', type: 'flat_hourly', blockMinutes: 60, amountSGD: 1.50, isApproximate: true },
        { dayType: 'sunday_ph', startTime: '07:00', endTime: '18:00', type: 'flat_hourly', blockMinutes: 60, amountSGD: 1.50, isApproximate: true }
      ],
      isApproximate: allRules.length === 0,
      defaultAgency: 'COMMERCIAL'
    });
  }

  return list;
}

/**
 * Standard HDB Central & Non-Central definitions
 */
export const HDB_CENTRAL_DEF: CarparkRateDefinition = {
  normalisedName: 'hdb central area',
  name: 'HDB / URA Central Area',
  category: 'South & CBD',
  aliases: ['hdb central', 'ura central', 'hdb central area'],
  publishedRateText: {
    weekdays: '07:00-17:00: $1.20 per 30 mins. 17:00-07:00: $0.60 per 30 mins (max $5.00/night).',
    saturday: 'Same as weekdays.',
    sunday_ph: '07:00-22:30: Free or $0.60 per 30 mins.'
  },
  rules: [
    { dayType: 'weekday', startTime: '07:00', endTime: '17:00', type: 'flat_hourly', blockMinutes: 30, amountSGD: 1.20 },
    { dayType: 'weekday', startTime: '17:00', endTime: '07:00', type: 'flat_hourly', blockMinutes: 30, amountSGD: 0.60 },
    { dayType: 'saturday', startTime: '07:00', endTime: '17:00', type: 'flat_hourly', blockMinutes: 30, amountSGD: 1.20 },
    { dayType: 'saturday', startTime: '17:00', endTime: '07:00', type: 'flat_hourly', blockMinutes: 30, amountSGD: 0.60 },
    { dayType: 'sunday_ph', startTime: '07:00', endTime: '22:30', type: 'flat_hourly', blockMinutes: 30, amountSGD: 0.60 },
    { dayType: 'sunday_ph', startTime: '22:30', endTime: '07:00', type: 'flat_hourly', blockMinutes: 30, amountSGD: 0.60 },
  ],
  defaultAgency: 'HDB'
};

export const HDB_NON_CENTRAL_DEF: CarparkRateDefinition = {
  normalisedName: 'hdb non central',
  name: 'HDB / URA Standard (Non-Central)',
  category: 'Central, North & North East',
  aliases: ['hdb standard', 'ura standard', 'hdb non central'],
  publishedRateText: {
    weekdays: '07:00-22:30: $0.60 per 30 mins. 22:30-07:00: $0.60 per 30 mins (capped at $5.00 night parking).',
    saturday: 'Same as weekdays.',
    sunday_ph: '07:00-22:30: Free parking scheme (selected), or $0.60 per 30 mins.'
  },
  rules: [
    { dayType: 'weekday', startTime: '07:00', endTime: '22:30', type: 'flat_hourly', blockMinutes: 30, amountSGD: 0.60 },
    { dayType: 'weekday', startTime: '22:30', endTime: '07:00', type: 'flat_hourly', blockMinutes: 30, amountSGD: 0.60 },
    { dayType: 'saturday', startTime: '07:00', endTime: '22:30', type: 'flat_hourly', blockMinutes: 30, amountSGD: 0.60 },
    { dayType: 'saturday', startTime: '22:30', endTime: '07:00', type: 'flat_hourly', blockMinutes: 30, amountSGD: 0.60 },
    { dayType: 'sunday_ph', startTime: '07:00', endTime: '22:30', type: 'flat_hourly', blockMinutes: 30, amountSGD: 0.60 },
    { dayType: 'sunday_ph', startTime: '22:30', endTime: '07:00', type: 'flat_hourly', blockMinutes: 30, amountSGD: 0.60 },
  ],
  defaultAgency: 'HDB'
};

/**
 * Complete Database containing:
 * 1. Curated high-precision rates
 * 2. 357 LTA/data.gov.sg commercial car park rates
 * 3. Standard HDB/URA central and non-central rates
 */
export const CARPARK_RATES_DATABASE: CarparkRateDefinition[] = [
  ...CURATED_CARPARK_RATES,
  ...buildLTARatesDatabase(),
  HDB_CENTRAL_DEF,
  HDB_NON_CENTRAL_DEF
];

/**
 * Raw data.gov.sg dataset info and records
 */
export const LTA_DATASET_INFO = {
  datasetId: 'd_9f6056bdb6b1dfba57f063593e4f34ae',
  source: 'https://data.gov.sg/datasets/d_9f6056bdb6b1dfba57f063593e4f34ae',
  title: 'Carpark Rates (data.gov.sg / LTA)',
  totalRecords: LTA_CARPARK_RATES_DATASET.records?.length || 357
};

/**
 * Precision scoring helper to match candidate carpark name against a rate definition
 */
function scoreMatch(queryClean: string, candidate: CarparkRateDefinition): number {
  const cClean = candidate.name.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  const cNorm = candidate.normalisedName;

  // Exact full name match
  if (queryClean === cClean || queryClean === cNorm) return 100;

  // Exact alias match
  if (candidate.aliases.some(a => normaliseCarparkName(a) === queryClean)) return 98;

  // Strip common suffixes
  const stripSuffix = (s: string) =>
    s.replace(/\b(car park|carpark|cp|shopping centre|shopping mall|shopping plaza|retail centre|shopping|centre|center|mall|plaza|building|towers?|complex)\b/g, '')
     .replace(/\s+/g, ' ')
     .trim();

  const qCore = stripSuffix(queryClean);
  const cCore = stripSuffix(cClean);

  if (qCore && cCore && qCore === cCore) return 95;

  // Multi-word phrase containment
  if (qCore.length >= 4 && cCore.length >= 4) {
    if (cCore.startsWith(qCore) || qCore.startsWith(cCore)) return 90;
    const cWords = cCore.split(' ').filter(w => w.length >= 3);
    const qWords = qCore.split(' ').filter(w => w.length >= 3);
    if (qWords.length >= 2 && qWords.every(w => cWords.includes(w))) return 85;
    if (cWords.length >= 2 && cWords.every(w => qWords.includes(w))) return 80;
  }

  // Alias containment
  for (const alias of candidate.aliases) {
    const aNorm = normaliseCarparkName(alias);
    if (aNorm.length >= 4 && (queryClean.includes(aNorm) || aNorm.includes(queryClean))) {
      return 75;
    }
  }

  return 0;
}

/**
 * Attempt to match a carpark name to the official data.gov.sg rates database.
 * If development name matches any carpark or alias, returns the definition.
 * Also handles standard HDB / URA pattern matching.
 */
export function matchCarparkRateDefinition(
  rawName: string,
  agency?: string
): CarparkRateDefinition | null {
  if (!rawName) return null;
  const cleanQ = rawName.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleanQ) return null;

  // 1. Check curated and commercial database
  let bestMatch: CarparkRateDefinition | null = null;
  let highestScore = 0;

  for (const def of CARPARK_RATES_DATABASE) {
    // Skip fallback HDB defs during commercial scoring
    if (def === HDB_CENTRAL_DEF || def === HDB_NON_CENTRAL_DEF) continue;

    const score = scoreMatch(cleanQ, def);
    if (score > highestScore) {
      highestScore = score;
      bestMatch = def;
      if (score === 100) break; // Found exact match
    }
  }

  // Score threshold for commercial match: 75+
  if (bestMatch && highestScore >= 75) {
    return bestMatch;
  }

  // 2. Check if HDB / URA
  const isHDB = agency === 'HDB' || /^[A-Z0-9]{3,5}$/.test(rawName.trim()) || /blk\s*\d+/i.test(rawName);
  const isURA = agency === 'URA';

  if (isHDB || isURA) {
    // Check if in central area
    const isCentral = /marina|orchard|bugis|chinatown|raffles|tanjong|shenton|rochor/i.test(rawName);
    const def = isCentral ? HDB_CENTRAL_DEF : HDB_NON_CENTRAL_DEF;
    return {
      ...def,
      name: rawName,
      isApproximate: true
    };
  }

  return null;
}

/**
 * Returns all carparks available in the rates database
 */
export function getAllCarparkRateDefinitions(): CarparkRateDefinition[] {
  return CARPARK_RATES_DATABASE;
}

/**
 * Lookup by exact name or query
 */
export function getRateDefinitionByCarparkName(name: string): CarparkRateDefinition | null {
  return matchCarparkRateDefinition(name);
}
