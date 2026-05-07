# Embedded collaborative packing on the event Packing tab — Technical specification

## 1. Purpose

**Problem:** The dashboard event **Packing** tab is thin: **You’re bringing** plus a link to **open the full list** in another tab (`/packing/[roomId]`). Organizers get a share/copy panel but still use **Open list** for the full Liveblocks experience (`PackingCollabPage`).

**Goal:** **Signed-in event members** on the **Packing** tab get the **same capabilities as `PackingCollabPage`** without leaving the event page. **Guests and share recipients** keep using **`/packing/[roomId]`** (canonical share entry).

**Non-goals:** Remove or replace the public packing route; change Liveblocks room semantics or storage; guest/anonymous access from the **dashboard** (already sign-in only); large packing sub-tab redesign (minor layout only).

## 2. Scope

| In scope                                                                                                                                           | Out of scope (unless added later)                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Full collab UI for **authenticated** members when packing is enabled and a list exists                                                             | Changing Liveblocks **room semantics** or **persistence contracts** |
| **`/packing/[roomId]`** for guests, link-only users, copy/share                                                                                    | Dashboard guest access                                              |
| **One `liveblocksRoomId` per list** — embedded and standalone join the **same** room                                                               |                                                                     |
| **Authorization** unchanged: `PackingListVisibility` (e.g. `MEMBERS_ONLY` → guests sign in for room URL); event membership for dashboard unchanged |                                                                     |

## 3. Baseline architecture

| Surface           | Location                                                      | Behavior                                                                                                           |
| ----------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Event Packing tab | `components/packing/PackingSection.tsx` → `EventDetailClient` | `PackingListPanel` (organizers) + `MyPackingCommitments`; members → **Open collaborative packing list** (new tab). |
| Full collab UI    | `components/packing/PackingCollabPage.tsx`                    | `RoomProvider`, `PackingListEditor`, suggestions / my packing; used by `app/packing/[roomId]/page.tsx`.            |
| Standalone data   | `app/packing/[roomId]/page.tsx`                               | Loads list, suggestions, personal items, `canManageTemplate`, `packingSignupMembers`, etc.                         |
| Event page data   | `app/dashboard/events/[eventId]/page.tsx`                     | `getPackingListForEvent`, commitments, path; **no** collab-page props today.                                       |

## 4. Requirements

### 4.1 Signed-in member on event Packing tab

When **packing is enabled**, a **list exists**, and the viewer is a **signed-in member** on `/dashboard/events/[eventId]`:

- Show the **same functional areas as `PackingCollabPage`**: **Shared** (Liveblocks), **Suggestions**, **My packing**, under existing role rules (`canManageTemplate`, guest vs auth where relevant).
- The user must **not** need `/packing/[roomId]` in another tab to sign up, edit allowed fields, or use suggestions/personal views **from the event page**.

### 4.2 Organizers

- Keep an obvious **copy** and **open** path for the public packing URL (today: `PackingListPanel`). Embedding **adds** inline access; it does **not** remove share.

### 4.3 Standalone route

- **`/packing/[roomId]`** stays; behavior for guests and signed-in users who only use the link is **unchanged**. Optional copy (“also available from the event page”) is product-only.

### 4.4 “You’re bringing” / commitments

**Default (assumed unless stakeholders pick the alternative):** When showing full embedded collab, **drop** the separate **`MyPackingCommitments`** block — **My packing** already covers commitments + personal items; no regression on packed-checkbox behavior.

**Alternative:** Keep a **compact** commitments strip above embedded collab for quick toggles (duplicate entry points).

## 5. Technical design

### 5.1 Shared server loader

- Move data assembly from `app/packing/[roomId]/page.tsx` into a **reusable module** (e.g. `lib/packing-collab-page-data.ts`) that returns props matching **`PackingCollabPage`’s contract** (room id, event metadata, initial sections/items, `authUser`, template/signup/suggestions/personal/commitments fields — mirror the standalone page).
- **Call sites:** (1) `app/packing/[roomId]/page.tsx` — same behavior and access checks. (2) `app/dashboard/events/[eventId]/page.tsx` — when a list exists, build collab props with known `dbUser` and event/`liveblocksRoomId` **once per request** (lighter or lazy loading only if §7 says so).

### 5.2 Event page client

- Extend `EventDetailClient` / packing props with **collab payload** or `null`.
- In `PackingSection` (or thin wrapper): if collab props exist and viewer is a **signed-in member** (dashboard enforces both): render **`PackingCollabPage`** or **`PackingCollabEmbedded`** (spacing/titles only — no duplicate page chrome). Keep **`PackingListPanel`** for `canManagePacking`. Apply **§4.4 default** (omit redundant `MyPackingCommitments`).

### 5.3 Code splitting

- **`next/dynamic`** with `ssr: false` (or equivalent) for the embedded collab subtree so the event detail bundle does not eagerly load Liveblocks/editor until the **Packing** tab is used. Optional: preload on tab hover.

### 5.4 Liveblocks and identity

- Same **room id** and storage shape. Same **signed-in identity** path as standalone (Clerk + `getOrCreateUser` → `authUser` into `PackingCollabPage`).

### 5.5 Revalidation

- Keep `revalidatePath` for `/packing/[roomId]`. Add **`/dashboard/events/[eventId]`** (or exact detail path) where packing mutations should refresh the embedded view, **if** the event page does not already.

## 6. UX

- **Tabs:** Event has top-level tabs; collab has **Shared / Suggestions / My**. Avoid repeating “Packing list” as multiple page titles — one heading in `PackingSection`, internal tab bar in `PackingCollabPage`.
- **Deep link** `?tab=packing&packingSubTab=…`: optional, not v1.

## 7. Performance

- Standalone packing does **many Prisma reads**; event detail may duplicate them.
- **v1:** Duplicate reads for simplicity; **measure** TTFB with packing enabled.
- **Later:** Request-level dedup, collab props only when `tab=packing` (segment/parallel route), or fetch on tab mount — only if profiling justifies it.

## 8. Testing

- **Automated:** Update/add tests for `PackingSection`, `EventDetailClient`, and the loader (mirror `app/packing/[roomId]` coverage if any).
- **Manual:** Organizer — embedded UI + share panel, template edits, link works. Member — embedded UI, sign-ups, no template management. Guest — `/packing/[roomId]` unchanged; `MEMBERS_ONLY` → sign-in. Packing off / no list — no embedded collab, same as today.

## 9. Acceptance criteria

1. Signed-in **member** can do primary packing workflows **entirely** in the event **Packing** tab without `/packing/[roomId]`.
2. **`/packing/[roomId]`** still works for guests and share links.
3. Organizers can **copy** and **open** the share URL from the event page.
4. **One** Liveblocks room per list — no forked storage for the same event list.
