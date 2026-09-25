# Pure for Men ERP

Cloned application codebase (from Smart Analytics advance).

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Add Supabase credentials (new project — not the Smart Analytics one):
   ```bash
   copy .env.local.example .env.local
   ```
   Then fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only)

3. Run:
   ```bash
   npm run dev
   ```

## Notes

- The `supabase/` folder (migrations, RPC, edge functions) was **not** copied. Wire this app to your new Supabase project when ready.
- Do not reuse Smart Analytics production credentials here.
