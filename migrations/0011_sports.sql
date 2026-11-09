-- Multi-sport: every bookable unit belongs to one sport.
-- Box cricket units reuse the football turf's cells (same masks), so a cricket booking and a
-- football booking in the same hour clash exactly like Full vs Half already do.
-- Badminton courts are separate indoor courts with their own cells (bits 4 and up).
ALTER TABLE units ADD COLUMN sport TEXT NOT NULL DEFAULT 'football';
