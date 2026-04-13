-- Baseline schema that existed before the first incremental migration in this repo.
-- Without this, `prisma migrate dev` (shadow DB) fails: the earliest migration alters
-- `packing_items`, which was never created by a tracked migration.
--
-- Idempotent: safe when tables/FKs already exist (e.g. production DB created before this file).

CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT NOT NULL,
    "clerk_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_clerk_id_key" ON "users"("clerk_id");
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");

CREATE TABLE IF NOT EXISTS "events" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "start_at" TIMESTAMP(3),
    "end_at" TIMESTAMP(3),
    "location" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_created_by_id_fkey'
  ) THEN
    ALTER TABLE "events" ADD CONSTRAINT "events_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "event_members" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "event_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "event_members_event_id_user_id_key" ON "event_members"("event_id", "user_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'event_members_user_id_fkey'
  ) THEN
    ALTER TABLE "event_members" ADD CONSTRAINT "event_members_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'event_members_event_id_fkey'
  ) THEN
    ALTER TABLE "event_members" ADD CONSTRAINT "event_members_event_id_fkey"
      FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "packing_lists" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "liveblocks_room_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "packing_lists_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "packing_lists_event_id_key" ON "packing_lists"("event_id");
CREATE UNIQUE INDEX IF NOT EXISTS "packing_lists_liveblocks_room_id_key" ON "packing_lists"("liveblocks_room_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'packing_lists_event_id_fkey'
  ) THEN
    ALTER TABLE "packing_lists" ADD CONSTRAINT "packing_lists_event_id_fkey"
      FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "packing_items" (
    "id" TEXT NOT NULL,
    "packing_list_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "packing_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "packing_items_packing_list_id_idx" ON "packing_items"("packing_list_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'packing_items_packing_list_id_fkey'
  ) THEN
    ALTER TABLE "packing_items" ADD CONSTRAINT "packing_items_packing_list_id_fkey"
      FOREIGN KEY ("packing_list_id") REFERENCES "packing_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
