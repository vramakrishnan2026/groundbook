-- Photos, UPI QR codes and payment screenshots are stored in D1 instead of R2.
CREATE TABLE files (
  key          TEXT PRIMARY KEY,   -- e.g. photos/1/<uuid>, proofs/1/<booking token>
  content_type TEXT NOT NULL,
  data         TEXT NOT NULL,      -- base64
  size         INTEGER NOT NULL,   -- original bytes
  created_at   INTEGER NOT NULL
);
