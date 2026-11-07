-- Per-ground traffic (counted by the app, one row per ground per day).
CREATE TABLE ground_daily (
  ground_id  INTEGER NOT NULL,
  date       TEXT NOT NULL,              -- YYYY-MM-DD, IST
  views      INTEGER NOT NULL DEFAULT 0, -- booking page opened
  slot_views INTEGER NOT NULL DEFAULT 0, -- free slots checked (each date tapped)
  PRIMARY KEY (ground_id, date)
);

-- Server errors and browser errors, for debugging remotely. Kept 30 days.
CREATE TABLE error_log (
  id        INTEGER PRIMARY KEY,
  ground_id INTEGER,
  source    TEXT NOT NULL,               -- 'server' | 'browser' | 'razorpay'
  path      TEXT NOT NULL DEFAULT '',
  status    INTEGER,
  code      TEXT NOT NULL DEFAULT '',
  message   TEXT NOT NULL,
  at        INTEGER NOT NULL
);
CREATE INDEX idx_error_log_ground ON error_log (ground_id, id);
CREATE INDEX idx_error_log_at ON error_log (at);

-- Owner / business details, kept by GoArena (owners don't see these).
ALTER TABLE grounds ADD COLUMN business_name TEXT NOT NULL DEFAULT '';
ALTER TABLE grounds ADD COLUMN address TEXT NOT NULL DEFAULT '';
ALTER TABLE grounds ADD COLUMN gstin TEXT NOT NULL DEFAULT '';
ALTER TABLE grounds ADD COLUMN contact_email TEXT NOT NULL DEFAULT '';
ALTER TABLE grounds ADD COLUMN alt_phone TEXT NOT NULL DEFAULT '';

-- Razorpay health
ALTER TABLE grounds ADD COLUMN rzp_connected_at INTEGER;
ALTER TABLE grounds ADD COLUMN rzp_checked_at INTEGER;
ALTER TABLE grounds ADD COLUMN rzp_check_error TEXT;       -- NULL = last check passed
