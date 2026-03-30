-- AlterTable
ALTER TABLE "packing_item_sign_ups" ADD COLUMN "packed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "packing_items" DROP COLUMN IF EXISTS "packed";
