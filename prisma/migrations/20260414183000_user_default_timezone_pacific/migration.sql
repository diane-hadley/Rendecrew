-- New users default to US Pacific; existing rows keep their stored value.
ALTER TABLE "users" ALTER COLUMN "timezone" SET DEFAULT 'America/Los_Angeles';
