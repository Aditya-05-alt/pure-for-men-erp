/** Portfolio Health — all 16 dealers across down / stable / up buckets. */
export const HEALTH_DEALERS = [
  { name: 'Thunder Cycles — Nashville',     cat: 'powersports', catColor: '#FFA269', delta: -28, cur: 4240,  prev: 5889,  ly: 3920,  channels: ['Organic', 'Paid'],          spark: [9, 8, 7, 6, 5, 5, 4] },
  { name: 'Pacific Toyota — San Diego',     cat: 'auto',        catColor: '#6FA0FF', delta: -19, cur: 31200, prev: 38519, ly: 28400, channels: ['Paid Search', 'Direct'],    spark: [8, 7, 7, 6, 6, 5, 5] },
  { name: 'Gulf Coast Marine — Tampa',      cat: 'marine',      catColor: '#22D3EE', delta: -17, cur: 6800,  prev: 8192,  ly: 6100,  channels: ['Organic'],                  spark: [7, 6, 6, 5, 5, 5, 4] },
  { name: 'Desert Moto — Phoenix',          cat: 'powersports', catColor: '#FFA269', delta: -15, cur: 3980,  prev: 4682,  ly: 3640,  channels: ['Paid Social'],              spark: [7, 7, 6, 6, 5, 5, 4] },
  { name: 'Suncoast Kia — Clearwater',      cat: 'auto',        catColor: '#6FA0FF', delta: -14, cur: 18400, prev: 21395, ly: 17200, channels: ['Organic', 'Paid'],          spark: [8, 8, 7, 7, 6, 6, 5] },
  { name: 'Mountain Marine — Reno',         cat: 'marine',      catColor: '#22D3EE', delta: -12, cur: 2940,  prev: 3341,  ly: 2710,  channels: ['Organic'],                  spark: [6, 6, 5, 5, 5, 4, 4] },
  { name: 'Premier RV & Auto — Dallas',     cat: 'rv',          catColor: '#4EE09C', delta: 9,   cur: 89203, prev: 82045, ly: 78120, channels: ['Organic', 'Paid', 'Direct'], spark: [4, 5, 5, 6, 6, 7, 7] },
  { name: 'Lone Star Ford — Houston',       cat: 'auto',        catColor: '#6FA0FF', delta: 7,   cur: 44100, prev: 41215, ly: 38900, channels: ['Paid Search'],              spark: [5, 5, 6, 6, 6, 7, 7] },
  { name: 'Rocky Mountain RV — Denver',     cat: 'rv',          catColor: '#4EE09C', delta: -5,  cur: 22400, prev: 23578, ly: 20100, channels: ['Organic'],                  spark: [7, 6, 7, 6, 6, 6, 6] },
  { name: 'Bay Area Harley — Oakland',      cat: 'powersports', catColor: '#FFA269', delta: 3,   cur: 8900,  prev: 8641,  ly: 8100,  channels: ['Organic', 'Social'],        spark: [5, 5, 6, 5, 6, 6, 6] },
  { name: 'Sunshine Jayco — Tampa',         cat: 'rv',          catColor: '#4EE09C', delta: -8,  cur: 31400, prev: 34130, ly: 29800, channels: ['Organic', 'Paid'],          spark: [7, 7, 6, 6, 6, 6, 5] },
  { name: 'Midwest RV Center — Indy',       cat: 'rv',          catColor: '#4EE09C', delta: 31,  cur: 28400, prev: 21679, ly: 22100, channels: ['Organic', 'Paid Social'],   spark: [3, 4, 5, 6, 7, 8, 9] },
  { name: 'Coastal Marine — Miami',         cat: 'marine',      catColor: '#22D3EE', delta: 24,  cur: 12800, prev: 10322, ly: 9800,  channels: ['Paid Search', 'Organic'],   spark: [4, 4, 5, 6, 7, 7, 8] },
  { name: 'Powersports Plus — Austin',      cat: 'powersports', catColor: '#FFA269', delta: 22,  cur: 7400,  prev: 6066,  ly: 5900,  channels: ['Paid Social', 'Organic'],   spark: [4, 5, 5, 6, 7, 7, 8] },
  { name: 'Capital RV — Sacramento',        cat: 'rv',          catColor: '#4EE09C', delta: 18,  cur: 41200, prev: 34915, ly: 36800, channels: ['Organic'],                  spark: [4, 5, 5, 6, 6, 7, 8] },
  { name: 'Grand Auto — Phoenix',           cat: 'auto',        catColor: '#6FA0FF', delta: 15,  cur: 52100, prev: 45304, ly: 46200, channels: ['Paid Search', 'Direct'],    spark: [5, 5, 6, 6, 7, 7, 8] },
];

/** Provider templates for Admin page. */
export const PROVIDERS = [
  { name: 'DealerSocket',   categories: 'Auto,RV,PS,Marine', cond: 'url',      make: 'url',     year: 'title',  loc: '—',        dealers: 38, status: 'Active' },
  { name: 'DealerFire',     categories: 'Auto,RV',           cond: 'title',    make: 'title',   year: 'title',  loc: 'scrape',   dealers: 24, status: 'Active' },
  { name: 'Dealer Inspire', categories: 'Auto',              cond: 'url',      make: 'scrape',  year: 'scrape', loc: '—',        dealers: 18, status: 'Active' },
  { name: 'VinSolutions',   categories: 'Auto,RV',           cond: 'url',      make: 'url',     year: 'url',    loc: '—',        dealers: 11, status: 'Active' },
  { name: 'CDK Global',     categories: 'Auto',              cond: 'url',      make: 'url',     year: 'url',    loc: '—',        dealers: 6,  status: 'Review' },
  { name: 'Custom',         categories: 'All',               cond: 'override', make: 'override',year: 'override',loc: 'override', dealers: 3,  status: 'Manual' },
];
