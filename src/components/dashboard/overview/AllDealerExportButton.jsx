'use client';

import { useState } from 'react';
import { useOverview } from './OverviewDataContext';
import { useAllDealerMatrix } from './AllDealerMatrixContext';

export default function AllDealerExportButton() {
  const {
    tab,
    from,
    to,
    compareEnabled,
    compareFrom,
    compareTo,
    currentPeriodLabel,
    comparePeriodLabel,
  } = useOverview();
  const { snapshot } = useAllDealerMatrix();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (tab !== 'all' && tab !== 'vdp') return null;

  const tabLabel = tab === 'vdp' ? 'VDP' : 'All';
  const tableBusy = snapshot.loading || snapshot.compareLoading;
  const disabled = loading
    || tableBusy
    || !snapshot.ready
    || !snapshot.matrixRows?.length
    || !from
    || !to;

  const onDownload = async () => {
    if (!snapshot.ready) return;

    setError(null);
    setLoading(true);
    try {
      const { downloadAllDealerChannelXlsx } = await import('@/lib/api/allDealerExport');
      await downloadAllDealerChannelXlsx({
        matrixRows: snapshot.matrixRows,
        compareMatrixRows: snapshot.compareMatrixRows,
        columns: snapshot.columns,
        from,
        to,
        tab,
        compareEnabled,
        compareFrom,
        compareTo,
        currentPeriodLabel,
        comparePeriodLabel,
      });
    } catch (err) {
      setError(err?.message || 'Download failed.');
    } finally {
      setLoading(false);
    }
  };

  const title = tableBusy
    ? 'Wait for the table to finish loading'
    : !snapshot.ready
      ? 'No data ready to export yet'
      : `Download ${tabLabel} views by dealer as XLSX`;

  return (
    <>
      <button
        type="button"
        className="ga4-count-export-btn vdp-export-btn"
        onClick={onDownload}
        disabled={disabled}
        title={title}
      >
        {loading ? 'Preparing…' : tableBusy ? 'Loading data…' : 'Download XLSX'}
      </button>
      {error && (
        <span className="vdp-export-error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
