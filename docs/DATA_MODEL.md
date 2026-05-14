# Data model

Diagrams are generated from `prisma/schema.prisma` with [prisma-erd-generator](https://github.com/keonik/prisma-erd-generator) when you run `npm run prisma:generate`. See the `generator erd*` blocks in the schema; `scripts/fix-data-model-erd-svg.mjs` post-processes each SVG.

**GitHub and many Markdown previews shrink wide images to the column width.** For readable views, open the raw SVG and scroll/zoom:

- **[Full schema (all tables & relations)](./data-model-full-erd.svg)** — authoritative.
- **[Core slice](./data-model-erd.svg)** — omits packing, rides, tasks, and notification tables (each has its own slice below).
- **[Packing slice](./packing-data-model-erd.svg)** — packing + **User** + **Event**.
- **[Rides slice](./rides-data-model-erd.svg)** — rides + **User**, **Event**, **EventMember**.
- **[Tasks slice](./tasks-data-model-erd.svg)** — **EventTask**, **EventTaskAssignment** + **Event**, **EventMember**, **User**.
- **[Notifications slice](./notifications-data-model-erd.svg)** — **Notification**, **UserNotificationPreferences**, **EventMemberNotificationPreferences** + **User**, **Event**, **EventMember**.

## Full model (embedded)

<div style="overflow-x: auto;">

![Full data model (ERD)](./data-model-full-erd.svg)

</div>

## Core slice (embedded)

<div style="overflow-x: auto;">

![Data model (ERD)](./data-model-erd.svg)

</div>

## Packing slice (embedded)

<div style="overflow-x: auto;">

![Packing data model (ERD)](./packing-data-model-erd.svg)

</div>

## Rides slice (embedded)

<div style="overflow-x: auto;">

![Rides data model (ERD)](./rides-data-model-erd.svg)

</div>

## Tasks slice (embedded)

<div style="overflow-x: auto;">

![Tasks data model (ERD)](./tasks-data-model-erd.svg)

</div>

## Notifications slice (embedded)

<div style="overflow-x: auto;">

![Notifications data model (ERD)](./notifications-data-model-erd.svg)

</div>
