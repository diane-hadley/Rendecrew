# Advanced Packing List — Technical Specification

## 1. Purpose and context

**Goal:** Evolve the shared event packing list from a single collaborative document into a system that supports **auditable changes**, **undo**, **safer deletion**, **per-user personal lists**, **admin/user-suggested templates**, and a **single “my trip” view** that merges personal items and group commitments.

**Current state (baseline):**

- One `PackingList` per `Event`, with `liveblocksRoomId` for real-time editing.
- `PackingItem` rows hold shared line items; `PackingItemSignUp` rows hold who is bringing what and a per-sign-up `packed` flag.
- DB sync replaces all sign-ups for an item on each persist (`deleteMany` + `createMany` in `persistPackingListItems`), so **removals and edits leave no durable audit trail** today.

This update keeps the **Liveblocks room** as the source of truth for collaborative editing. **Undo/redo** and **coarse restore** are implemented with **Liveblocks’ built-in Storage history** and **document-level snapshot/restore**. The database remains the durable mirror for `persistPackingListItems` and event-page reads.

## 2. Scope

- Append-only (or snapshot-based) **activity / version history** for shared list and sign-ups, including **sign-up removed** and **item removed**, with **batching** for noisy edits.
- **Undo/redo** for each collaborator’s own edits via **Liveblocks `Room.history`**; **whole-document restore** via **snapshot/restore** (§3.2), **organizers only**
- **Confirmed delete** for removing a shared list item.
- **Personal packing list** per user per event — **full create/edit/checklist only for signed-in users** (§3.4, §6).
- **Suggested items catalog**: admin-managed defaults, user proposals, **organizer-configurable approval** (required vs auto-publish, §3.6), **“new since you last looked”** surfacing, **library of not-yet-added** suggestions, **copy to personal** then **independent quantities**. **Guests may view** the suggested-items catalog **read-only**; they **cannot** maintain a personal list or edit suggestions (§6).
- **Combined view**: personal items + group items the user signed up for.
- **Shared list template:** add/remove/reorder items and edit item metadata — **organizers only**; participants with the packing link **sign up** and manage **their own** contributions (§3.1, §6).

## 3. Domain model

### 3.1 Shared list (existing concepts, refined)

- **Shared packing list** — still one per event; still backed by `PackingList` + `PackingItem` + `PackingItemSignUp` for “who’s covering the group need.”
- **List item** — `PackingItem` (section, name, min/max quantity, sort).

**Shared template vs participation**

- **Template (structural) — organizers only:** creating, deleting, or reordering shared `PackingItem` rows; editing item **name**, **section**, or **quantity** fields that define the group need. Includes **confirmed delete** of an item (§3.3).
- **Participation — anyone with packing access:** adding, editing, or removing **their own** `PackingItemSignUp` rows (including quantity claimed and **packed** for their sign-up). They **do not** reshape the list of items the group is trying to fill.
- **Enforcement:** Combine **Liveblocks room permissions** (e.g. read vs write access to Storage, if supported for your plan) with **server-side validation** in **`persistPackingListItems`**: reject or strip template mutations from non-organizers so the DB never diverges from the access model even if a client misbehaves.

### 3.2 Liveblocks: document-level snapshot/restore and per-user undo/redo

**Design principle:** Use Liveblocks’ native primitives for collaborative state—not a parallel server undo engine for Storage edits.

#### Per-user local undo/redo (Storage history)

- Use **`Room.history`** on the client: `undo` / `redo`, `canUndo` / `canRedo`, `clear`, `pause` / `resume` (see [Liveblocks `Room.history`](https://liveblocks.io/docs/api-reference/liveblocks-client#Room.history)).
- **Semantics:** History applies only to **this client’s** mutations to **Storage** (and optionally Presence via `addToHistory`). Other users’ edits are **not** undone. Each user keeps a **separate in-memory** stack; **history resets on full page reload** (documented Liveblocks behavior).
- **UI:** Wire toolbar or shortcuts to `room.history` (e.g. React [`useHistory`](https://liveblocks.io/docs/api-reference/liveblocks-react) from `@liveblocks/react` / generated `liveblocks.config` where applicable).
- **Batching:** Use **`room.batch(() => { ... })`** so multiple storage updates form **one** undo step. Use **`pause` / `resume`** around drags or multi-field edits so intermediate ticks don’t flood the stack.

#### Document-level snapshot and restore

- Use Liveblocks’ **document-level** mechanisms to **capture the full Room Storage** for a packing list room and **restore** the collaborative document to a prior snapshot (e.g. organizer “restore this version,” disaster recovery, or reconciling after a bad bulk edit).
- **Authorization:** Only **organizers** for the event (`canManageEvent` or equivalent) may **run document snapshot restore** (server-side or dashboard flow that writes Storage). Participants may use **per-user `room.history` undo** only for edits they are allowed to make (primarily **sign-up / packed** changes, not template edits—§3.1). They **cannot** roll back the whole shared document to a saved snapshot.
- Implementation should follow the current Liveblocks stack for this repo (**`@liveblocks/node`**, REST storage APIs, JSON Patch, or dashboard/versioning features—**exact APIs and plan limits depend on Liveblocks version and subscription**; keep integration behind a thin adapter and document the chosen approach in code).
- **Relationship to DB:** After a restore, run the existing **sync to Postgres** (`persistPackingListItems`) so the database matches the restored Storage (same as today after any authoritative room change).

#### What this replaces

- **No** server-side “inverse mutation” undo for normal collaborative edits.
- **Optional** UI copy for undo: describe actions in product terms (“Undo your last edit”) without implying a global time machine across participants.

### 3.3 Confirmed delete (shared item)

**Behavior:**

- **Organizer** initiates remove on a shared `PackingItem` → open **modal** (or two-step) with consequences: “This removes the item and all sign-ups for it.”
- On confirm: apply the delete in **Liveblocks Storage** (within `room.batch` if it should undo as one step with local history), sync to DB, and optionally append **`ITEM_DELETE`** to an optional server-side audit log if implemented.

**Recommendation:** Prefer **soft delete** in Postgres (`deletedAt`, `deletedBy`) if you need queries to include “removed items” in history; **in-room undo** of a delete is still the user’s **`room.history.undo`** if the delete was their recent local operation. **Coarse restore** of an older document state uses **snapshot/restore** (§3.2), not Postgres soft delete alone.

### 3.4 Personal packing list

**New table: `PersonalPackingItem`**

- `id`, `eventId`, `userId`
- `name`, optional `section`, `quantity` (int), `sortOrder`
- `packed` (boolean) — personal checklist
- **Provenance:** `sourceSuggestionId` nullable FK → links back if copied from a suggestion
- `createdAt`, `updatedAt`

Scoped by **event + user**. Not shared via Liveblocks unless you explicitly add CRDT later (v2 can be **server actions + revalidate** first).

**Access:** Only **signed-in** Rendecrew users may have a **full** personal list (create, update, delete rows, set quantities, mark packed, copy from suggestions). **Anonymous / guest** sessions **do not** get persisted personal rows—server actions must require an authenticated `userId`. Guests may still **open the packing list** (view the shared template, manage sign-ups per §3.1) and view suggestions per §6.

### 3.6 Suggested items catalog

**New table: `PackingSuggestion`**

- `id`, `eventId` (or `packingListId` if 1:1 — recommend `eventId` for clarity)
- `name`, optional `section`, optional `defaultQuantity`
- `status`: `DRAFT_USER` | `PUBLISHED` | `REJECTED` | `ARCHIVED`
- `createdByUserId`, `reviewedByUserId` nullable, `reviewedAt`
- `createdAt`, `updatedAt`

**Admin** = existing event manage permission (`canManageEvent` / same as packing enable).

**Per-event admin configuration (suggestion approval):**

- Add a boolean on **`Event`** (or a small settings row), e.g. **`suggestionApprovalRequired`**, set by organizers.
- **`suggestionApprovalRequired === true`:** User-submitted suggestions are created as **`DRAFT_USER`** and are **not** visible in the public suggested catalog until an organizer **approves** → **`PUBLISHED`** (or **`REJECTED`** / **`ARCHIVED`**).
- **`suggestionApprovalRequired === false`:** New user suggestions can become **`PUBLISHED` immediately** (still record `createdByUserId` for attribution). Organizers may still edit or archive items later.

**Default:** **`false`** for new events (suggestions can publish without a review step unless an organizer turns approval on).

**View vs edit:**

- **Anyone** (including guests) may **view** the **published** suggested-items catalog for an event (read-only UI: browse names, sections, default quantities).
- **Editing** the catalog (create admin defaults, approve/reject, change status, delete) requires **organizer** permissions. **Submitting** a new suggestion from a participant is expected to require **sign-in** so proposals are attributable; guests do not submit suggestions.

**User suggest flow (signed-in participants):**

- Submit suggestion → if approval required → **`DRAFT_USER`** until approved; else → **`PUBLISHED`** per setting above.
- Organizer approves → **`PUBLISHED`** when applicable.

**“New suggested items” presentation:**

- Track **`UserSuggestionState`**: `userId`, `eventId`, `lastSeenSuggestionCatalogAt` or per-suggestion `dismissedAt` / `seenAt`.
- Items with `status = PUBLISHED` and `createdAt > lastSeen` (or not yet “acknowledged”) surface as **New**.

**Not yet on personal list:**

- Query: all `PUBLISHED` suggestions where no `PersonalPackingItem` exists for this user with matching `sourceSuggestionId` (or fuzzy match by name if you allow duplicate copies—prefer stable FK).

**Copy to personal:**

- Server action: create `PersonalPackingItem` with `quantity` initial value from suggestion’s `defaultQuantity` or user-chosen value at copy time; set `sourceSuggestionId`.
- After copy, **personal row is independent**: edits to `PackingSuggestion` do not retro-change personal quantities (only optional “admin updated suggestion—see notice” if you add that later).

### 3.7 Combined “my packing” view

**Derived read model** (no new table required):

1. **Group commitments:** reuse `listPackingCommitmentsForUser` shape—items + quantities user signed up for on shared list (requires identity link to sign-ups; guests use shared list without this merged view or see group-only UI).
2. **Personal items:** `PersonalPackingItem` for same `eventId` + `userId` — **signed-in only**; omit section or prompt sign-in for guests.
3. **Merge for display:** two sections or one list with **badges**: `Personal` vs `Group commitment`, optional grouping by section.

**Packed state:**

- Group: existing sign-up `packed`.
- Personal: `PersonalPackingItem.packed`.

## 4. APIs and server responsibilities

### 4.1 Shared list sync (Liveblocks → DB)

**Today:** `syncPackingListToDatabase` / `persistPackingListItems` applies full item/sign-up state.

**Updates:**

- **Undo/redo** stays in the **Liveblocks client** (§3.2); the server does not implement Storage undo.
- **`persistPackingListItems`** (or equivalent) must **reject template mutations** from sessions that are not organizers for the list’s event (§3.1), comparing incoming payload to the prior DB snapshot or using explicit mutation tagging.
- On sync, optionally **diff** the previous DB snapshot vs the incoming payload to feed an optional **`PackingListChange`** audit table for durable activity feeds.
- After **document snapshot restore** (§3.2), run a full **sync** so Postgres matches Storage.

### 4.2 New server actions (illustrative)

- `deletePackingItemWithConfirmation(...)` — **organizers only**; confirm modal client-side; server validates role.
- Optional: `listPackingHistory(packingListId, cursor)` if an audit log is implemented.
- Optional: `restorePackingListStorageFromSnapshot(...)` — **organizers only**; verify event permission, then delegate to Liveblocks REST/node helper and trigger sync.
- CRUD for `PersonalPackingItem` — **signed-in users only** (`userId` from session).
- `suggestPackingItem` — **signed-in**; respects `Event.suggestionApprovalRequired`.
- `moderatePackingSuggestion`, update `suggestionApprovalRequired` — **organizers only**.
- `copySuggestionToPersonal`, `markSuggestionsSeen` — **signed-in** (personal list features).
- **Read-only** queries for published `PackingSuggestion` lists may be exposed to **guest** contexts (event page, share links) without personal-list mutations.

Packing room remains unguessable for guests—**guest identity** for optional audit logging may use signed cookie session id.

## 5. UI/UX

| Area | Behavior |
|------|-----------|
| Shared editor | **Organizers:** full template edit (add/reorder rows, edit item fields, delete with **modal**). **Participants:** read-only template + **sign-up** UI for own rows; no structural controls. Optional audit log on deletes. |
| Sign-up | Removing self → optional short confirm if quantity large; optional `SIGNUP_REMOVE` in audit log |
| History | **Activity feed** from optional server audit log, grouped/batched; filter by “sign-ups only” |
| Undo / redo | **Liveblocks** `room.history` — **organizers** undo template edits; **participants** undo their own sign-up/packed edits only (§3.1) |
| Restore version | **Document snapshot/restore** (§3.2) for whole-list rollback — **organizers only**; separate from per-user undo |
| Suggestions | Signed-in: **New**, **All available**, copy to personal. **Guests:** read-only catalog of **published** suggestions (no personal list, no submit). |
| Combined | Dashboard/event page route e.g. “My packing” merging both sources |

## 6. Permissions

| Action | Who |
|--------|-----|
| **Edit shared list template** (items, sections, quantities, reorder, add/remove rows) | **Organizers only** |
| Sign up / remove own sign-up; edit own sign-up quantity; toggle own **packed** | Anyone with packing access (including guests where sign-ups are allowed today) |
| **View** published suggested-items catalog | **Anyone** with access to the event context (including **guests**) — **read-only** |
| **Submit** a new suggestion | **Signed-in** participants (not guests) |
| **Approve / reject / edit / archive** suggestions; **set** `suggestionApprovalRequired` | Organizers (`canManageEvent` or equivalent) |
| **Personal packing list** (full CRUD, copy from suggestion, packed state) | **Signed-in** user only (owner’s rows). **Guests:** no persisted personal list |
| **Document snapshot restore** (whole Storage rollback) | **Organizers only** — not available to participants who only have the packing link |

## 7. Real-time (Liveblocks) notes

- **`/api/liveblocks-auth`** (or successor) should issue **organizer** sessions **full** room access for Storage mutation and **participant** sessions **restricted** access if the Liveblocks plan/API supports it; otherwise rely on **server-side rejection** in `persistPackingListItems` for template changes (§3.1, §4.1).
- **Per-user undo/redo** is **client-local** by design: each collaborator has their own `Room.history` stack; this matches Liveblocks’ multiplayer model (you do not undo other people’s edits).
- **`room.history` resets on reload** — durable “version history” for the team requires **snapshot/restore** and/or an **optional server audit log**, not the in-memory undo stack alone.
- Use **`room.batch`** and **`pause` / `resume`** so undo steps match user intent (single delete, single drag, etc.).
- After **snapshot restore** or any server-initiated Storage mutation, ensure **clients reconcile** (Liveblocks propagates updated Storage) and **Postgres sync** runs.

## 8. Migration

1. Add `Event.suggestionApprovalRequired` (or equivalent), default **`false`**. Add new tables: optional `PackingListChange`, `PersonalPackingItem`, `PackingSuggestion`, optional `UserSuggestionState`.
2. Add `deletedAt` to `PackingItem` if using soft delete for server-side history queries.
3. Wire **Liveblocks** `useHistory` / `room.history` and document **snapshot/restore** integration; optional backfill `BASELINE` audit entry from current DB rows.

## 9. Performance and limits

- If using an optional `PackingListChange` audit table: index `(packingListId, seq)`; cap `payload` size; retain audit history for N days or last M entries (config).
- Index `(eventId, userId)` on personal items, `(eventId, status)` on suggestions.

## 10. Testing

- Unit: `persistPackingListItems` validation; **reject template mutations from non-organizers**; optional diff → audit log emission; quantity cap conflicts.
- Liveblocks: `room.batch` produces one undo step; `pause`/`resume` collapses drags; `undo` only affects local mutations.
- Integration: confirmed delete → Storage + DB consistent; snapshot restore → DB matches Storage; **non-organizer** cannot invoke restore.
- E2E: suggest → approve → appears as new → copy → quantity edit independent.
- Access: guest can open published suggestions **read-only**; signed-in user can CRUD personal list; approval-required vs auto-publish paths.
- **Non-organizer** cannot persist template changes (items/sections/quantities/reorder); can persist own sign-up changes.
