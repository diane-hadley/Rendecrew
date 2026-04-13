-- Rename legacy description column to general_information (same TEXT data).
ALTER TABLE "events" RENAME COLUMN "description" TO "general_information";
