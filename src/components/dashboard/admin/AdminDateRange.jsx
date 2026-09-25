'use client';

import { useMemo } from 'react';
import CalendarRangePicker, {
  rangePickerValueFromISO,
  resolveRangePickerValue,
} from '@/components/dashboard/CalendarRangePicker';

export default function AdminDateRange({ from, to, onFromChange, onToChange }) {
  const value = useMemo(() => rangePickerValueFromISO(from, to), [from, to]);

  const handleChange = (next) => {
    const resolved = resolveRangePickerValue(next);
    if (!resolved?.start || !resolved?.end) return;
    onFromChange(resolved.start);
    onToChange(resolved.end);
  };

  return (
    <div className="admin-date-range admin-date-range--picker">
      <span className="admin-date-label">Date range</span>
      <CalendarRangePicker value={value} onChange={handleChange} />
    </div>
  );
}
