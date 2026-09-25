'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useClient } from '@/components/dashboard/ClientContext';
import { fetchCampaignViews } from '@/lib/api/campaignViews';
import { fmt, pct, momClass, safeDiv } from '@/lib/vdp/aggregates';
import { isAllDealerClient } from '@/lib/dashboard/allDealers';
import {
  formatRangeLabel,
  previousFullMonthRange,
  previousMonthAlignedRange,
} from '@/lib/overview/comparePeriod';
import { VDP_COMPARE_MODES } from '@/lib/vdp/dateRange';
import VdpChart from './VdpChart';
import VdpLoadingBanner, { VdpLoadingBlock } from './VdpLoadingBanner';
import { useVdpDateRange } from './VdpDateRangeContext';
import { Card, Kpi, Seg, Toolbar, ToolbarGroup } from './VdpUi';

const PAGE_TYPE_OPTS = [
  { value: 'VDP', label: 'VDP Only' },
  { value: 'ALL', label: 'All Page Views' },
];

const WA_PREFIX_HINT = 'WA| / WA | campaigns only';

function fmtCost(n) {
  const v = Number(n) || 0;
  return `$${v.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Cost per view (or per VDP view). */
function costPerView(views, cost) {
  const v = Number(views) || 0;
  if (v <= 0) return null;
  return (Number(cost) || 0) / v;
}

function fmtCostPerView(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return `$${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function aggregateByCampaign(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const name = String(row.campaign || '(not set)');
    const prev = map.get(name) || {
      campaign: name,
      views: 0,
      cost: 0,
      sessions: 0,
      total_users: 0,
      new_users: 0,
    };
    prev.views += Number(row.views) || 0;
    prev.cost += Number(row.cost) || 0;
    prev.sessions += Number(row.sessions) || 0;
    prev.total_users += Number(row.total_users) || 0;
    prev.new_users += Number(row.new_users) || 0;
    map.set(name, prev);
  }
  const sorted = [...map.values()].sort((a, b) => b.views - a.views);
  const total = sorted.reduce((s, r) => s + r.views, 0);
  return sorted.map((r, i) => ({
    ...r,
    costPerView: costPerView(r.views, r.cost),
    rank: i + 1,
    pct: total > 0 ? Math.round((r.views / total) * 10000) / 100 : 0,
  }));
}

export default function CampaignsView() {
  const { client, loading: dealersLoading, isAllDealer } = useClient();
  const { from: curFrom, to: curTo, curLabel } = useVdpDateRange();

  const [pageType, setPageType] = useState('VDP');
  const [detailCompareMode, setDetailCompareMode] = useState(null);
  const [campaignSort, setCampaignSort] = useState({ k: 'views', dir: -1 });
  const [matrixSearch, setMatrixSearch] = useState('');
  const [matrixCampaignFilter, setMatrixCampaignFilter] = useState([]);
  const [matrixCampaignOpen, setMatrixCampaignOpen] = useState(false);
  const [matrixCampaignQuery, setMatrixCampaignQuery] = useState('');
  const [campaigns, setCampaigns] = useState([]);
  const [priorCampaigns, setPriorCampaigns] = useState([]);
  const [daily, setDaily] = useState([]);
  const [cells, setCells] = useState([]);
  const [loading, setLoading] = useState(false);
  const [priorLoading, setPriorLoading] = useState(false);
  const [error, setError] = useState(null);
  const cancelRef = useRef(false);
  const loadGenRef = useRef(0);
  const matrixFixedScrollRef = useRef(null);
  const matrixScrollRef = useRef(null);
  const matrixSyncingScrollRef = useRef(false);
  const matrixFreezeHeadRef = useRef(null);
  const matrixChannelsHeadRef = useRef(null);
  const matrixCampaignDropRef = useRef(null);
  const matrixCampaignSearchRef = useRef(null);

  const MATRIX_DATE_COL_W = 118;
  const MATRIX_TOTAL_COL_W = 108;
  const MATRIX_CAMPAIGN_COL_W = 160;
  const matrixFreezeWidth = MATRIX_DATE_COL_W + MATRIX_TOTAL_COL_W;

  const ga4Id = String(client?.ga4CustomerId || '').trim();
  const dealerName = client?.name || 'Dealer';
  const canLoad =
    Boolean(ga4Id) && !isAllDealerClient(client) && !isAllDealer;

  const detailCompareActive =
    detailCompareMode === 'mom' || detailCompareMode === 'pop';
  const comparePctLabel = detailCompareMode === 'pop' ? 'PoP %' : 'MoM %';
  const compareModeLabel =
    detailCompareMode === 'pop'
      ? 'PoP · same dates last month'
      : 'MoM · full last month';

  const priorRange = useMemo(() => {
    if (!detailCompareActive || !curFrom || !curTo) return null;
    const range =
      detailCompareMode === 'pop'
        ? previousMonthAlignedRange(curFrom, curTo)
        : previousFullMonthRange(curFrom, curTo);
    if (!range.compareFrom || !range.compareTo) return null;
    return {
      from: range.compareFrom,
      to: range.compareTo,
      label: formatRangeLabel(range.compareFrom, range.compareTo) || 'Prior',
    };
  }, [detailCompareActive, detailCompareMode, curFrom, curTo]);

  const toggleDetailCompareMode = useCallback((next) => {
    setDetailCompareMode((prev) => (prev === next ? null : next));
  }, []);

  useEffect(() => {
    setCampaigns([]);
    setPriorCampaigns([]);
    setDaily([]);
    setCells([]);
    setError(null);
    setMatrixSearch('');
    setMatrixCampaignFilter([]);
    setMatrixCampaignOpen(false);
    setMatrixCampaignQuery('');
  }, [ga4Id]);

  const load = useCallback(async () => {
    if (!canLoad || !curFrom || !curTo) {
      setCampaigns([]);
      setDaily([]);
      setCells([]);
      return;
    }

    const loadGen = loadGenRef.current + 1;
    loadGenRef.current = loadGen;
    cancelRef.current = false;
    const requestedClientId = ga4Id;
    const isStale = () =>
      cancelRef.current ||
      loadGenRef.current !== loadGen ||
      requestedClientId !== String(client?.ga4CustomerId || '').trim();

    setLoading(true);
    setError(null);
    // Keep previous rows visible while the new range loads (avoid flashing zeros).

    try {
      const data = await fetchCampaignViews({
        clientId: requestedClientId,
        from: curFrom,
        to: curTo,
        pageType,
        onCancelCheck: () => isStale(),
      });
      if (isStale() || data == null) return;
      setCampaigns(data.campaigns || []);
      setDaily(data.daily || []);
      setCells(data.cells || []);
    } catch (err) {
      if (!isStale()) {
        setError(err?.message || 'Failed to load campaign views.');
        setCampaigns([]);
        setDaily([]);
        setCells([]);
      }
    } finally {
      if (!isStale()) setLoading(false);
    }
  }, [canLoad, ga4Id, client?.ga4CustomerId, curFrom, curTo, pageType]);

  const loadPrior = useCallback(async () => {
    if (!canLoad || !priorRange?.from || !priorRange?.to) {
      setPriorCampaigns([]);
      return;
    }

    const loadGen = loadGenRef.current;
    const requestedClientId = ga4Id;
    const isStale = () =>
      cancelRef.current ||
      loadGenRef.current !== loadGen ||
      requestedClientId !== String(client?.ga4CustomerId || '').trim();

    setPriorLoading(true);
    try {
      const data = await fetchCampaignViews({
        clientId: requestedClientId,
        from: priorRange.from,
        to: priorRange.to,
        pageType,
        onCancelCheck: () => isStale(),
      });
      if (isStale() || data == null) return;
      setPriorCampaigns(data.campaigns || []);
    } catch (err) {
      if (!isStale()) {
        setPriorCampaigns([]);
        setError((prev) => prev || err?.message || 'Failed to load prior campaigns.');
      }
    } finally {
      if (!isStale()) setPriorLoading(false);
    }
  }, [canLoad, ga4Id, client?.ga4CustomerId, priorRange, pageType]);

  useEffect(() => {
    if (dealersLoading) return undefined;
    load();
    return () => {
      cancelRef.current = true;
    };
  }, [dealersLoading, load]);

  useEffect(() => {
    if (dealersLoading) return undefined;
    if (!detailCompareActive) {
      setPriorCampaigns([]);
      return undefined;
    }
    loadPrior();
    return undefined;
  }, [dealersLoading, detailCompareActive, loadPrior]);

  const byCampaign = useMemo(() => {
    const current = aggregateByCampaign(campaigns);
    if (!detailCompareActive) return current;

    const priorMap = new Map(
      aggregateByCampaign(priorCampaigns).map((r) => [
        r.campaign,
        { views: r.views, cost: r.cost },
      ])
    );
    const names = new Set([
      ...current.map((r) => r.campaign),
      ...priorMap.keys(),
    ]);

    const merged = [...names].map((campaign) => {
      const cur = current.find((r) => r.campaign === campaign);
      const prior = priorMap.get(campaign);
      const views = cur?.views || 0;
      const views0 = prior?.views || 0;
      const cost = cur?.cost || 0;
      const cost0 = prior?.cost || 0;
      const deltaPct = safeDiv(views - views0, views0) * 100;
      return {
        campaign,
        views,
        views0,
        cost,
        cost0,
        costPerView: costPerView(views, cost),
        costPerView0: costPerView(views0, cost0),
        sessions: cur?.sessions || 0,
        total_users: cur?.total_users || 0,
        new_users: cur?.new_users || 0,
        deltaPct,
        pct: 0,
        rank: 0,
      };
    });

    merged.sort((a, b) => b.views - a.views);
    const total = merged.reduce((s, r) => s + r.views, 0);
    return merged.map((r, i) => ({
      ...r,
      rank: i + 1,
      pct: total > 0 ? Math.round((r.views / total) * 10000) / 100 : 0,
    }));
  }, [campaigns, priorCampaigns, detailCompareActive]);

  const sortedCampaigns = useMemo(() => {
    const list = [...byCampaign];
    list.sort((a, b) => {
      const av = a[campaignSort.k];
      const bv = b[campaignSort.k];
      if (typeof av === 'string') return av.localeCompare(bv) * campaignSort.dir;
      return ((av || 0) - (bv || 0)) * campaignSort.dir;
    });
    return list;
  }, [byCampaign, campaignSort]);

  const priorTotalViews = useMemo(
    () => byCampaign.reduce((s, r) => s + (Number(r.views0) || 0), 0),
    [byCampaign]
  );

  const dateCampaignMatrix = useMemo(() => {
    const cellMap = new Map();
    const campaignTotals = new Map();

    for (const cell of cells || []) {
      const report_date = String(cell.report_date || '').split('T')[0];
      const campaign = String(cell.campaign || '').trim();
      if (!report_date || !campaign) continue;
      const views = Number(cell.views) || 0;
      const key = `${report_date}||${campaign}`;
      cellMap.set(key, (cellMap.get(key) || 0) + views);
      campaignTotals.set(campaign, (campaignTotals.get(campaign) || 0) + views);
    }

    // Prefer campaigns ordered by total views from cell data; fall back to summary list.
    let campaignCols = [...campaignTotals.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name);

    if (!campaignCols.length) {
      campaignCols = byCampaign.map((c) => String(c.campaign || '').trim()).filter(Boolean);
    }

    const dateSet = new Set();
    for (const d of daily || []) {
      const report_date = String(d.report_date || '').split('T')[0];
      if (report_date) dateSet.add(report_date);
    }
    for (const key of cellMap.keys()) {
      dateSet.add(key.split('||')[0]);
    }

    const dates = [...dateSet].sort((a, b) => a.localeCompare(b));

    const rows = dates.map((report_date) => {
      const values = {};
      let rowTotal = 0;
      for (const campaign of campaignCols) {
        const v = cellMap.get(`${report_date}||${campaign}`) || 0;
        values[campaign] = v;
        rowTotal += v;
      }
      return { report_date, values, rowTotal };
    });

    const colTotals = {};
    let grandTotal = 0;
    for (const campaign of campaignCols) {
      const sum = rows.reduce((s, r) => s + (r.values[campaign] || 0), 0);
      colTotals[campaign] = sum;
      grandTotal += sum;
    }

    return { campaignCols, rows, colTotals, grandTotal };
  }, [byCampaign, daily, cells]);

  const filteredDateCampaignMatrix = useMemo(() => {
    const q = matrixSearch.trim().toLowerCase();
    const allCols = dateCampaignMatrix.campaignCols;
    const allRows = dateCampaignMatrix.rows;

    const nameMatches = q
      ? allCols.filter((c) => c.toLowerCase().includes(q))
      : null;
    const dateMatches = q
      ? allRows.filter((r) => r.report_date.toLowerCase().includes(q))
      : null;

    const selected = matrixCampaignFilter.filter((c) => allCols.includes(c));

    let campaignCols = allCols;
    if (selected.length) {
      // Preserve overall rank order from allCols
      campaignCols = allCols.filter((c) => selected.includes(c));
      if (q && nameMatches.length) {
        campaignCols = campaignCols.filter((c) => nameMatches.includes(c));
      }
    } else if (q) {
      if (nameMatches.length) campaignCols = nameMatches;
      else if (!dateMatches.length) campaignCols = [];
    }

    let rows = allRows;
    if (q) {
      if (dateMatches.length) rows = dateMatches;
      else if (!nameMatches.length) rows = [];
    }

    rows = rows.map((r) => {
      const values = {};
      let rowTotal = 0;
      for (const campaign of campaignCols) {
        const v = r.values[campaign] || 0;
        values[campaign] = v;
        rowTotal += v;
      }
      return { report_date: r.report_date, values, rowTotal };
    });

    const colTotals = {};
    let grandTotal = 0;
    for (const campaign of campaignCols) {
      const sum = rows.reduce((s, r) => s + (r.values[campaign] || 0), 0);
      colTotals[campaign] = sum;
      grandTotal += sum;
    }

    return { campaignCols, rows, colTotals, grandTotal };
  }, [dateCampaignMatrix, matrixCampaignFilter, matrixSearch]);

  // Drop stale campaign selections when data/page type changes.
  useEffect(() => {
    setMatrixCampaignFilter((prev) => {
      const next = prev.filter((c) =>
        dateCampaignMatrix.campaignCols.includes(c)
      );
      return next.length === prev.length ? prev : next;
    });
  }, [dateCampaignMatrix.campaignCols]);

  useEffect(() => {
    if (!matrixCampaignOpen) return undefined;
    const onPointer = (e) => {
      if (matrixCampaignDropRef.current?.contains(e.target)) return;
      setMatrixCampaignOpen(false);
      setMatrixCampaignQuery('');
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setMatrixCampaignOpen(false);
        setMatrixCampaignQuery('');
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    const focusId = window.requestAnimationFrame(() => {
      matrixCampaignSearchRef.current?.focus();
    });
    return () => {
      window.cancelAnimationFrame(focusId);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [matrixCampaignOpen]);

  const matrixCampaignOptions = useMemo(() => {
    const q = matrixCampaignQuery.trim().toLowerCase();
    if (!q) return dateCampaignMatrix.campaignCols;
    return dateCampaignMatrix.campaignCols.filter((c) =>
      c.toLowerCase().includes(q)
    );
  }, [dateCampaignMatrix.campaignCols, matrixCampaignQuery]);

  const matrixCampaignTriggerLabel = useMemo(() => {
    const all = dateCampaignMatrix.campaignCols;
    const selected = matrixCampaignFilter.filter((c) => all.includes(c));
    if (!selected.length || selected.length === all.length) {
      return all.length
        ? `All session campaigns (${all.length})`
        : 'All session campaigns';
    }
    if (selected.length === 1) return selected[0];
    return `${selected.length} campaigns selected`;
  }, [dateCampaignMatrix.campaignCols, matrixCampaignFilter]);

  const toggleMatrixCampaign = useCallback((campaign) => {
    setMatrixCampaignFilter((prev) =>
      prev.includes(campaign)
        ? prev.filter((c) => c !== campaign)
        : [...prev, campaign]
    );
  }, []);

  const totalViews = useMemo(
    () => byCampaign.reduce((s, r) => s + r.views, 0),
    [byCampaign]
  );
  const totalCost = useMemo(
    () => byCampaign.reduce((s, r) => s + (Number(r.cost) || 0), 0),
    [byCampaign]
  );
  const priorTotalCost = useMemo(
    () => byCampaign.reduce((s, r) => s + (Number(r.cost0) || 0), 0),
    [byCampaign]
  );
  const dailyTotal = useMemo(
    () => daily.reduce((s, r) => s + r.views, 0),
    [daily]
  );
  const topCampaign = byCampaign[0] || null;
  const pageLabel = pageType === 'VDP' ? 'VDP Views' : 'Page Views';
  const efficiencyLabel = pageType === 'VDP' ? 'Cost / VDP' : 'Cost / Page';
  const totalCostPerView = costPerView(totalViews, totalCost);
  const priorTotalCostPerView = costPerView(priorTotalViews, priorTotalCost);

  const campaignLineData = useMemo(() => {
    const ordered = [...(daily || [])]
      .map((r) => ({
        report_date: String(r.report_date || '').split('T')[0],
        views: Number(r.views) || 0,
      }))
      .filter((r) => r.report_date)
      .sort((a, b) => a.report_date.localeCompare(b.report_date));

    return {
      labels: ordered.map((r) => r.report_date),
      datasets: [
        {
          label: pageLabel,
          data: ordered.map((r) => r.views),
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37,99,235,.08)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: '#2563eb',
          pointBorderColor: '#2563eb',
          borderWidth: 2.5,
        },
      ],
    };
  }, [daily, pageLabel]);

  const campaignLineOptions = useMemo(
    () => ({
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 12, font: { size: 11 } },
        },
      },
      scales: {
        x: {
          ticks: {
            maxRotation: 45,
            minRotation: 0,
            font: { size: 10 },
            autoSkip: true,
            maxTicksLimit: 14,
          },
        },
        y: {
          beginAtZero: true,
          ticks: { callback: (v) => fmt(v) },
        },
      },
    }),
    []
  );

  const onCampaignSort = (k) => {
    setCampaignSort((prev) => ({
      k,
      dir: prev.k === k ? -prev.dir : -1,
    }));
  };

  const syncMatrixScroll = useCallback(() => {
    if (matrixSyncingScrollRef.current) return;
    const fixed = matrixFixedScrollRef.current;
    const scroll = matrixScrollRef.current;
    if (!fixed || !scroll) return;
    matrixSyncingScrollRef.current = true;
    fixed.scrollTop = scroll.scrollTop;
    requestAnimationFrame(() => {
      matrixSyncingScrollRef.current = false;
    });
  }, []);

  const onMatrixFixedWheel = useCallback((e) => {
    const scroll = matrixScrollRef.current;
    if (!scroll) return;
    scroll.scrollTop += e.deltaY;
    e.preventDefault();
  }, []);

  const isBusy = dealersLoading || loading || (detailCompareActive && priorLoading);

  // Keep Date/Total header height matched to wrapped campaign headers.
  useEffect(() => {
    const syncHeaderHeights = () => {
      const freezeHead = matrixFreezeHeadRef.current;
      const channelHead = matrixChannelsHeadRef.current;
      if (!freezeHead || !channelHead) return;

      const freezeThs = freezeHead.querySelectorAll('th');
      const channelThs = channelHead.querySelectorAll('th');
      freezeThs.forEach((th) => {
        th.style.height = '';
        th.style.minHeight = '';
      });
      channelThs.forEach((th) => {
        th.style.height = '';
        th.style.minHeight = '';
      });

      let maxH = 48;
      channelThs.forEach((th) => {
        maxH = Math.max(maxH, th.getBoundingClientRect().height);
      });
      freezeThs.forEach((th) => {
        maxH = Math.max(maxH, th.getBoundingClientRect().height);
      });

      const px = `${Math.ceil(maxH)}px`;
      freezeThs.forEach((th) => {
        th.style.height = px;
        th.style.minHeight = px;
      });
      channelThs.forEach((th) => {
        th.style.height = px;
        th.style.minHeight = px;
      });
    };

    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(syncHeaderHeights);
    });
    window.addEventListener('resize', syncHeaderHeights);
    return () => {
      window.cancelAnimationFrame(id);
      window.removeEventListener('resize', syncHeaderHeights);
    };
  }, [filteredDateCampaignMatrix.campaignCols, filteredDateCampaignMatrix.rows.length, isBusy]);

  if (!dealersLoading && (!client || isAllDealer || !ga4Id)) {
    return (
      <div className="vdp-view">
        <div className="vdp-card" style={{ padding: 20 }}>
          <h3>Select a dealer first</h3>
          <div className="vdp-cardsub" style={{ marginBottom: 0 }}>
            Campaign Views is dealer-specific and only includes campaigns that
            start with <code>WA|</code> or <code>WA |</code>. Open{' '}
            <strong>All Dealers</strong>, click one dealer, then open this tab —
            or pick a dealer in the bar above.
            {!ga4Id && client && !isAllDealer
              ? ' This dealer has no GA4 customer ID configured.'
              : ''}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`vdp-view${isBusy ? ' vdp-view--loading' : ''}`}>
      <VdpLoadingBanner
        active={isBusy}
        label={`Loading WA campaigns for ${dealerName}…`}
        detail={`get_wa_campaign_views_advance · ${WA_PREFIX_HINT} · client_id ${ga4Id}`}
      />
      <Toolbar>
        <ToolbarGroup label="Page type">
          <Seg value={pageType} options={PAGE_TYPE_OPTS} onChange={setPageType} />
        </ToolbarGroup>
      </Toolbar>

      <div className="vdp-kpi-grid">
        <Kpi
          label={`${pageLabel} · ${curLabel}`}
          value={isBusy ? '…' : fmt(totalViews)}
          sub={dealerName}
        />
        <Kpi
          label="Campaigns"
          value={isBusy ? '…' : byCampaign.length}
          sub={WA_PREFIX_HINT}
        />
        <Kpi
          label="Top campaign"
          value={isBusy ? '…' : topCampaign?.campaign || '—'}
          sub={topCampaign ? `${fmt(topCampaign.views)} ${pageLabel.toLowerCase()}` : dealerName}
        />
        <Kpi
          label="Days with data"
          value={isBusy ? '…' : daily.length}
          sub={daily.length ? `${fmt(dailyTotal)} date-wise total` : dealerName}
        />
      </div>

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
        title={`${dealerName} — WA Campaign Views`}
        sub={`${pageLabel} · ${curLabel} · day-wise · ${WA_PREFIX_HINT}`}
        style={{ marginBottom: 16 }}
      >
        {isBusy && !daily.length ? (
          <VdpLoadingBlock label="Loading day-wise views…" minHeight={140} />
        ) : !daily.length ? (
          <div style={{ color: 'var(--vdp-muted)', fontSize: 13, padding: 12 }}>
            No WA| / WA | campaign data for this period.
            {!error
              ? ' If this persists, deploy get_wa_campaign_views_advance.sql in Supabase.'
              : ''}
          </div>
        ) : (
          <VdpChart
            type="line"
            data={campaignLineData}
            options={campaignLineOptions}
            height={120}
          />
        )}
      </Card>

      <div className="vdp-card" style={{ marginBottom: 16 }}>
        <div className="vdp-wa-detail-head">
          <div className="vdp-wa-detail-head__title">
            <h3>{dealerName} — WA Campaign Detail</h3>
            <div className="vdp-cardsub">
              {detailCompareActive
                ? `${WA_PREFIX_HINT} · ${curLabel} vs ${priorRange?.label || 'Prior'} (${compareModeLabel})`
                : `${WA_PREFIX_HINT} · select MoM or PoP to compare · click a column to sort`}
            </div>
          </div>
          <div className="vdp-wa-detail-head__compare">
            <ToolbarGroup>
              <Seg
                value={detailCompareMode}
                options={VDP_COMPARE_MODES}
                onChange={toggleDetailCompareMode}
              />
            </ToolbarGroup>
          </div>
        </div>

        {isBusy && !sortedCampaigns.length ? (
          <VdpLoadingBlock label="Loading campaign detail…" minHeight={100} />
        ) : !sortedCampaigns.length ? (
          <div style={{ color: 'var(--vdp-muted)', fontSize: 13, padding: 12 }}>
            No WA| / WA | campaign rows for this period.
          </div>
        ) : (
          <>
            <div className="vdp-table-scroll vdp-table-scroll--10">
              <table className="vdp-table">
                <thead>
                  <tr>
                    {(detailCompareActive
                      ? [
                          ['campaign', 'Session Campaign'],
                          ['views', `${pageLabel} (Current)`],
                          ['cost', 'Cost (Current)'],
                          ['costPerView', `${efficiencyLabel} (Current)`],
                          ['views0', `${pageLabel} (Prior)`],
                          ['cost0', 'Cost (Prior)'],
                          ['costPerView0', `${efficiencyLabel} (Prior)`],
                          ['deltaPct', comparePctLabel],
                          ['pct', '% of Total'],
                        ]
                      : [
                          ['campaign', 'Session Campaign'],
                          ['views', pageLabel],
                          ['cost', 'Cost'],
                          ['costPerView', efficiencyLabel],
                          ['pct', '% of Total'],
                        ]
                    ).map(([k, label]) => (
                      <th
                        key={k}
                        className={`${k !== 'campaign' ? 'right' : ''} ${
                          campaignSort.k === k ? 'sorted' : ''
                        }`}
                        onClick={() => onCampaignSort(k)}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedCampaigns.map((r) => (
                    <tr key={r.campaign}>
                      <td className="vdp-campaign-name">{r.campaign}</td>
                      <td className="right mono">{fmt(r.views)}</td>
                      <td className="right mono">{fmtCost(r.cost)}</td>
                      <td className="right mono">
                        {fmtCostPerView(r.costPerView)}
                      </td>
                      {detailCompareActive ? (
                        <>
                          <td className="right mono">{fmt(r.views0 || 0)}</td>
                          <td className="right mono">{fmtCost(r.cost0)}</td>
                          <td className="right mono">
                            {fmtCostPerView(r.costPerView0)}
                          </td>
                          <td
                            className={`right vdp-delta ${momClass(
                              (r.deltaPct || 0) / 100
                            )}`}
                          >
                            {(r.views0 || 0) < 1
                              ? r.views > 0
                                ? 'New'
                                : '—'
                              : pct(r.deltaPct)}
                          </td>
                        </>
                      ) : null}
                      <td className="right mono">{r.pct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td className="right mono">{fmt(totalViews)}</td>
                    <td className="right mono">{fmtCost(totalCost)}</td>
                    <td className="right mono">
                      {fmtCostPerView(totalCostPerView)}
                    </td>
                    {detailCompareActive ? (
                      <>
                        <td className="right mono">{fmt(priorTotalViews)}</td>
                        <td className="right mono">{fmtCost(priorTotalCost)}</td>
                        <td className="right mono">
                          {fmtCostPerView(priorTotalCostPerView)}
                        </td>
                        <td
                          className={`right vdp-delta ${momClass(
                            safeDiv(totalViews - priorTotalViews, priorTotalViews)
                          )}`}
                        >
                          {priorTotalViews < 1
                            ? totalViews > 0
                              ? 'New'
                              : '—'
                            : pct(
                                safeDiv(
                                  totalViews - priorTotalViews,
                                  priorTotalViews
                                ) * 100
                              )}
                        </td>
                      </>
                    ) : null}
                    <td className="right mono">
                      {totalViews > 0 ? '100.0%' : '0.0%'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {sortedCampaigns.length > 10 && (
              <div className="vdp-scroll-hint">
                Showing 10 of {sortedCampaigns.length} campaigns — scroll for more
              </div>
            )}
          </>
        )}
      </div>

      <Card
        title={`${dealerName} — Date-wise Detail (WA campaigns)`}
        sub="Date + Total frozen · session campaigns scroll horizontally"
      >
        {isBusy && !dateCampaignMatrix.rows.length ? (
          <VdpLoadingBlock label="Loading date × campaign matrix…" minHeight={100} />
        ) : !dateCampaignMatrix.rows.length ? (
          <div style={{ color: 'var(--vdp-muted)', fontSize: 13, padding: 12 }}>
            No date × campaign data for this period.
            {!cells.length && daily.length
              ? ' Redeploy get_wa_campaign_views_advance.sql in Supabase to enable the matrix.'
              : ''}
          </div>
        ) : (
          <>
            <Toolbar>
              <ToolbarGroup label="Session campaign">
                <div
                  className="vdp-multi"
                  ref={matrixCampaignDropRef}
                  style={{ minWidth: 260, maxWidth: 360 }}
                >
                  <button
                    type="button"
                    className={`vdp-multi-trigger${
                      matrixCampaignOpen ? ' is-open' : ''
                    }`}
                    aria-haspopup="listbox"
                    aria-expanded={matrixCampaignOpen}
                    aria-label="Session campaign"
                    onClick={() => setMatrixCampaignOpen((o) => !o)}
                  >
                    <span className="vdp-multi-trigger-text">
                      {matrixCampaignTriggerLabel}
                    </span>
                    <span aria-hidden>{matrixCampaignOpen ? '▴' : '▾'}</span>
                  </button>
                  {matrixCampaignOpen ? (
                    <div
                      className="vdp-multi-pop"
                      role="listbox"
                      aria-label="Session campaigns"
                      aria-multiselectable="true"
                    >
                      <div className="vdp-multi-head">
                        <div className="vdp-multi-search-wrap">
                          <input
                            ref={matrixCampaignSearchRef}
                            type="text"
                            className="vdp-multi-search"
                            placeholder="Search campaigns…"
                            value={matrixCampaignQuery}
                            onChange={(e) =>
                              setMatrixCampaignQuery(e.target.value)
                            }
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                            aria-label="Search session campaigns"
                          />
                        </div>
                        <div className="vdp-multi-actions">
                          <button
                            type="button"
                            className="vdp-multi-link"
                            onClick={() =>
                              setMatrixCampaignFilter((prev) => {
                                const next = new Set(prev);
                                for (const c of matrixCampaignOptions) next.add(c);
                                return [...next];
                              })
                            }
                          >
                            Select all
                          </button>
                          <button
                            type="button"
                            className="vdp-multi-link"
                            onClick={() => {
                              if (matrixCampaignQuery.trim()) {
                                const hide = new Set(matrixCampaignOptions);
                                setMatrixCampaignFilter((prev) =>
                                  prev.filter((c) => !hide.has(c))
                                );
                              } else {
                                setMatrixCampaignFilter([]);
                              }
                            }}
                          >
                            Clear
                          </button>
                          <span className="vdp-multi-meta">
                            {
                              matrixCampaignFilter.filter((c) =>
                                dateCampaignMatrix.campaignCols.includes(c)
                              ).length
                            }{' '}
                            selected
                          </span>
                        </div>
                      </div>
                      <ul className="vdp-multi-list">
                        {matrixCampaignOptions.length ? (
                          matrixCampaignOptions.map((campaign) => {
                            const checked =
                              matrixCampaignFilter.includes(campaign);
                            return (
                              <li key={campaign}>
                                <label className="vdp-multi-item">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() =>
                                      toggleMatrixCampaign(campaign)
                                    }
                                  />
                                  <span title={campaign}>{campaign}</span>
                                </label>
                              </li>
                            );
                          })
                        ) : (
                          <li className="vdp-multi-empty">No campaigns match</li>
                        )}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </ToolbarGroup>
              <ToolbarGroup label="Search">
                <input
                  type="text"
                  className="vdp-search"
                  placeholder="Campaign or date…"
                  value={matrixSearch}
                  onChange={(e) => setMatrixSearch(e.target.value)}
                  aria-label="Search campaigns or dates"
                />
              </ToolbarGroup>
            </Toolbar>

            {!filteredDateCampaignMatrix.campaignCols.length ||
            !filteredDateCampaignMatrix.rows.length ? (
              <div style={{ color: 'var(--vdp-muted)', fontSize: 13, padding: 12 }}>
                No rows match this search / campaign filter.
              </div>
            ) : (
              <>
            <div className="vdp-split-table vdp-split-table--wa-matrix">
              <div
                className="vdp-split-table__freeze"
                style={{ width: matrixFreezeWidth }}
              >
                <div
                  ref={matrixFixedScrollRef}
                  className="vdp-split-table__freeze-y vdp-table-scroll--10"
                  onWheel={onMatrixFixedWheel}
                >
                  <table
                    className="vdp-table"
                    style={{
                      width: matrixFreezeWidth,
                      tableLayout: 'fixed',
                    }}
                  >
                    <colgroup>
                      <col style={{ width: MATRIX_DATE_COL_W }} />
                      <col style={{ width: MATRIX_TOTAL_COL_W }} />
                    </colgroup>
                    <thead ref={matrixFreezeHeadRef}>
                      <tr>
                        <th className="vdp-matrix-freeze-th">Date</th>
                        <th className="right vdp-matrix-freeze-th">{pageLabel}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDateCampaignMatrix.rows.map((r) => (
                        <tr key={r.report_date}>
                          <td className="mono">{r.report_date}</td>
                          <td className="right mono" style={{ fontWeight: 700 }}>
                            {fmt(r.rowTotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="vdp-split-table__freeze-foot">
                  <table
                    className="vdp-table"
                    style={{
                      width: matrixFreezeWidth,
                      tableLayout: 'fixed',
                    }}
                  >
                    <colgroup>
                      <col style={{ width: MATRIX_DATE_COL_W }} />
                      <col style={{ width: MATRIX_TOTAL_COL_W }} />
                    </colgroup>
                    <tbody>
                      <tr>
                        <td>Total</td>
                        <td className="right mono">
                          {fmt(filteredDateCampaignMatrix.grandTotal)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="vdp-split-table__channels">
                <div
                  className="vdp-split-table__channels-inner"
                  style={{
                    width: Math.max(
                      filteredDateCampaignMatrix.campaignCols.length *
                        MATRIX_CAMPAIGN_COL_W,
                      320
                    ),
                  }}
                >
                  <div
                    ref={matrixScrollRef}
                    className="vdp-split-table__channels-y vdp-table-scroll--10"
                    onScroll={syncMatrixScroll}
                  >
                    <table
                      className="vdp-table"
                      style={{
                        width: Math.max(
                          filteredDateCampaignMatrix.campaignCols.length *
                            MATRIX_CAMPAIGN_COL_W,
                          320
                        ),
                        tableLayout: 'fixed',
                      }}
                    >
                      <colgroup>
                        {filteredDateCampaignMatrix.campaignCols.map((campaign) => (
                          <col
                            key={campaign}
                            style={{ width: MATRIX_CAMPAIGN_COL_W }}
                          />
                        ))}
                      </colgroup>
                      <thead ref={matrixChannelsHeadRef}>
                        <tr>
                          {filteredDateCampaignMatrix.campaignCols.map((campaign) => (
                            <th
                              key={campaign}
                              className="right vdp-campaign-name"
                              title={campaign}
                            >
                              {campaign}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDateCampaignMatrix.rows.map((r) => (
                          <tr key={r.report_date}>
                            {filteredDateCampaignMatrix.campaignCols.map((campaign) => {
                              const v = r.values[campaign] || 0;
                              return (
                                <td key={campaign} className="right mono">
                                  {fmt(v)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="vdp-split-table__channels-foot">
                    <table
                      className="vdp-table"
                      style={{
                        width: Math.max(
                          filteredDateCampaignMatrix.campaignCols.length *
                            MATRIX_CAMPAIGN_COL_W,
                          320
                        ),
                        tableLayout: 'fixed',
                      }}
                    >
                      <colgroup>
                        {filteredDateCampaignMatrix.campaignCols.map((campaign) => (
                          <col
                            key={campaign}
                            style={{ width: MATRIX_CAMPAIGN_COL_W }}
                          />
                        ))}
                      </colgroup>
                      <tbody>
                        <tr>
                          {filteredDateCampaignMatrix.campaignCols.map((campaign) => (
                            <td key={campaign} className="right mono">
                              {fmt(
                                filteredDateCampaignMatrix.colTotals[campaign] || 0
                              )}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
            {filteredDateCampaignMatrix.rows.length > 10 && (
              <div className="vdp-scroll-hint">
                Showing 10 of {filteredDateCampaignMatrix.rows.length} days — scroll
                for more · {filteredDateCampaignMatrix.campaignCols.length} campaigns
              </div>
            )}
              </>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
