# Notifications (technical specification)

## 1. Purpose and scope

**In scope:** which **events** emit notifications, **user** and **per-event** **preferences**, **inbox** behavior including **read state**, and **retention** (purge).

**Out of scope for v1** (unless product explicitly expands): email, push/mobile, digest summaries, per-notification “mark unread”, and notifying users who are not yet platform members.

**Related specs:** `docs/specs/0003-event-roles-and-settings.md` (membership), `docs/specs/0001-advanced-packing-list.md` (packing), `docs/specs/0004-event-rides-board.md` (rides), `docs/specs/0005-event-task-board.md` (tasks). Emitters belong next to **authoritative server mutations** for those domains (server actions / API routes), not only in the UI.

---

## 2. Functional requirements

| ID    | Requirement                                                                                                                                                                                  |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-1  | Notifications use **categories** (3.1). Each category’s **kinds** have independent **on/off** toggles. **Defaults:** **on** for new users and for any new toggle (backfill **on**).          |
| FR-2  | **Actor suppression:** whoever **performed** the action **must not** get a notification for that same action (4.1).                                                                          |
| FR-3  | **Global** notification preferences on the account are the **default** for every event the user belongs to.                                                                                  |
| FR-4  | **Per event**, overrides are allowed. **Effective** preference for recipient + event + category: **event override if set**, else **global** (5).                                             |
| FR-5  | User can **list all** notifications (newest first unless product says otherwise).                                                                                                            |
| FR-6  | Opening the **notifications experience** (primary inbox or equivalent) marks **all** of that user’s notifications **read** (6).                                                              |
| FR-7  | Each row stores **when it occurred** (immutable `createdAt` / `occurredAt`). Display respects the user’s **timezone** (`User.timezone` today).                                               |
| FR-8  | Rows are **deleted** **30 days** after creation (7).                                                                                                                                         |
| FR-9  | **Event deleted:** emit **`event.member_removed`** **once per** former member (one row per recipient), still applying **FR-2** per recipient vs actor.                                       |
| FR-10 | **Packing quantity:** **any** **committed** change to a user’s signed quantity emits `packing.signup_or_quantity` for that user (3.3), with **FR-2**. **No** “only when crossing zero” rule. |
| FR-11 | **`rides.passenger_joined_my_car`:** recipient is the car’s **driver** only. If creator ≠ driver, **do not** notify the creator.                                                             |

---

## 3. Categories and triggers

### 3.1 Taxonomy

Four **categories** (product language): **Event**, **Packing**, **Rides**, **Tasks**.

Each category has one or more **kinds** (stable string keys for analytics, routing, i18n). **Kinds** are what toggles control (**FR-1**). Either one toggle per kind or one per category gating all kinds in it—**v1:** **one toggle per kind**; UI may still group under the four headings.

### 3.2 Event

| Kind                   | Emit when                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event.member_added`   | User **added** to event (new `EventMember` for them).                                                                                                                                 |
| `event.member_removed` | User **removed** from event **or** event **deleted** while they were a member. Deletion: **one** row **per** former member (**FR-9**); **FR-2** (e.g. deleter not notified for self). |

### 3.3 Packing

| Kind                         | Emit when                                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packing.signup_or_quantity` | User **signs up** for an item **or** **signed quantity** changes (**FR-10**; actor = whoever committed the mutation).                             |
| `packing.removed_from_item`  | User **removed** from packing an item (self-unassign: actor suppressed for self; organizer removal: recipient = removed user, actor = organizer). |

### 3.4 Rides

| Kind                              | Emit when                                                                                                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rides.passenger_joined_my_car`   | Another user **joins** as passenger. **Recipient:** car **driver** only (**FR-11**). Creator ≠ driver → creator not notified unless they are the driver. |
| `rides.driver_assignment_changed` | User **added** or **removed** as **driver** for a car (or equivalent role).                                                                              |
| `rides.car_assignment_changed`    | User **added** or **removed** as **passenger** (or equivalent occupancy).                                                                                |

### 3.5 Tasks

| Kind                       | Emit when                                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tasks.assignment_changed` | User **assigned**, **unassigned**, or task they were assigned to is **deleted** (former assignees notified; **FR-2** if deleter was sole assignee—others still notified). |
| `tasks.due_date_changed`   | Task **due date** changes **and** user is **currently assigned** at the time of the change.                                                                               |

**Bulk:** multi-select assign/delete—either **one notification per recipient per logical transaction** or **one per affected row**; pick one and document; **preference:** one per (recipient, task, kind) for assign/unassign/due-date. **Event delete** stays **FR-9**.

**Idempotency:** retries must not duplicate rows; optional **`dedupeKey`** (8.1).

---

## 4. Actor suppression

**Rule:** every notification **N** has **`actorUserId`** (nullable only for real system/cron). **Do not insert** **N** if **`recipientUserId === actorUserId`**.

**Multi-recipient:** e.g. task with several assignees—notify each with prefs on, suppress only the actor. Rides: `rides.passenger_joined_my_car` → driver only (**FR-11**); other ride kinds follow their own recipient rules + **FR-2**.

**No human actor:** rare; either `actorUserId = null` and notify all eligible, or disallow silent system mutations without actor in app code—**v1:** user-visible mutations have an **actor**; retention cron deletes do not emit.

---

## 5. Preferences (global + per-event)

**Storage (recommended):**

- **`UserNotificationPreferences`** (1:1 `User`): one **boolean per kind**, default **true**; new kinds **true** at migration.
- **`EventMemberNotificationPreferences`** (optional 1:1 with `EventMember`): same columns as user **or** JSON by kind. **Null / absent** = inherit global (**FR-4**).

**Effective:** `eventOverride(kind) ?? globalUser(kind)`.

If there is **no** `EventMember` for event-scoped work, **do not emit**.

**On join:** no need to copy toggles to per-event; absent = inherit (**FR-3**, **FR-4**). “Snapshot on join” would be a later product change.

**UI:** account settings = **global**; event member settings = **this user’s overrides only** for that event, not other members’.

---

## 6. Inbox and read state

**Row fields:** `recipientUserId`; `readAt DateTime?` (**null** = unread). Alternative: `read` + `readAt`; **timestamp** helps auditing **FR-6**.

**Mark read (**FR-6**):** user opens dedicated notifications view **or** a first-class panel listing **all** notifications (not toast-only):

1. Client calls a server mutation (e.g. `markAllNotificationsReadForUser`).
2. Server sets `readAt = now()` for all rows with `recipientUserId = currentUser` and `readAt IS NULL`.

**Later / product:** viewport-only read, swipe unread, explicit “mark all read”.

**Listing:** paginate (cursor or offset); sort **`createdAt` DESC** unless product overrides.

**Deep link payload:** store enough structured fields to deep-link **without joins where cheap** (e.g. `eventId`, optional `taskId`, `rideCarId`, `packingListId` / `packingItemId`); keys match schema.

---

## 7. Retention (**FR-8**)

Delete rows whose **`createdAt`** (or `occurredAt` if split) is **more than 30 days** in the past. **Read** vs **unread** irrelevant.

**Job:** scheduled at least **daily**; batch on indexed `createdAt` to avoid full scans.

---

## 8. Persistence sketch (Prisma-oriented)

Names illustrative; match existing `@map` snake_case.

### `Notification`

`id`, `recipientUserId`, `actorUserId?`, `kind` (string or enum), `createdAt @default(now())`, `readAt?`, optional **`dedupeKey String? @unique`**, **`metadata Json`** (human-arg keys for UI templates + deep-link ids). Indexes: `(recipientUserId, createdAt DESC)`, `(createdAt)` for purge.

### `UserNotificationPreferences`

`userId` PK/unique; **boolean per kind** in 3.2–3.5, all `@default(true)`.

### `EventMemberNotificationPreferences`

`eventMemberId` unique (or `userId`+`eventId` unique); same booleans as user **or** `overrides Json` with **only** keys that override globals.

**Cascade:** deleting `User`, `Event`, or `EventMember` removes dependent prefs; notifications deleted or cascaded as product requires (retention vs GDPR-style user delete).

---

## 9. Authorization and privacy

List / mark-read: **only** the authenticated **recipient**. Do not expose another user’s inbox via URLs without auth checks. **`metadata`:** no secrets (tokens, private email beyond what recipient already sees).

---

## 10. Acceptance criteria

| Scenario                                     | Expected                                                                                                          |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| A adds B to event                            | B gets `event.member_added` if enabled; **A gets nothing** for that action.                                       |
| B removes self from packing                  | **B gets nothing**; other product rules unchanged.                                                                |
| Organizer removes B from packing             | B gets `packing.removed_from_item` if enabled.                                                                    |
| Global **Tasks** off, no event override      | No task notifications in any event.                                                                               |
| Global on, tasks off **only** in Event X     | No task notifs for X; still get them for Event Y.                                                                 |
| User opens notifications page                | All unread rows get `readAt`.                                                                                     |
| Row **31** days old                          | Purge deletes it regardless of read.                                                                              |
| Event with **N** members deleted by member A | **N − 1** notifications if A was a member (**FR-9**, **FR-2**); each other member **one** `event.member_removed`. |
| Packing quantity **2→3** for B, actor C      | B gets `packing.signup_or_quantity` if enabled (**FR-10**).                                                       |
| Passenger joins; creator ≠ driver            | **Driver** gets `rides.passenger_joined_my_car`; **creator does not** (**FR-11**).                                |

---

## 11. Rollout

1. Emitters behind a **feature flag** if needed; prefs tables can ship empty (= all on via defaults).
2. New **kinds** only with a **migration** defaulting new user-pref columns **true**.
3. UI copy: grouped toggles match **3.1**.
