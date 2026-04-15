# Event rides board (technical specification)

## 1. Purpose

Add an **optional rides board** to events to coordinate **drivers**, **cars**, and **passengers** for **To Event** and **From Event** directions. The rides board is enabled/disabled per event, appears as a **Rides** tab when enabled, and enforces that a member can only be assigned to **one car per direction**.

Primary surfaces: event detail UI (tabs), event settings, and a new Rides board view (table rows with inline expand similar to the reference screenshot).

## 2. Current behavior (baseline)

- Events have no rides coordination feature.
- There is no domain model for cars, directional trip info, or passenger sign-ups.

## 3. Functional requirements (authoritative)

| ID   | Requirement |
| ---- | ----------- |
| FR-1 | An event can **enable** / **disable** rides from **Event Settings** (admins only). When enabled, the event shows a **Rides** tab. |
| FR-2 | A **car** has mandatory fields: **Driver** (an event member) and **Number of passengers** (capacity, can be 0). |
| FR-3 | A car has optional fields: **Make/model**, **Fun car name** with fallback display name: if fun name missing, show “Driver’s Make Model”; if make/model missing too, show “Driver’s car”. |
| FR-4 | A car can apply to **To Event**, **From Event**, or **both** (two booleans). The UI shows **two lists**: To Event cars and From Event cars. |
| FR-5 | **To Event** info fields (all optional): **From**, **Departs**, **Arrives**, **Notes**. |
| FR-6 | **From Event** info fields: **Departs**, **Arrives**, **To**, **Notes**. (Fields may be left blank; the direction itself is controlled by the car’s booleans.) |
| FR-7 | All times default to the **event timezone**, but the user can change the timezone used for display and editing. |
| FR-8 | A member can only be in **one To Event car** and **one From Event car** (drivers count as being “in a car” for that direction). |
| FR-9 | Creating cars: there is an **Add Car** button; the create form has **two tabs** (To Event Info / From Event Info). Any event member can **add** a car (driver can be self or another member). Any event member can **delete** a car (must confirm). |
| FR-10 | If a car is deleted “in one direction”, ask if the user also wants to delete it in the other direction. |
| FR-11 | Signing up: any event member can sign up **self** or **another member** into a car, and can also remove **self** or **another member**. When adding/removing a member, ask whether to also add/remove in the other direction if the car drives both ways and the member’s other-direction state allows it. |
| FR-12 | View: cars render as **table rows** with an **inline expand** to show names/details, like the reference screenshot. Also show who **still needs a ride** for To Event and From Event (members not assigned for that direction). |

## 4. Domain model

### 4.1 Conceptual model

- **Rides board**: an event-level capability flag `ridesEnabled`.
- **Ride car**: one logical car with a driver, capacity, display metadata, and two directional “legs” (To Event / From Event).
- **Directional leg**: the trip metadata that differs by direction (depart/arrive/from/to/notes).
- **Seat assignment**: membership of a specific event member in a specific car for a specific direction.

Key invariants:

- **One-car-per-direction per member** (FR-8), including drivers.
- **Capacity** limits passengers per direction (capacity excludes driver).
- Directional legs can be enabled independently and can share the same base car metadata.

### 4.2 Proposed Prisma schema additions

Add an event setting flag:

- `Event.ridesEnabled Boolean @default(false) @map("rides_enabled")`

Introduce rides tables. Names are illustrative; follow existing snake_case mapping conventions.

Enums:

- `enum RideDirection { TO_EVENT FROM_EVENT }`

Models:

- `EventRideCar`
  - `id String @id @default(uuid())`
  - `eventId String @map("event_id")`
  - `driverEventMemberId String @map("driver_event_member_id")`
  - `passengerCapacity Int @map("passenger_capacity")` (>= 0; excludes driver)
  - `makeModel String? @map("make_model")`
  - `funName String? @map("fun_name")`
  - `toEventEnabled Boolean @default(false) @map("to_event_enabled")`
  - `fromEventEnabled Boolean @default(false) @map("from_event_enabled")`
  - `toEventFrom String? @map("to_event_from")`
  - `toEventDepartsAt DateTime? @map("to_event_departs_at")`
  - `toEventArrivesAt DateTime? @map("to_event_arrives_at")`
  - `toEventNotes String? @map("to_event_notes")`
  - `fromEventTo String? @map("from_event_to")`
  - `fromEventDepartsAt DateTime? @map("from_event_departs_at")`
  - `fromEventArrivesAt DateTime? @map("from_event_arrives_at")`
  - `fromEventNotes String? @map("from_event_notes")`
  - `createdAt DateTime @default(now()) @map("created_at")`
  - `updatedAt DateTime @updatedAt @map("updated_at")`
  - Relations:
    - `event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)`
    - `driver EventMember @relation(fields: [driverEventMemberId], references: [id], onDelete: Cascade)`
    - `seats EventRideSeat[]`
  - Indexes:
    - `@@index([eventId])`
    - `@@index([eventId, driverEventMemberId])`
    - `@@map("event_ride_cars")`

- `EventRideSeat`
  - `id String @id @default(uuid())`
  - `eventId String @map("event_id")` (denormalized for fast unique constraints)
  - `carId String @map("car_id")`
  - `eventMemberId String @map("event_member_id")`
  - `direction RideDirection`
  - `createdAt DateTime @default(now()) @map("created_at")`
  - Relations:
    - `car EventRideCar @relation(fields: [carId], references: [id], onDelete: Cascade)`
    - `eventMember EventMember @relation(fields: [eventMemberId], references: [id], onDelete: Cascade)`
  - Constraints:
    - `@@unique([eventId, eventMemberId, direction])` (enforces FR-8)
    - `@@index([carId, direction])`
    - `@@map("event_ride_seats")`

#### Why `EventRideSeat` is needed

The “one car per direction” constraint is simplest and safest as a database uniqueness rule on `(eventId, memberId, direction)`. It also naturally supports “needs ride” queries by direction.

### 4.3 Derived display name

`displayName(car)` (client derived; not stored):

1. If `funName` present → use it.
2. Else if `makeModel` present → `"{driverFirstName}’s {makeModel}"`
3. Else → `"{driverFirstName}’s car"`

Note: driver display name should come from the associated `User.name` for the driver’s `EventMember`.

## 5. Timezone behavior

### 5.1 Storage

- Store times as `DateTime` in Postgres (timestamptz) and treat them as **absolute instants**.
- The event has a default IANA timezone (`Event.timezone`) used as the default display/edit zone.

### 5.2 Display + editing

- Default timezone selection for the rides board is `Event.timezone`.
- Users may change a **timezone selector** in the rides UI; this affects:
  - How times are displayed in rows and expanded details
  - How date/time inputs interpret typed values
- Persistence of the user’s chosen timezone:
  - v1: store in **client local storage** keyed by `eventId` (fast, no schema changes).
  - Optional later: store as a per-user-per-event preference.

## 6. UI / UX specification

### 6.1 Navigation and settings

- **Event Settings** (admins only) includes a toggle:
  - **Enable rides** → sets `Event.ridesEnabled = true`
  - **Disable rides** → sets `Event.ridesEnabled = false`
- When `ridesEnabled === true`, show a **Rides** tab in the event UI.
- When disabled, hide the tab. Data retention:
  - v1: disabling rides **does not delete** cars or sign-ups; it only hides UI and blocks rides endpoints (see §7). Re-enabling restores previous state.
  - UI copy should warn that disabling hides rides coordination.

### 6.2 Rides board layout

The rides board has two main sections:

- **To Event**
  - Cars list (table)
  - “Needs a ride” list (members not assigned to any To Event car, and not driving a To Event car)
- **From Event**
  - Cars list (table)
  - “Needs a ride” list for From Event

Each car renders as a **single row** in the table for that direction, with:

- **Car / Driver**: display name + driver name
- **From / To**: per direction (To Event shows “From”; From Event shows “To”)
- **Departs / Arrives**
- **Passengers**: seat avatars indicating filled vs open seats (capacity), matching the reference screenshot’s “filled/open seats at a glance”
- **Actions**: sign up / manage menu (expand row or inline controls)

Expanding the row reveals:

- Passenger name list (for that direction)
- Directional notes
- Controls to add/remove passengers (self or other member)
- Controls to edit car info (see §6.4)

Reference UI: see attached screenshot asset at `assets/Screenshot_2026-04-15_at_1.38.03_PM-930c8965-8f63-4563-a873-297d5c82cecf.png`.

### 6.3 “Needs a ride” definition

For a given direction \(d\):

- A member **has a ride** if either:
  - They are the driver of a car with that direction enabled, or
  - They have an `EventRideSeat` row for \(d\)
- “Needs a ride” list is:
  - `all event members` minus `members who have a ride for d`

If the product later needs “opting out / I don’t need a ride”, add an explicit per-member-per-direction status (out of scope for v1).

### 6.4 Add Car / Edit Car flow

- **Add Car** button is visible to any event member.
- The create/edit form includes:
  - Base info: Driver (event member), passenger capacity, make/model, fun name
  - Two tabs:
    - **To Event Info**: enabled toggle + from/departs/arrives/notes
    - **From Event Info**: enabled toggle + to/departs/arrives/notes
- Validation:
  - Capacity must be an integer >= 0
  - Driver must be an event member
  - At least one direction should be enabled for a newly created car (otherwise the car is not visible anywhere)
- Conflict handling:
  - If setting the driver for a direction would violate FR-8 (driver already assigned for that direction), show a clear error and do not save.

### 6.5 Delete semantics

Deletion is confirmation-gated.

Two user intents exist:

1. **Delete the entire car**: removes the `EventRideCar` row and all `EventRideSeat` rows.
2. **Delete one direction** (e.g. “remove To Event leg”):
   - Clears the leg fields for that direction, sets that direction enabled flag to false
   - Deletes all seats for that direction (including driver’s implicit “has a ride” status comes from being the driver; driver remains the driver of the car but no longer “has a ride” for that direction because the direction is disabled)
   - If both directions are now disabled, delete the whole car

When a user deletes one direction and the other is enabled, prompt:

- “Also delete the other direction?” (FR-10)

### 6.6 Passenger sign-up / removal

Operations:

- **Add passenger** (self or another member) to a specific car and direction
  - Must respect uniqueness constraint (FR-8) and capacity
- **Remove passenger** (self or another member) from a specific car and direction

Cross-direction prompt (FR-11):

- If the car drives both directions:
  - On add: ask whether to also add the member to the other direction, if they are not already assigned elsewhere for that direction and there is capacity.
  - On remove: ask whether to also remove the member from the other direction if they are currently in this car for that other direction.

## 7. APIs and server responsibilities

### 7.1 Authorization

All rides endpoints require:

- Caller is signed in and is an `EventMember` for the event (consistent with “choose a member from the event” flows).
- Additionally, `Event.ridesEnabled === true` for read and write (except admin can toggle enable/disable).

Settings:

- Toggle rides enable/disable: admins only (reuse existing `canManageEvent` semantics from roles spec).

Cars and seats:

- Any event member can create/update/delete cars and add/remove passengers (per FR-9, FR-11).

### 7.2 Proposed server actions / routes (illustrative)

- `setEventRidesEnabled(eventId, enabled)` (admin only)
- `listEventRides(eventId)` → returns cars + seats + enough member info to render driver/passenger names and avatars
- `createRideCar(eventId, payload)` / `updateRideCar(carId, payload)` / `deleteRideCar(carId)`
- `disableRideCarDirection(carId, direction)` (direction delete semantics, §6.5)
- `addRideSeat(eventId, carId, direction, eventMemberId)` / `removeRideSeat(eventId, carId, direction, eventMemberId)`

### 7.3 Server-side validation (must be enforced server-side)

- Reject all mutations if rides are disabled for the event.
- **FR-8** uniqueness: rely on DB constraint and map unique-violation errors to a user-friendly message (“That member is already in another car for To Event/From Event.”).
- Capacity: enforce `count(seats where carId+direction) <= passengerCapacity`.
- Driver membership: ensure `driverEventMemberId` belongs to the same event.
- Visibility: only return rides data to event members.

## 8. Queries and performance

Recommended read pattern for the board:

- Query `EventRideCar` by `eventId` including:
  - driver `EventMember` → `User` (name/avatar)
  - seats filtered/grouped by direction, including passenger `EventMember` → `User`
- Indexing listed in §4.2 should support:
  - Listing cars per event
  - Listing seats per car+direction
  - “Needs a ride” computation using `EventRideSeat` uniqueness + “drivers in enabled cars” sets

## 9. Migration

1. Add `Event.ridesEnabled` column (default false).
2. Create tables `event_ride_cars` and `event_ride_seats`.
3. No backfill required for existing events.

## 10. Testing

- **Unit**
  - `displayName` fallback logic
  - “needs ride” computation per direction
  - validation: capacity bounds, driver belongs to event
- **Integration**
  - uniqueness (member can’t be added to two cars for same direction)
  - capacity enforcement (can’t exceed passengerCapacity)
  - direction delete semantics clears seats for that direction and optionally deletes car when both disabled
  - rides disabled blocks reads/writes (except toggling by admins)
- **E2E**
  - create car with both legs, sign up passenger, cross-direction prompt behavior, remove passenger with cross-direction prompt
  - two lists (To Event / From Event) render correctly and expand shows details

## 11. Rollout notes

- Ship schema + server-side authorization/validation before UI.
- Add the Settings toggle (admins only), then Rides tab gated by `ridesEnabled`.
- Consider feature-flagging in addition to `ridesEnabled` if a staged rollout is desired.

