# Multi-sport (sandbox branch)

## What it does
- **Football** stays as it is: full ground (8-a-side) or Half A / Half B (5-a-side).
- **Box cricket** (switch in Settings → Sports) reuses the same turf: Full turf, Half A, Half B,
  each with its own price. A cricket booking blocks football in that hour, and the other way round
  (same cells as football, so the existing clash-proof locking handles it).
- **Badminton** (Settings → Sports → 0–8 courts) adds indoor courts that are separate from the
  turf and from each other. They start at ₹400 weekday / ₹500 weekend; change under Prices.
- Booking length follows the ground's setting from main (minimum 1 hour, then 30 or 60 minute steps),
  for every sport.
- Players see a **Sport** picker on "Pick a slot" only when a ground has more than one sport.
  Football-only grounds look exactly as before.
- Owners see the sport in booking names ("Box cricket · Half A"); the calendar adds badminton
  courts as extra columns.
- A sport (or badminton court) with upcoming bookings can't be switched off until they're cancelled.

Database change: `migrations/0011_sports.sql` adds `units.sport` (default `football`), so existing
grounds keep working unchanged.

## Try it without touching production
The live site and its database are untouched. The sandbox is a second Worker with its own database.

1. Create the sandbox database (once):
   `npx wrangler d1 create groundbook-sandbox` and paste the printed `database_id` into
   `wrangler.toml` under `[env.sandbox]`.
2. Create tables and deploy the branch:
   ```
   git checkout multi-sport
   npx wrangler d1 migrations apply groundbook-sandbox --env sandbox --remote
   npx wrangler deploy --env sandbox
   ```
   It goes live at `https://groundbook-sandbox.<your-subdomain>.workers.dev`.
3. Add a test ground with owner phone + PIN login (Google login is off in the sandbox):
   ```
   node scripts/new-ground.mjs --slug demo --name "Sandbox Turf" --owner Test --phone 9847012345 \
     --pin 1234 --full 1200,1500 --half 700,900 > sandbox-ground.sql
   npx wrangler d1 execute groundbook-sandbox --env sandbox --remote --file sandbox-ground.sql
   ```
   Then log in at `/login`, open Settings → Sports, switch on Box cricket and pick badminton courts.

Locally (no Cloudflare): `npm run dev` → http://localhost:8787/demo, owner login 9847012345 / 1234.

## Going live later
Merge `multi-sport` into `main`. The normal deploy runs the migration first, then deploys.
