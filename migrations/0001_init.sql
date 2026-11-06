-- GroundBook schema (Cloudflare D1 / SQLite)
-- Money is stored in whole rupees. Times: dates are 'YYYY-MM-DD' and hours are 0-23
-- in the ground's local time; *_at columns are epoch milliseconds (UTC).

CREATE TABLE grounds (
  id             INTEGER PRIMARY KEY,
  slug           TEXT NOT NULL UNIQUE,          -- used in the QR link: /g/<slug>
  name           TEXT NOT NULL,
  area           TEXT NOT NULL DEFAULT '',      -- short location line, e.g. "Edappally, Kochi"
  maps_url       TEXT NOT NULL DEFAULT '',
  about          TEXT NOT NULL DEFAULT '',
  whatsapp       TEXT NOT NULL DEFAULT '',      -- owner's number for wa.me links (10 digits)
  upi_id         TEXT NOT NULL DEFAULT '',
  upi_name       TEXT NOT NULL DEFAULT '',
  upi_qr_key     TEXT,                          -- R2 key of the owner's UPI QR image
  facilities     TEXT NOT NULL DEFAULT '[]',    -- JSON array of strings
  open_hour      INTEGER NOT NULL DEFAULT 6,    -- first bookable hour
  close_hour     INTEGER NOT NULL DEFAULT 23,   -- last slot starts at close_hour - 1
  hold_minutes   INTEGER NOT NULL DEFAULT 30,
  booking_days   INTEGER NOT NULL DEFAULT 14,   -- how far ahead customers can book
  tz_offset_min  INTEGER NOT NULL DEFAULT 330,  -- IST
  payment_mode   TEXT NOT NULL DEFAULT 'upi' CHECK (payment_mode IN ('upi')),
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     INTEGER NOT NULL
);

-- A unit is something a customer can book. `mask` says which physical cells it uses:
-- Half A = 1 (0b01), Half B = 2 (0b10), Full ground = 3 (0b11).
-- Two bookings in the same hour clash when their masks share a bit.
-- A ground with a single pitch has one unit with mask 1.
CREATE TABLE units (
  id         INTEGER PRIMARY KEY,
  ground_id  INTEGER NOT NULL REFERENCES grounds(id),
  code       TEXT NOT NULL,
  name       TEXT NOT NULL,
  subtitle   TEXT NOT NULL DEFAULT '',
  mask       INTEGER NOT NULL CHECK (mask > 0),
  sort       INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1,
  UNIQUE (ground_id, code)
);

CREATE TABLE prices (
  unit_id   INTEGER NOT NULL REFERENCES units(id),
  day_type  TEXT NOT NULL CHECK (day_type IN ('weekday', 'weekend')),
  amount    INTEGER NOT NULL CHECK (amount >= 0),
  PRIMARY KEY (unit_id, day_type)
);

CREATE TABLE photos (
  id         INTEGER PRIMARY KEY,
  ground_id  INTEGER NOT NULL REFERENCES grounds(id),
  r2_key     TEXT NOT NULL,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE staff (
  id         INTEGER PRIMARY KEY,
  ground_id  INTEGER NOT NULL REFERENCES grounds(id),
  role       TEXT NOT NULL CHECK (role IN ('owner', 'helper')),
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,
  pin_hash   TEXT NOT NULL,                     -- pbkdf2$<iterations>$<salt b64>$<hash b64>
  active     INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  UNIQUE (ground_id, phone)
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,                  -- sha256 of the cookie value
  staff_id   INTEGER NOT NULL REFERENCES staff(id),
  expires_at INTEGER NOT NULL
);

CREATE TABLE login_attempts (
  key          TEXT PRIMARY KEY,                -- phone number
  failures     INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);

-- status: HOLD (waiting for payment proof), PENDING (proof sent, owner to check),
--         CONFIRMED, REJECTED, EXPIRED, CANCELLED
-- kind:   customer (booked online), walkin (added by owner, already paid), block (closed by owner)
CREATE TABLE bookings (
  id              INTEGER PRIMARY KEY,
  token           TEXT NOT NULL UNIQUE,         -- secret link for the customer: /b/<token>
  ref             TEXT NOT NULL,                -- short human code, e.g. GB-7K3Q
  ground_id       INTEGER NOT NULL REFERENCES grounds(id),
  unit_id         INTEGER NOT NULL REFERENCES units(id),
  date            TEXT NOT NULL,
  start_hour      INTEGER NOT NULL,
  mask            INTEGER NOT NULL,
  kind            TEXT NOT NULL DEFAULT 'customer' CHECK (kind IN ('customer', 'walkin', 'block')),
  status          TEXT NOT NULL CHECK (status IN ('HOLD','PENDING','CONFIRMED','REJECTED','EXPIRED','CANCELLED')),
  customer_name   TEXT NOT NULL DEFAULT '',
  phone           TEXT NOT NULL DEFAULT '',
  amount          INTEGER NOT NULL DEFAULT 0,
  utr             TEXT,
  proof_key       TEXT,
  note            TEXT NOT NULL DEFAULT '',
  ip              TEXT NOT NULL DEFAULT '',
  hold_expires_at INTEGER,
  created_at      INTEGER NOT NULL,
  proof_at        INTEGER,
  decided_at      INTEGER,
  decided_by      INTEGER
);
CREATE INDEX idx_bookings_ground_date ON bookings (ground_id, date);
CREATE INDEX idx_bookings_status ON bookings (ground_id, status);
CREATE INDEX idx_bookings_hold ON bookings (status, hold_expires_at);

-- One row per (hour, cell) that is taken. The primary key makes double booking impossible:
-- a new booking inserts its rows in the same transaction as the booking itself, and the
-- whole transaction fails if any cell is already taken.
CREATE TABLE slot_locks (
  ground_id     INTEGER NOT NULL,
  date          TEXT NOT NULL,
  hour          INTEGER NOT NULL,
  cell          INTEGER NOT NULL,
  booking_token TEXT NOT NULL,
  PRIMARY KEY (ground_id, date, hour, cell)
);
CREATE INDEX idx_locks_token ON slot_locks (booking_token);
