const fs = require('fs');
const data = JSON.parse(
  fs.readFileSync('exports/pfm-ga4-daily-2026-08-01_2026-09-25.json', 'utf8')
);

function esc(s) {
  return String(s).replace(/'/g, "''");
}

const vals = data.rows
  .map(
    (r) =>
      `('${esc(r.client_id)}','${r.report_date}'::date,'${esc(r.ga4_property_id)}','${esc(r.account_name)}',${r.total_users},${r.new_users},${r.conversions},${r.revenue})`
  )
  .join(',\n');

const sql = `INSERT INTO public.chipper_pfm_ga4_daily
(client_id, report_date, ga4_property_id, account_name, total_users, new_users, conversions, revenue)
VALUES
${vals}
ON CONFLICT (client_id, report_date) DO UPDATE SET
  ga4_property_id = EXCLUDED.ga4_property_id,
  account_name = EXCLUDED.account_name,
  total_users = EXCLUDED.total_users,
  new_users = EXCLUDED.new_users,
  conversions = EXCLUDED.conversions,
  revenue = EXCLUDED.revenue,
  updated_at = now();`;

fs.writeFileSync('exports/pfm-ga4-daily-upsert.sql', sql);
console.log(JSON.stringify({ rows: data.rows.length, sqlBytes: sql.length }));
