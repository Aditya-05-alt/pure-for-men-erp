export async function fetchPipelineDealers() {
  const res = await fetch('/api/admin/pipeline/dealers', { credentials: 'same-origin' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Failed to load dealers.');
  return json.dealers || [];
}

async function fetchPipelineStatsQuery({ clientId, from, to, scope, signal }) {
  const qs = new URLSearchParams({ clientId, from, to, scope });
  const res = await fetch(`/api/admin/pipeline/stats?${qs}`, {
    credentials: 'same-origin',
    signal,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Failed to load pipeline stats.');
  return json;
}

/** Fast workflow metadata ??? stage badges, coverage, unlock flags (no per-day tables). */
export async function fetchPipelineWorkflow({ clientId, from, to, signal }) {
  return fetchPipelineStatsQuery({ clientId, from, to, scope: 'workflow', signal });
}

/** Per-day view totals for one date (or small chunk). Uses build_pipeline_range_views RPC when deployed. */
export async function fetchPipelineViewsChunk({ clientId, from, to, signal }) {
  return fetchPipelineStatsQuery({ clientId, from, to, scope: 'views', signal });
}

/** @deprecated Prefer fetchPipelineWorkflow + chunked fetchPipelineViewsChunk */
export async function fetchPipelineStats({ clientId, from, to, signal }) {
  return fetchPipelineStatsQuery({ clientId, from, to, scope: 'full', signal });
}

export function mergePipelineRangeViews(prev, chunk) {
  if (!chunk?.rangeViews) return prev || {};
  if (!prev) return chunk.rangeViews;
  return {
    ga4Page: { ...prev.ga4Page, ...chunk.rangeViews.ga4Page },
    ga4Filter: { ...prev.ga4Filter, ...chunk.rangeViews.ga4Filter },
    finalVdp: { ...prev.finalVdp, ...chunk.rangeViews.finalVdp },
    hootMatch: { ...prev.hootMatch, ...chunk.rangeViews.hootMatch },
  };
}

/** Step 1 ??? Node GA4 page sync ??? smart_ga4_page_data */
export async function runPipelinePageSync({ clientId, from, to }) {
  const res = await fetch('/api/admin/pipeline/sync-page', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, from, to }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Page sync failed.');
  return json;
}

/** Step 2 ??? apply_vdp_filtration_range RPC */
export async function runPipelineFiltration({ clientId, from, to }) {
  const res = await fetch('/api/admin/pipeline/filtration', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, from, to }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Filtration failed.');
  return json;
}

/** Step 3 ??? final VDP sync RPC */
export async function runPipelineFinalSync({ clientId, from, to }) {
  const res = await fetch('/api/admin/pipeline/final-sync', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, from, to }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Final sync failed.');
  return json;
}
