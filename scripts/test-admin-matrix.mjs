import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createAdminDataClient } from '../src/lib/supabase/adminDataClient.js';
import { fetchPageViewsViaOverviewRpc } from '../src/lib/ga4/aggregatePageDataRows.js';

// Load .env.local into process.env
const raw = readFileSync(resolve('.env.local'), 'utf8');
for (const line of raw.split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const admin = createAdminDataClient();
console.log('mode:', admin?.mode);

const { data, error } = await admin.supabase
  .from('smart_hoot_config')
  .select('id, customer_name, ga4_customer_id')
  .eq('is_active', true)
  .limit(5);

console.log('dealers sample:', error?.message ?? data?.length);

const dealers = (data || []).map((row) => ({
  id: row.id,
  name: row.customer_name,
  ga4CustomerId: row.ga4_customer_id ? String(row.ga4_customer_id).trim() : null,
}));

const t0 = Date.now();
const { byGa4Client, rpcErrors } = await fetchPageViewsViaOverviewRpc(
  admin.supabase,
  dealers,
  '2026-05-22',
  '2026-05-31'
);
console.log('views clients:', byGa4Client.size, 'errors:', rpcErrors.length, 'ms:', Date.now() - t0);
