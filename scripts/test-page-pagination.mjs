import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1)];
    })
);

for (const [label, key] of [
  ['anon', env.NEXT_PUBLIC_SUPABASE_ANON_KEY],
  ['svc', env.SUPABASE_SERVICE_ROLE_KEY],
]) {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, key);
  let offset = 0;
  let total = 0;
  let pages = 0;
  const t0 = Date.now();
  while (pages < 30) {
    const r = await sb
      .from('smart_ga4_page_data')
      .select('client_id, report_date, views', { count: 'exact' })
      .eq('report_date', '2026-05-20')
      .range(offset, offset + 4999);
    if (r.error) {
      console.log(label, 'err', r.error.message);
      break;
    }
    total += r.data.length;
    pages += 1;
    if (r.data.length < 5000) {
      console.log(label, 'done', total, 'pages', pages, 'count', r.count, 'ms', Date.now() - t0);
      break;
    }
    offset += 5000;
  }
}
