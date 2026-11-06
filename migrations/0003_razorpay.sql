-- Optional Razorpay per ground. The key secret is stored encrypted (AES-GCM with the
-- SECRETS_KEY Worker secret), never in plain text.
ALTER TABLE grounds ADD COLUMN rzp_key_id TEXT;
ALTER TABLE grounds ADD COLUMN rzp_key_secret_enc TEXT;
ALTER TABLE grounds ADD COLUMN rzp_enabled INTEGER NOT NULL DEFAULT 0;

ALTER TABLE bookings ADD COLUMN rzp_order_id TEXT;
ALTER TABLE bookings ADD COLUMN rzp_payment_id TEXT;
ALTER TABLE bookings ADD COLUMN paid_via TEXT;                         -- 'upi' (screenshot) | 'razorpay' | 'cash'
ALTER TABLE bookings ADD COLUMN refund_needed INTEGER NOT NULL DEFAULT 0; -- paid online after the slot was released
CREATE INDEX idx_bookings_rzp_order ON bookings (rzp_order_id);
