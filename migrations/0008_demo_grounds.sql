-- Demo grounds: copies of a real ground for payment-gateway reviewers and demos.
-- Customers see a "demo" notice; the admin page marks them and leaves them out of the totals.
ALTER TABLE grounds ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0;
