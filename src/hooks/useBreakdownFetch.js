import { useEffect, useState } from 'react';

/**
 * Shared fetch lifecycle for inventory breakdown panels (make/model/year/condition).
 */
export function useBreakdownFetch({
  enabled,
  clientId,
  from,
  to,
  topN,
  vdpFilters,
  tab,
  fetchFn,
  normalize,
  errorMessage = 'Failed to load breakdown.',
  ignoreVdpFilters = false,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled || !clientId || !from || !to) {
      setRows([]);
      setError(null);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchFn({
      clientId,
      from,
      to,
      limit: topN,
      vdpFilters,
      tab,
      onCancelCheck: () => cancelled,
    })
      .then((data) => {
        if (cancelled) return;
        if (data === undefined) return;
        setRows(normalize(data));
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message || errorMessage);
        setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    clientId,
    from,
    to,
    topN,
    ignoreVdpFilters ? null : vdpFilters,
    tab,
    fetchFn,
    normalize,
    errorMessage,
    ignoreVdpFilters,
  ]);

  return { rows, loading, error };
}
