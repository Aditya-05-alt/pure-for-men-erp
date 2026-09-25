import {
  CLIENTS,
  DATASET,
  PERIODS,
  RAW_SOURCES,
  TREND_DATES,
  VEH_DATES,
  defaultChannels,
  defaultMapping,
  buildPeriods,
} from './mockData';

export function fmt(n) {
  return Math.round(n).toLocaleString('en-US');
}

export function pct(n) {
  return (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
}

export function momClass(n) {
  return n > 0.05 ? 'up' : n < -0.05 ? 'down' : 'flat';
}

export function safeDiv(a, b) {
  return b === 0 ? 0 : a / b;
}

export function sumRange(dateList, values, fromISO, toISO) {
  let s = 0;
  for (let i = 0; i < dateList.length; i++) {
    if (dateList[i] >= fromISO && dateList[i] <= toISO) s += values[i];
  }
  return s;
}

export function getChannels() {
  return defaultChannels();
}

export function getMapping() {
  return defaultMapping();
}

export function sourceTotals(clientId, mode, metric, channels = getChannels(), mapping = getMapping()) {
  const raw = DATASET[clientId].rawDaily;
  const p = PERIODS[mode];
  return channels
    .map((ch) => {
      let cur = 0;
      let pri = 0;
      RAW_SOURCES.forEach((r) => {
        if (mapping[r.id] === ch.id) {
          cur += sumRange(TREND_DATES, raw[r.id][metric], p.curFrom, p.curTo);
          pri += sumRange(TREND_DATES, raw[r.id][metric], p.priFrom, p.priTo);
        }
      });
      return { source: ch.name, color: ch.color, id: ch.id, cur, pri };
    })
    .filter((row) => row.id !== 'unmapped' || row.cur > 0 || row.pri > 0);
}

export function siteTotal(clientId, mode, metric, channels, mapping) {
  return sourceTotals(clientId, mode, metric, channels, mapping).reduce(
    (s, r) => ({ cur: s.cur + r.cur, pri: s.pri + r.pri }),
    { cur: 0, pri: 0 }
  );
}

export function dealerMetric(clientId, mode, metric, channelId, channels, mapping) {
  if (channelId === 'all') return siteTotal(clientId, mode, metric, channels, mapping);
  const row = sourceTotals(clientId, mode, metric, channels, mapping).find((r) => r.id === channelId);
  return row ? { cur: row.cur, pri: row.pri } : { cur: 0, pri: 0 };
}

export function inventoryRows(clientId, mode) {
  const inv = DATASET[clientId].inventory;
  const p = PERIODS[mode];
  return inv.map((v) => {
    const vdp1 = sumRange(VEH_DATES, v.daily, p.curFrom, p.curTo);
    const vdp0 = sumRange(VEH_DATES, v.daily, p.priFrom, p.priTo);
    return {
      stock: v.stock,
      make: v.make,
      model: v.model,
      year: v.year,
      condition: v.condition,
      category: v.category,
      vdp1,
      vdp0,
      vdpmom: safeDiv(vdp1 - vdp0, vdp0) * 100,
      uniq1: vdp1 * v.uniqueRate,
    };
  });
}

export function cumulativeSeries(clientId, mode, metric) {
  const raw = DATASET[clientId].rawDaily;
  const p = PERIODS[mode];
  function build(fromISO, toISO) {
    const dates = TREND_DATES.filter((d) => d >= fromISO && d <= toISO);
    let running = 0;
    return dates.map((iso) => {
      const idx = TREND_DATES.indexOf(iso);
      let dayTotal = 0;
      RAW_SOURCES.forEach((r) => {
        dayTotal += raw[r.id][metric][idx];
      });
      running += dayTotal;
      return running;
    });
  }
  return { cur: build(p.curFrom, p.curTo), pri: build(p.priFrom, p.priTo) };
}

export function portfolioDealerRows(mode, channelId, channels, mapping) {
  return CLIENTS.map((client) => {
    const pv = dealerMetric(client.id, mode, 'page', channelId, channels, mapping);
    const vdp = dealerMetric(client.id, mode, 'vdp', channelId, channels, mapping);
    return {
      id: client.id,
      name: client.name,
      vertical: client.vertical,
      pv1: pv.cur,
      pv0: pv.pri,
      pvmom: safeDiv(pv.cur - pv.pri, pv.pri) * 100,
      vdp1: vdp.cur,
      vdp0: vdp.pri,
      vdpmom: safeDiv(vdp.cur - vdp.pri, vdp.pri) * 100,
      rate: safeDiv(vdp.cur, pv.cur) * 100,
    };
  });
}

export { CLIENTS, DATASET, PERIODS, buildPeriods };
