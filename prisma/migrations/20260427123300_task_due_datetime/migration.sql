-- Change task due_date from DATE to TIMESTAMPTZ(3) so tasks can store time-of-day.

ALTER TABLE "event_tasks"
ALTER COLUMN "due_date" TYPE TIMESTAMPTZ(3)
-- Preserve the original date as a stable midnight UTC instant.
USING (("due_date"::timestamp) AT TIME ZONE 'UTC');

