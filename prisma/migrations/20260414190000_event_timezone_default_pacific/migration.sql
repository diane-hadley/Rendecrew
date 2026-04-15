-- Align with users.timezone and APP_DEFAULT_TIME_ZONE (new rows only; existing events unchanged).
ALTER TABLE "events" ALTER COLUMN "timezone" SET DEFAULT 'America/Los_Angeles';
