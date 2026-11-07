-- Sign in with Google for owners and helpers (PIN stays as the backup),
-- self-signup for new grounds, and approval of new grounds by a GoArena admin.
ALTER TABLE staff ADD COLUMN google_sub TEXT;      -- Google's stable account id
ALTER TABLE staff ADD COLUMN google_email TEXT;
CREATE INDEX idx_staff_google ON staff (google_sub);

-- Grounds created before this migration are already live.
ALTER TABLE grounds ADD COLUMN approved INTEGER NOT NULL DEFAULT 1;
ALTER TABLE grounds ADD COLUMN signup_email TEXT;

CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
