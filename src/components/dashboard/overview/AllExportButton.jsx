'use client';

import { useState } from 'react';
import { useClient } from '../ClientContext';
import { useOverview } from './OverviewDataContext';

export default function AllExportButton() {
  const { client } = useClient();
  const { tab, clientKey, from, to } = useOverview();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (tab !== 'all') return null;

  const disabled = loading || !clientKey || !from || !to;

  const onDownload = async () => {
    setError(null);
    setLoading(true);
    try {
      const { downloadAllTabXlsx } = await import('@/lib/api/allExport');
      await downloadAllTabXlsx({
        clientId: clientKey,
        from,
        to,
        dealerName: client?.name,
      });
    } catch (err) {
      setError(err?.message || 'Download failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="ga4-count-export-btn vdp-export-btn"
        onClick={onDownload}
        disabled={disabled}
        title="Download full page data as XLSX (All tab, smart_ga4_page_data)"
      >
        {loading ? 'Preparing…' : 'Download XLSX'}
      </button>
      {error && (
        <span className="vdp-export-error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
