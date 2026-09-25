'use client';

import FilterDropdown from '@/components/dashboard/FilterDropdown';
import InventoryDatePicker from './InventoryDatePicker';
import {
  INVENTORY_CONDITION_OPTIONS,
  inventoryFiltersActive,
  toFilterOpts,
} from '@/lib/inventory/inventoryReportFilters';
import { useInventoryReport } from './InventoryReportContext';

function CompareDateSwitch({ enabled, onChange }) {
  return (
    <label className="compare-period-switch">
      <span className="compare-period-switch-label">Compare date</span>
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

export default function InventoryReportFilters() {
  const {
    reportDate,
    setReportDate,
    compareEnabled,
    toggleCompareEnabled,
    compareDate,
    setCompareDate,
    filters,
    setFilter,
    clearFilters,
    filterOptions,
    showLocationFilter,
    typeHeader,
    updating,
    compareUpdating,
  } = useInventoryReport();

  const hasActiveFilters = inventoryFiltersActive(filters);
  const showDataUpdating = updating || (compareEnabled && compareUpdating);

  return (
    <div className="filters inventory-report-filters">
      <span className="f-label">Filter</span>
      {hasActiveFilters && (
        <button
          type="button"
          className="filter-clear-all"
          onClick={clearFilters}
          aria-label="Clear all filters"
          title="Clear all filters"
        >
          ×
        </button>
      )}
      <FilterDropdown
        clearable
        options={INVENTORY_CONDITION_OPTIONS}
        value={filters.condition}
        onChange={(v) => setFilter('condition', v)}
      />
      <FilterDropdown
        clearable
        options={toFilterOpts(filterOptions.makes, 'All Makes')}
        value={filters.make}
        onChange={(v) => setFilter('make', v)}
      />
      <FilterDropdown
        clearable
        options={toFilterOpts(filterOptions.types, `All ${typeHeader}`)}
        value={filters.type}
        onChange={(v) => setFilter('type', v)}
      />
      {showLocationFilter && (
        <FilterDropdown
          clearable
          options={toFilterOpts(filterOptions.locations, 'All Locations')}
          value={filters.location}
          onChange={(v) => setFilter('location', v)}
        />
      )}
      <div className="f-right">
        {showDataUpdating && (
          <span className="data-updating-badge" role="status" aria-live="polite">
            <span className="data-updating-dot" aria-hidden />
            Data is updating
          </span>
        )}
        <CompareDateSwitch enabled={compareEnabled} onChange={toggleCompareEnabled} />
        {compareEnabled && (
          <>
            <span className="f-label">Compare</span>
            <InventoryDatePicker value={compareDate} onChange={setCompareDate} />
          </>
        )}
        <span className="f-label">Date</span>
        <InventoryDatePicker value={reportDate} onChange={setReportDate} />
      </div>
    </div>
  );
}
