-- Add a per-event toggle for whether packing list UI is enabled.
-- Default true to preserve existing behavior for existing events.

ALTER TABLE "events"
ADD COLUMN "packing_enabled" BOOLEAN NOT NULL DEFAULT TRUE;

