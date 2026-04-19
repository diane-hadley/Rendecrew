-- Add event task board schema (spec 0005).

-- CreateEnum
CREATE TYPE "EventTaskStatus" AS ENUM ('TO_DO', 'IN_PROGRESS', 'DONE');

-- AlterTable
ALTER TABLE "events"
ADD COLUMN     "task_board_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "event_tasks" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "status" "EventTaskStatus" NOT NULL DEFAULT 'TO_DO',
    "due_date" DATE,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_task_assignments" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "event_member_id" TEXT NOT NULL,
    "done_at" TIMESTAMP(3),
    "done_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_task_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_tasks_event_id_status_idx" ON "event_tasks"("event_id", "status");

-- CreateIndex
CREATE INDEX "event_tasks_event_id_due_date_idx" ON "event_tasks"("event_id", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "event_task_assignments_task_id_event_member_id_key" ON "event_task_assignments"("task_id", "event_member_id");

-- CreateIndex
CREATE INDEX "event_task_assignments_event_member_id_done_at_idx" ON "event_task_assignments"("event_member_id", "done_at");

-- AddForeignKey
ALTER TABLE "event_tasks" ADD CONSTRAINT "event_tasks_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_task_assignments" ADD CONSTRAINT "event_task_assignments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "event_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_task_assignments" ADD CONSTRAINT "event_task_assignments_event_member_id_fkey" FOREIGN KEY ("event_member_id") REFERENCES "event_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

