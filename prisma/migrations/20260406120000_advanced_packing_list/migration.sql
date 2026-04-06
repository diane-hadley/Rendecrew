-- CreateEnum
CREATE TYPE "PackingSuggestionStatus" AS ENUM ('DRAFT_USER', 'PUBLISHED', 'REJECTED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "events" ADD COLUMN "suggestion_approval_required" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "personal_packing_items" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "section" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "packed" BOOLEAN NOT NULL DEFAULT false,
    "source_suggestion_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personal_packing_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packing_suggestions" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "section" TEXT,
    "default_quantity" INTEGER,
    "status" "PackingSuggestionStatus" NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "packing_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_suggestion_states" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "last_seen_suggestion_catalog_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_suggestion_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "personal_packing_items_event_id_user_id_idx" ON "personal_packing_items"("event_id", "user_id");

-- CreateIndex
CREATE INDEX "packing_suggestions_event_id_status_idx" ON "packing_suggestions"("event_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "user_suggestion_states_user_id_event_id_key" ON "user_suggestion_states"("user_id", "event_id");

-- AddForeignKey
ALTER TABLE "personal_packing_items" ADD CONSTRAINT "personal_packing_items_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_packing_items" ADD CONSTRAINT "personal_packing_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_packing_items" ADD CONSTRAINT "personal_packing_items_source_suggestion_id_fkey" FOREIGN KEY ("source_suggestion_id") REFERENCES "packing_suggestions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packing_suggestions" ADD CONSTRAINT "packing_suggestions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packing_suggestions" ADD CONSTRAINT "packing_suggestions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packing_suggestions" ADD CONSTRAINT "packing_suggestions_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_suggestion_states" ADD CONSTRAINT "user_suggestion_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_suggestion_states" ADD CONSTRAINT "user_suggestion_states_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
