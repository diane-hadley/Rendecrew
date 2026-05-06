-- CreateEnum
CREATE TYPE "EventTaskAssigneeCompletionMode" AS ENUM ('ANY', 'EACH');

-- AlterTable
ALTER TABLE "event_tasks" ADD COLUMN     "assignee_completion_mode" "EventTaskAssigneeCompletionMode" NOT NULL DEFAULT 'EACH';
