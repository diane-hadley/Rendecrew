# Task board: assignee modes, optional assignees, and list filters

## 1. Purpose

This document specifies **functional updates** to the event Task Board. It **amends and partially supersedes** [0005-event-task-board.md](./0005-event-task-board.md) for the behaviors below; **where they conflict, this spec wins** for those behaviors.

**Scope**

- **Assignee completion mode** for multi-assignee tasks: **Any** vs **Each**.
- **Unassigned tasks** stay valid (assignee not required).
- Replace paired toggles (**Me** / **Group** and **Open** / **Done**) with **User** and **Status** filters (defaults and query semantics below).
- **Reopening** when an **Each** task was fully `DONE` but membership or per-assignee completion changes afterward.

Prisma layout and API naming may follow 0005 unless this spec needs new fields or view parameters.

---

## 2. Assignee completion mode (Any vs Each)

### 2.1 Definitions

| Mode     | When it applies                                                                                                 | Meaning                                                                                                        |
| -------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Each** | Default for multi-assignee; matches historical behavior and [0005](./0005-event-task-board.md) **§2.3 / §3.2**. | Every assignee must complete their part before the task is **fully** `DONE`. Per-assignee progress is tracked. |
| **Any**  | When **more than one** person is assigned.                                                                      | Any assignee may finish the work. Per-assignee completion **must not** gate overall `DONE`.                    |

**Single assignee:** Implement as **Each** (one completion actor). UI may hide the mode or show a single sensible state.

**Zero assignees:** Allowed at **create and edit** time. Do not show the mode or ignore it; behavior is **overall `EventTask.status` only** (no per-assignee rows), same as [0005](./0005-event-task-board.md) **§3.2** for unassigned tasks.

### 2.2 Any — rules

- Assignees are **eligible** workers; **overall** `EventTask.status` is what “finished” means.
- Server rules **must not** require every assignee’s `doneAt` (or equivalent) to set `DONE`. The product may omit per-row completion for **Any** or keep it for analytics only.
- **Who can mark done:** At least any **assigned** member (same permission model as today for “mark done for me”). No assignees → see **§2.1** (unassigned).

### 2.3 Each — rules

Same as [0005](./0005-event-task-board.md) **§2.3 / §3.2**: track per-assignee completion; overall task is **not** `DONE` until **all** assignees are done (or equivalent server rule).

### 2.4 Changing mode on an existing task

| Change                                                   | Rule                                                                                                                                                                                                                                          |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Each → Any** while some assignees are not done         | Overall stays non-`DONE` until **Any** completion is satisfied (e.g. someone marks done or an editor sets status).                                                                                                                            |
| **Any → Each** when task is already `DONE` under **Any** | Do **not** assume assignees are individually done unless product backfills. **Recommended:** set overall to **open** (`TO_DO` or `IN_PROGRESS`) until **Each** invariants hold, and clear or initialize per-assignee completion consistently. |

Enforce migration **server-side** with tests.

---

## 3. Filters (replaces scope + bucket toggles)

### 3.1 Replace old UI

Remove the two controls that paired **Me** / **Group** with **Open** / **Done**. Use two independent filters: **User** and **Status**.

### 3.2 Status filter

- **Open:** overall status is **not** `DONE` (`TO_DO` or `IN_PROGRESS`).
- **Done:** overall status is `DONE`.

### 3.3 User filter

Constrains **how the task relates to a member** (not overall status—that is **Status**).

**Required**

1. Quick access to the **current user** (e.g. default **Me**).
2. **No user restriction:** show tasks for the event with only **Status** applied. Label examples: **All**, **Everyone**, **Whole group**—pick one and use it consistently.

**Optional (recommended):** Choose another event member to see that member’s slice (“view as user”). If v1 skips this, **Me** + **All** are still required.

### 3.4 Defaults

On first load: **User = Me**, **Status = Open** (same as prior “my open tasks”).

### 3.5 Query semantics (normative)

Let `U` = selected member when User ≠ All; `S` = **Open** or **Done**.

| User                     | Status   | Include task when…                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **All**                  | **Open** | Event task; overall status ∈ {`TO_DO`, `IN_PROGRESS`}.                                                                                                                                                                                                                                                                                                             |
| **All**                  | **Done** | Overall status `DONE`.                                                                                                                                                                                                                                                                                                                                             |
| **Me** (or specific `U`) | **Open** | `U` **is** an assignee **and** overall is open **and** (**Each:** `U`’s assignment is **not** done; **Any:** rely on overall open—`U` must still be assignee). **Unassigned** tasks **do not** appear unless product adds an explicit “Unassigned” control (out of scope here).                                                                                    |
| **Me** (or specific `U`) | **Done** | `U` **is** an assignee **and** (**Each:** `U`’s assignment **is** done; **Any:** **recommended** — overall `DONE` **and** `U` is assignee so “what I was on” that finished). If the product does not track per-assignee done for **Any**, **User + Done** may instead hide **Any** tasks from user-done lists—document the chosen rule in code comments and tests. |

**Unassigned tasks:** Visible for **User = All** (subject to **Status**). Not visible for **User = Me** unless extended later.

List filters must still surface unassigned tasks when User means “no specific user” / “all tasks for the event” (exact label is a product choice).

---

## 4. Reopening (**Each** only)

### 4.1 New assignee after `DONE`

**New assignee** while overall is `DONE` → overall **must** return to **open** (`TO_DO` or `IN_PROGRESS`); the new assignee is **not** done until they act. Others may keep prior done flags; invariant: not all assignees done ⇒ overall **not** `DONE`.

### 4.2 Assignee unmarks done

**Assignee clears** personal completion while overall was `DONE` → overall **must** leave `DONE` (open again), consistent with [0005](./0005-event-task-board.md) **§3.2**.

**Any:** Adding assignees **does not** reopen a task already `DONE`. A different rule would be a separate change.

---

## 5. Data model (informative)

- Persist mode: enum `ANY | EACH`, default `EACH`.
- **Each:** keep `EventTaskAssignment.doneAt` (or equivalent) and existing status invariants.
- **Any:** do not derive overall `DONE` from per-assignee `doneAt`; UI may hide per-person progress.

---

## 6. UI (informative)

- Create/edit: if **≥ 2** assignees, show **Any** vs **Each** with short helper text (e.g. “Any: one person can complete for everyone” / “Each: everyone must mark done”).
- Row/card: **Each** — per-assignee indicators; **Any** — show assignees without required checkoffs.

---

## 7. Acceptance criteria

- [ ] Multi-assignee task: **Any** / **Each** behavior matches **§2**.
- [ ] Task with **no** assignees saves and appears in **All** views per **§3.5**.
- [ ] **User** and **Status** replace old toggles; defaults **Me** + **Open** (**§3.4**).
- [ ] User filter: quick **current user** + mode with **no** assignee scoping (**§3.3**).
- [ ] **Each** + `DONE` + new assignee ⇒ task open (**§4.1**).
- [ ] **Each** + assignee unmarks done ⇒ not `DONE` (**§4.2**).

---

## 8. References

- [0005-event-task-board.md](./0005-event-task-board.md) — original task board spec (superseded in part by this document).
