/**
 * Sort by manufacturer then model; show manufacturer label only on first row per group.
 * @param {object[]} rows
 */
export function groupInventoryListRows(rows = []) {
  const sorted = [...rows].sort((a, b) => {
    const byMake = String(a.manufacturer || '').localeCompare(
      String(b.manufacturer || ''),
      undefined,
      { sensitivity: 'base' },
    );
    if (byMake !== 0) return byMake;
    return String(a.brandModel || '').localeCompare(String(b.brandModel || ''), undefined, {
      sensitivity: 'base',
    });
  });

  let lastManufacturer = null;
  return sorted.map((row) => {
    const manufacturer = String(row.manufacturer || '').trim();
    const showManufacturer = manufacturer !== lastManufacturer;
    if (showManufacturer) lastManufacturer = manufacturer;
    return {
      ...row,
      showManufacturer,
      conditionLabel: String(row.condition || '').toLowerCase(),
    };
  });
}
