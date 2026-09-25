/** Dummy inventory report data — replaced by RPC when backend is ready. */

const PALETTE = ['#34d399', '#60a5fa', '#fb923c', '#a78bfa', '#f472b6', '#22d3ee'];

function withPct(rows) {
  const totalUnits = rows.reduce((sum, row) => sum + (Number(row.units) || 0), 0);
  return rows.map((row, index) => ({
    ...row,
    label: row.label,
    color: row.color ?? PALETTE[index % PALETTE.length],
    pct: totalUnits > 0 ? ((Number(row.units) || 0) / totalUnits) * 100 : 0,
  }));
}

function section(rows) {
  const enriched = withPct(rows);
  return {
    rows: enriched,
    totalUnits: enriched.reduce((sum, row) => sum + row.units, 0),
    totalValue: enriched.reduce((sum, row) => sum + row.totalValue, 0),
  };
}

const DUMMY_CONDITION = [
  { label: 'New', units: 142, totalValue: 4287500 },
  { label: 'Used', units: 98, totalValue: 1842900 },
  { label: 'Certified', units: 36, totalValue: 1124400 },
];

const DUMMY_LOCATION = [
  { label: 'Main Lot', units: 156, totalValue: 4820000 },
  { label: 'Remote Lot', units: 72, totalValue: 1910000 },
  { label: 'Showroom', units: 48, totalValue: 1528000 },
];

const DUMMY_MAKE = [
  { label: 'Harley-Davidson', units: 89, totalValue: 3210000 },
  { label: 'Honda', units: 54, totalValue: 1145000 },
  { label: 'Toyota', units: 42, totalValue: 986000 },
  { label: 'Ford', units: 38, totalValue: 924000 },
  { label: 'Other', units: 53, totalValue: 1015000 },
];

const DUMMY_TYPE = [
  { label: 'Motorcycle', units: 95, totalValue: 2840000 },
  { label: 'ATV', units: 48, totalValue: 892000 },
  { label: 'UTV', units: 62, totalValue: 1415000 },
  { label: 'Marine', units: 35, totalValue: 1081000 },
  { label: 'Other', units: 36, totalValue: 1042000 },
];

const DUMMY_INVENTORY_LIST_ROWS = [
  { manufacturer: 'Buick', brandModel: 'Enclave', condition: 'used', units: 1, totalValue: 23454 },
  { manufacturer: 'Chevrolet', brandModel: 'Silverado 1500', condition: 'used', units: 2, totalValue: 75052 },
  { manufacturer: 'Chevrolet', brandModel: 'Equinox', condition: 'used', units: 1, totalValue: 23454 },
  { manufacturer: 'Chevrolet', brandModel: 'Tahoe', condition: 'used', units: 1, totalValue: 37526 },
  { manufacturer: 'Chevrolet', brandModel: 'Traverse', condition: 'used', units: 2, totalValue: 46908 },
  { manufacturer: 'Ford', brandModel: 'F-150', condition: 'used', units: 3, totalValue: 112362 },
  { manufacturer: 'Ford', brandModel: 'Explorer', condition: 'used', units: 1, totalValue: 28127 },
  { manufacturer: 'Harley-Davidson', brandModel: 'Street Glide', condition: 'new', units: 2, totalValue: 72000 },
  { manufacturer: 'Harley-Davidson', brandModel: 'Road Glide', condition: 'used', units: 1, totalValue: 31000 },
  { manufacturer: 'Honda', brandModel: 'CRF450R', condition: 'new', units: 2, totalValue: 19000 },
  { manufacturer: 'Honda', brandModel: 'Pioneer 1000', condition: 'new', units: 1, totalValue: 22000 },
  { manufacturer: 'Toyota', brandModel: 'Tacoma TRD', condition: 'certified', units: 1, totalValue: 46000 },
];

function inventoryListSummary(rows) {
  const totalUnits = rows.reduce((sum, row) => sum + (Number(row.units) || 0), 0);
  const totalValue = rows.reduce((sum, row) => sum + (Number(row.totalValue) || 0), 0);
  return {
    rows,
    totalUnits,
    totalValue,
    averagePrice: totalUnits > 0 ? totalValue / totalUnits : 0,
  };
}

export function getDummyInventoryReport() {
  const inventoryList = inventoryListSummary(DUMMY_INVENTORY_LIST_ROWS);

  return {
    ready: true,
    sections: {
      condition: {
        title: 'Condition',
        labelHeader: 'Conditions',
        ...section(DUMMY_CONDITION),
      },
      location: {
        title: 'Location',
        labelHeader: 'Locations',
        ...section(DUMMY_LOCATION),
      },
      make: {
        title: 'Make',
        labelHeader: 'Makes',
        ...section(DUMMY_MAKE),
      },
      type: {
        title: 'Type',
        labelHeader: 'Types',
        ...section(DUMMY_TYPE),
      },
    },
    inventoryList,
  };
}
