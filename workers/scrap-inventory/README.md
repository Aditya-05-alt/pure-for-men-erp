# Scrap inventory worker

Daily external job that scrapes dealer inventory pages and upserts into `smart_scrap_data`.

## Setup

```bash
cd workers/scrap-inventory
npm install
cp .env.example .env
# Edit .env with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
```

## Run

```bash
# All scrap dealers (inventory_source = scrap)
npm start

# Single dealer
npm start -- --client-id=8881717635

# Or via env
SCRAP_CLIENT_ID=8881717635 npm start
```

## Supabase prerequisites

1. Run migrations: `smart_scrap_data.sql`, `smart_scrap_inventory_source.sql`
2. Deploy RPCs: `get_scrap_dealers_for_sync.sql`, `upsert_scrap_inventory_batch.sql`, updated `build_smart_final_data.sql`
3. Set dealer `inventory_source = 'scrap'` in `smart_hoot_config`
4. Add `scrap_link` + `vdp_logic` in `smart_vdp_logic` for that dealer

## Cron (daily 6 AM)

```
0 6 * * * cd /path/to/smartanalytics-app/workers/scrap-inventory && /usr/bin/npm start >> /var/log/scrap-inventory.log 2>&1
```

## Pilot dealer checklist

1. Admin → Dealers → set **Inventory source** = Scrap (Hoot URL optional)
2. Admin → Vdp Logics → add row with matching `dealer_id`, `scrap_link`, `vdp_logic`, `cms`
3. Run worker or Pipeline **Step 0 — Scrap inventory**
4. Run Pipeline Steps 1–3 as usual
5. Verify `smart_final_data` has `inv_url` matches for VDP page paths
