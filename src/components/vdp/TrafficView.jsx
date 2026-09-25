'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useClient } from '@/components/dashboard/ClientContext';
import { fetchTrafficBySource } from '@/lib/api/trafficBySource';
import {
  formatRangeLabel,
  previousMonthAlignedRange,
} from '@/lib/overview/comparePeriod';
import { fmt, pct, momClass } from '@/lib/vdp/aggregates';
import { isAllDealerClient } from '@/lib/dashboard/allDealers';
import VdpChart from './VdpChart';
import { VdpLoadingCard } from './VdpLoadingBanner';
import { useVdpDateRange } from './VdpDateRangeContext';
import { useSoftLoadPercent } from './useSoftLoadPercent';
import { Card, Seg, Toolbar, ToolbarGroup } from './VdpUi';

const METRIC_OPTS = [
  { value: 'page', label: 'Page Views' },
  { value: 'vdp', label: 'VDP Views' },
];

export default function TrafficView() {
  const { client, loading: dealersLoading, isAllDealer } = useClient();
  const {
    from: curFrom,
    to: curTo,
    priorFrom: ctxPriFrom,
    priorTo: ctxPriTo,
    curLabel,
    priLabel: ctxPriLabel,
  } = useVdpDateRange();

  // Traffic always needs MoM prior — fall back to prior-month-aligned if context is empty
  const { priFrom, priTo, priLabel } = useMemo(() => {
    if (ctxPriFrom && ctxPriTo) {
      return {
        priFrom: ctxPriFrom,
        priTo: ctxPriTo,
        priLabel: ctxPriLabel || 'Prior',
      };
    }
    const aligned = previousMonthAlignedRange(curFrom, curTo);
    return {
      priFrom: aligned.compareFrom,
      priTo: aligned.compareTo,
      priLabel:
        formatRangeLabel(aligned.compareFrom, aligned.compareTo) || 'Prior',
    };
  }, [ctxPriFrom, ctxPriTo, ctxPriLabel, curFrom, curTo]);

  const [metric, setMetric] = useState('page');
  const [sort, setSort] = useState({ k: 'pv1', dir: -1 });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const cancelRef = useRef(false);
  const loadGenRef = useRef(0);

  const ga4Id = String(client?.ga4CustomerId || '').trim();
  const canLoad = Boolean(ga4Id) && !isAllDealerClient(client) && !isAllDealer;

  const load = useCallback(async () => {
    if (!canLoad || !curFrom || !curTo || !priFrom || !priTo) {
      setRows([]);
      return;
    }

    const loadGen = loadGenRef.current + 1;
    loadGenRef.current = loadGen;
    cancelRef.current = false;
    const isStale = () => cancelRef.current || loadGenRef.current !== loadGen;

    setLoading(true);
    setError(null);

    try {
      const data = await fetchTrafficBySource({
        clientId: ga4Id,
        from: curFrom,
        to: curTo,
        priorFrom: priFrom,
        priorTo: priTo,
        onCancelCheck: () => isStale(),
      });
      if (isStale()) return;
      setRows(data || []);
    } catch (err) {
      if (!isStale()) {
        setError(err?.message || 'Failed to load traffic by source.');
        setRows([]);
      }
    } finally {
      if (!isStale()) setLoading(false);
    }
  }, [canLoad, ga4Id, curFrom, curTo, priFrom, priTo]);

  useEffect(() => {
    if (dealersLoading) return undefined;
    load();
    return () => {
      cancelRef.current = true;
    };
  }, [dealersLoading, load]);

  const sorted = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => (a[sort.k] > b[sort.k] ? 1 : -1) * sort.dir);
    return list;
  }, [rows, sort]);

  const barData = useMemo(() => {
    const key = metric === 'page' ? 'pv' : 'vdp';
    const barSrc = [...rows].sort((a, b) => b[key + '1'] - a[key + '1']);
    return {
      labels: barSrc.map((r) => r.source),
      datasets: [
        {
          label: curLabel,
          data: barSrc.map((r) => r[key + '1']),
          backgroundColor: barSrc.map((r) => r.color),
          borderRadius: 4,
        },
        {
          label: priLabel,
          data: barSrc.map((r) => r[key + '0']),
          backgroundColor: '#e2e8f0',
          borderRadius: 4,
        },
      ],
    };
  }, [rows, metric, curLabel, priLabel]);

  const barOptions = useMemo(
    () => ({
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
      },
      scales: {
        x: { ticks: { font: { size: 10.5 } } },
        y: { ticks: { callback: (v) => fmt(v) } },
      },
    }),
    []
  );

  const onSort = (k) => {
    setSort((prev) => ({
      k,
      dir: prev.k === k ? -prev.dir : -1,
    }));
  };

  const isBusy = dealersLoading || loading;
  const loadPercent = useSoftLoadPercent(isBusy);
  const metricLabel = metric === 'page' ? 'Page Views' : 'VDP Views';

  if (!dealersLoading && (!client || isAllDealer || !ga4Id)) {
    return (
      <div className="vdp-view">
        <div className="vdp-card" style={{ padding: 20 }}>
          <h3>Select a dealer</h3>
          <div className="vdp-cardsub" style={{ marginBottom: 0 }}>
            Open All Dealers and click a dealer, or pick one from the dealer bar above.
            {!ga4Id && client && !isAllDealer
              ? ' This dealer has no GA4 customer ID configured.'
              : ''}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`vdp-view${isBusy ? ' vdp-view--card-loading' : ''}`}>
      <VdpLoadingCard active={isBusy} percent={loadPercent} />
      <Toolbar>
        <ToolbarGroup label="Metric">
          <Seg value={metric} options={METRIC_OPTS} onChange={setMetric} />
        </ToolbarGroup>
      </Toolbar>

      {error && (
        <div
          className="vdp-card"
          style={{
            marginBottom: 16,
            borderColor: '#fecaca',
            background: '#fef2f2',
            color: '#991b1b',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      <Card
        title="Views by Source — This Period vs. Comparable Period"
        sub={`${metricLabel}: ${curLabel} vs. ${priLabel}`}
        style={{ marginBottom: 16 }}
      >
        {!rows.length ? (
          <div style={{ color: 'var(--vdp-muted)', fontSize: 13, padding: 12 }}>
            No channel traffic for this period.
          </div>
        ) : (
          <VdpChart type="bar" data={barData} options={barOptions} height={120} />
        )}
      </Card>

      <Card
        title="Source Detail"
        sub="Click a column header to sort · page views from smart_ga4_page_data"
      >
        {!sorted.length ? (
          <div style={{ color: 'var(--vdp-muted)', fontSize: 13, padding: 12 }}>
            No source rows for this period.
          </div>
        ) : (
          <div className="vdp-table-scroll vdp-table-scroll--10">
            <table className="vdp-table">
              <thead>
                <tr>
                  {[
                    ['source', 'Source'],
                    ['pv1', 'Page Views (Current)'],
                    ['pv0', 'Page Views (Prior)'],
                    ['pvmom', 'MoM %'],
                    ['vdp1', 'VDP Views (Current)'],
                    ['vdp0', 'VDP Views (Prior)'],
                    ['vdpmom', 'MoM %'],
                    ['rate', 'VDP Rate'],
                  ].map(([k, label]) => (
                    <th
                      key={k}
                      className={`${k !== 'source' ? 'right' : ''} ${sort.k === k ? 'sorted' : ''}`}
                      onClick={() => onSort(k)}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.source}>
                    <td>
                      <span
                        className="vdp-legend-swatch"
                        style={{ background: r.color }}
                      />
                      {r.source}
                    </td>
                    <td className="right mono">{fmt(r.pv1)}</td>
                    <td className="right mono">{fmt(r.pv0)}</td>
                    <td className={`right vdp-delta ${momClass(r.pvmom / 100)}`}>
                      {r.pv0 < 1 && r.pv1 > 0 ? 'New' : pct(r.pvmom)}
                    </td>
                    <td className="right mono">{fmt(r.vdp1)}</td>
                    <td className="right mono">{fmt(r.vdp0)}</td>
                    <td className={`right vdp-delta ${momClass(r.vdpmom / 100)}`}>
                      {r.vdp0 < 1 && r.vdp1 > 0 ? 'New' : pct(r.vdpmom)}
                    </td>
                    <td className="right mono">{r.rate.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {sorted.length > 10 && (
          <div className="vdp-scroll-hint">
            Showing 10 of {sorted.length} sources — scroll for more
          </div>
        )}
      </Card>
    </div>
  );
}
