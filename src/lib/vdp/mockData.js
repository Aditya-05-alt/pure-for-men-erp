/** Seeded mock dataset ported from vdp_dashboard_prototype.html — sample data only. */

export const TODAY = new Date('2026-07-29T00:00:00');

export const RAW_SOURCES = [
  { id: 'google-organic', rawSource: 'google', rawMedium: 'organic', weight: 0.22, vdpRate: 0.43 },
  { id: 'bing-organic', rawSource: 'bing', rawMedium: 'organic', weight: 0.05, vdpRate: 0.4 },
  { id: 'yahoo-organic', rawSource: 'yahoo', rawMedium: 'organic', weight: 0.03, vdpRate: 0.38 },
  { id: 'direct-none', rawSource: '(direct)', rawMedium: '(none)', weight: 0.2, vdpRate: 0.55 },
  { id: 'google-cpc', rawSource: 'google', rawMedium: 'cpc', weight: 0.13, vdpRate: 0.5 },
  { id: 'bing-cpc', rawSource: 'bing', rawMedium: 'cpc', weight: 0.05, vdpRate: 0.44 },
  { id: 'facebook-paid', rawSource: 'facebook', rawMedium: 'paid', weight: 0.08, vdpRate: 0.29 },
  { id: 'instagram-paid', rawSource: 'instagram', rawMedium: 'paid', weight: 0.045, vdpRate: 0.27 },
  { id: 'tiktok-paid', rawSource: 'tiktok', rawMedium: 'paid', weight: 0.015, vdpRate: 0.22 },
  { id: 'facebook-organic', rawSource: 'facebook', rawMedium: 'organic', weight: 0.045, vdpRate: 0.26 },
  { id: 'instagram-organic', rawSource: 'instagram', rawMedium: 'organic', weight: 0.035, vdpRate: 0.24 },
  { id: 'autotrader-referral', rawSource: 'autotrader.com', rawMedium: 'referral', weight: 0.025, vdpRate: 0.37 },
  { id: 'cars-referral', rawSource: 'cars.com', rawMedium: 'referral', weight: 0.02, vdpRate: 0.35 },
  { id: 'cargurus-referral', rawSource: 'cargurus.com', rawMedium: 'referral', weight: 0.015, vdpRate: 0.33 },
  { id: 'newsletter-email', rawSource: 'newsletter', rawMedium: 'email', weight: 0.025, vdpRate: 0.62 },
  { id: 'klaviyo-email', rawSource: 'klaviyo', rawMedium: 'email', weight: 0.015, vdpRate: 0.58 },
];

export function defaultChannels() {
  return [
    { id: 'organic-search', name: 'Organic Search', color: '#2563eb' },
    { id: 'direct', name: 'Direct', color: '#16a34a' },
    { id: 'paid-search', name: 'Paid Search', color: '#d97706' },
    { id: 'paid-social', name: 'Paid Social', color: '#dc2626' },
    { id: 'organic-social', name: 'Organic Social', color: '#7c3aed' },
    { id: 'referral', name: 'Referral', color: '#0891b2' },
    { id: 'email', name: 'Email', color: '#db2777' },
    { id: 'unmapped', name: 'Unmapped', color: '#94a3b8' },
  ];
}

export function defaultMapping() {
  return {
    'google-organic': 'organic-search',
    'bing-organic': 'organic-search',
    'yahoo-organic': 'organic-search',
    'direct-none': 'direct',
    'google-cpc': 'paid-search',
    'bing-cpc': 'paid-search',
    'facebook-paid': 'paid-social',
    'instagram-paid': 'paid-social',
    'tiktok-paid': 'paid-social',
    'facebook-organic': 'organic-social',
    'instagram-organic': 'organic-social',
    'autotrader-referral': 'referral',
    'cars-referral': 'referral',
    'cargurus-referral': 'referral',
    'newsletter-email': 'email',
    'klaviyo-email': 'email',
  };
}

export const CLIENTS = [
  {
    id: 'sunset-rv',
    name: 'Sunset RV & Marine',
    vertical: 'RV',
    baseDaily: 1300,
    seasonality: [0.7, 0.8, 0.95, 1.1, 1.25, 1.3],
    categories: ['Travel Trailer', 'Fifth Wheel', 'Class A Motorhome', 'Class C Motorhome', 'Toy Hauler'],
    makes: {
      'Forest River': ['Cherokee', 'Wildwood', 'Rockwood', 'Sandstorm'],
      Keystone: ['Cougar', 'Montana', 'Bullet', 'Passport'],
      'Thor Motor Coach': ['Four Winds', 'Ace', 'Freedom Elite'],
      Jayco: ['Jay Flight', 'Eagle', 'White Hawk'],
      'Grand Design': ['Reflection', 'Imagine', 'Momentum'],
    },
    inventoryCount: 46,
  },
  {
    id: 'big-sky-powersports',
    name: 'Big Sky Powersports',
    vertical: 'Powersports',
    baseDaily: 900,
    seasonality: [0.65, 0.78, 1.0, 1.2, 1.3, 1.28],
    categories: ['ATV', 'UTV / Side-by-Side', 'Snowmobile', 'Motorcycle', 'Utility'],
    makes: {
      Polaris: ['RZR', 'Ranger', 'Sportsman', 'Indy'],
      'Can-Am': ['Maverick X3', 'Defender', 'Outlander', 'Ryker'],
      Yamaha: ['YXZ1000R', 'Wolverine', 'Grizzly', 'MT-07'],
      Kawasaki: ['Mule', 'Teryx', 'KX450', 'Ninja 400'],
      Honda: ['Talon', 'Pioneer', 'Rubicon', 'CRF450'],
    },
    inventoryCount: 38,
  },
  {
    id: 'metro-auto',
    name: 'Metro Auto Group',
    vertical: 'Auto',
    baseDaily: 2600,
    seasonality: [0.95, 1.0, 1.0, 1.05, 1.05, 1.1],
    categories: ['Sedan', 'SUV', 'Truck', 'Crossover'],
    makes: {
      Toyota: ['RAV4', 'Camry', 'Tacoma', 'Highlander'],
      Ford: ['F-150', 'Explorer', 'Escape', 'Bronco'],
      Honda: ['CR-V', 'Civic', 'Accord', 'Pilot'],
      Chevrolet: ['Silverado', 'Equinox', 'Traverse', 'Malibu'],
      Jeep: ['Grand Cherokee', 'Wrangler', 'Compass', 'Gladiator'],
    },
    inventoryCount: 58,
  },
];

function mulberry32(seed) {
  return function rand() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function dateISO(d) {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function daysBetween(a, b) {
  return Math.round((b - a) / 86400000);
}

const TREND_START = new Date(TODAY.getFullYear(), TODAY.getMonth() - 5, 1);
const TREND_DAYS = daysBetween(TREND_START, TODAY) + 1;
export const TREND_DATES = Array.from({ length: TREND_DAYS }, (_, i) =>
  dateISO(addDays(TREND_START, i))
);

const VEH_START = new Date(TODAY.getFullYear(), TODAY.getMonth() - 2, 1);
const VEH_DAYS = daysBetween(VEH_START, TODAY) + 1;
export const VEH_DATES = Array.from({ length: VEH_DAYS }, (_, i) =>
  dateISO(addDays(VEH_START, i))
);

function monShort(d) {
  return d.toLocaleDateString('en-US', { month: 'short' });
}

export function buildPeriods(today = TODAY) {
  const dom = today.getDate();
  const curMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
  const twoAgoStart = new Date(today.getFullYear(), today.getMonth() - 2, 1);
  const twoAgoEnd = new Date(today.getFullYear(), today.getMonth() - 1, 0);
  const priSameDateDay = Math.min(dom, prevMonthEnd.getDate());
  const priSameDate = new Date(
    prevMonthStart.getFullYear(),
    prevMonthStart.getMonth(),
    priSameDateDay
  );
  return {
    mtd: {
      curLabel: `${monShort(curMonthStart)} 1–${dom}`,
      curFrom: dateISO(curMonthStart),
      curTo: dateISO(today),
      priLabel: `${monShort(prevMonthStart)} 1–${priSameDateDay}`,
      priFrom: dateISO(prevMonthStart),
      priTo: dateISO(priSameDate),
      name: 'Month-to-Date vs. Last Month (same dates)',
    },
    mom: {
      curLabel: `${monShort(prevMonthStart)} (full)`,
      curFrom: dateISO(prevMonthStart),
      curTo: dateISO(prevMonthEnd),
      priLabel: `${monShort(twoAgoStart)} (full)`,
      priFrom: dateISO(twoAgoStart),
      priTo: dateISO(twoAgoEnd),
      name: 'Full Last Month vs. Prior Full Month',
    },
  };
}

export const PERIODS = buildPeriods(TODAY);

function seasonalFactor(client, iso) {
  const m = new Date(iso + 'T00:00:00').getMonth();
  const idx = m - 1;
  if (idx < 0 || idx >= client.seasonality.length) return client.seasonality[0];
  return client.seasonality[idx];
}

function dowFactor(iso) {
  const dow = new Date(iso + 'T00:00:00').getDay();
  return dow === 0 || dow === 6 ? 1.15 : 1.0;
}

function generateRawDaily(client, rand) {
  const out = {};
  RAW_SOURCES.forEach((src) => {
    out[src.id] = {
      page: new Array(TREND_DATES.length),
      vdp: new Array(TREND_DATES.length),
    };
  });
  TREND_DATES.forEach((iso, i) => {
    const seas = seasonalFactor(client, iso) * dowFactor(iso);
    const totalPV = client.baseDaily * seas;
    RAW_SOURCES.forEach((src) => {
      const noise = 0.85 + rand() * 0.3;
      const pv = totalPV * src.weight * noise;
      const vdpNoise = 0.85 + rand() * 0.3;
      out[src.id].page[i] = pv;
      out[src.id].vdp[i] = pv * src.vdpRate * vdpNoise;
    });
  });
  return out;
}

function generateInventory(client, rand) {
  const makeNames = Object.keys(client.makes);
  const items = [];
  let stockSeed = 10000 + Math.floor(rand() * 900);
  for (let i = 0; i < client.inventoryCount; i++) {
    const make = makeNames[Math.floor(rand() * makeNames.length)];
    const models = client.makes[make];
    const model = models[Math.floor(rand() * models.length)];
    const year = 2024 + Math.floor(rand() * 3);
    const condition = rand() < 0.55 ? 'New' : 'Used';
    const category = client.categories[Math.floor(rand() * client.categories.length)];
    const stock =
      client.id.slice(0, 3).toUpperCase() +
      '-' +
      (stockSeed + i * 3 + Math.floor(rand() * 3));
    const popularity = Math.pow(rand(), 2.1) * 0.9 + 0.08;
    const uniqueRate = 0.55 + rand() * 0.22;
    items.push({ stock, make, model, year, condition, category, popularity, uniqueRate });
  }
  const dailyPoolBase = client.baseDaily * 0.4;
  const totalPop = items.reduce((s, v) => s + v.popularity, 0);
  items.forEach((v) => {
    v.daily = new Array(VEH_DATES.length);
    const share = v.popularity / totalPop;
    VEH_DATES.forEach((iso, i) => {
      const seas = seasonalFactor(client, iso) * dowFactor(iso);
      const expected = dailyPoolBase * seas * share;
      const noise = 0.6 + rand() * 0.8;
      v.daily[i] = Math.max(0, expected * noise);
    });
  });
  return items;
}

export const DATASET = {};
CLIENTS.forEach((client, ci) => {
  const rand = mulberry32(1000 + ci * 777);
  DATASET[client.id] = {
    client,
    rawDaily: generateRawDaily(client, rand),
    inventory: generateInventory(client, rand),
  };
});
