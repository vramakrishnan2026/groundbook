-- Refunds issued from GoArena through the ground's Razorpay account.
ALTER TABLE bookings ADD COLUMN refund_amount INTEGER;      -- rupees refunded (or to be returned by hand for UPI)
ALTER TABLE bookings ADD COLUMN rzp_refund_id TEXT;
ALTER TABLE bookings ADD COLUMN refund_status TEXT;         -- Razorpay: pending | processed | failed; 'manual' for UPI
ALTER TABLE bookings ADD COLUMN refunded_at INTEGER;
-- Customers can cancel an online-paid booking themselves, with a full refund, up to this many hours before the slot.
-- 0 = customers can't cancel online.
ALTER TABLE grounds ADD COLUMN cancel_hours INTEGER NOT NULL DEFAULT 24;
