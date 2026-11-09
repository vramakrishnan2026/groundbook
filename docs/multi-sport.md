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
The sandbox is a second Worker (`groundbook-sandbox`) with its own database (`groundbook-sandbox`).
book.goarena.in and its bookings are never touched. All set up in the Cloudflare dashboard:

1. **Storage & databases → D1 → Create database**, name `groundbook-sandbox`. Copy its Database ID
   into `wrangler.toml` under `[env.sandbox]` on this branch.
2. **Workers & Pages → Create → Import a repository** → `groundbook`, Worker name `groundbook-sandbox`.
   - Production branch: `multi-sport`
   - Deploy command:
     ```
     npx wrangler d1 migrations apply groundbook-sandbox --env sandbox --remote && npx wrangler d1 execute groundbook-sandbox --env sandbox --remote --file scripts/sandbox-seed.sql && npx wrangler deploy --env sandbox
     ```
3. Open `https://groundbook-sandbox.<your-subdomain>.workers.dev/sandbox`. The test ground has football,
   box cricket and 3 badminton courts. Owner login at `/login`: phone 9847012345 or 8884265999, PIN 1234
   (Google login is off in the sandbox).

Every push to `multi-sport` redeploys the sandbox. `scripts/sandbox-seed.sql` only adds the test
ground if it's missing, so test bookings survive redeploys.

Locally (no Cloudflare): `npm run dev` → http://localhost:8787/demo, owner login 9847012345 / 1234.

## Going live later
Merge `multi-sport` into `main`. The normal deploy runs the migration first, then deploys.
