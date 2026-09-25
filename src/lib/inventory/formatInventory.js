export function formatInventoryUnits(n) {
  const v = Number(n) || 0;
  return v.toLocaleString();
}

export function formatInventoryValue(n) {
  const v = Number(n) || 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(v);
}
