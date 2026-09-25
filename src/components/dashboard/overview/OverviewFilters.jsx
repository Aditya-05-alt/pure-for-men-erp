'use client';

import FilterDropdown from '../FilterDropdown';
import CalendarRangePicker from '../CalendarRangePicker';
import VdpExportButton from './VdpExportButton';
import AllExportButton from './AllExportButton';
import AllDealerExportButton from './AllDealerExportButton';
import { useClient } from '../ClientContext';
import { useOverview } from './OverviewDataContext';
import { vdpFiltersActive } from '@/lib/vdp/vdpFilterParams';

const CONDITION_OPTIONS = ['All', 'Used + New', 'Used', 'New'];

function toOpts(values, allLabel) {
  return (values || ['All']).map((v) => ({
    value: v,
    label: v === 'All' ? allLabel : v,
  }));
}

function ComparePeriodSwitch({ enabled, onChange }) {
  return (
    <label className="compare-period-switch">
      <span className="compare-period-switch-label">Compare period</span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        className={`compare-period-switch-track ${enabled ? 'compare-period-switch-track--on' : ''}`}
        onClick={onChange}
      >
        <span className="compare-period-switch-thumb" />
      </button>
    </label>
  );
}

export default function OverviewFilters() {
  const { config, isAllDealer } = useClient();
  const {
    dateRange,
    setDateRange,
    tab,
    vdpFilters,
    setVdpFilter,
    clearVdpFilters,
    vdpFilterOptions,
    breakdownUpdating,
    breakdownChunkProgress,
    compareEnabled,
    toggleCompareEnabled,
    compareDateRange,
    setCompareDateRange,
    compareFrom,
    compareTo,
    compareLoading,
  } = useOverview();

  const showDataUpdating = breakdownUpdating || (compareEnabled && compareLoading);

  const showVdpFilters = tab === 'vdp';

  const typeValues = vdpFilterOptions.types?.length > 1
    ? vdpFilterOptions.types
    : ['All', ...(config.types || [])];

  const conditionOpts = CONDITION_OPTIONS.map((v) => ({
    value: v,
    label: v === 'All' ? 'All Conditions' : v,
  }));

  const comparePickerValue = compareDateRange ?? {
    start: compareFrom,
    end: compareTo,
    preset: 'custom',
  };

  const hasActiveVdpFilters = vdpFiltersActive(vdpFilters, 'vdp');

  if (isAllDealer) {
    return (
      <div className="filters all-dealer-filters">
        <div className="all-dealer-filters-left">
          <AllDealerExportButton />
        </div>
        <div className="f-right all-dealer-filters-right">
          <ComparePeriodSwitch enabled={compareEnabled} onChange={toggleCompareEnabled} />
          {compareEnabled && (
            <>
              <span className="f-label">Compare range</span>
              <CalendarRangePicker
                value={comparePickerValue}
                onChange={setCompareDateRange}
              />
            </>
          )}
          <span className="f-label">Date range</span>
          <CalendarRangePicker value={dateRange} onChange={setDateRange} />
        </div>
      </div>
    );
  }

  return (
    <div className="filters">
      {showVdpFilters && (
        <>
          <span className="f-label">Filter</span>
          {hasActiveVdpFilters && (
            <button
              type="button"
              className="filter-clear-all"
              onClick={clearVdpFilters}
              aria-label="Clear all filters"
              title="Clear all filters"
            >
              ×
            </button>
          )}
          <FilterDropdown
            clearable
            options={conditionOpts}
            value={vdpFilters.condition}
            onChange={(v) => setVdpFilter('condition', v)}
          />
          <FilterDropdown
            clearable
            options={toOpts(vdpFilterOptions.years, 'All Years')}
            value={vdpFilters.year}
            onChange={(v) => setVdpFilter('year', v)}
          />
          <FilterDropdown
            clearable
            options={toOpts(vdpFilterOptions.makes, 'All Makes')}
            value={vdpFilters.make}
            onChange={(v) => setVdpFilter('make', v)}
          />
          <FilterDropdown
            clearable
            options={toOpts(vdpFilterOptions.models, 'All Models')}
            value={vdpFilters.model}
            onChange={(v) => setVdpFilter('model', v)}
          />
          <FilterDropdown
            clearable
            options={toOpts(typeValues, `All ${config.typeH || 'Types'}`)}
            value={vdpFilters.type}
            onChange={(v) => setVdpFilter('type', v)}
          />
          {config.showLoc !== false && (
            <FilterDropdown
              clearable
              options={toOpts(vdpFilterOptions.locations, 'All Locations')}
              value={vdpFilters.location}
              onChange={(v) => setVdpFilter('location', v)}
            />
          )}
          <VdpExportButton />
        </>
      )}
      {tab === 'all' && (
        <div className="filters-export-slot">
          <AllExportButton />
        </div>
      )}
      <div className="f-right">
        {showDataUpdating && (
          <span className="data-updating-badge" role="status" aria-live="polite">
            <span className="data-updating-dot" aria-hidden />
            Data is updating
            {breakdownChunkProgress?.total > 1 && (
              <span className="data-updating-chunk">
                {breakdownChunkProgress.completed}/{breakdownChunkProgress.total}
              </span>
            )}
          </span>
        )}
        <ComparePeriodSwitch enabled={compareEnabled} onChange={toggleCompareEnabled} />
        {compareEnabled && (
          <>
            <span className="f-label">Compare range</span>
            <CalendarRangePicker
              value={comparePickerValue}
              onChange={setCompareDateRange}
            />
          </>
        )}
        <CalendarRangePicker value={dateRange} onChange={setDateRange} />
      </div>
    </div>
  );
}
