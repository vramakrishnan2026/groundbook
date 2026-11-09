-- Bookings in 30-minute steps: minimum 1 hour, then longer in the owner's chosen step (30 or 60 minutes).
-- Grounds keep whole-hour booking (60) until the owner switches to half hours in Settings.
ALTER TABLE grounds ADD COLUMN step_min INTEGER NOT NULL DEFAULT 60;

-- Start time in minutes after midnight (local to the ground) and length in minutes.
-- start_hour stays filled in (start_min / 60, rounded down) for anything that still reads it.
ALTER TABLE bookings ADD COLUMN start_min INTEGER;
ALTER TABLE bookings ADD COLUMN dur_min INTEGER NOT NULL DEFAULT 60;
UPDATE bookings SET start_min = start_hour * 60 WHERE start_min IS NULL;
CREATE INDEX idx_bookings_ground_date_start ON bookings (ground_id, date, start_min);

-- Locks move from whole hours to half hours: one row per (half hour, cell) taken.
-- half = minutes after midnight / 30, so 6 PM is 36 and 6:30 PM is 37.
CREATE TABLE slot_locks_new (
  ground_id     INTEGER NOT NULL,
  date          TEXT NOT NULL,
  half          INTEGER NOT NULL,
  cell          INTEGER NOT NULL,
  booking_token TEXT NOT NULL,
  PRIMARY KEY (ground_id, date, half, cell)
);
INSERT INTO slot_locks_new (ground_id, date, half, cell, booking_token)
  SELECT ground_id, date, hour * 2, cell, booking_token FROM slot_locks;
INSERT INTO slot_locks_new (ground_id, date, half, cell, booking_token)
  SELECT ground_id, date, hour * 2 + 1, cell, booking_token FROM slot_locks;
DROP TABLE slot_locks;
ALTER TABLE slot_locks_new RENAME TO slot_locks;
CREATE INDEX idx_locks_token ON slot_locks (booking_token);
