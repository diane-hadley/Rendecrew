-- CreateTable
CREATE TABLE "packing_item_sign_ups" (
    "id" TEXT NOT NULL,
    "packing_item_id" TEXT NOT NULL,
    "quantity" INTEGER,
    "display_name" TEXT NOT NULL,
    "email" TEXT,
    "user_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "packing_item_sign_ups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "packing_item_sign_ups_packing_item_id_idx" ON "packing_item_sign_ups"("packing_item_id");
CREATE INDEX "packing_item_sign_ups_email_idx" ON "packing_item_sign_ups"("email");

ALTER TABLE "packing_item_sign_ups" ADD CONSTRAINT "packing_item_sign_ups_packing_item_id_fkey" FOREIGN KEY ("packing_item_id") REFERENCES "packing_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "packing_item_sign_ups" ADD CONSTRAINT "packing_item_sign_ups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Migrate legacy single sign-up per row into packing_item_sign_ups (if columns still exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'packing_items' AND column_name = 'claimed_by_name'
  ) THEN
    INSERT INTO "packing_item_sign_ups" ("id", "packing_item_id", "quantity", "display_name", "email", "user_id", "sort_order", "created_at", "updated_at")
    SELECT gen_random_uuid(), pi."id", pi."claimed_quantity",
      COALESCE(NULLIF(trim(pi."claimed_by_name"), ''), 'Member'),
      pi."claimed_by_email", pi."claimed_by_user_id", 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM "packing_items" pi
    WHERE pi."claimed_by_name" IS NOT NULL OR pi."claimed_by_user_id" IS NOT NULL;

    ALTER TABLE "packing_items" DROP CONSTRAINT IF EXISTS "packing_items_claimed_by_user_id_fkey";
    DROP INDEX IF EXISTS "packing_items_claimed_by_email_idx";
    ALTER TABLE "packing_items" DROP COLUMN IF EXISTS "claimed_by_name";
    ALTER TABLE "packing_items" DROP COLUMN IF EXISTS "claimed_by_email";
    ALTER TABLE "packing_items" DROP COLUMN IF EXISTS "claimed_by_user_id";
    ALTER TABLE "packing_items" DROP COLUMN IF EXISTS "claimed_quantity";
  END IF;
END $$;
