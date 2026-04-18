# Event task board (technical specification)

## 1. Purpose

Add an **optional Task Board** to events to coordinate shared and personal responsibilities. The Task Board is enabled/disabled per event, appears as a **Tasks** surface when enabled, and supports **multi-assignee** tasks with **per-assignee completion**.

This spec defines the domain model, enable/disable semantics, views, and server responsibilities.

## 2. Functional requirements (authoritative)

### 2.1 Task fields

A To-Do item (task) has:

- **Title** (required)
- **Status**: `TO_DO`, `IN_PROGRESS`, `DONE`
- **Due date** (optional)
- **Assigned to**: list of event members (0..N)
- **Notes** (optional, free text)

### 2.2 Optional feature enable/disable

Enabling/disabling the Task Board must follow the same pattern as other optional event features (Packing list and Rides):

- Admin-only toggle in **Event Settings**
- UI surfaces are **gated** on an event-level boolean flag
- Disable may optionally **delete** related data (see §6.2)

### 2.3 Multi-assignee completion rules

- A task may be assigned to **multiple** people.
- It should be easy to assign to **everyone** (one click).
- Each assigned user can mark the task **Done for themselves**.
- The overall task is **not** `DONE` until **all assigned users** have marked themselves done.

### 2.4 Views

Provide these views:

- **Tasks for the group**
  - **Open** tasks (status `TO_DO` or `IN_PROGRESS`)
  - **Done** tasks (status `DONE`)
- **Tasks for a user** (default to current user)
  - **Open** tasks (status `TO_DO` or `IN_PROGRESS`)
  - **Done** tasks (status `DONE`)

## 3. Conceptual model

### 3.1 Entities

- **Task board**: event-level capability flag `taskBoardEnabled`.
- **Task**: a row representing a unit of work with title, notes, due date, and status.
- **Assignment**: membership of an event member on a task, including that assignee’s completion state.

### 3.2 Completion semantics (overall vs per-assignee)

To satisfy “a user can mark done for themselves, but the overall item is not Done until all assigned users have marked done” while retaining a single `status` field:

- `Task.status` is the **overall status**.
- `TaskAssignment.doneAt` captures per-assignee completion.
- Server enforces invariant:
  - If **all assignees are done** (or there are **zero assignees**, see below), then `Task.status` **may be** `DONE`.
  - If **any assignee is not done**, then `Task.status` **must not be** `DONE` (it must be `TO_DO` or `IN_PROGRESS`).

**Zero assignees rule (v1):**

- A task with **no assignees** behaves as a “group-owned” task. It can be marked `DONE` directly (no per-assignee completion).

**State transitions (recommended):**

- When the _last remaining_ assignee marks themselves done, the server sets `Task.status = DONE` automatically.
- If any assignee later unmarks done (or a new assignee is added), the server sets `Task.status = IN_PROGRESS` (or preserves a stored prior non-done status if you want; see “Deferred”).
- Attempts to set `Task.status = DONE` while not all assignees are done should be rejected with a user-facing error.

## 4. Proposed Prisma schema additions

Follow existing conventions: Prisma enums + `@map` snake_case columns, event-scoped tables, and cascade deletes.

### 4.1 Event flag

Add to `Event`:

- `taskBoardEnabled Boolean @default(false) @map("task_board_enabled")`

### 4.2 Enums

Add:

- `enum EventTaskStatus { TO_DO IN_PROGRESS DONE }`

### 4.3 Models

#### `EventTask`

- `id String @id @default(uuid())`
- `eventId String @map("event_id")`
- `title String`
- `notes String?`
- `status EventTaskStatus @default(TO_DO)`
- `dueDate DateTime? @db.Date` (or `DateTime?` if you want time-of-day later; see §5.2)
- `sortOrder Int @default(0) @map("sort_order")` (optional; supports manual ordering)
- `createdByUserId String? @map("created_by_user_id")` (optional but recommended for auditability)
- `createdAt DateTime @default(now()) @map("created_at")`
- `updatedAt DateTime @updatedAt @map("updated_at")`
- Relations:
  - `event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)`
  - `assignments EventTaskAssignment[]`
- Indexes:
  - `@@index([eventId, status])`
  - `@@index([eventId, dueDate])`
  - `@@map("event_tasks")`

#### `EventTaskAssignment`

- `id String @id @default(uuid())`
- `taskId String @map("task_id")`
- `eventMemberId String @map("event_member_id")`
- `doneAt DateTime? @map("done_at")`
- `doneByUserId String? @map("done_by_user_id")` (optional; typically equals the assigned member’s user, but supports “mark done for someone else” if product allows later)
- `createdAt DateTime @default(now()) @map("created_at")`
- `updatedAt DateTime @updatedAt @map("updated_at")`
- Relations:
  - `task EventTask @relation(fields: [taskId], references: [id], onDelete: Cascade)`
  - `eventMember EventMember @relation(fields: [eventMemberId], references: [id], onDelete: Cascade)`
- Constraints:
  - `@@unique([taskId, eventMemberId])` (a member can only be assigned once to the same task)
  - `@@index([eventMemberId, doneAt])`
  - `@@map("event_task_assignments")`

### 4.4 Why use `EventMember` (not `User`) for assignment

Using `EventMember`:

- Makes “Assign to everyone” a direct mapping over current event membership
- Matches existing rides/packing “event-scoped membership” patterns
- Avoids ambiguity if a user is removed from an event (assignments cascade away)

## 5. Data and UX decisions

### 5.1 “Assign to everyone” behavior

In the Task edit/create UI:

- Provide a one-click **Assign to everyone** control.
- It creates `EventTaskAssignment` rows for all current `EventMember` rows for the event.
- If some members are already assigned, the operation is idempotent (insert missing only).

### 5.2 Due date representation

Requirement says “Due Date” (date-only). Recommended v1:

- Store as **date-only** (`@db.Date`) and display in the event’s timezone.
- If time-of-day becomes needed later, migrate to `DateTime` (timestamptz) and add timezone UI similar to rides.

### 5.3 Notes

Store `notes` as plain text (or Markdown) consistent with other surfaces. If Markdown, reuse the same renderer used for event `generalInformation` / chat formatting if applicable.

## 6. Enable/disable semantics (matching existing optional features)

### 6.1 UI gating

- Event Settings contains a toggle visible to **admins** (`canManageEvent`).
- When enabled, show a **Tasks** surface (tab/section) in the event UI.

### 6.2 Data retention on disable

Match current patterns:

- **Rides**: disabling deletes rides data and sets `ridesEnabled = false`.
- **Packing**: disabling deletes packing-related data and sets `packingEnabled = false`.

For Task Board v1, recommend the **Rides/Packing style** (disable deletes data), to avoid hidden stale task data and simplify re-enable semantics:

- On disable:
  - Delete all `EventTaskAssignment` for the event’s tasks (cascade will handle via deleting tasks)
  - Delete all `EventTask` for the event
  - Set `Event.taskBoardEnabled = false`
- On enable:
  - Set `Event.taskBoardEnabled = true` (no backfill)

If the product later wants “disable hides but keeps data,” flip to retention mode; the schema supports both.

## 7. Authorization and permissions

Base assumptions aligned with current Rendecrew event model:

- Only signed-in users who are `EventMember`s can view/mutate event-internal features.
- Admin-only: enable/disable the optional feature flag (via `canManageEvent`).

### 7.1 Task actions

Unless otherwise restricted by product, recommend v1 parity with rides board actions:

- **Any event member** can:
  - Create tasks
  - Edit task fields (title, status, due date, notes)
  - Assign/unassign members
  - Mark themselves done on assigned tasks (and unmark)

If you later need stricter rules (organizers only can edit or assign), add an event setting and audit log; out of scope for v1.

### 7.2 “Mark done” permissions

v1: only the assigned member can toggle their own done state:

- `setTaskAssignmentDone(taskId, eventMemberId, done)` requires the acting user’s `eventMemberId` matches the assignment’s `eventMemberId`.

## 8. Server actions / APIs (illustrative)

Pattern: mirror `app/actions/event-rides.ts` + `app/actions/event-optional-features.ts` style server actions, with server-side enforcement that the feature is enabled.

### 8.1 Optional feature actions

Add to `app/actions/event-optional-features.ts`:

- `enableEventTaskBoardFeature(eventId)` (admin only)
- `disableEventTaskBoardFeature(eventId)` (admin only; performs deletion + flips flag)

### 8.2 Task CRUD actions

Illustrative server actions:

- `listEventTasks(eventId, { view, userId? })`
  - `view = GROUP_OPEN | GROUP_DONE | USER_OPEN | USER_DONE`
  - Default `USER_*` to current user
- `createEventTask(eventId, payload)`
- `updateEventTask(taskId, payload)`
- `deleteEventTask(taskId)`
- `assignMembersToTask(taskId, eventMemberIds[])`
- `unassignMembersFromTask(taskId, eventMemberIds[])`
- `assignEveryoneToTask(taskId)` (shortcut that maps event membership)
- `setMyTaskDone(taskId, done)` (toggles the caller’s assignment doneAt)

### 8.3 Server-side validation (must be enforced server-side)

- All reads/writes require the caller is an `EventMember` for the event.
- All task endpoints must reject if `Event.taskBoardEnabled === false` (except the enable/disable endpoints).
- Title is required and trimmed; enforce max lengths (e.g. 200 chars title; notes reasonable cap).
- Assignment uniqueness is enforced via `@@unique([taskId, eventMemberId])`.
- Status invariant enforcement (see §3.2):
  - If status set to `DONE` and task has assignees, require all assignments have `doneAt != null`.
  - On per-assignee done toggles, auto-update overall status when entering/leaving “all done” state.

## 9. Queries and view definitions

### 9.1 Group views

For an event:

- **Group open**: `EventTask` where `status IN (TO_DO, IN_PROGRESS)`
- **Group done**: `EventTask` where `status = DONE`

Include assignments + minimal member/user display info to render “Assigned To” chips and per-assignee done state.

### 9.2 User views

For a given `eventMemberId`:

- **User open**: tasks where the user is assigned **and** their assignment is **not done**:
  - `EventTaskAssignment.eventMemberId = :eventMemberId`
  - `EventTaskAssignment.doneAt IS NULL`
  - (Optionally) `EventTask.status IN (TO_DO, IN_PROGRESS)` as a defensive filter
- **User done**: tasks where the user is assigned **and** their assignment **is done**:
  - `EventTaskAssignment.eventMemberId = :eventMemberId`
  - `EventTaskAssignment.doneAt IS NOT NULL`

**Why:** This ensures that if a user is “done with a task” for themselves (but the overall task is not `DONE` because other assignees aren’t done yet), it will **not** appear in that user’s **Open** list.

### 9.3 Sorting (recommended defaults)

Default sort order for all lists:

1. Due date ascending (nulls last)
2. Status (TO_DO before IN_PROGRESS; DONE in done views only)
3. Updated at descending

Use as the primary order within each view.

## 10. UI / UX (high level)

### 10.1 Surface placement

- Add a **Tasks** surface to the event UI, gated on `taskBoardEnabled`.
- The surface provides two top-level scopes:
  - **Group**
  - **Me** (default; optionally allow switching to any user)

Within each scope show two tabs or filters:

- **Open**
- **Done**

### 10.2 Task card/row

Each task displays:

- Title
- Status pill (To-Do / In Progress / Done)
- Due date (if set)
- Assigned-to chips (avatars/names)
- Completion indicator for assignees (e.g. checkmarks per assignee)

Actions:

- Create
- Edit title/status/due date/notes
- Assign/unassign members, plus **Assign to everyone**
- “Mark done for me” toggle when the current user is assigned

### 10.3 Editing notes

Notes are optional and can be edited in an expanded row, modal, or side panel. Keep it consistent with existing event settings rich text UI, if any.

## 11. Testing

### 11.1 Unit/integration tests (recommended)

- **Enable/disable**:
  - Admin can enable/disable; non-admin cannot.
  - Disabling deletes tasks and flips `taskBoardEnabled` false.
- **Assignments**:
  - Assign to everyone creates one assignment per event member; idempotent.
  - Uniqueness constraint prevents duplicates.
- **Status invariants**:
  - Cannot set `DONE` when any assignee is not done.
  - Last assignee marking done auto-sets status `DONE`.
  - Unmarking done (or adding a new assignee) auto-moves status away from `DONE`.
- **Views**:
  - Group open/done filters by status.
  - User open/done returns tasks where the user is assigned and status matches.
- **Auth**:
  - Calls fail when feature disabled.
  - Only event members can list/create/update tasks.
