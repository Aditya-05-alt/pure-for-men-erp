export const TABLE = 'smart_vdp_logic';

export const CSV_HEADERS = [
  'dealer_name',
  'dealer_id',
  'website_url',
  'cms',
  'data_source',
  'hoot_link',
  'scrap_link',
  'vdp_logic',
  'srp_logic',
  'home_page_logic',
  'others',
];

/** One sample row for CSV template / documentation. */
export const EXAMPLE_ROW = {
  dealer_name: 'Example Dealer',
  dealer_id: '123456789',
  website_url: 'https://www.example-dealer.com',
  cms: 'DealerOn',
  data_source: 'GA4',
  hoot_link: 'https://hoot.example/inventory',
  scrap_link: 'off',
  vdp_logic: '^/inventory/\\d{4}-.+',
  srp_logic: '/inventory/?$',
  home_page_logic: '^/$',
  others: 'Optional notes',
};

const FORM_FIELDS = [
  { key: 'dealerName', db: 'dealer_name', label: 'Dealer name', requiredFlag: true },
  { key: 'dealerId', db: 'dealer_id', label: 'Dealer ID' },
  { key: 'websiteUrl', db: 'website_url', label: 'Website URL' },
  { key: 'cms', db: 'cms', label: 'CMS' },
  { key: 'dataSource', db: 'data_source', label: 'Data source' },
  { key: 'hootLink', db: 'hoot_link', label: 'Hoot link' },
  { key: 'scrapLink', db: 'scrap_link', label: 'Scrap (auto on/off)', readOnly: true },
  { key: 'vdpLogic', db: 'vdp_logic', label: 'VDP logic', wide: true, multiPattern: true },
  { key: 'srpLogic', db: 'srp_logic', label: 'SRP logic', wide: true },
  { key: 'homePageLogic', db: 'home_page_logic', label: 'Home page logic', wide: true },
  { key: 'others', db: 'others', label: 'Others', wide: true },
];

export { FORM_FIELDS };

/** Split stored vdp_logic into editable patterns (` OR ` between entries). */
export function splitVdpLogicPatterns(value) {
  const s = String(value ?? '').trim();
  if (!s) return [''];
  const parts = s.split(/\s+OR\s+/i).map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts : [''];
}

/**
 * Normalize one VDP regex so it matches GA4 page_path (usually starts with `/`).
 * Fixes common save mistakes like `^inventory/...` → `^/inventory/...`.
 */
export function normalizeVdpLogicPattern(pattern) {
  let p = String(pattern ?? '').trim();
  if (!p) return p;
  if (/^true$/i.test(p) || /^false$/i.test(p)) return p;
  // ^inventory/... → ^/inventory/...
  if (/^\^[A-Za-z0-9]/.test(p)) {
    p = `^/${p.slice(1)}`;
  } else if (/^[A-Za-z0-9]/.test(p) && !/^https?:\/\//i.test(p)) {
    // inventory/... → /inventory/...
    p = `/${p}`;
  }
  return p;
}

/** Join UI patterns for smart_vdp_logic.vdp_logic (pipeline Step 2 understands ` OR `). */
export function joinVdpLogicPatterns(patterns) {
  return (patterns || [])
    .map((p) => normalizeVdpLogicPattern(p))
    .filter(Boolean)
    .join(' OR ');
}

export function emptyFormState() {
  const state = Object.fromEntries(
    FORM_FIELDS.filter((f) => !f.multiPattern).map((f) => [f.key, ''])
  );
  state.vdpLogicPatterns = [''];
  return state;
}

export function rowToFormState(row) {
  const state = emptyFormState();
  if (!row) return state;
  for (const f of FORM_FIELDS) {
    if (f.multiPattern) {
      state.vdpLogicPatterns = splitVdpLogicPatterns(row.vdpLogic ?? row.vdp_logic);
    } else {
      state[f.key] = row[f.key] ?? '';
    }
  }
  return state;
}

export function normalizeRow(row) {
  return {
    id: row.id,
    dealerName: row.dealer_name ?? null,
    dealerId: row.dealer_id ?? null,
    websiteUrl: row.website_url ?? null,
    cms: row.cms ?? null,
    dataSource: row.data_source ?? null,
    hootLink: row.hoot_link ?? null,
    scrapLink: row.scrap_link ?? null,
    scrapStatus:
      String(row.scrap_link ?? '').trim().toLowerCase() === 'on'
        ? 'on'
        : String(row.scrap_link ?? '').trim().toLowerCase() === 'off'
          ? 'off'
          : row.scrap_link
            ? 'on'
            : 'off',
    scrapOn: String(row.scrap_link ?? '').trim().toLowerCase() === 'on',
    scrapRowCount: row.scrap_row_count ?? 0,
    vdpLogic: row.vdp_logic ?? null,
    srpLogic: row.srp_logic ?? null,
    homePageLogic: row.home_page_logic ?? null,
    others: row.others ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function bodyToDbRecord(body) {
  const record = {};
  for (const f of FORM_FIELDS) {
    if (f.multiPattern || f.readOnly) continue;
    const v = body?.[f.key];
    if (v === undefined) continue;
    const s = v == null ? null : String(v).trim();
    record[f.db] = s === '' ? null : s;
  }
  if (body?.vdpLogicPatterns !== undefined) {
    const joined = joinVdpLogicPatterns(body.vdpLogicPatterns);
    record.vdp_logic = joined === '' ? null : joined;
  } else if (body?.vdpLogic !== undefined) {
    const joined = joinVdpLogicPatterns(splitVdpLogicPatterns(body.vdpLogic));
    record.vdp_logic = joined === '' ? null : joined;
  }
  if (!record.dealer_name) {
    throw new Error('Dealer name is required.');
  }
  return record;
}

export function csvRowToDbRecord(obj) {
  const body = {};
  for (const f of FORM_FIELDS) {
    const raw = obj[f.db] ?? obj[f.key];
    if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
      body[f.key] = String(raw).trim();
    }
  }
  return bodyToDbRecord(body);
}

function escapeCsvCell(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildExampleCsv() {
  const header = CSV_HEADERS.join(',');
  const row = CSV_HEADERS.map((h) => escapeCsvCell(EXAMPLE_ROW[h] ?? '')).join(',');
  return `${header}\n${row}\n`;
}

/** Minimal RFC-style CSV parser (quoted fields, commas). */
export function parseCsv(text) {
  const lines = String(text || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    throw new Error('CSV must include a header row and at least one data row.');
  }

  const parseLine = (line) => {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i += 1;
          } else inQuotes = false;
        } else cur += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === ',') {
        out.push(cur.trim());
        cur = '';
      } else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };

  const headerCells = parseLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const missing = ['dealer_name'].filter((h) => !headerCells.includes(h));
  if (missing.length) {
    throw new Error(`CSV header must include: ${missing.join(', ')}`);
  }

  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseLine(lines[i]);
    if (cells.every((c) => !c)) continue;
    const obj = {};
    headerCells.forEach((h, idx) => {
      if (CSV_HEADERS.includes(h)) obj[h] = cells[idx] ?? '';
    });
    rows.push(obj);
  }

  if (!rows.length) throw new Error('No data rows found in CSV.');
  return rows;
}
