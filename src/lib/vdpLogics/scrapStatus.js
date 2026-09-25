const PAGE = 1000;

/** customer_id values that have at least one row in smart_scrap_inventory */
export async function loadScrapInventoryByCustomerId(supabase) {
  const counts = new Map();
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('smart_scrap_inventory')
      .select('customer_id')
      .not('customer_id', 'is', null)
      .range(offset, offset + PAGE - 1);

    if (error) {
      throw new Error(error.message);
    }
    if (!data?.length) {
      break;
    }

    for (const row of data) {
      const id = String(row.customer_id ?? '').trim();
      if (!id) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
    }

    if (data.length < PAGE) {
      break;
    }
    offset += PAGE;
  }

  return counts;
}

export function scrapStatusForDealerId(dealerId, scrapCounts) {
  const id = String(dealerId ?? '').trim();
  if (!id) {
    return { scrapOn: false, scrapStatus: 'off', scrapRowCount: 0 };
  }
  const scrapRowCount = scrapCounts.get(id) || 0;
  return {
    scrapOn: scrapRowCount > 0,
    scrapStatus: scrapRowCount > 0 ? 'on' : 'off',
    scrapRowCount,
  };
}

export function isScrapLinkOn(scrapLink, scrapRowCount) {
  const value = String(scrapLink ?? '').trim().toLowerCase();
  if (value === 'on') return true;
  if (value === 'off') return scrapRowCount > 0;
  if (/^https?:\/\//i.test(value)) return true;
  return scrapRowCount > 0;
}
