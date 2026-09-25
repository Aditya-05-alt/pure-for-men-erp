/**
 * Daily series for the Overview "Daily Views" chart.
 *
 * Values are zeroed out — replace with Supabase results.
 * The 30-element shape is what the chart renderer expects.
 */
const zeros = (n = 30) => Array(n).fill(0);

export const CURRENT_SERIES = {
  vdp: zeros(),
  srp: zeros(),
  all: zeros(),
};

export const PREVIOUS_SERIES = {
  vdp: zeros(),
};

export const YOY_SERIES = {
  vdp: zeros(),
};
