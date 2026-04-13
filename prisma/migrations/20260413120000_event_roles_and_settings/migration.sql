-- CreateEnum
CREATE TYPE "EventMemberRole" AS ENUM ('creator', 'admin', 'member');

-- CreateEnum
CREATE TYPE "MemberManagementPolicy" AS ENUM ('ANY_MEMBER_CAN_INVITE', 'ADMINS_ONLY');

-- CreateEnum
CREATE TYPE "PackingListVisibility" AS ENUM ('URL_PUBLIC', 'MEMBERS_ONLY');

-- Data migration: legacy string roles -> enum-compatible text
UPDATE "event_members" AS em
SET "role" = 'creator'
FROM "events" AS e
WHERE em."event_id" = e."id"
  AND em."role" = 'owner'
  AND em."user_id" = e."created_by_id";

UPDATE "event_members"
SET "role" = 'member'
WHERE "role" = 'owner';

UPDATE "event_members"
SET "role" = 'member'
WHERE "role" NOT IN ('creator', 'admin', 'member');

-- AlterTable
ALTER TABLE "event_members"
  ALTER COLUMN "role" TYPE "EventMemberRole"
  USING ("role"::"EventMemberRole");

-- AlterTable
ALTER TABLE "events" ADD COLUMN "member_management_policy" "MemberManagementPolicy" NOT NULL DEFAULT 'ANY_MEMBER_CAN_INVITE';

ALTER TABLE "events" ADD COLUMN "packing_list_visibility" "PackingListVisibility" NOT NULL DEFAULT 'URL_PUBLIC';
