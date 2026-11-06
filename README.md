# GroundBook

Commission-free online booking for football grounds.

A customer scans the ground's QR code, picks a slot, pays the owner directly by UPI and sends the payment screenshot. The owner checks the payment in their bank app and taps **Approve**, and the slot is locked. A helper sees who is coming and can call them. There is no app to install and no login for customers.

Built to run many grounds from one setup. Each ground has its own page at `/g/<slug>`.

| Who | Where | What they can do |
|---|---|---|
| Customer | `/g/<slug>` (QR code) | See photos, prices and free slots; book with name and phone; pay by UPI; upload proof |
| Owner | `/owner` | Today view, approve or reject payments, calendar (walk-ins, closing slots), prices, photos, UPI details, helpers |
| Helper | `/helper` | Upcoming bookings with names and phone numbers. No money is shown. |

## How booking works

- **Courts:** a ground has a *full ground* (8-a-side) and two *halves* (5-a-side). Booking the full ground blocks both halves for that hour. Booking one half blocks the full ground, but the other half stays open. Grounds with a single pitch are supported too.
- **Holds:** when a customer continues to pay, the slot is held for 30 minutes (the owner can change this). If no payment proof arrives in time, the slot is released automatically.
- **No double bookings:** each taken hour and half is a row in the `slot_locks` table. The table's primary key makes it impossible for two bookings to take the same cell, even if two people tap at the same moment.
- **Payments:** the customer pays the owner's UPI ID or QR. The 12-digit UPI reference number is required, and the same number can't be used twice. The screenshot is recommended.
- **Prices:** set per court, with separate weekday (Mon–Fri) and weekend (Sat–Sun) rates.

## Tech

- **Cloudflare Workers:** runs the API and serves the app. No servers to manage.
- **D1 (SQLite):** stores grounds, courts, prices, staff, bookings and sessions. Schema: `migrations/0001_init.sql`.
- **R2:** stores ground photos, UPI QR images and payment screenshots.
- **Frontend:** plain HTML, CSS and JavaScript in `public/`, with no build step. Design matches the Figma file *Ground Booking App – Screens*.
- **No runtime dependencies.** The only dev dependency is `wrangler`, the Cloudflare command-line tool.

```
src/worker.js          routes + cron (releases expired holds every 5 min)
src/lib/bookings.js    slot rules, holds, clash-free inserts
src/lib/auth.js        owner/helper login (phone + PIN), sessions, lockout after 5 wrong PINs
src/routes/public.js   customer API
src/routes/staff.js    owner + helper API
public/                the web app
scripts/new-ground.mjs adds a ground and its owner
scripts/dev-server.mjs runs everything locally (SQLite + a folder instead of D1/R2)
tests/                 API tests (node --test) and a browser walkthrough (Playwright)
```

## Run it locally

You need Node 22.5 or newer. Nothing needs to be installed for local runs.

```bash
npm run dev        # http://localhost:8787
npm test           # API tests
```

Demo logins (the local database resets on every restart):
- Customer page: `/g/demo`
- Owner: `/owner`, phone `9847012345`, PIN `1234`
- Helper: `/helper`, phone `9946055321`, PIN `1111`

`npm run e2e` runs the full browser walkthrough and saves screenshots. It needs Playwright installed (`npm i -D playwright && npx playwright install chromium`).

## Deploy to Cloudflare (first time, about 20 minutes)

1. **Create a Cloudflare account** at <https://dash.cloudflare.com/sign-up>. Use a personal or business email, not a work one.
2. **Turn on R2:** in the dashboard go to *R2 Object Storage* and click *Purchase R2 / Enable*. Cloudflare asks for a card, but the free tier (10 GB) is far more than one ground needs.
3. On your computer, in this folder:
   ```bash
   npm install
   npx wrangler login                      # opens the browser; approve access
   npx wrangler d1 create groundbook       # copy the database_id it prints…
   ```
   …and paste that ID into `wrangler.toml`, replacing `PASTE-DATABASE-ID-HERE`.
4. Create the file storage and the tables:
   ```bash
   npx wrangler r2 bucket create groundbook-files
   npm run db:migrate
   ```
5. **Add your friend's ground and owner login.** Choose a short slug; it becomes the link `/g/green-field`:
   ```bash
   node scripts/new-ground.mjs --slug green-field --name "Green Field Turf" --area "Edappally, Kochi" \
     --owner "Owner name" --phone 98XXXXXXXX --pin 4826 \
     --full 1200,1500 --half 700,900 > ground.sql
   npx wrangler d1 execute groundbook --remote --file ground.sql
   ```
   Prices are `weekday,weekend` in rupees per hour. For a single-pitch ground, use `--single 1000,1200` instead of `--full` and `--half`. Optional flags: `--upi`, `--upi-name`, `--maps`, `--whatsapp`, `--facilities "A,B,C"`, `--open 6`, `--close 24`.
6. **Go live:**
   ```bash
   npm run deploy
   ```
   Wrangler prints the address, for example `https://groundbook.<your-name>.workers.dev`.
7. **Owner setup:** open `<address>/owner` on the owner's phone and log in. Then go to **Settings** and:
   - Add the UPI ID and upload the UPI QR image. A free business UPI such as PhonePe Business is the most reliable.
   - Add photos, the Google Maps link and facilities.
   - Add the helper with a PIN.
   - Use **Open QR to print** to print the booking QR code for the ground.

   Tip: on the owner's and helper's phones, use the browser's *Add to Home screen* option so it opens like an app.

**Updating later:** after code changes, run `npm run deploy`. If a change adds a new file in `migrations/`, run `npm run db:migrate` first.

**Adding another ground:** repeat step 5 with a new slug. The same deployment serves every ground.

**Custom domain (optional):** add your domain to Cloudflare, then in *Workers & Pages → groundbook → Settings → Domains & Routes* add it, for example `book.yourdomain.in`.

### Costs

The Cloudflare free tier covers a single ground comfortably: 100,000 requests a day, 5 GB of D1 and 10 GB of R2. The Workers Paid plan (USD 5/month) only becomes worth it with many grounds.

## Security notes

- Customers have no account. Each booking has a long secret link (`/b/<token>`) that only they receive.
- Owner and helper PINs are hashed (PBKDF2). Five wrong PINs lock that number for 15 minutes.
- Helpers can't open owner pages or see amounts, UPI references or screenshots. This is checked on the server, not just hidden in the app.
- Payment screenshots are only viewable by the logged-in owner of that ground.
- Cross-site write requests are rejected. One phone number can hold at most 2 unpaid slots at once, to stop someone blocking the calendar.

## Not built yet

- Razorpay (automatic payment confirmation) as an option per ground.
- Automatic WhatsApp or SMS messages. For now, the owner gets a one-tap "Tell them on WhatsApp" button after approving or rejecting.
- Self-service sign-up for new grounds. Grounds are added with `scripts/new-ground.mjs`.
- Bookings longer than one hour in a single step. Customers book consecutive hours one at a time.
