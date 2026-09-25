'use client';

import { useState } from 'react';
import { useClient } from '../ClientContext';
import { useOverview } from './OverviewDataContext';

export default function VdpExportButton() {
  const { client } = useClient();
  const { tab, clientKey, from, to, vdpFilters } = useOverview();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (tab !== 'vdp') return null;

  const disabled = loading || !clientKey || !from || !to;

  const onDownload = async () => {
    setError(null);
    setLoading(true);
    try {
      const { downloadVdpXlsx } = await import('@/lib/api/vdpExport');
      await downloadVdpXlsx({
        clientId: clientKey,
        from,
        to,
        vdpFilters,
        tab: 'vdp',
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
        title="Download VDP data as XLSX (Channel, Location, Make, Model, Condition)"
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
