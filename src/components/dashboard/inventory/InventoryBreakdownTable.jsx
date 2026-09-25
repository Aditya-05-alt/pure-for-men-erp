'use client';

import {
  formatInventoryUnits,
  formatInventoryValue,
} from '@/lib/inventory/formatInventory';
import { inventoryRowLabel } from '@/lib/inventory/inventoryDonutData';

export default function InventoryBreakdownTable({
  rows = [],
  totalUnits = 0,
  totalValue = 0,
  labelHeader = 'Conditions',
  periodLabel,
}) {
  return (
    <div className="make-breakdown-table-side inventory-condition-data-col">
      {periodLabel && (
        <div className="inventory-compare-period-label inventory-compare-table-label">
          {periodLabel}
        </div>
      )}
      <div className="make-breakdown-table-header inventory-condition-data-header">
        <span>{labelHeader}</span>
        <span>Units</span>
        <span>Price</span>
      </div>

      <div className="make-breakdown-table-scroll inventory-breakdown-table-scroll">
        {rows.map((row, index) => {
          const label = inventoryRowLabel(row);
          return (
            <div
              key={`${label}-${row.units}-${index}`}
              className={`make-breakdown-data-row inventory-condition-data-row${
                index % 2 === 1 ? ' inventory-condition-data-row--alt' : ''
              }`}
            >
              <div className="make-breakdown-make-cell">
                <span
                  className="make-breakdown-dot"
                  style={{ background: row.color }}
                  aria-hidden
                />
                <span className="make-breakdown-name" title={label}>
                  {label}
                </span>
              </div>
              <span className="make-breakdown-views-cell">
                {formatInventoryUnits(row.units)}
              </span>
              <span className="make-breakdown-views-cell inventory-condition-price">
                {formatInventoryValue(row.totalValue)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="make-breakdown-total inventory-condition-data-total">
        <span>Total</span>
        <span className="make-breakdown-total-value">
          {formatInventoryUnits(totalUnits)}
        </span>
        <span className="make-breakdown-total-value inventory-condition-price">
          {formatInventoryValue(totalValue)}
        </span>
      </div>
    </div>
  );
}
