-- Add per-datetime timezone columns.

-- Events: start/end each have their own zone. Backfill from legacy `events.timezone`.
ALTER TABLE "events"
  ADD COLUMN "start_at_time_zone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  ADD COLUMN "end_at_time_zone"   TEXT NOT NULL DEFAULT 'America/Los_Angeles';

UPDATE "events"
SET
  "start_at_time_zone" = COALESCE(NULLIF(TRIM("timezone"), ''), 'America/Los_Angeles'),
  "end_at_time_zone"   = COALESCE(NULLIF(TRIM("timezone"), ''), 'America/Los_Angeles');

-- Remove legacy single timezone column.
ALTER TABLE "events" DROP COLUMN "timezone";

-- Tasks: due date has its own zone; nullable because due_date is nullable.
ALTER TABLE "event_tasks"
  ADD COLUMN "due_date_time_zone" TEXT;

-- Backfill: use event start zone (closest we have) when due_date exists.
UPDATE "event_tasks" t
SET "due_date_time_zone" = e."start_at_time_zone"
FROM "events" e
WHERE t."event_id" = e."id" AND t."due_date" IS NOT NULL;

-- Rides: each stored instant gets its own zone; nullable because datetimes are nullable.
ALTER TABLE "event_ride_cars"
  ADD COLUMN "departure_toward_event_time_zone" TEXT,
  ADD COLUMN "expected_arrival_at_event_time_zone" TEXT,
  ADD COLUMN "departure_from_event_time_zone" TEXT,
  ADD COLUMN "expected_arrival_home_time_zone" TEXT;

-- Backfill ride datetime zones from event start zone where instants exist.
UPDATE "event_ride_cars" c
SET
  "departure_toward_event_time_zone" = CASE WHEN c."departure_toward_event_at" IS NOT NULL THEN e."start_at_time_zone" ELSE NULL END,
  "expected_arrival_at_event_time_zone" = CASE WHEN c."expected_arrival_at_event_at" IS NOT NULL THEN e."start_at_time_zone" ELSE NULL END,
  "departure_from_event_time_zone" = CASE WHEN c."departure_from_event_at" IS NOT NULL THEN e."start_at_time_zone" ELSE NULL END,
  "expected_arrival_home_time_zone" = CASE WHEN c."expected_arrival_home_at" IS NOT NULL THEN e."start_at_time_zone" ELSE NULL END
FROM "events" e
WHERE c."event_id" = e."id";

