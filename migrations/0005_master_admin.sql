-- Master admin: service level per ground, GoArena subscription, last-login tracking and an audit log.
--   service = 'active'  everything works
--             'paused'  customers can't book online (they see "Call to book"); owner and helpers can still log in
--             'locked'  booking page closed and owner/helpers can't log in (existing booking links still open)
ALTER TABLE grounds ADD COLUMN service TEXT NOT NULL DEFAULT 'active';
ALTER TABLE grounds ADD COLUMN service_note TEXT NOT NULL DEFAULT '';   -- shown to the owner
ALTER TABLE grounds ADD COLUMN plan_amount INTEGER NOT NULL DEFAULT 500; -- ₹ per month
ALTER TABLE grounds ADD COLUMN paid_until TEXT;                         -- YYYY-MM-DD, NULL = no plan yet
ALTER TABLE grounds ADD COLUMN admin_note TEXT NOT NULL DEFAULT '';     -- private to GoArena admins
-- Planned (not used yet): pause bookings automatically this many days after paid_until. NULL = never.
ALTER TABLE grounds ADD COLUMN auto_pause_days INTEGER;

ALTER TABLE staff ADD COLUMN last_login_at INTEGER;

CREATE TABLE sub_payments (
  id         INTEGER PRIMARY KEY,
  ground_id  INTEGER NOT NULL REFERENCES grounds(id),
  amount     INTEGER NOT NULL,
  months     INTEGER NOT NULL,
  paid_on    TEXT NOT NULL,          -- YYYY-MM-DD
  covers_to  TEXT NOT NULL,          -- paid_until after this payment
  note       TEXT NOT NULL DEFAULT '',
  by_email   TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_sub_payments_ground ON sub_payments (ground_id, id);

CREATE TABLE admin_log (
  id        INTEGER PRIMARY KEY,
  ground_id INTEGER,
  email     TEXT NOT NULL,
  action    TEXT NOT NULL,
  detail    TEXT NOT NULL DEFAULT '',
  at        INTEGER NOT NULL
);
CREATE INDEX idx_admin_log_ground ON admin_log (ground_id, id);
