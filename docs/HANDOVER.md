# GoArena: handover notes

Written 10 Nov 2026 when the working chat was closed. Everything below is in this repo; nothing
depends on the chat. Start here, then `README.md` (setup and deploy) and the other files in `docs/`.

## What it is

- **GoArena** is a ground-booking app. Customers book a slot with name and phone (no login), owners
  approve or take payment automatically, helpers see upcoming bookings.
- Built first for a friend's ground **LLAB TOOF** ("football" backwards) in **Vibhuthipura, Bangalore**:
  <https://book.goarena.in/llab-toof>. Onboarding starts in Bangalore, then other cities remotely.
  (The Malayalam option in the intro was only for one friend; it does not mean Kerala.)
- Plan: offer it to other grounds as a hosted subscription (around ₹500–600/month).

## Where things run

| Thing | Where |
|---|---|
| Code | GitHub `vramakrishnan2026/groundbook`, branch `main` |
| Hosting | Cloudflare Workers + D1 (personal Cloudflare account, not 75F). Pushing to `main` deploys; the deploy applies `migrations/` first |
| Domain | `goarena.in` (GoDaddy, nameservers on Cloudflare). App at `book.goarena.in/<ground-slug>` |
| Admin | `book.goarena.in/admin`, Google sign-in as `goarena2026@gmail.com` |
| Support WhatsApp | +91 98863 04904 (`SUPPORT_WHATSAPP` / `ADMIN_WHATSAPP` in `wrangler.toml`) |
| Old project | `vramakrishnan2026/pitch_book` (reference only) |
| Sandbox | branch `multi-sport` + database `groundbook-sandbox` (see below). Do not merge without checking |

Keep it off 75F accounts, and keep recurring costs low (no R2; photos live in D1).

## How the app works (main points)

- **Roles:** customer (no login), owner and helpers (Google sign-in, PIN as backup), master admin.
- **New grounds** sign up themselves with Google; the admin approves them before bookings open. A
  WhatsApp alert goes to the admin on sign-up (CallMeBot; needs the `CALLMEBOT_KEY` secret).
- **Courts:** full ground (8-a-side) or Half A / Half B (5-a-side). Booking the full ground locks both
  halves.
- **Booking length:** at least 1 hour; then longer in the owner's step: whole hours (default) or half
  hours (Settings → Prices → Booking length). Online maximum 4 hours. Price is per hour, pro-rata
  (1.5 h = 1.5 × hourly). Owners can add walk-ins and closures of any length in 30-minute steps.
  Clashes are blocked per half hour (`slot_locks.half`, migration `0010_half_hours.sql`).
- **Time bar (customer "Pick a time"):** each free stretch is drawn as a small football pitch (straight
  ends, goal arcs); booked time is a grey gap; the customer's pick is a rounded yellow pill. Tap a free
  block to start (1 hour), + / – or tap the next block to change length, tap a block in the pick to
  remove that block (it clears if under 1 hour would be left). Switching court reuses the day's times
  (no refetch for 60 s); changing date fetches.
- **Payments:** per ground, either UPI with screenshot approval or Razorpay (owner's own account and
  keys, entered in Settings). Refunds tracked. Subscription payments to GoArena go to the user's own
  Razorpay account.
- **Owner screens:** Today, Calendar, Settings. On PCs they lay out as a dashboard. Settings is a
  Swiggy-style list of compact rows that open in place (open state remembered).
- **Posters:** Settings → QR & posters. Three templates (Splash, Floodlight, Match day) in A4, A3,
  standee, roll-up, story, post and square; JPEG or PDF.
- **Branding:** files in `public/brand/` (wordmark for dark and light backgrounds, GA badge icons,
  flaming ball, `sting.js` logo animation used as the splash). Written "GoArena" (capital G and A).
  Ground page: photo slider with a GoArena pill, "Booking by GoArena" wordmark footer. WhatsApp
  buttons carry a WhatsApp mark (drawn in `waIcon()`; swap for the official icon if wanted).
- **Text sizes:** smallest text 12px; form inputs 16px (stops iPhone zoom on focus).

## Tests

```
npm test                                        # unit and API tests (node --test)
CHROME=/usr/bin/google-chrome node tests/e2e.mjs         # browser flows, screenshots in e2e-shots/
CHROME=/usr/bin/google-chrome node tests/e2e-google.mjs  # Google sign-in, sign-up, admin
CHROME=/usr/bin/google-chrome PHOTO=<jpg> node tests/e2e-posters.mjs
```

## Marketing material (`marketing/`, not deployed)

- `logo/`: flaming-ball logo (dark, white, transparent for dark and light backgrounds), Instagram
  profile badge (`goarena-instagram-profile-GA.png`, the chosen one), highlight covers, WhatsApp
  status poster.
- `video/`: 25-second owners reel, logo animation, badge animation.
- `intro/`: the GoArena intro slideshow with voice (single HTML file) and its voiceover script.
- `source/`: how they were made (3D ball renderer `render_ball.py`, flame effects `fx.html`, reel
  timeline `reel25.html` + `render.mjs` + `sting.js`, intro capture, status and Instagram scripts). They
  are kept for reference; fonts, photos and node packages they used are not all included.

## Decisions to remember

- Pricing talk must be simple and checkable: a flat fee. Owners in India read "we only charge when we
  bring you someone new" as an eyewash. Plan (not built): a disclosed one-time ~₹15 new-player fee on a
  player's first booking at a ground, collected by the owner, passed on as a line on the monthly
  subscription invoice. See `docs/new-player-fee-plan.md`.
- GoArena's plus over Playo is the one-to-one owner–customer link. A Playo-style city directory was
  discussed, not decided: maybe an opt-in list on the front page once a city has 8–10 grounds.
- Uploaded photos stay clean; GoArena branding is added only on our own pages. Plan for branded link
  previews and a "Share photo" button: `docs/branded-photo-cards.md` (not built).
- Name check: "GO ARENA" is a US trademark of a fitness company and a pickleball app uses the name; no
  Indian conflict was found. Indian trademark filing is ₹4,500 per class (individual/MSME).
- Instagram allows 5 hashtags per post. Use Bangalore tags (#BengaluruFootball), not Kerala ones.
- Playo has no public calendar export; owners using both copy bookings by hand.

## Multi-sport (sandbox branch `multi-sport`)

Box cricket reusing the football turf (full or half), badminton as separate indoor courts. Tried in a
sandbox first (database `groundbook-sandbox`, test ground and owner login). Not merged into `main`.
Note: `main` has since moved to half-hour bookings (`0010_half_hours.sql`), so the branch needs
rebasing and its migrations renumbering before any merge.

## Open items

Owner/admin steps outside the code:
- [ ] Activate CallMeBot from the admin WhatsApp and add the `CALLMEBOT_KEY` secret in Cloudflare.
- [ ] Switch LLAB TOOF's Razorpay keys to the friend's own account.
- [ ] Change LLAB TOOF's 123456 PIN.
- [ ] Turn the GoDaddy domain lock back on.

Possible next work:
- [ ] Sample ground "Green Field Turf" is still shown as "Edappally, Kochi" in the intro, reel, status
      poster and poster previews; change to a Bangalore area and regenerate them.
- [ ] Update the logo canvas artifact (it still shows the older flat logos).
- [ ] Branded photo cards (link previews, Share photo): `docs/branded-photo-cards.md`.
- [ ] New-player fee: `docs/new-player-fee-plan.md`.
- [ ] Ideas not started: iCal export for owners using Playo too, policy pages, Bangalore competitor
      check, city directory.
- [ ] Defaults to confirm: online maximum 4 hours; walk-in lengths up to 8 hours.
