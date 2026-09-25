import { resolveRangePickerValue } from '@/components/dashboard/CalendarRangePicker';
import {
  formatRangeLabel,
  previousFullMonthRange,
  previousMonthAlignedRange,
} from '@/lib/overview/comparePeriod';

/** Default on login / fresh session. */
export const VDP_DEFAULT_DATE_RANGE = 'current_month';

/**
 * Compare modes (optional — none selected by default).
 * PoP = same calendar dates last month (Aug 1–13 → Jul 1–13)
 * MoM = current range vs full previous calendar month (Aug 1–13 → Jul 1–31)
 */
export const VDP_COMPARE_MODES = [
  { value: 'pop', label: 'PoP' },
  { value: 'mom', label: 'MoM' },
];
/** No MoM/PoP selected until the user chooses one. */
export const VDP_DEFAULT_COMPARE_MODE = null;

/**
 * Resolve primary report period (+ compare prior window).
 * When compareMode is mom/pop, that mode always wins (not Overview custom range).
 * When unset, prior still defaults to last-month aligned so dealer Traffic /
 * Inventory keep a baseline.
 */
export function resolveVdpReportPeriod(
  pickerValue,
  {
    compareEnabled = true,
    compareDateRange = null,
    compareMode = VDP_DEFAULT_COMPARE_MODE,
  } = {}
) {
  const resolved =
    resolveRangePickerValue(pickerValue) ||
    resolveRangePickerValue(VDP_DEFAULT_DATE_RANGE);

  const from = resolved?.start || null;
  const to = resolved?.end || null;

  let priorFrom = null;
  let priorTo = null;

  const mode =
    compareMode === 'pop' || compareMode === 'mom' ? compareMode : null;

  if (mode === 'pop') {
    // PoP: same date range last month (Aug 1–13 → Jul 1–13)
    const aligned = previousMonthAlignedRange(from, to);
    priorFrom = aligned.compareFrom;
    priorTo = aligned.compareTo;
  } else if (mode === 'mom') {
    // MoM: full previous calendar month (Aug 1–13 → Jul 1–31)
    const full = previousFullMonthRange(from, to);
    priorFrom = full.compareFrom;
    priorTo = full.compareTo;
  } else {
    const custom =
      compareEnabled && compareDateRange
        ? resolveRangePickerValue(compareDateRange)
        : null;
    if (custom?.start && custom?.end) {
      priorFrom = custom.start;
      priorTo = custom.end;
    } else {
      // Silent baseline for dealer pages: same dates last month
      const aligned = previousMonthAlignedRange(from, to);
      priorFrom = aligned.compareFrom;
      priorTo = aligned.compareTo;
    }
  }

  return {
    from,
    to,
    priorFrom,
    priorTo,
    curLabel: formatRangeLabel(from, to) || 'Current',
    priLabel: formatRangeLabel(priorFrom, priorTo) || 'Prior',
    preset: resolved?.preset || 'custom',
    compareEnabled: Boolean(compareEnabled),
    compareMode: mode,
  };
}
