import { EventTaskStatus } from "@prisma/client";

/**
 * Default task list filter: To-do + In progress (legacy “Open”).
 *
 * Kept in `lib/` so it can be imported by both client components and
 * server actions (Next "use server" files may not export non-async values).
 */
export const DEFAULT_TASK_LIST_OPEN_STATUS_FILTER = {
  kind: "SET" as const,
  statuses: [EventTaskStatus.TO_DO, EventTaskStatus.IN_PROGRESS],
};
