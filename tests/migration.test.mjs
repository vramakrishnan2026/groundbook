// The half-hour migration keeps existing bookings and their locks. Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dir = path.join(import.meta.dirname, '..', 'migrations');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

test('0010 turns hour locks into half-hour locks and fills start_min', () => {
  const db = new DatabaseSync(':memory:');
  for (const f of files.filter((f) => f < '0010')) db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  db.exec(`INSERT INTO grounds (slug, name, created_at) VALUES ('t', 'T', 0)`);
  db.exec(`INSERT INTO units (ground_id, code, name, mask) VALUES (1, 'FULL', 'Full', 3)`);
  db.exec(`INSERT INTO bookings (token, ref, ground_id, unit_id, date, start_hour, mask, status, created_at)
           VALUES ('tok', 'GB-1', 1, 1, '2026-11-10', 19, 3, 'CONFIRMED', 0)`);
  db.exec(`INSERT INTO slot_locks (ground_id, date, hour, cell, booking_token) VALUES (1, '2026-11-10', 19, 1, 'tok'), (1, '2026-11-10', 19, 2, 'tok')`);
  db.exec(fs.readFileSync(path.join(dir, files.find((f) => f.startsWith('0010'))), 'utf8'));
  const b = db.prepare('SELECT start_min, dur_min FROM bookings').get();
  assert.deepEqual({ ...b }, { start_min: 1140, dur_min: 60 });
  const locks = db.prepare('SELECT half, cell FROM slot_locks ORDER BY half, cell').all().map((r) => [r.half, r.cell]);
  assert.deepEqual(locks, [[38, 1], [38, 2], [39, 1], [39, 2]]);
  assert.equal(db.prepare(`SELECT step_min FROM grounds`).get().step_min, 60);
  assert.throws(() => db.exec(`INSERT INTO slot_locks (ground_id, date, half, cell, booking_token) VALUES (1, '2026-11-10', 39, 2, 'x')`), /UNIQUE/);
});
