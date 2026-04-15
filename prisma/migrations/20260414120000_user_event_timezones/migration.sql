-- Default timezone for new users and events (existing rows get UTC).
ALTER TABLE "users" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC';

ALTER TABLE "events" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC';
