'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useClient } from '@/components/dashboard/ClientContext';
import { isAllDealerClient } from '@/lib/dashboard/allDealers';
import {
  dayHeaderLabel,
  eachDateInclusive,
  fetchVehicleAgeCalendar,
  fetchVehicleAgeVins,
  formatRangeLabel,
} from '@/lib/api/vehicleAge';
import CalendarRangePicker from '@/components/dashboard/CalendarRangePicker';
import { VdpLoadingCard } from './VdpLoadingBanner';
import { useVdpDateRange } from './VdpDateRangeContext';
import { Card, Kpi, Toolbar, ToolbarGroup } from './VdpUi';

const PAGE_SIZE = 40;
const MAX_RANGE_DAYS = 92;

function conditionClass(condition) {
  const c = String(condition || '').toLowerCase();
  if (c.startsWith('new')) return 'new';
  if (c.startsWith('used')) return 'used';
  return 'used';
}

function vehicleLabel(row) {
  return [row.year, row.make, row.model].filter(Boolean).join(' ') || '—';
}

function sourceBadge(sources) {
  if (!sources?.length) return null;
  if (sources.includes('hoot') && sources.includes('scrap')) return 'hoot+scrap';
  if (sources.includes('scrap')) return 'scrap';
  return 'hoot';
}

function weekdayLabel(ymdStr) {
  const [y, m, d] = ymdStr.split('-').map(Number);
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return names[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function ageDays(firstSeen, lastSeen) {
  if (!firstSeen || !lastSeen) return 0;
  return (
    Math.max(
      0,
      Math.round(
        (Date.parse(`${lastSeen}T00:00:00Z`) -
          Date.parse(`${firstSeen}T00:00:00Z`)) /
          86400000
      )
    ) + 1
  );
}

/** Build day statuses for one VIN across a date range. */
function dayStatusesForVin(firstSeen, lastSeen, dates) {
  const first = firstSeen ? String(firstSeen).slice(0, 10) : null;
  const last = lastSeen ? String(lastSeen).slice(0, 10) : null;
  const statuses = [];
  let available = 0;
  for (const date of dates) {
    const ok = Boolean(first && last) && date >= first && date <= last;
    if (ok) available += 1;
    statuses.push(ok ? 'available' : 'absent');
  }
  return { statuses, available, absent: dates.length - available };
}

export default function VehicleAgeView() {
  const { client, loading: dealersLoading, isAllDealer } = useClient();
  const { from: rangeFrom, to: rangeTo, dateRange, setDateRange } =
    useVdpDateRange();

  const dealerName =
    client && !isAllDealerClient(client)
      ? String(client.name || '').trim()
      : '';
  const clientId =
    client && !isAllDealerClient(client)
      ? String(client.ga4CustomerId || '').trim()
      : '';

  const [vinList, setVinList] = useState([]);
  const [vinQuery, setVinQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(0);
  const [view, setView] = useState('matrix');
  const [selectedVin, setSelectedVin] = useState('');
  const [vehicle, setVehicle] = useState(null);
  const [detailDays, setDetailDays] = useState([]);
  const [availableDays, setAvailableDays] = useState(0);
  const [absentDays, setAbsentDays] = useState(0);
  const [vinsLoading, setVinsLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState(null);
  const vinsGenRef = useRef(0);
  const detailGenRef = useRef(0);
  const searchTimer = useRef(null);

  const canLoad =
    Boolean(dealerName || clientId) &&
    !isAllDealer &&
    Boolean(rangeFrom) &&
    Boolean(rangeTo);

  const rangeDates = useMemo(
    () => eachDateInclusive(rangeFrom, rangeTo, MAX_RANGE_DAYS),
    [rangeFrom, rangeTo]
  );

  const matrixRows = useMemo(() => {
    return vinList.map((v) => {
      const { statuses, available, absent } = dayStatusesForVin(
        v.first_seen,
        v.last_seen,
        rangeDates
      );
      return {
        ...v,
        age_days: ageDays(v.first_seen, v.last_seen),
        statuses,
        available,
        absent,
      };
    });
  }, [vinList, rangeDates]);

  const pageRows = useMemo(() => {
    const start = page * PAGE_SIZE;
    return matrixRows.slice(start, start + PAGE_SIZE);
  }, [matrixRows, page]);

  const loadVins = useCallback(async () => {
    if (!canLoad) {
      setVinList([]);
      return;
    }
    const loadGen = vinsGenRef.current + 1;
    vinsGenRef.current = loadGen;
    const isStale = () => vinsGenRef.current !== loadGen;

    setVinsLoading(true);
    setError(null);
    try {
      const result = await fetchVehicleAgeVins({
        dealer: dealerName || undefined,
        clientId: clientId || undefined,
        q: vinQuery || undefined,
      });
      if (isStale()) return;
      setVinList(result.vins || []);
      setPage(0);
    } catch (err) {
      if (!isStale()) {
        setError(err?.message || 'Failed to load VINs.');
        setVinList([]);
      }
    } finally {
      if (!isStale()) setVinsLoading(false);
    }
  }, [canLoad, dealerName, clientId, vinQuery]);

  const openVinDetail = useCallback((vin) => {
    if (!vin) return;
    setSelectedVin(vin);
    setView('detail');
    setVehicle(null);
    setDetailDays([]);
    setError(null);
  }, []);

  useEffect(() => {
    if (dealersLoading) return undefined;
    setView('matrix');
    setSelectedVin('');
    setVehicle(null);
    setDetailDays([]);
    loadVins();
    return undefined;
  }, [dealersLoading, loadVins]);

  useEffect(() => {
    setPage(0);
  }, [rangeFrom, rangeTo]);

  useEffect(() => {
    if (view !== 'detail' || !selectedVin || !canLoad) return undefined;

    const loadGen = detailGenRef.current + 1;
    detailGenRef.current = loadGen;
    const isStale = () => detailGenRef.current !== loadGen;

    setDetailLoading(true);
    setError(null);

    (async () => {
      try {
        const result = await fetchVehicleAgeCalendar({
          dealer: dealerName || undefined,
          clientId: clientId || undefined,
          vin: selectedVin,
          from: rangeFrom,
          to: rangeTo,
        });
        if (isStale()) return;
        setVehicle(result.vehicle || null);
        setDetailDays(result.days || []);
        setAvailableDays(Number(result.availableDays) || 0);
        setAbsentDays(Number(result.absentDays) || 0);
      } catch (err) {
        if (isStale()) return;
        const row = matrixRows.find((r) => r.vin === selectedVin);
        if (row) {
          const days = row.statuses.map((status, idx) => {
            const date = rangeDates[idx];
            return {
              day: Number(String(date).slice(8, 10)),
              date,
              weekday: weekdayLabel(date),
              status,
            };
          });
          setVehicle({
            vin: row.vin,
            dealer: dealerName,
            make: row.make,
            model: row.model,
            year: row.year,
            condition: row.condition,
            stock_number: row.stock_number,
            first_seen: row.first_seen,
            last_seen: row.last_seen,
            age_days: row.age_days,
            sources: row.sources,
          });
          setDetailDays(days);
          setAvailableDays(row.available);
          setAbsentDays(row.absent);
          setError(null);
        } else {
          setError(err?.message || 'Failed to load VIN detail.');
          setVehicle(null);
          setDetailDays([]);
        }
      } finally {
        if (!isStale()) setDetailLoading(false);
      }
    })();

    return undefined;
  }, [
    view,
    selectedVin,
    canLoad,
    dealerName,
    clientId,
    rangeFrom,
    rangeTo,
    matrixRows,
    rangeDates,
  ]);

  const onSearchChange = (value) => {
    setSearchInput(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setVinQuery(value.trim());
    }, 300);
  };

  const backToMatrix = () => {
    setView('matrix');
    setSelectedVin('');
    setVehicle(null);
    setDetailDays([]);
    setError(null);
  };

  if (dealersLoading) {
    return <VdpLoadingCard label="Loading dealers…" />;
  }

  if (!canLoad) {
    return (
      <div className="vdp-view">
        <Card
          title="Vehicle Age"
          sub="Select a dealer to view VIN × day availability"
        >
          <p style={{ color: 'var(--vdp-muted)', margin: 0 }}>
            Choose a dealer from the top dealer dropdown to load VINs from hoot
            + scrap inventory.
          </p>
        </Card>
      </div>
    );
  }

  const start = page * PAGE_SIZE;

  return (
    <div className="vdp-view">
      <Toolbar>
        {view === 'matrix' ? (
          <ToolbarGroup label="Search VIN">
            <input
              type="text"
              className="vdp-search"
              placeholder="VIN, stock, make…"
              value={searchInput}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </ToolbarGroup>
        ) : (
          <ToolbarGroup>
            <button type="button" className="vdp-chip-btn" onClick={backToMatrix}>
              ← All VINs
            </button>
          </ToolbarGroup>
        )}
        <ToolbarGroup label="Date range">
          <div className="vdp-vehicle-age-daterange">
            <CalendarRangePicker
              value={dateRange}
              onChange={setDateRange}
              popClassName="cdr-pop--vdp"
            />
          </div>
        </ToolbarGroup>
      </Toolbar>

      {error ? (
        <Card title="Error">
          <p style={{ color: '#b91c1c', margin: 0 }}>{error}</p>
        </Card>
      ) : null}

      {view === 'matrix' ? (
        vinsLoading && !matrixRows.length ? (
          <VdpLoadingCard label="Loading VIN matrix…" />
        ) : (
          <Card
            title="VIN × Days matrix"
            sub={`${dealerName} · ${formatRangeLabel(rangeFrom, rangeTo)}`}
          >
            <div className="vdp-newused-legend" style={{ marginBottom: 10 }}>
              <div className="vdp-newused-legend-item">
                <span
                  className="vdp-legend-swatch"
                  style={{ background: '#86efac' }}
                />
                <span className="vdp-newused-legend-label">P Present</span>
              </div>
              <div className="vdp-newused-legend-item">
                <span
                  className="vdp-legend-swatch"
                  style={{ background: '#fecaca' }}
                />
                <span className="vdp-newused-legend-label">A Absent</span>
              </div>
            </div>
            <div className="vdp-table-scroll vdp-table-scroll--10 vdp-vehicle-age-matrix-scroll">
              <table className="vdp-table vdp-vehicle-age-matrix">
                <thead>
                  <tr>
                    <th className="vdp-va-sticky vdp-va-sticky--0">VIN</th>
                    <th className="vdp-va-sticky vdp-va-sticky--1">Vehicle</th>
                    <th className="right vdp-va-sticky vdp-va-sticky--2">Age</th>
                    <th className="right vdp-va-sticky vdp-va-sticky--3">Avail</th>
                    {rangeDates.map((d) => (
                      <th
                        key={d}
                        className="right vdp-vehicle-age-day-th"
                        title={d}
                      >
                        {dayHeaderLabel(d)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4 + rangeDates.length}
                        style={{
                          textAlign: 'center',
                          color: 'var(--vdp-muted)',
                          padding: 20,
                        }}
                      >
                        No VINs found for this dealer in hoot/scrap inventory
                      </td>
                    </tr>
                  ) : (
                    pageRows.map((r) => (
                      <tr
                        key={r.vin}
                        className="vdp-vehicle-age-row"
                        onClick={() => openVinDetail(r.vin)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openVinDetail(r.vin);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        title={`Open detail for ${r.vin}`}
                      >
                        <td className="mono vdp-va-sticky vdp-va-sticky--0">
                          {r.vin}
                        </td>
                        <td className="vdp-va-sticky vdp-va-sticky--1">
                          <div className="vdp-va-vehicle">
                            <span className="vdp-va-vehicle-name">
                              {vehicleLabel(r)}
                            </span>
                            {r.condition ? (
                              <span
                                className={`vdp-tag ${conditionClass(r.condition)}`}
                              >
                                {r.condition}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="right mono vdp-va-sticky vdp-va-sticky--2">
                          {r.age_days}d
                        </td>
                        <td className="right mono vdp-va-sticky vdp-va-sticky--3">
                          {r.available}/{rangeDates.length}
                        </td>
                        {r.statuses.map((status, idx) => (
                          <td
                            key={`${r.vin}-${rangeDates[idx]}`}
                            className={`vdp-vehicle-age-day-td ${status}`}
                            title={`${rangeDates[idx]}: ${status === 'available' ? 'Present' : 'Absent'}`}
                          >
                            {status === 'available' ? 'P' : 'A'}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="vdp-pager">
              <span>
                {matrixRows.length
                  ? `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, matrixRows.length)} of ${matrixRows.length}`
                  : ''}
              </span>
              <div>
                <button
                  type="button"
                  disabled={page === 0}
                  onClick={() => setPage((n) => n - 1)}
                >
                  ← Prev
                </button>
                <button
                  type="button"
                  disabled={start + PAGE_SIZE >= matrixRows.length}
                  onClick={() => setPage((n) => n + 1)}
                >
                  Next →
                </button>
              </div>
            </div>
          </Card>
        )
      ) : detailLoading && !vehicle ? (
        <VdpLoadingCard label={`Loading ${selectedVin}…`} />
      ) : (
        <>
          <div className="vdp-kpi-grid">
            <Kpi
              label="Vehicle age"
              value={vehicle?.age_days != null ? `${vehicle.age_days}d` : '—'}
              sub="first_seen → last_seen"
            />
            <Kpi
              label="Available days"
              value={String(availableDays)}
              sub={formatRangeLabel(rangeFrom, rangeTo)}
            />
            <Kpi
              label="Absent days"
              value={String(absentDays)}
              sub={formatRangeLabel(rangeFrom, rangeTo)}
            />
            <Kpi
              label="First seen"
              value={vehicle?.first_seen || '—'}
              sub={vehicle?.last_seen ? `Last ${vehicle.last_seen}` : '—'}
            />
          </div>

          {vehicle ? (
            <Card
              title={vehicleLabel(vehicle)}
              sub={`${vehicle.vin}${vehicle.stock_number ? ` · Stock ${vehicle.stock_number}` : ''} · ${dealerName}${sourceBadge(vehicle.sources) ? ` · ${sourceBadge(vehicle.sources)}` : ''}`}
              actions={
                vehicle.condition ? (
                  <span
                    className={`vdp-tag ${conditionClass(vehicle.condition)}`}
                  >
                    {vehicle.condition}
                  </span>
                ) : null
              }
            >
              <div
                className="vdp-vehicle-age-strip"
                aria-label="Range day strip"
              >
                {detailDays.map((d) => (
                  <div
                    key={d.date}
                    className={`vdp-vehicle-age-cell ${d.status}`}
                    title={`${d.date} · ${d.status}`}
                  >
                    <span className="vdp-vehicle-age-day">
                      {d.status === 'available' ? 'P' : 'A'}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <Card
            title="Day-by-day availability"
            sub={`VIN ${selectedVin} · ${formatRangeLabel(rangeFrom, rangeTo)} · hoot + scrap first_seen / last_seen`}
          >
            <div className="vdp-table-scroll">
              <table className="vdp-table">
                <thead>
                  <tr>
                    <th className="right">Day</th>
                    <th>Date</th>
                    <th>Weekday</th>
                    <th>Status</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {detailDays.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        style={{
                          textAlign: 'center',
                          color: 'var(--vdp-muted)',
                          padding: 20,
                        }}
                      >
                        No day data for this VIN
                      </td>
                    </tr>
                  ) : (
                    detailDays.map((d) => (
                      <tr key={d.date}>
                        <td className="right mono">{d.day}</td>
                        <td className="mono">{d.date}</td>
                        <td>{d.weekday}</td>
                        <td>
                          <span
                            className={`vdp-tag ${
                              d.status === 'available' ? 'available' : 'absent'
                            }`}
                          >
                            {d.status === 'available' ? 'P Present' : 'A Absent'}
                          </span>
                        </td>
                        <td style={{ color: 'var(--vdp-muted)', fontSize: 12 }}>
                          {d.status === 'available'
                            ? 'On lot (within first_seen → last_seen)'
                            : 'Outside first_seen → last_seen window'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
