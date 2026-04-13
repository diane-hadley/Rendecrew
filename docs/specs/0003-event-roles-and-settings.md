# Event membership, roles, and event settings (technical specification)

## 1. Purpose

This document specifies how **event membership and roles** evolve so that **creator**, **admin**, and **member** are explicit product concepts with the right capabilities; how **event-level settings** (member management policy, packing list visibility) are stored and enforced; and how the **event dashboard UI** surfaces **Members** and **Settings** alongside the main event experience.

**Preview-era constraints (see §4.4):** event members can **only** be **existing** Rendecrew users (no add-by-email for people without accounts). **New** platform accounts are onboarded **only** by a **single designated preview operator** until preview ends.

**Primary surfaces today:** `prisma/schema.prisma` (`Event`, `EventMember`), `lib/events.ts` (`getEventForUser`, `canManageEvent`), `app/actions/events.ts`, `app/dashboard/events/[eventId]/page.tsx`, `components/events/EventDetailClient.tsx`, and packing access via `app/packing/[roomId]/page.tsx` (room id in URL).

**Related:** `docs/specs/0001-advanced-packing-list.md` (packing list permissions and guest behavior). This spec is scoped to **event identity, membership, settings, and dashboard navigation**—not to packing list editor internals.

---

## 2. Current behavior (baseline)

- **`Event.createdById`** records who created the event.
- **`EventMember`** links `User` ↔ `Event` with a **string `role`** (`"owner"` at creation time, plus `"admin"` / `"member"` in tests and helpers). There is **no Prisma enum** for roles.
- **`getEventsForUser` / `getEventForUser`** grant access if the user has a membership row **or** matches `createdById`. Effective role falls back to **`"owner"`** when the user is the creator but has no membership row (defensive), though **`createEventRecord` currently inserts an `EventMember` with `role: "owner"`** for the creator.
- **`canManageEvent(role)`** returns true for **`"owner"`** or **`"admin"`**. It is used for **editing event fields**, **deleting the event**, **packing list “organizer” capabilities** on the dashboard, and **template management** on the public packing page when the signed-in user is an organizer.
- **`deleteEvent`** authorizes any user who passes **`canManageEvent`**—so **admins can delete the event today**, which **conflicts** with the new rule that **only the creator** may delete.
- **Member add/remove:** There is **no** dedicated UI or server actions for inviting or removing members beyond the implicit creator membership on create. The product requirement assumes **new flows** (Members tab + APIs).
- **Public packing URL:** `/packing/[roomId]` resolves the list by **`liveblocksRoomId`** without requiring event membership for **read access**; organizer checks apply only to **template** edits when signed in. There is **no** event setting to restrict the page to members only.

---

## 3. Functional requirements (authoritative)

| ID   | Requirement                                                                                                                                                                                                                                                                                                                                                 |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-1 | Every participant has exactly one of **`creator`**, **`admin`**, or **`member`** for a given event. **Creator** has **all admin capabilities** and is the **only** role that may **delete the event**.                                                                                                                                                      |
| FR-2 | **Admins** (including the creator) may configure whether **only admins** may add/remove members, or **any member** may add/remove members. **Default:** any member may add/remove members. **Hierarchy overrides (FR-6)** always apply regardless of this policy.                                                                                           |
| FR-3 | The **event view** exposes a **side tab** labeled **Members** where members can **see all members** and **perform allowed add/remove (and related) actions** per FR-2, FR-6, FR-7, and FR-8.                                                                                                                                                                |
| FR-4 | The **event view** exposes a **side tab** labeled **Settings** where **all members** can **view** event settings, and **admins** (including creator) can **change** them. Non-admins see read-only controls or copy explaining that only admins can edit.                                                                                                   |
| FR-5 | **Admins** may configure whether the **packing list** is visible **only to event members** or to **anyone with the share URL** (unchanged from today’s “link works for strangers” behavior when set to URL mode). When **members-only**, guests are **sent to the sign-in page** (see §6).                                                                  |
| FR-6 | A **non-creator admin** **cannot** **remove** the **creator** from the event. **Only the creator** may **remove** or **demote** **another** user who is an **`admin`**. An **`admin`** may **leave** the event (remove **only their own** membership); they **cannot** remove a **different** **`admin`**.                                                  |
| FR-7 | **Any** **`admin`** (**`creator`** or **`admin`**) may **promote** a **`member`** to **`admin`**. This is **not** delegated to plain **`member`** actors by FR-2—**only admins** may promote. Demoting or removing **another** **`admin`** remains **creator-only** (FR-6).                                                                                 |
| FR-8 | **Add member** (to an event) may **only** attach **existing** Rendecrew **`User`** rows. **No** inviting or adding someone **by email** who is **not** already a user. Search UI may match on name or email to **disambiguate**, but the server must accept **only** a resolved **`userId`** that already exists in the app database.                       |
| FR-9 | While the product is in **preview**, **only** **the designated preview operator** may invite or approve **new** people becoming Rendecrew **users** (platform-level onboarding—e.g. Clerk sign-up / invitations). Other people (including event **admins**) **cannot** create new platform accounts; they may only add **existing** users to events (FR-8). |

---

## 4. Domain model

### 4.1 Roles

**Canonical roles** (replace ambiguous `"owner"` string):

| Role      | Dashboard event access | Edit core event fields (title, dates, …) | Manage event settings (FR-4) | Add/remove members (when policy allows)                                                                                             | Delete event |
| --------- | ---------------------- | ---------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `creator` | Yes                    | Yes                                      | Yes                          | Full under FR-2 for **`member`** targets; **may remove/demote another `admin`**; **never** removable by others (FR-6)               | **Yes**      |
| `admin`   | Yes                    | Yes                                      | Yes                          | Under FR-2 for **`member`** targets; **may leave** (remove self); **cannot** remove **`creator`** or **another** **`admin`** (FR-6) | **No**       |
| `member`  | Yes                    | No                                       | No                           | Under FR-2 for **`member`** targets; **cannot** remove **`creator`** or **`admin`** (FR-6)                                          | **No**       |

**Creator assignment:**

Keep `Event.createdById` as the **source of truth** for who the creator is. Store `EventMember.role` as `creator` for that user only. **Do not** allow transferring creator in v1 unless product explicitly asks later.

**Enforcement helpers** (conceptual; names illustrative):

- `isEventAdmin(role)` — `creator` or `admin`
- `isEventCreator(userId, event)` — `event.createdById === userId` (or membership role `creator`)
- `canDeleteEvent(userId, event, role)` — **creator only** (per FR-1)

Refactor **`canManageEvent`** to mean **“organizer / admin capabilities”** (edit event, packing template, suggestion approval, **settings write**) = `creator` **or** `admin`. **Do not** use it for delete; use **`canDeleteEvent`**.

### 4.2 Event settings (new columns or JSON)

Persist at least:

| Setting                  | Type      | Default                            | Description                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------ | --------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `memberManagementPolicy` | enum/bool | `ANY_MEMBER_CAN_INVITE`            | When `ADMINS_ONLY`, only admins (incl. creator) may add/remove members or change roles, **subject to FR-6** and **FR-7** (creator protection, **another**-`admin` removal / demotion, **`admin`** self-leave, and **any-admin** promotion `member` → `admin`).                                                                                                                              |
| `packingListVisibility`  | enum      | `LINK_PUBLIC` or `ANYONE_WITH_URL` | **`MEMBERS_ONLY`:** no shared list data for unauthorized users. **Unauthenticated** visitors → **redirect to the app sign-in page** (optionally preserve a return URL after login). **Signed in but not a member** → redirect to a safe destination (e.g. dashboard) or a short “no access” page—**not** sign-in (would loop). **`URL_PUBLIC`:** same behavior as today for anonymous read. |

Naming is implementation detail; prefer **Prisma enum** + snake_case `@map` for Postgres.

**Relationship to existing `Event.suggestionApprovalRequired`:** Remains a **setting** editable by admins; the Settings tab aggregates **all** organizer-tunable flags including this one and the new fields above.

### 4.3 Member management policy (FR-2) — edge cases

- **Add member:** Actor must be admin **or** (policy = any member **and** actor is a member). Target must be an **existing `User`** (FR-8); server rejects unknown emails or ids with a clear client-facing error.
- **Remove member (target role):**
  - **Target = `creator`:** **Forbidden** for everyone (creator is removed only with the event, e.g. `deleteEvent`). **Non-creator admins cannot remove the creator** (FR-6).
  - **Target = `admin` (another user):** **Only the creator** may remove them from the event **or** demote them from `admin` to `member`. **Non-creator admins cannot** remove or demote **another** **`admin`** (FR-6).
  - **Target = `admin` (self):** **`Admin`** may **leave**—delete **their own** `EventMember` row (same as any voluntary leave).
  - **Target = `member`:** Same gate as **FR-2** (policy + actor is admin or allowed member).
- **Removing self (“leave event”):** Allowed for **`member`** and **`admin`**. **Creator** cannot leave without deleting the event (no transfer in v1).
- **Promote `member` → `admin`:** **Any** **`admin`** may do this (FR-7). **Only the creator** may **demote** or **remove** **another** **`admin`** (FR-6).

Document hierarchy rules explicitly in the Members tab (tooltips / disabled actions).

### 4.4 Preview-era platform onboarding (FR-9)

- **Goal:** During preview, **capability to add new Rendecrew accounts** (people who do not yet have a `User` / Clerk identity in the product) is **limited to one operator** (the product owner / designated account).
- **Implementation options** (pick one or combine): Clerk **restricted sign-up** / **allowlist**; **manual invitations** from the Clerk dashboard; or an app/env **allowlist** of Clerk user ids who may hit an “invite user” admin route. The **single** allowed operator should be **configuration-driven** (e.g. env var), not baked into UI copy. Event **Members** UI **must not** expose “invite by email” that creates accounts.
- **After preview:** Revisit FR-9 (broader self-serve or delegated invites) without changing FR-8 unless product explicitly allows email-based event invites later.

---

## 5. Data migration

1. **Rename role values:** Map existing `EventMember.role === 'owner'` → **`creator`** (for rows whose `userId === Event.createdById`); if any orphan `'owner'` exists, same rule; unknown strings → **`member`** pending manual cleanup.
2. **Backfill settings:** Set `memberManagementPolicy` default to “any member can add/remove” and `packingListVisibility` to “URL” so **behavior matches current** packing page.
3. **Unique constraint:** Keep `@@unique([eventId, userId])` on `EventMember`.
4. **Invariant:** At most one `creator` membership per event; creator’s `userId` matches `createdById`.

---

## 6. Authorization matrix (server actions / API)

All mutations must re-check policy **server-side** (never UI-only).

| Action                                                           | Required capability                                                          |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Read event (dashboard)                                           | Member (any role)                                                            |
| Update event core fields                                         | Admin (`creator`/`admin`)                                                    |
| Update event settings                                            | Admin                                                                        |
| Delete event                                                     | **Creator**                                                                  |
| Add member / remove **`member`**                                 | Per `memberManagementPolicy` + §4.3; add requires **existing `User`** (FR-8) |
| Remove **`creator`**                                             | **Forbidden** (not even other admins)                                        |
| Remove **another** **`admin`** or demote them `admin` → `member` | **Creator** only                                                             |
| **`Admin`** leave event (remove **own** membership)              | **`Admin`** (self only)                                                      |
| Promote `member` → `admin`                                       | **Any** **`admin`** (FR-7)                                                   |
| List members                                                     | Any member                                                                   |

**Packing list page (`/packing/[roomId]`):**

- Resolve `PackingList` → `eventId` → `Event`.
- If `packingListVisibility === MEMBERS_ONLY`: require signed-in user with membership. **Not signed in** → **redirect to sign-in** (no list payloads). **Signed in, not a member** → redirect away (e.g. dashboard) or access-denied UI with **no** list payloads—**not** a hard 404 by default.
- If `LINK_PUBLIC`: preserve current read path for anonymous users; organizer detection unchanged for signed-in admins.

**Liveblocks / realtime:** If non-members lose access, ensure **room token issuance** aligns with the same visibility rule so clients cannot subscribe without authorization.

---

## 7. UI / UX specification

### Event layout: side tabs

Refactor the event detail layout (today a single column in `EventDetailClient` / page wrapper) to a **two-column** or **sidebar + main** pattern:

- **Tabs (or nav items):** **Overview** (or **Event**—current summary + packing + chat placement TBD), **Members**, **Settings**.
- **Overview:** Retain high-level event card, packing section, and chat **or** move chat/settings per design—minimum requirement is **presence** of Members and Settings tabs, not necessarily removing content from Overview.

**Members tab**

- Table or list: avatar/name/email, role badge (`Creator` / `Admin` / `Member`), joined date.
- Actions: **Add member** — search **existing** Rendecrew users (e.g. by name or email **to pick** among accounts that already exist); **no** “invite by email” for non-users (FR-8). **Remove**, **Change role** (if allowed). **Promote to admin** is available to **any** **`admin`** for **`member`** rows (FR-7). Disabled states with tooltips when policy forbids. **Never** show remove on the **creator** for non-creators. **Remove** / **demote** on **another user’s** **`admin`** row is **creator-only** (FR-6); each **`admin`** may still **Leave** (self) from their own row or account menu.
- Empty states and loading states for slow queries.

**Settings tab**

- **View for all members:** read-only display of title/dates/location/description **or** link to Overview for core fields; show toggles **disabled** for non-admins.
- **Edit for admins:** `memberManagementPolicy`, `packingListVisibility`, `suggestionApprovalRequired`, and any future flags in one cohesive form. **Danger zone:** **Delete event** only visible to **creator** (not other admins).

---

## 8. Testing and observability

- **Unit tests:** Role helpers (`isEventAdmin`, `canDeleteEvent`), policy checks for add/remove, **FR-6** / **FR-7** (admin cannot remove creator; non-creator cannot remove **another** admin; **admin** may remove **self**; **any** **admin** may promote **`member`** → **`admin`**), migration mapping `owner` → `creator`.
- **Integration tests:** Server actions reject non-creator delete; reject admin removing creator or **another** admin; allow **admin** self-removal; allow **any** **admin** to promote a **member**; reject add-member for unknown **`userId`** / email-without-user (FR-8); `MEMBERS_ONLY` packing route **redirects anonymous users to sign-in** and does not expose list data to signed-in non-members; member tab list respects RLS-equivalent Prisma filters; optional tests for preview-only onboarding gate (FR-9) if implemented in-app.
- **Audit (optional):** Log `EVENT_MEMBER_ADDED`, `EVENT_SETTINGS_CHANGED` for support.

---

## 9. Rollout and compatibility

- Ship **migration + server enforcement** before or with UI so packing visibility cannot be bypassed.
- **Communicate** to existing users: default **URL-visible** packing list preserves today’s sharing; opting into **members-only** may break previously shared links—UI should warn on toggle.

---

## 10. Deferred (post-preview / later)

- **Event invites by email** or **pending `EventMember`** rows before the invitee has a `User` record — **out of scope** while FR-8 applies; revisit if product allows non-user invites later.
- **Delegated platform onboarding** (multiple people who may create Rendecrew accounts) — **out of scope** while FR-9 applies; relax when preview ends.
