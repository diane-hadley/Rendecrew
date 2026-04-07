# Packing list — sections and ordering (technical specification)

## 1. Purpose

This document specifies product and engineering changes for the **collaborative event packing list** so organizers can manage **sections** independently of items, **reorder** sections and items via **drag and drop**, and see a **cleaner table** without repeating the section name on every row.

**Primary implementation surface today:** `components/packing/PackingListEditor.tsx`, Liveblocks `Storage` (`liveblocks.config.ts`), and Postgres sync via `lib/packing-list.ts` / `persistPackingListItems`.

**Related broader vision:** `docs/advanced-packing-list-spec.md` (auditing, personal lists, suggestions). This spec is scoped to **section UX and ordering** only.

---

## 2. Current behavior (baseline)

- **Sections are inferred from each line item:** `PackingItemStorage.section` is an optional string on every item; `null` / empty means **Uncategorized** in the UI.
- **Section blocks in the UI:** Named section headers appear when the normalized section string **changes** between consecutive visible rows. **Uncategorized** gets a header when it is the first block or follows a named section.
- **Section order:** Derived from **first appearance** of each section key in the flat `items` list (`sectionFirstAppearanceRanks` in `PackingListEditor`). There is **no** way to show a named section with **zero** items, because nothing carries that section label yet.
- **Adding items:** `addItem()` with no args **pushes** a row with `section: null` (Uncategorized). Per-section **Add item** inserts after the last row in that section’s run.
- **Reordering:** There is **no** drag-and-drop today; order is whatever order rows have in the Liveblocks `items` `LiveList`.
- **Redundancy:** The table includes a **Section** column with a per-row text input, while section headers already label each block—this duplicates information for organizers.

---

## 3. Functional requirements (authoritative)

| ID   | Requirement                                                                                                                                                                                                                                                                                                     |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-1 | A user can **add a new section** without adding any items.                                                                                                                                                                                                                                                      |
| FR-2 | A user can add an item to a section via that section’s **Add item** control **or** by **dragging** an item into that section.                                                                                                                                                                                   |
| FR-3 | **Section order** is **stable**, **user-visible**, and **changeable** (drag and drop).                                                                                                                                                                                                                          |
| FR-4 | **Item order within a section** is **stable**, **user-visible**, and **changeable** (drag and drop).                                                                                                                                                                                                            |
| FR-5 | A default **Uncategorized** section exists: items created with the **bottom** “add item” action land there; items may be **dragged** to Uncategorized.                                                                                                                                                          |
| FR-6 | The **section name must not appear in each data row**; the section header (or equivalent group chrome) is the single place for the section label for that block.                                                                                                                                                |
| FR-7 | In the **Needs sign-ups** view, **do not render a section header** for a section that has **no visible items** in that filter (i.e. no items in that section currently need sign-ups). Empty named sections and fully satisfied sections disappear from this view until they have at least one qualifying item. |

---

## 4. Proposed domain model

### 4.1 Conceptual model

- **Section** — A first-class grouping with a stable **id**, human-readable **title**, and **position** in the section list.
- **Uncategorized** — Not a persisted section row: represented by **`sectionId === null`** (or an agreed sentinel) on items. In the UI it is always labeled **Uncategorized** and rendered **after all named sections** (see §5.2).
- **Item** — Belongs to exactly one section bucket: **one section id** or **uncategorized**.

This directly satisfies FR-1 (empty sections exist as rows in a `sections` list), FR-3 (order = list order), and FR-5 (null membership).

### 4.2 Liveblocks `Storage` shape (recommended)

Extend storage beyond a single `items` list, for example:

- `sections`: `LiveList<LiveObject<{ id: string; title: string }>>` — ordered; defines **section order** and **titles** for non-uncategorized groups.
- `items`: unchanged as a `LiveList` of item objects, but each item gains **`sectionId: string | null`** (`null` = Uncategorized).

### 4.3 Drag-and-drop library

Use **[dnd kit](https://dndkit.com/)** (`@dnd-kit/core`, `@dnd-kit/sortable`, and as needed `@dnd-kit/utilities`):

- Built for React, hooks-based API, and **keyboard / screen-reader friendly** patterns when configured with sensible `accessibility` props.
- **Sortable** presets map cleanly to reordering the **`sections` list** and reordering **items within a section**; **custom collision / droppable containers** support **cross-section** moves (drag item onto another section’s body or header drop zone).
- Actively maintained and composes well with **Liveblocks** updates (mutate storage in `onDragEnd`, use `room.batch` for a single undo step).

No DnD packages are in the repo today; add these as new dependencies when implementing.

### 4.4 Database mirror (Postgres)

Today, `PackingItem` has `section: String?` and `sortOrder: Int` (`prisma/schema.prisma`). To mirror empty sections and stable section order durably:

1. Introduce a **`PackingSection`** (name TBD) model, e.g. `id`, `packingListId`, `title`, `sortOrder`, timestamps.
2. Add **`sectionId`** (nullable FK) on **`PackingItem`**; **`null`** = uncategorized. Migrate existing rows: create sections from distinct non-null `section` strings (preserving a deterministic order), attach items, then deprecate or stop writing the legacy `section` string (or keep it denormalized for one release behind a migration—team choice).

**Persistence contract:** `persistPackingListItems` (and any merge logic for participants) must accept an ordered **sections** payload plus **items** with **section membership** and **item order** within the list (or a defined global `sortOrder` scheme). Organizer-only structural changes remain enforced as today.

---

## 5. UI / UX specification

### 5.1 Section chrome

- Each **named section** renders a **header row** (or card subheading) showing the **section title** and organizer actions: **Add item**, **Rename section** (opens a **modal**—see below), and **delete section** (organizers only).
- **Rename section (modal):** Organizers trigger rename from the header (e.g. button or menu item “Rename section”). A **modal dialog** opens with a single text field prefilled with the current title, **Save** and **Cancel**, validation against `MAX_SECTION_LEN`, and focus trap / `aria-*` labels for accessibility. **Save** commits the new title on the section record in Liveblocks (and mirrored DB); **Cancel** discards changes. No inline editing of the header text (avoids clashes with section drag handles).
- **Delete section — confirmed in all cases:**
  - **Section has no items:** Show a confirmation dialog (e.g. “Remove section ‘Snacks’?”). On confirm, remove that section from `sections` / `PackingSection` only. No item rows change.
  - **Section has one or more items:** Show a confirmation dialog that states how many items will be affected. On confirm: set those items’ **`sectionId` to `null`** (Uncategorized), **remove** the section record, then **reconcile item order** so those items appear in the **Uncategorized** block while preserving **their relative order** to each other; append them after any items that were already uncategorized (unless implementation prefers a single stable global `sortOrder` pass—either way, no silent data loss and sign-ups stay on the same item ids).
- **Uncategorized** uses the same header pattern with fixed label **Uncategorized** and **Add item** (optional if redundant with bottom control; FR-5 implies at least one clear way to add uncategorized items—the existing bottom control satisfies FR-5).

### 5.2 Ordering and drag and drop

- **Section drag handles:** Reordering `sections` updates **only** the section list order. Items **do not** change `sectionId`; they **move visually** with their section because rendering groups by `sectionId`.
- **Uncategorized placement:** **Uncategorized is always last** in the visual list (after every named section), in both **All items** and **Needs sign-ups** when that block is shown. New items from the bottom control still use `sectionId: null`; they appear in the Uncategorized block at the end.
- **Item drag and drop:** Items can move **within** a section (reorder `items` among same `sectionId`) and **across** sections (update `sectionId` and insert at drop index within target section’s contiguous run).
- **Drop targets:** Each section header area and the **tbody** region for that section should accept drops (exact hit targets to be designed to avoid accidental moves). **Uncategorized** is a first-class drop target and appears **below** named sections.
- **Batching:** Wrap multi-step storage updates in `room.batch` and align with existing undo/history guidance in `docs/advanced-packing-list-spec.md` so one drag is one undo step.

### 5.3 Adding items (FR-2, FR-5)

- **Per-section Add item:** Inserts a new item with that section’s `sectionId` at the end of that section’s block (same semantics as today’s “last row in run,” but keyed by id not string comparison).
- **Bottom Add item:** Inserts with `sectionId: null` (Uncategorized).
- **Drag into section:** On drop, set `sectionId` to the target section’s id (or `null` for Uncategorized) and position per drop index.

### 5.4 Table layout (FR-6)

- **Remove** the **Section** column from the item table (header cell and per-row section input).
- **Section title** appears **only** in the section header (or adjacent group label); organizers **rename** via the **modal** flow in §5.1.
- Adjust **`colSpan`** on full-width header rows and empty states to match the reduced column count.
- **Accessibility:** Ensure section headers have appropriate **roles/labels** (e.g. `row` + `scope` or `aria-labelledby` tying item rows to their section).

### 5.5 Filters and “Needs sign-ups” view

Today, `sortRowsBySectionRun` groups by section for the **All items** / **Needs sign-ups** toggle. After the change:

- Grouping key becomes **`sectionId`** (and `null` for Uncategorized).
- Section **order** for rendering comes from the **`sections` list**, then **Uncategorized last**—not from “first appearance” in the item list.
- **FR-7:** After filtering to rows that **need sign-ups**, **omit the section header row** for any section (including empty named sections stored in `sections`) that has **zero** items left in the filtered list. Do **not** show a header-only stub for “Snacks” if every Snacks item is fully covered—only show **Snacks** when at least one Snacks item appears in this view. Same rule for **Uncategorized**: if no uncategorized items need sign-ups, **do not** render the Uncategorized header (or its empty block) in this view.

---

## 6. Migration and backward compatibility

1. **Liveblocks rooms with legacy data** (items have `section` string, no `sections` list): on load, run a **one-time migration mutation** that:
   - Builds `sections` from distinct non-null section strings in **current item order** (preserving historical block order as closely as possible).
   - Assigns new **UUIDs** per section; sets each item’s **`sectionId`** accordingly; clears or ignores legacy `section` string for template logic.
2. **Database:** Backfill `PackingSection` + `PackingItem.sectionId` from existing `section` text + `sortOrder`; then cut over `persistPackingListItems` to write the new shape.
3. **APIs and types:** Update `PackingItemPayload` (and any server merge helpers) to carry **section id** (or ordered section records + items). Keep **participant merge** rules: non-organizers still cannot change ids, membership, or order—only their sign-ups.

---

## 7. Non-functional requirements

- **Performance:** Drag handlers should avoid persisting on every pointer move; debounce DB sync as today (~existing `schedulePersist` behavior).
- **Collaboration:** Two users editing section titles or dragging concurrently should rely on Liveblocks CRDT semantics; define conflict UX as “last write wins” unless product adds locking.
- **Limits:** Reuse `MAX_SECTION_LEN` and sensible **max section count** (new cap) to match `MAX_ITEMS` guardrails in `lib/packing-list.ts`.
- **Testing:** Unit tests for migration from legacy storage; integration/e2e for drag reorder (or component tests with mocked DnD library).

---

## 8. Out of scope (this spec)

- Personal packing lists, suggestions, audit history, and permission changes beyond what existing `persistPackingListItems` already enforces.
- Non-organizer ability to rename sections or reorder template structure (remains organizer-only unless product explicitly changes).

---

## 9. Summary

| Topic          | Direction                                                                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty sections | First-class **`sections`** list in Liveblocks + mirrored **`PackingSection`** rows in Postgres                                                  |
| Item → section | **`sectionId`** on items; **`null`** = Uncategorized                                                                                            |
| Uncategorized  | Always **last** in the UI                                                                                                                       |
| Section order  | Order of **`sections` LiveList**; drag to reorder (**dnd kit**)                                                                                 |
| Item order     | Reorder within **`items`** respecting `sectionId` grouping (**dnd kit**)                                                                        |
| Needs sign-ups | **No section header** if that section has **no items** in the filtered list (FR-7)                                                              |
| Delete section | **Always confirm**; empty → drop section row only; with items → **move items to Uncategorized** (`sectionId: null`), then remove section (§5.1) |
| Rename section | **Modal** with text field, Save/Cancel, `MAX_SECTION_LEN` (§5.1)                                                                                |
| UI             | Section label **only** in headers; **remove** per-row section column                                                                            |
| Legacy data    | One-time migration from string `section` to ids + section list                                                                                  |

This aligns implementation with the functional requirements while staying compatible with the existing collaborative architecture (Liveblocks authoritative storage, Postgres as durable mirror).
