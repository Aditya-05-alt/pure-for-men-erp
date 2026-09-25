'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useClient } from '@/components/dashboard/ClientContext';
import {
  CHANNEL_PALETTE,
  UNMAPPED_ID,
  defaultChannels,
  defaultMappingEntries,
  rawPairKey,
} from '@/lib/sourceMapping/defaults';
import { aggregateRawToChannels, toMappingMap } from '@/lib/sourceMapping/apply';
import { buildPeriods } from '@/lib/vdp/mockData';
import { invalidateSourceMappingCache } from '@/lib/api/sourceMapping';
import VdpLoadingBanner, { VdpLoadingBlock } from '@/components/vdp/VdpLoadingBanner';

const MTD = buildPeriods(new Date()).mtd;
const MODE_KEY = 'vdp_src_map_mode';
const MAP_MODES = [
  {
    id: 'all',
    label: 'All Dealers Mapping',
    blurb: 'One shared mapping for every dealer. Preview totals use all dealers combined.',
  },
  {
    id: 'multi',
    label: 'Multi Dealer Mapping',
    blurb: 'Same shared mapping rules; preview totals use the dealers you pick in the dropdown.',
  },
  {
    id: 'single',
    label: 'Default Single Dealer Mapping',
    blurb: 'Same shared mapping rules; preview totals use one dealer for context.',
  },
];

function readStoredMode() {
  if (typeof window === 'undefined') return 'single';
  try {
    const v = window.sessionStorage.getItem(MODE_KEY);
    if (v === 'all' || v === 'multi' || v === 'single') return v;
  } catch {
    /* ignore */
  }
  return 'single';
}

function fmt(n) {
  return Math.round(Number(n) || 0).toLocaleString();
}

/** Pretty-print GA4 default channel group (organic_search → Organic Search). */
function formatRawChannel(raw) {
  const s = String(raw || '').trim();
  if (!s || s === '(not set)') return '(not set)';
  const known = {
    organic_search: 'Organic Search',
    paid_search: 'Paid Search',
    direct: 'Direct',
    organic_social: 'Organic Social',
    paid_social: 'Paid Social',
    paid_video: 'Paid Video',
    organic_video: 'Organic Video',
    display: 'Display',
    email: 'Email',
    referral: 'Referral',
    affiliates: 'Affiliates',
    paid_other: 'Paid Other',
    sms: 'SMS',
    audio: 'Audio',
    'cross-network': 'Cross-network',
    unassigned: 'Unassigned',
  };
  const key = s.toLowerCase();
  if (known[key]) return known[key];
  return s
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function rulesFromMappingObj(mapping) {
  return Object.entries(mapping || {}).map(([key, channelId]) => {
    const [rawSource, rawMedium] = String(key).split('|||');
    return {
      rawSource: rawSource || '(direct)',
      rawMedium: rawMedium || '(none)',
      channelId,
    };
  });
}

function resolveMappedChannelId(rawSource, rawMedium, mappingMap, validIds) {
  const key = rawPairKey(rawSource, rawMedium);
  let id = mappingMap instanceof Map ? mappingMap.get(key) : mappingMap?.[key];
  // Legacy keys sometimes used "||" instead of "|||".
  if (!id && mappingMap instanceof Map) {
    const legacy = `${String(rawSource || '')
      .trim()
      .toLowerCase()}||${String(rawMedium || '')
      .trim()
      .toLowerCase()}`;
    id = mappingMap.get(legacy);
  }
  id = String(id || '').trim();
  if (!id || id === UNMAPPED_ID) return UNMAPPED_ID;
  if (validIds && !validIds.has(id)) return UNMAPPED_ID;
  return id;
}

async function fetchRawForClient(clientId) {
  const qs = new URLSearchParams({
    clientId,
    from: MTD.curFrom,
    to: MTD.curTo,
  });
  const res = await fetch(`/api/dashboard/source-mapping/raw?${qs}`, {
    credentials: 'same-origin',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `Failed to load raw sources (${res.status})`);
  }
  return json.rows || [];
}

function mergeRawLists(lists) {
  const map = new Map();
  for (const rows of lists) {
    for (const r of rows || []) {
      const key = r.id || rawPairKey(r.rawSource, r.rawMedium);
      const prev = map.get(key);
      if (!prev) {
        map.set(key, {
          id: key,
          rawSource: r.rawSource,
          rawMedium: r.rawMedium,
          rawChannel: r.rawChannel || '(not set)',
          pageViews: Number(r.pageViews) || 0,
          vdpViews: Number(r.vdpViews) || 0,
        });
      } else {
        prev.pageViews += Number(r.pageViews) || 0;
        prev.vdpViews += Number(r.vdpViews) || 0;
      }
    }
  }
  return [...map.values()].sort(
    (a, b) => b.pageViews - a.pageViews || a.rawSource.localeCompare(b.rawSource)
  );
}

export default function SourceMappingPanel() {
  const { dealers, client, loading: dealersLoading } = useClient();
  const [mapMode, setMapModeState] = useState(readStoredMode);
  const [channels, setChannels] = useState(defaultChannels());
  const [mapping, setMapping] = useState(() =>
    Object.fromEntries(
      defaultMappingEntries().map((e) => [
        rawPairKey(e.rawSource, e.rawMedium),
        e.channelId,
      ])
    )
  );
  const [rawRows, setRawRows] = useState([]);
  const [clientId, setClientId] = useState('');
  const [multiIds, setMultiIds] = useState([]);
  const [multiOpen, setMultiOpen] = useState(false);
  const multiDropRef = useRef(null);
  const [search, setSearch] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterMedium, setFilterMedium] = useState('');
  const [filterChannel, setFilterChannel] = useState('');
  const [filterMappedChannel, setFilterMappedChannel] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [bulkTarget, setBulkTarget] = useState('');
  const [loading, setLoading] = useState(true);
  const [rawLoading, setRawLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const savedFlashTimer = useRef(null);
  const [error, setError] = useState(null);
  const [warning, setWarning] = useState(null);
  const [status, setStatus] = useState(null);

  const clearSavedFlash = () => {
    if (savedFlashTimer.current) {
      clearTimeout(savedFlashTimer.current);
      savedFlashTimer.current = null;
    }
    setSavedFlash(false);
  };

  const showSavedFlash = () => {
    clearSavedFlash();
    setSavedFlash(true);
    savedFlashTimer.current = setTimeout(() => {
      setSavedFlash(false);
      savedFlashTimer.current = null;
    }, 15000);
  };

  const markDirty = () => {
    setDirty(true);
    setStatus(null);
    clearSavedFlash();
  };

  const setMapMode = (next) => {
    setMapModeState(next);
    try {
      window.sessionStorage.setItem(MODE_KEY, next);
    } catch {
      /* ignore */
    }
  };

  const dealerOptions = useMemo(
    () =>
      (dealers || [])
        .map((d) => ({
          id: String(d.ga4CustomerId || '').trim(),
          name: d.name || d.customerName || 'Unnamed',
        }))
        .filter((d) => d.id),
    [dealers]
  );

  useEffect(() => {
    if (clientId) return;
    const fromClient = String(client?.ga4CustomerId || '').trim();
    if (fromClient) {
      setClientId(fromClient);
      return;
    }
    if (dealerOptions[0]?.id) setClientId(dealerOptions[0].id);
  }, [clientId, client, dealerOptions]);

  useEffect(() => {
    if (multiIds.length || !dealerOptions.length) return;
    const fromClient = String(client?.ga4CustomerId || '').trim();
    const starter = fromClient || dealerOptions[0]?.id;
    if (starter) setMultiIds([starter]);
  }, [multiIds.length, dealerOptions, client]);

  useEffect(() => {
    if (mapMode !== 'multi') setMultiOpen(false);
  }, [mapMode]);

  useEffect(() => {
    if (!multiOpen) return undefined;
    const onPointer = (e) => {
      if (multiDropRef.current?.contains(e.target)) return;
      setMultiOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setMultiOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [multiOpen]);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboard/source-mapping', {
        credentials: 'same-origin',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to load mapping');
      setChannels(json.channels?.length ? json.channels : defaultChannels());
      setMapping(json.mapping || {});
      setWarning(json.warning || null);
      setDirty(false);
    } catch (err) {
      setError(err.message || 'Failed to load mapping');
    } finally {
      setLoading(false);
    }
  }, []);

  const previewClientIds = useMemo(() => {
    if (mapMode === 'all') return dealerOptions.map((d) => d.id);
    if (mapMode === 'multi') return multiIds.filter(Boolean);
    return clientId ? [clientId] : [];
  }, [mapMode, dealerOptions, multiIds, clientId]);

  const loadRaw = useCallback(async () => {
    if (!previewClientIds.length || !MTD.curFrom || !MTD.curTo) {
      setRawRows([]);
      return;
    }
    setRawLoading(true);
    try {
      const lists = await Promise.all(
        previewClientIds.map((id) => fetchRawForClient(id))
      );
      setRawRows(mergeRawLists(lists));
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load raw sources');
      setRawRows([]);
    } finally {
      setRawLoading(false);
    }
  }, [previewClientIds]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    loadRaw();
  }, [loadRaw]);

  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  useEffect(
    () => () => {
      if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current);
    },
    []
  );

  const mappingMap = useMemo(() => toMappingMap(mapping), [mapping]);

  const validChannelIds = useMemo(
    () => new Set((channels || []).map((c) => String(c.id))),
    [channels]
  );

  const channelIdByName = useMemo(() => {
    const map = new Map();
    for (const c of channels || []) {
      map.set(String(c.name || '').trim().toLowerCase(), c.id);
      map.set(String(c.id || '').trim().toLowerCase(), c.id);
    }
    return map;
  }, [channels]);

  const previewRows = useMemo(
    () => aggregateRawToChannels(rawRows, channels, mappingMap),
    [rawRows, channels, mappingMap]
  );

  const filteredRaw = useMemo(() => {
    const q = search.trim().toLowerCase();
    const wantedRaw = String(filterMappedChannel || '').trim();
    const wantedId =
      channelIdByName.get(wantedRaw.toLowerCase()) || wantedRaw || '';
    const wantedName = String(
      (channels || []).find((c) => c.id === wantedId)?.name || ''
    )
      .trim()
      .toLowerCase();

    // Dedupe by pair id (facebook vs Facebook can collide after normalize).
    const seen = new Set();
    let rows = [];
    for (const r of rawRows || []) {
      const id =
        r.id || rawPairKey(r.rawSource, r.rawMedium);
      if (seen.has(id)) continue;
      seen.add(id);
      const channelId = resolveMappedChannelId(
        r.rawSource,
        r.rawMedium,
        mappingMap,
        validChannelIds
      );
      rows.push({
        ...r,
        id,
        channelId,
        rawChannelLabel: formatRawChannel(r.rawChannel),
      });
    }

    if (filterSource) {
      rows = rows.filter((r) => String(r.rawSource) === filterSource);
    }
    if (filterMedium) {
      rows = rows.filter((r) => String(r.rawMedium) === filterMedium);
    }
    if (filterChannel) {
      rows = rows.filter((r) => r.rawChannelLabel === filterChannel);
    }
    // Strict: Mapped Channel filter only keeps rows assigned to that channel id.
    if (wantedId) {
      rows = rows.filter((r) => r.channelId === wantedId);
      // Put GA4-raw matches first so "aligned" rows aren't buried under big mismatches.
      rows = [...rows].sort((a, b) => {
        const aHit = a.rawChannelLabel.toLowerCase() === wantedName ? 0 : 1;
        const bHit = b.rawChannelLabel.toLowerCase() === wantedName ? 0 : 1;
        if (aHit !== bHit) return aHit - bHit;
        return (Number(b.pageViews) || 0) - (Number(a.pageViews) || 0);
      });
    }
    if (q) {
      rows = rows.filter(
        (r) =>
          String(r.rawSource).toLowerCase().includes(q) ||
          String(r.rawMedium).toLowerCase().includes(q) ||
          String(r.rawChannel || '').toLowerCase().includes(q) ||
          r.rawChannelLabel.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [
    rawRows,
    mappingMap,
    validChannelIds,
    channelIdByName,
    channels,
    search,
    filterSource,
    filterMedium,
    filterChannel,
    filterMappedChannel,
  ]);

  const filterEpoch = [
    filterMappedChannel,
    filterChannel,
    filterSource,
    filterMedium,
    search,
  ].join('|');

  const sourceFilterOpts = useMemo(() => {
    const set = new Set(rawRows.map((r) => String(r.rawSource || '')));
    return [...set].filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [rawRows]);

  const mediumFilterOpts = useMemo(() => {
    const set = new Set(rawRows.map((r) => String(r.rawMedium || '')));
    return [...set].filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [rawRows]);

  const channelFilterOpts = useMemo(() => {
    const set = new Set(rawRows.map((r) => formatRawChannel(r.rawChannel)));
    return [...set].filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [rawRows]);

  const mappedChannelFilterOpts = useMemo(() => {
    return (channels || [])
      .map((c) => ({ id: c.id, name: c.name || c.id }))
      .filter((c) => c.id)
      .sort((a, b) => {
        if (a.id === UNMAPPED_ID) return 1;
        if (b.id === UNMAPPED_ID) return -1;
        return String(a.name).localeCompare(String(b.name));
      });
  }, [channels]);

  const channelCounts = useMemo(() => {
    const counts = Object.fromEntries(channels.map((c) => [c.id, 0]));
    for (const r of rawRows) {
      const id = resolveMappedChannelId(
        r.rawSource,
        r.rawMedium,
        mappingMap,
        validChannelIds
      );
      counts[id] = (counts[id] || 0) + 1;
    }
    for (const [key, channelId] of Object.entries(mapping)) {
      const inRaw = rawRows.some(
        (r) => rawPairKey(r.rawSource, r.rawMedium) === key
      );
      if (!inRaw) {
        const id = validChannelIds.has(channelId) ? channelId : UNMAPPED_ID;
        counts[id] = (counts[id] || 0) + 1;
      }
    }
    return counts;
  }, [channels, rawRows, mapping, mappingMap, validChannelIds]);

  const pvByChannel = useMemo(() => {
    return Object.fromEntries(previewRows.map((r) => [r.id, r.pageViews]));
  }, [previewRows]);

  const modeMeta = MAP_MODES.find((m) => m.id === mapMode) || MAP_MODES[2];

  const previewScopeLabel = useMemo(() => {
    if (mapMode === 'all') return `All dealers (${dealerOptions.length})`;
    if (mapMode === 'multi') return `${multiIds.length} dealer${multiIds.length === 1 ? '' : 's'} selected`;
    const name = dealerOptions.find((d) => d.id === clientId)?.name;
    return name || 'One dealer';
  }, [mapMode, dealerOptions, multiIds, clientId]);

  const multiTriggerLabel = useMemo(() => {
    if (!multiIds.length) return 'Select dealers…';
    if (multiIds.length === 1) {
      return (
        dealerOptions.find((d) => d.id === multiIds[0])?.name || '1 dealer'
      );
    }
    if (multiIds.length === dealerOptions.length && dealerOptions.length > 0) {
      return `All dealers (${multiIds.length})`;
    }
    return `${multiIds.length} dealers selected`;
  }, [multiIds, dealerOptions]);

  const toggleMultiId = (id) => {
    setMultiIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };
  const persist = async (nextChannels, nextMapping, { reset = false } = {}) => {
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      const res = await fetch('/api/dashboard/source-mapping', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          reset
            ? { reset: true }
            : {
                channels: nextChannels,
                rules: rulesFromMappingObj(nextMapping),
              }
        ),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          [json.error, json.hint].filter(Boolean).join(' ') || 'Save failed'
        );
      }
      if (json.missingTable) {
        throw new Error(
          json.warning ||
            'Mapping tables are missing — deploy supabase/migrations/source_mapping.sql first.'
        );
      }
      setChannels(json.channels?.length ? json.channels : nextChannels);
      setMapping(json.mapping || nextMapping);
      setWarning(json.warning || null);
      invalidateSourceMappingCache();
      setDirty(false);
      setStatus('Saved — Traffic and All Dealers columns will use this mapping.');
      showSavedFlash();
    } catch (err) {
      setError(err.message || 'Save failed');
      clearSavedFlash();
    } finally {
      setSaving(false);
    }
  };

  const saveMapping = () => persist(channels, mapping);

  const assignOne = (rawSource, rawMedium, channelId) => {
    const key = rawPairKey(rawSource, rawMedium);
    const next = { ...mapping, [key]: channelId };
    setMapping(next);
    markDirty();
  };

  const addChannel = () => {
    const color = CHANNEL_PALETTE[channels.length % CHANNEL_PALETTE.length];
    const id = `ch-${Date.now()}`;
    const idx = channels.findIndex((c) => c.id === UNMAPPED_ID);
    const next = [...channels];
    const row = {
      id,
      name: 'New Channel',
      color,
      sortOrder: (idx < 0 ? next.length : idx) * 10,
      isUnmapped: false,
    };
    if (idx < 0) next.push(row);
    else next.splice(idx, 0, row);
    setChannels(next);
    markDirty();
  };

  const renameChannel = (id, name) => {
    const next = channels.map((c) =>
      c.id === id ? { ...c, name: name || c.name } : c
    );
    setChannels(next);
    markDirty();
  };

  const deleteChannel = (id) => {
    if (id === UNMAPPED_ID) return;
    const nextMapping = { ...mapping };
    for (const k of Object.keys(nextMapping)) {
      if (nextMapping[k] === id) nextMapping[k] = UNMAPPED_ID;
    }
    const nextChannels = channels.filter((c) => c.id !== id);
    setChannels(nextChannels);
    setMapping(nextMapping);
    markDirty();
  };

  const mergeChannel = (fromId, intoId) => {
    if (!intoId || fromId === intoId) return;
    const nextMapping = { ...mapping };
    for (const k of Object.keys(nextMapping)) {
      if (nextMapping[k] === fromId) nextMapping[k] = intoId;
    }
    const nextChannels =
      fromId === UNMAPPED_ID
        ? channels
        : channels.filter((c) => c.id !== fromId);
    setChannels(nextChannels);
    setMapping(nextMapping);
    markDirty();
  };

  const resetMapping = () => {
    const ch = defaultChannels();
    const map = Object.fromEntries(
      defaultMappingEntries().map((e) => [
        rawPairKey(e.rawSource, e.rawMedium),
        e.channelId,
      ])
    );
    setChannels(ch);
    setMapping(map);
    setSelected(new Set());
    persist(ch, map, { reset: true });
  };

  const discardChanges = () => {
    setDirty(false);
    setStatus(null);
    setError(null);
    loadConfig();
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = (checked) => {
    if (!checked) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(filteredRaw.map((r) => r.id)));
  };

  const applyBulk = () => {
    if (!bulkTarget || selected.size === 0) return;
    const next = { ...mapping };
    for (const r of filteredRaw) {
      if (!selected.has(r.id)) continue;
      next[rawPairKey(r.rawSource, r.rawMedium)] = bulkTarget;
    }
    setMapping(next);
    setSelected(new Set());
    markDirty();
  };

  if (loading) {
    return (
      <div className="src-map-page">
        <VdpLoadingBanner
          active
          label="Loading source mapping…"
          detail="Fetching channels and mapping rules"
        />
        <VdpLoadingBlock label="Preparing Source Mapping…" minHeight={220} />
      </div>
    );
  }

  return (
    <div className="src-map-page">
      <VdpLoadingBanner
        active={rawLoading || saving}
        label={saving ? 'Saving mapping…' : 'Loading raw sources…'}
        detail={
          saving
            ? 'Updating channel rules for Traffic and All Dealers'
            : `Fetching source / medium rows · ${previewScopeLabel}`
        }
      />
      <div className="src-map-card">
        <h3 className="src-map-h3">Mapping scope</h3>
        <div className="src-map-mode" role="tablist" aria-label="Mapping scope">
          {MAP_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={mapMode === m.id}
              className={`src-map-mode-btn${mapMode === m.id ? ' is-active' : ''}`}
              onClick={() => setMapMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="src-map-sub" style={{ marginBottom: 0, marginTop: 10 }}>
          {modeMeta.blurb} Channel rules are still shared and apply on Traffic and All
          Dealers after save. Preview below: <strong>{previewScopeLabel}</strong>.
        </p>
      </div>

      <div className="src-map-card">
        <h3 className="src-map-h3">How this works</h3>
        <p className="src-map-sub" style={{ marginBottom: 0 }}>
          GA4 reports traffic as raw <code>source / medium</code> pairs —{' '}
          <code>google / organic</code>, <code>facebook / paid</code>, and so on.
          Map each raw source into a clean channel (the column names used on Traffic
          and All Dealers). Renaming, merging, or reassigning here updates those
          pages after save.
        </p>
      </div>

      {(error || warning || status) && (
        <div className="src-map-card">
          {error && <p className="src-map-msg src-map-msg--err">{error}</p>}
          {warning && <p className="src-map-msg src-map-msg--warn">{warning}</p>}
          {status && <p className="src-map-msg src-map-msg--ok">{status}</p>}
        </div>
      )}

      <div className="src-map-toolbar">
        {mapMode === 'single' && (
          <label>
            Preview dealer
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="src-map-select"
              disabled={dealersLoading || !dealerOptions.length}
            >
              {!dealerOptions.length && <option value="">No dealers</option>}
              {dealerOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {mapMode === 'multi' && (
          <div className="src-map-multi" ref={multiDropRef}>
            <div className="src-map-multi-label">Preview dealers</div>
            <button
              type="button"
              className={`src-map-multi-trigger${multiOpen ? ' is-open' : ''}`}
              aria-haspopup="listbox"
              aria-expanded={multiOpen}
              onClick={() => setMultiOpen((o) => !o)}
            >
              <span className="src-map-multi-trigger-text">{multiTriggerLabel}</span>
              <span className="src-map-multi-trigger-arr" aria-hidden>
                {multiOpen ? '▴' : '▾'}
              </span>
            </button>
            {multiOpen && (
              <div className="src-map-multi-pop" role="listbox" aria-label="Preview dealers" aria-multiselectable="true">
                <div className="src-map-multi-actions">
                  <button
                    type="button"
                    className="src-map-linkish"
                    onClick={() => setMultiIds(dealerOptions.map((d) => d.id))}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    className="src-map-linkish"
                    onClick={() => setMultiIds([])}
                  >
                    Clear
                  </button>
                  <span className="src-map-meta" style={{ paddingBottom: 0, marginLeft: 'auto' }}>
                    {multiIds.length} selected
                  </span>
                </div>
                <ul className="src-map-multi-list">
                  {dealerOptions.map((d) => {
                    const checked = multiIds.includes(d.id);
                    return (
                      <li key={d.id}>
                        <label className="src-map-multi-item">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleMultiId(d.id)}
                          />
                          <span>{d.name}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
        {mapMode === 'all' && (
          <span className="src-map-meta">
            Previewing combined MTD traffic for all {dealerOptions.length} dealers
          </span>
        )}
        <span className="src-map-meta">
          MTD {MTD.curLabel}
          {rawLoading ? ' · Loading raw…' : ''}
          {saving ? ' · Saving…' : ''}
          {dirty && !saving ? ' · Unsaved changes' : ''}
        </span>
        <div className="src-map-save-actions">
          {dirty ? (
            <button
              type="button"
              className="src-map-btn"
              onClick={discardChanges}
              disabled={saving}
            >
              Discard
            </button>
          ) : null}
          <button
            type="button"
            className="src-map-btn src-map-btn--primary"
            onClick={saveMapping}
            disabled={saving || !dirty}
          >
            {saving ? 'Saving…' : dirty ? 'Save Mapping' : 'Saved'}
          </button>
          {savedFlash ? (
            <span className="src-map-saved-tick" aria-live="polite" title="Saved">
              ✓
            </span>
          ) : null}
        </div>
      </div>

      <div className="src-map-grid2">
        <div className="src-map-card src-map-card--panel">
          <h3 className="src-map-h3">Channels</h3>
          <p className="src-map-sub">
            Rename, merge, or delete. &quot;Unmapped&quot; catches anything not yet
            assigned.
          </p>
          <div className="src-map-channel-list">
            <div className="src-map-channel-head" aria-hidden>
              <span>Channel</span>
              <span className="right">Raw Sources</span>
              <span className="right">Page Views (MTD)</span>
              <span className="right">Actions</span>
            </div>
            {channels.map((ch) => (
              <div className="src-map-channel-row" key={ch.id}>
                <div className="src-map-channel-cell">
                  <span
                    className="src-map-swatch"
                    style={{ background: ch.color }}
                  />
                  <input
                    type="text"
                    className="src-map-rename"
                    defaultValue={ch.name}
                    key={`${ch.id}-${ch.name}`}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== ch.name) renameChannel(ch.id, v);
                    }}
                  />
                </div>
                <div className="src-map-num right">{channelCounts[ch.id] || 0}</div>
                <div className="src-map-num right">{fmt(pvByChannel[ch.id] || 0)}</div>
                <div className="src-map-actions">
                  <select
                    className="src-map-select src-map-select--sm"
                    defaultValue=""
                    aria-label={`Merge ${ch.name} into`}
                    onChange={(e) => {
                      if (e.target.value) {
                        mergeChannel(ch.id, e.target.value);
                        e.target.value = '';
                      }
                    }}
                  >
                    <option value="">Merge into…</option>
                    {channels
                      .filter((c) => c.id !== ch.id)
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                  </select>
                  {ch.id !== UNMAPPED_ID ? (
                    <button
                      type="button"
                      className="src-map-btn src-map-btn--danger"
                      onClick={() => deleteChannel(ch.id)}
                    >
                      Delete
                    </button>
                  ) : (
                    <span className="src-map-btn-spacer" aria-hidden />
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="src-map-btn-row">
            <button type="button" className="src-map-btn" onClick={addChannel}>
              + Add Channel
            </button>
            <button type="button" className="src-map-btn" onClick={resetMapping}>
              Reset to Default Mapping
            </button>
            <button
              type="button"
              className="src-map-btn src-map-btn--primary"
              onClick={saveMapping}
              disabled={saving || !dirty}
            >
              {saving ? 'Saving…' : dirty ? 'Save Mapping' : 'Saved'}
            </button>
            {savedFlash ? (
              <span className="src-map-saved-tick" aria-live="polite" title="Saved">
                ✓
              </span>
            ) : null}
          </div>
        </div>

        <div className="src-map-card src-map-card--panel">
          <h3 className="src-map-h3">Live Preview — Channel Totals</h3>
          <p className="src-map-sub">
            Month-to-date · {previewScopeLabel}. This is what the Traffic tab will show
            for the selected scope.
          </p>
          <div className="src-map-table-wrap">
            <table className="src-map-table">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th className="right">Page Views</th>
                  <th className="right">VDP Views</th>
                  <th className="right">VDP Rate</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="src-map-empty">
                      Nothing mapped yet
                    </td>
                  </tr>
                ) : (
                  previewRows.map((r) => {
                    const rate =
                      r.pageViews > 0 ? (r.vdpViews / r.pageViews) * 100 : 0;
                    return (
                      <tr key={r.id}>
                        <td>
                          <div className="src-map-channel-cell">
                            <span
                              className="src-map-swatch"
                              style={{ background: r.color }}
                            />
                            <span className="src-map-channel-name">{r.name}</span>
                          </div>
                        </td>
                        <td className="right src-map-num">{fmt(r.pageViews)}</td>
                        <td className="right src-map-num">{fmt(r.vdpViews)}</td>
                        <td className="right src-map-num">{rate.toFixed(1)}%</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="src-map-card">
        <h3 className="src-map-h3">
          Raw Sources{' '}
          <span className="src-map-count">
            ({filteredRaw.length}
            {search ||
            filterSource ||
            filterMedium ||
            filterChannel ||
            filterMappedChannel
              ? ` of ${rawRows.length}`
              : ''}
            )
          </span>
        </h3>
        <p className="src-map-sub">
          Select rows to bulk-assign, or change a single row&apos;s channel from its
          dropdown. &quot;By Mapped Channel&quot; filters the last column only — Raw
          Channel (GA4) can still differ.
        </p>
        {filterMappedChannel ? (
          <p className="src-map-sub" style={{ marginTop: -4, marginBottom: 10 }}>
            Showing <strong>Mapped Channel</strong> ={' '}
            <strong>
              {mappedChannelFilterOpts.find((c) => c.id === filterMappedChannel)
                ?.name || filterMappedChannel}
            </strong>{' '}
            only ({filteredRaw.length} rows). Raw Channel (GA4) can still differ —
            that is expected.
          </p>
        ) : null}
        <div className="src-map-toolbar" style={{ marginBottom: 10 }}>
          <input
            type="text"
            className="src-map-search"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search raw sources"
          />
          <select
            className="src-map-select src-map-select--filter"
            value={filterChannel}
            onChange={(e) => setFilterChannel(e.target.value)}
            aria-label="Filter by channel"
          >
            <option value="">By Raw Channel</option>
            {channelFilterOpts.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            className="src-map-select src-map-select--filter"
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
            aria-label="Filter by source"
          >
            <option value="">By Source</option>
            {sourceFilterOpts.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            className="src-map-select src-map-select--filter"
            value={filterMedium}
            onChange={(e) => setFilterMedium(e.target.value)}
            aria-label="Filter by medium"
          >
            <option value="">By Medium</option>
            {mediumFilterOpts.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select
            className="src-map-select src-map-select--filter"
            value={filterMappedChannel}
            onChange={(e) => {
              setFilterMappedChannel(e.target.value);
              setSelected(new Set());
            }}
            aria-label="Filter by mapped channel"
          >
            <option value="">By Mapped Channel</option>
            {mappedChannelFilterOpts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {(filterSource ||
            filterMedium ||
            filterChannel ||
            filterMappedChannel ||
            search) && (
            <button
              type="button"
              className="src-map-btn"
              onClick={() => {
                setSearch('');
                setFilterSource('');
                setFilterMedium('');
                setFilterChannel('');
                setFilterMappedChannel('');
              }}
            >
              Clear filters
            </button>
          )}
          {selected.size > 0 && (
            <div className="src-map-bulk">
              <span>{selected.size} selected</span>
              <select
                className="src-map-select"
                value={bulkTarget}
                onChange={(e) => setBulkTarget(e.target.value)}
              >
                <option value="">Assign to…</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button type="button" className="src-map-btn" onClick={applyBulk}>
                Assign
              </button>
              <button
                type="button"
                className="src-map-btn"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </button>
            </div>
          )}
        </div>
        <div className="src-map-table-wrap src-map-table-wrap--raw">
          <table className="src-map-table src-map-table--raw">
            <thead>
              <tr>
                <th className="src-map-th-check">
                  <input
                    type="checkbox"
                    checked={
                      filteredRaw.length > 0 &&
                      filteredRaw.every((r) => selected.has(r.id))
                    }
                    onChange={(e) => selectAllVisible(e.target.checked)}
                  />
                </th>
                <th>Raw Channel (GA4)</th>
                <th>Raw Source</th>
                <th>Raw Medium</th>
                <th className="right">Page Views (MTD)</th>
                <th className="right">VDP Views (MTD)</th>
                <th>Mapped Channel</th>
              </tr>
            </thead>
            <tbody key={`raw-body-${filterEpoch}`}>
              {filteredRaw.length === 0 ? (
                <tr>
                  <td colSpan={7} className="src-map-empty">
                    {rawLoading
                      ? 'Loading…'
                      : 'No raw sources for this dealer / period. Deploy source_mapping.sql if the RPC is missing.'}
                  </td>
                </tr>
              ) : (
                filteredRaw.map((r, idx) => {
                  const mappedId = validChannelIds.has(r.channelId)
                    ? r.channelId
                    : UNMAPPED_ID;
                  return (
                  <tr key={`${filterEpoch}::${r.id}::${mappedId}::${idx}`}>
                    <td className="src-map-td-check">
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                      />
                    </td>
                    <td>{r.rawChannelLabel}</td>
                    <td>{r.rawSource}</td>
                    <td>{r.rawMedium}</td>
                    <td className="right src-map-num">{fmt(r.pageViews)}</td>
                    <td className="right src-map-num">{fmt(r.vdpViews)}</td>
                    <td>
                      <select
                        key={`map-${filterEpoch}-${r.id}-${mappedId}`}
                        className="src-map-select src-map-select--map"
                        value={mappedId}
                        onChange={(e) =>
                          assignOne(r.rawSource, r.rawMedium, e.target.value)
                        }
                      >
                        {channels.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
