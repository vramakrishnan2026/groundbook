-- Subscription on/off per ground. Off = free ground: no plan reminders, never overdue, not counted as income.
ALTER TABLE grounds ADD COLUMN plan_enabled INTEGER NOT NULL DEFAULT 0;
-- Grounds that already have a paid-until date are on a plan.
UPDATE grounds SET plan_enabled = 1 WHERE paid_until IS NOT NULL;
