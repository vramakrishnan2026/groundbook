#!/usr/bin/env node
// Prints the SQL that adds a new ground, its courts, prices and owner login.
//
// Example (your friend's ground, full ground + two halves):
//   node scripts/new-ground.mjs --slug green-field --name "Green Field Turf" --area "Edappally, Kochi" \
//     --owner "Rajesh" --phone 9847012345 --pin 4826 \
//     --full 1200,1500 --half 700,900 > ground.sql
//   npx wrangler d1 execute groundbook --remote --file ground.sql
//
// For a ground with a single pitch, use --single 1000,1200 instead of --full/--half.
// Prices are weekday,weekend in rupees per hour.
import { hashPin } from '../src/lib/util.js';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];

const need = (k) => {
  if (!args[k]) {
    console.error(`Missing --${k}. See the comment at the top of this file.`);
    process.exit(1);
  }
  return args[k];
};
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const prices = (s) => {
  const [wd, we] = String(s).split(',').map((x) => parseInt(x, 10));
  if (!(wd >= 0) || !(we >= 0)) throw new Error(`Prices must look like 1200,1500 (got ${s})`);
  return { wd, we };
};

const slug = need('slug').toLowerCase();
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new Error('slug: lowercase letters, numbers and dashes only');
const phone = need('phone').replace(/\D/g, '').slice(-10);
if (!/^[6-9]\d{9}$/.test(phone)) throw new Error('phone must be a 10-digit Indian mobile number');
const pin = need('pin');
if (!/^\d{4,6}$/.test(pin)) throw new Error('pin must be 4 to 6 digits');

const now = Date.now();
const G = `(SELECT id FROM grounds WHERE slug = ${q(slug)})`;
const units = args.single
  ? [['MAIN', 'Ground', '', 1, prices(args.single)]]
  : [
      ['FULL', 'Full ground', '8-a-side', 3, prices(need('full'))],
      ['HALF_A', 'Half A', '5-a-side', 1, prices(need('half'))],
      ['HALF_B', 'Half B', '5-a-side', 2, prices(need('half'))],
    ];

const sql = [
  `INSERT INTO grounds (slug, name, area, maps_url, upi_id, upi_name, whatsapp, facilities, open_hour, close_hour, created_at)
   VALUES (${q(slug)}, ${q(need('name'))}, ${q(args.area || '')}, ${q(args.maps || '')}, ${q(args.upi || '')}, ${q(args['upi-name'] || '')},
           ${q(args.whatsapp || phone)}, ${q(JSON.stringify((args.facilities || 'Floodlights,Parking,Drinking water').split(',').map((s) => s.trim()).filter(Boolean)))},
           ${parseInt(args.open || '6', 10)}, ${parseInt(args.close || '23', 10)}, ${now});`,
  ...units.map(
    ([code, name, sub, mask], i) =>
      `INSERT INTO units (ground_id, code, name, subtitle, mask, sort) VALUES (${G}, ${q(code)}, ${q(name)}, ${q(sub)}, ${mask}, ${i});`
  ),
  ...units.flatMap(([code, , , , p]) => [
    `INSERT INTO prices (unit_id, day_type, amount) SELECT id, 'weekday', ${p.wd} FROM units WHERE ground_id = ${G} AND code = ${q(code)};`,
    `INSERT INTO prices (unit_id, day_type, amount) SELECT id, 'weekend', ${p.we} FROM units WHERE ground_id = ${G} AND code = ${q(code)};`,
  ]),
  `INSERT INTO staff (ground_id, role, name, phone, pin_hash, created_at) VALUES (${G}, 'owner', ${q(need('owner'))}, ${q(phone)}, ${q(await hashPin(pin))}, ${now});`,
];
console.log(sql.join('\n'));
