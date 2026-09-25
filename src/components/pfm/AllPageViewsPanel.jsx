'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchPfmPageViews } from '@/lib/api/pfmPageViews';
import { pctChange } from '@/lib/overview/comparePeriod';
import { fmt, pct } from '@/lib/vdp/aggregates';
import VdpChart from '@/components/vdp/VdpChart';
import { Card, Kpi } from '@/components/vdp/VdpUi';
import { VdpLoadingCard } from '@/components/vdp/VdpLoadingBanner';
import { useSoftLoadPercent } from '@/components/vdp/useSoftLoadPercent';

function dayOfMonth(iso) {
  return Number(String(iso).slice(8, 10)) || 0;
}

function PagesTable({ rows }) {
  if (!rows?.length) {
    return (
      <div style={{ color: 'var(--vdp-muted)', fontSize: 13, padding: 12 }}>
        No pages for this period.
      </div>
    );
  }

  return (
    <div className="vdp-table-scroll vdp-table-scroll--10">
      <table className="vdp-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Page</th>
            <th className="right">Views</th>
            <th className="right">Sessions</th>
            <th className="right">Users</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.pagePath}-${i}`}>
              <td className="mono" style={{ color: 'var(--vdp-muted)' }}>
                {i + 1}
              </td>
              <td>
                <div style={{ fontWeight: 500, lineHeight: 1.3 }}>
                  {r.pageTitle || r.pagePath}
                </div>
                {r.pageTitle ? (
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--vdp-muted)',
                      marginTop: 2,
                      wordBreak: 'break-all',
                    }}
                  >
                    {r.pagePath}
                  </div>
                ) : null}
              </td>
              <td className="right mono">{fmt(r.views)}</td>
              <td className="right mono">{fmt(r.sessions)}</td>
              <td className="right mono">{fmt(r.totalUsers)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AllPageViewsPanel({
  from,
  to,
  priorFrom,
  priorTo,
  curLabel,
  priLabel,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const cancelRef = useRef(false);
  const genRef = useRef(0);

  const load = useCallback(async () => {
    if (!from || !to || !priorFrom || !priorTo) {
      setData(null);
      return;
    }
    const gen = genRef.current + 1;
    genRef.current = gen;
    cancelRef.current = false;
    setLoading(true);
    setError(null);

    try {
      const json = await fetchPfmPageViews({
        from,
        to,
        priorFrom,
        priorTo,
      });
      if (cancelRef.current || genRef.current !== gen) return;
      setData(json);
    } catch (err) {
      if (cancelRef.current || genRef.current !== gen) return;
      setError(err?.message || 'Failed to load page views.');
      setData(null);
    } finally {
      if (!cancelRef.current && genRef.current === gen) setLoading(false);
    }
  }, [from, to, priorFrom, priorTo]);

  useEffect(() => {
    load();
    return () => {
      cancelRef.current = true;
    };
  }, [load]);

  const loadPercent = useSoftLoadPercent(loading);

  const barData = useMemo(() => {
    const curMap = new Map(
      (data?.dailyCurrent || []).map((r) => [dayOfMonth(r.date), r.views])
    );
    const priMap = new Map(
      (data?.dailyPrior || []).map((r) => [dayOfMonth(r.date), r.views])
    );
    const days = new Set([...curMap.keys(), ...priMap.keys()]);
    const labels = [...days].sort((a, b) => a - b);
    return {
      labels: labels.map((d) => `Day ${d}`),
      datasets: [
        {
          label: curLabel || 'Current',
          data: labels.map((d) => curMap.get(d) || 0),
          backgroundColor: '#2563eb',
          borderRadius: 4,
        },
        {
          label: priLabel || 'Previous month',
          data: labels.map((d) => priMap.get(d) || 0),
          backgroundColor: '#cbd5e1',
          borderRadius: 4,
        },
      ],
    };
  }, [data, curLabel, priLabel]);

  const barOptions = useMemo(
    () => ({
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 12, font: { size: 11 } },
        },
      },
      scales: {
        x: { ticks: { font: { size: 10.5 }, maxRotation: 0 } },
        y: { ticks: { callback: (v) => fmt(v) }, beginAtZero: true },
      },
    }),
    []
  );

  const curTotal = data?.totals?.current || 0;
  const priTotal = data?.totals?.prior || 0;
  const delta = pctChange(curTotal, priTotal);
  const hasBars = barData.labels.length > 0;

  return (
    <div className={`vdp-view${loading ? ' vdp-view--card-loading' : ''}`}>
      <VdpLoadingCard active={loading} percent={loadPercent} />

      {error ? (
        <div
          className="vdp-card vdp-alert-error"
          style={{ marginBottom: 16, fontSize: 13 }}
        >
          {error}
        </div>
      ) : null}

      <div className="vdp-kpi-grid vdp-kpi-grid--3" style={{ marginBottom: 16 }}>
        <Kpi
          label={`Page Views · ${curLabel}`}
          value={fmt(curTotal)}
          delta={delta}
          sub={`vs ${fmt(priTotal)} (${priLabel})`}
        />
        <Kpi
          label={`Prior · ${priLabel}`}
          value={fmt(priTotal)}
          sub="Previous month (aligned)"
        />
        <Kpi
          label="MoM change"
          value={pct(delta)}
          delta={delta}
          sub="Current vs previous month"
        />
      </div>

      <Card
        className="vdp-card--chart"
        title="Daily Page Views"
        sub={`${curLabel} vs ${priLabel} · compare current with previous month`}
        style={{ marginBottom: 16 }}
      >
        {!hasBars && !loading ? (
          <div style={{ color: 'var(--vdp-muted)', fontSize: 13, padding: 12 }}>
            No daily views for this period.
          </div>
        ) : (
          <VdpChart type="bar" data={barData} options={barOptions} height={180} />
        )}
      </Card>

      <div className="vdp-grid-2 vdp-grid-2--equal vdp-grid-2--overview">
        <Card title="Top Pages" sub={`${curLabel} · current`}>
          <PagesTable rows={data?.pagesCurrent} />
        </Card>
        <Card title="Top Pages" sub={`${priLabel} · prior`}>
          <PagesTable rows={data?.pagesPrior} />
        </Card>
      </div>
    </div>
  );
}
