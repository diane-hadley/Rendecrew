-- CreateTable
CREATE TABLE "packing_sections" (
    "id" TEXT NOT NULL,
    "packing_list_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "packing_sections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "packing_sections_packing_list_id_idx" ON "packing_sections"("packing_list_id");

-- AddForeignKey
ALTER TABLE "packing_sections" ADD CONSTRAINT "packing_sections_packing_list_id_fkey" FOREIGN KEY ("packing_list_id") REFERENCES "packing_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "packing_items" ADD COLUMN "section_id" TEXT;

-- CreateIndex
CREATE INDEX "packing_items_section_id_idx" ON "packing_items"("section_id");

-- Backfill: one section row per distinct non-empty section title per list, ordered by first appearance in sort_order
INSERT INTO "packing_sections" ("id", "packing_list_id", "title", "sort_order", "created_at", "updated_at")
SELECT gen_random_uuid()::text,
       fa."packing_list_id",
       fa."title",
       ROW_NUMBER() OVER (PARTITION BY fa."packing_list_id" ORDER BY fa."first_sort") - 1,
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
FROM (
    SELECT
        pi."packing_list_id",
        btrim(pi."section") AS "title",
        MIN(pi."sort_order") AS "first_sort"
    FROM "packing_items" pi
    WHERE pi."section" IS NOT NULL AND btrim(pi."section") <> ''
    GROUP BY pi."packing_list_id", btrim(pi."section")
) fa;

-- Point items at their section row (match trimmed title within the same list)
UPDATE "packing_items" pi
SET "section_id" = ps."id"
FROM "packing_sections" ps
WHERE pi."packing_list_id" = ps."packing_list_id"
  AND pi."section" IS NOT NULL
  AND btrim(pi."section") <> ''
  AND ps."title" = btrim(pi."section");

-- AddForeignKey (after backfill)
ALTER TABLE "packing_items" ADD CONSTRAINT "packing_items_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "packing_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
