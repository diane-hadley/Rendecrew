# Event rides board (technical specification)

## 1. Purpose

This document specifies an **optional per-event rides coordination** feature: a **Rides** tab where members organize **cars**, **drivers**, and **passengers** for travel **to** the event, **from** the event, or **both** under a single car when the event does not use separate outbound and return boards.

**Goals:** reduce coordination friction, make **capacity** and **gaps** obvious, and enforce **membership-scoped** rules (who can ride with whom, one car per leg, and clear “still needs a ride” visibility).

**Implementation:** Prisma (`Event`, `EventMember`, new rides models), server mutations for rides, and `components/events/EventDetailClient.tsx` (**Rides** tab with Overview, Members, Settings).

**Related:** `docs/specs/0003-event-roles-and-settings.md`. **Drivers and passengers are always event members.** Custom field **definitions** are **admin-only** (FR-10).

---

## 2. Functional requirements (authoritative)

| ID    | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-1  | Rides are **optional per event**. **Only admins** (`creator` / `admin`) may **enable** or **disable** rides for an event. When disabled, the event UI has **no** Rides tab (or the tab is hidden). When enabled, the event shows a **Rides** tab as the main rides surface.                                                                                                                                                                                            |
| FR-2  | When rides are enabled, an **admin** configures **one board mode**: **unified** (same car roster for both directions) or **split** (separate coordination for **to the event** vs **from the event**). **Split mode is optional**; unified mode must remain supported.                                                                                                                                                                                                 |
| FR-3  | A **car** always has **mandatory** fields: **driver** (must be an **event member**), **passenger capacity** (integer **≥ 0**, meaning “number of passenger seats offered,” excluding the driver).                                                                                                                                                                                                                                                                      |
| FR-4  | **Optional built-in** car fields: **make/model**; **fun car name**; **notes**; and **direction-specific** fields when applicable (see §3.3). **Display name** for a car follows §4.2 when fun name or make/model are absent.                                                                                                                                                                                                                                           |
| FR-5  | **Datetime fields** (depart/arrive, etc.) **default** to the event’s **IANA timezone** (`Event.timezone` today). The UI **may override** timezone **per car** or **per datetime** (implementation choice—see §5.2); stored instants must be unambiguous (UTC + tz metadata as needed).                                                                                                                                                                                 |
| FR-6  | The **driver** is **one event member** attached to the car (not a free-text name). Changing the driver reassigns that role on the car; validation must keep **one driver per car**.                                                                                                                                                                                                                                                                                    |
| FR-7  | **Unified mode:** an event member may appear in **at most one car** in any capacity (**driver** or **passenger**) for that event’s rides board.                                                                                                                                                                                                                                                                                                                        |
| FR-8  | **Split mode:** each car has a **direction coverage** of **`BOTH`**, **`TO_EVENT`**, or **`FROM_EVENT`**, defaulting to **`BOTH`** when created. **Signup for “there”** and **signup for “back”** are **independent** for members and for capacity: the UI shows **Rides there** and **Rides back** as **separate** sections. A member may be in **at most one car for the outbound leg** and **at most one car for the return leg** (different cars allowed per leg). |
| FR-9  | **Any event member** may: **create a car** with themselves **or another member** as driver; **add** themselves or another member as a **passenger** on a car (subject to capacity and FR-7/FR-8); **remove** themselves or another member from a car; **delete** a car, after **explicit confirmation** in the UI (destructive action).                                                                                                                                |
| FR-10 | **Admins** (`creator` / `admin` per `EventMemberRole`) may **define custom fields** on the rides board (**text**, **number**, **boolean**) and **remove** custom field definitions. Admins may also **hide** (disable) **irrelevant built-in optional** fields so they are not shown or edited on cars (see §3.6). **Members** use the configured field set but do not change schema.                                                                                  |
| FR-11 | The board must make **capacity obvious**: which cars have **remaining passenger seats** and which are **full** (driver + assigned passengers ≥ capacity, treating capacity as **maximum passengers**, not including the driver).                                                                                                                                                                                                                                       |
| FR-12 | The board must show **who still needs a ride**: event members **not** assigned for the relevant **leg** (in unified mode: not driver and not passenger on any car; in split mode: separate lists or clearly labeled columns for **needs ride there** / **needs ride back** when a member is missing that leg).                                                                                                                                                         |
| FR-13 | Cars are listed in a **manually controlled order**. Any event member may **drag and drop** to reorder cars; order is **persisted** (see §3.2 `sortOrder`).                                                                                                                                                                                                                                                                                                             |

Sections **3–6** elaborate **data shape**, **validation**, **implementation**, and **acceptance tests**. They do **not** add requirements beyond **FR-1–FR-13**.

---

## 3. Domain model (proposed)

> Naming is illustrative; align with existing Prisma conventions (`@map`, `onDelete`, indexes).

### 3.0 Modes and mode changes

**Switching** `ridesMode` (unified ↔ split) is **destructive or lossy** unless a migration is defined. **v1:** allow switching **only when the board is empty**, or require **admin** confirmation with a clear warning.

### 3.1 Event-level rides configuration

Persist on `Event` (preferred) **or** a 1:1 `EventRidesBoard` row:

| Field                             | Type                                  | Description                                  |
| --------------------------------- | ------------------------------------- | -------------------------------------------- |
| `ridesEnabled`                    | `Boolean`                             | FR-1                                         |
| `ridesMode`                       | enum `RIDES_UNIFIED` \| `RIDES_SPLIT` | FR-2                                         |
| `ridesBoardVersion` / `updatedAt` | optional                              | optimistic concurrency (future); v1 can omit |

### 3.2 Car

| Field                            | Type                                      | Notes                                                                                                         |
| -------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `id`                             | UUID                                      | Primary key                                                                                                   |
| `eventId`                        | FK → `Event`                              | Cascade delete with event                                                                                     |
| `driverEventMemberId`            | FK → `EventMember`                        | FR-6; must belong to same `eventId`                                                                           |
| `passengerCapacity`              | `Int`                                     | FR-3, ≥ 0                                                                                                     |
| `direction`                      | enum `BOTH` \| `TO_EVENT` \| `FROM_EVENT` | FR-8; when `ridesMode === UNIFIED`, store `BOTH` and ignore for uniqueness (use `leg` on passengers—see §3.4) |
| `sortOrder`                      | `Int`                                     | FR-13; stable ordering after DnD (gapless or fractional—implementation detail)                                |
| **Optional built-ins**           | nullable strings / datetimes              | Per §3.3; make/model, fun name, notes; departure location; datetimes                                          |
| **Per-field timezone overrides** | optional strings (IANA)                   | §5.2; null = event default                                                                                    |

**Indexes:** `[eventId]`, `[eventId, direction]` (split), `[eventId, sortOrder]` (listing).

### 3.3 Built-in optional fields (direction)

Cars store nullable columns for: **departure location**; **departure datetime** (toward event); **expected arrival at event**; **departure from event** datetime; **expected arrival home**; **returning-to** (destination). Which inputs appear in the UI depends on **`ridesMode`** and the car’s **`direction`** (FR-2, FR-8); omit or read-only where a leg does not apply (e.g. return-only car: no “arrival at event” requirement unless product says otherwise).

**`BOTH` cars in split mode:** do not require duplicate stored values for one logical fact; if one UI section collects “home arrival,” store once and surface in both sections as needed—the model must not force contradictory duplicates.

### 3.4 Passenger assignments

Separate join table (recommended), e.g. `EventRidePassenger`:

| Field           | Type                                         | Notes                                                         |
| --------------- | -------------------------------------------- | ------------------------------------------------------------- |
| `id`            | UUID                                         |                                                               |
| `carId`         | FK                                           | Cascade with car                                              |
| `eventMemberId` | FK → `EventMember`                           | Same event as car                                             |
| `leg`           | enum `UNIFIED` \| `TO_EVENT` \| `FROM_EVENT` | Unified: `UNIFIED`. Split: `TO_EVENT` / `FROM_EVENT` for FR-8 |

**Uniqueness:** unified: at most one row per `(eventMemberId)` with `leg = UNIFIED` (e.g. `@@unique([eventMemberId, leg])` or partial unique index). Split: at most one row per `(eventMemberId, leg)` for `leg ∈ {TO_EVENT, FROM_EVENT}`.

**Alternative** `toCarId` / `fromCarId` on `EventMember`: simpler reads, weaker normalization—**prefer join table**.

### 3.5 Admin-configurable field definitions

`EventRideCustomFieldDefinition`: `id`, `eventId`, `label`, `type` enum `TEXT` \| `NUMBER` \| `BOOLEAN` (FR-10), `sortOrder`, `required` (default false unless product dictates).

`EventRideCustomFieldValue`: `id`, `fieldDefinitionId` (cascade on definition delete), `carId`, typed value columns or validated JSON—pick one; Prisma often uses nullable typed columns + SQL check constraint.

**v1:** deleting a definition **cascades** values.

### 3.6 Built-in field visibility

Do **not** drop DB columns. Store per-event hidden keys (JSON enum list or bitflags): `MAKE_MODEL`, `FUN_NAME`, `NOTES`, `DEPARTURE_LOCATION`, … Members’ forms **omit** hidden fields. On re-enable, keep or clear stale values—product choice; note in release notes.

---

## 4. Business rules and validation

**Authorization:** follows **FR-1**, **FR-9**, **FR-10**—**server-side** via `EventMember` for actor and targets on the same `eventId`. Admins: enable/disable rides, mode, custom fields, hidden built-ins. Any member: view (when enabled), car CRUD, passengers, driver changes, reorder, delete car (with confirm).

### 4.1 Capacity (FR-3, FR-11)

- **`passengerCapacity`:** max **passenger** seats (**0** = driver-only, full for passengers immediately).
- **Occupied:** **unified** — count all passenger rows on the car. **Split** — when validating or displaying a leg, count passenger rows on that car with that `leg` (`TO_EVENT` or `FROM_EVENT`). **Remaining** = `passengerCapacity − occupied`, clamped ≥ 0 for display.
- **Driver** does not consume a passenger seat. Same `EventMember` must **not** be both driver and passenger on the **same** car.
- Reject new passenger if `occupied >= passengerCapacity`. Prefer **reject** (clear error) if lowering capacity below current occupancy.

### 4.2 Car display name (FR-4)

Let `driverName` be the driver’s display name (same as Members tab).

1. Fun car name present → use it.
2. Else make/model → `{driverName}’s {makeModel}` (apostrophe per app typography).
3. Else → `{driverName}’s car`.

### 4.3 Driver change

- New driver must be an event member. If they are a passenger on **this** car: **reject** (simpler than auto-clear).
- If they are a passenger on **another** car (same leg in split): **reject** in v1 (no auto-remove).

### 4.4 Membership removal

If an `EventMember` leaves the event:

- **Driver:** do not null the driver. **Recommendation:** **block** removal until they are not driving any car (UI → Rides); admin may **delete** those cars first (any member can delete a car).
- **Passenger rows:** `onDelete: Cascade` from `EventMember` or delete in the same transaction.

### 4.5 “Needs a ride” (FR-12)

Per relevant **leg**: **driver** on a car whose `direction` covers that leg counts as covered; **passenger** row on that leg on such a car counts. Everyone else appears on the **needs ride** list for that leg. **Unified:** one list.

---

## 5. Implementation notes

### 5.1 Split UI layout

**Getting there** vs **Heading home:** list cars whose `direction` is in `{BOTH, TO_EVENT}` vs `{BOTH, FROM_EVENT}`. `BOTH` cars appear in **both** (same `carId`) with **leg-specific** passenger controls. Sort by **`sortOrder`** in each list; dragging in one section updates **global** order.

### 5.2 Timezones (FR-5)

Store **timestamptz** (UTC). Default zone = `Event.timezone`. Optional per-car or per-field IANA strings; on write, wall time + zone → UTC.

---

## 6. Acceptance criteria (testable)

1. Rides **off** → **no** Rides tab (or equivalent).
2. **Unified:** passenger on car B **fails** if already driver or passenger on car A.
3. **Split:** same member may be outbound on A and return on B; **cannot** be on two outbound cars.
4. **Capacity 0:** car **full** for passengers; no passenger adds.
5. Display name matches §4.2 for all three branches.
6. **Needs ride** updates when the last assignment for a leg is removed.
7. Non-members cannot read or mutate rides (same as event access).
8. **Delete car:** UI confirmation; server rejects unauthenticated / non-member.
9. Non-admin cannot set `ridesEnabled`.
10. After DnD reorder, refresh preserves **new** `sortOrder` order.

---

## 7. Implementation checklist

**Server (illustrative):** `getEventRidesBoard` (config, cars, assignments, custom defs/values, derived needs-ride); `createCar` / `updateCar` / `deleteCar` (member; delete with `confirm: true` or idempotency); `addPassenger` / `removePassenger` / `setDriver`; `updateRidesSettings` (admin-only; **`ridesEnabled`** not writable by members); `reorderCars`; `upsertCustomFieldDefinition` / `deleteCustomFieldDefinition` (admin). Structured errors, e.g. `CAPACITY_FULL`, `DUPLICATE_LEG_ASSIGNMENT`, `INVALID_DIRECTION`, `TARGET_NOT_MEMBER`, `FIELD_HIDDEN`.

**Out of scope for v1:** audit/activity logs; realtime collab (server actions + revalidate is enough).

- [ ] Prisma models + migration + indexes/uniques for leg assignments.
- [ ] Server-side validation (capacity, uniqueness, direction vs mode).
- [ ] `EventDetailClient` Rides tab + section components.
- [ ] Admin UI: custom fields, hide built-ins, enable/disable rides, board mode.
- [ ] DnD car ordering + reorder mutation.
- [ ] Tests: uniqueness, capacity, mode switch constraints, membership cascade, sort persistence.
