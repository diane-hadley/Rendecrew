# Data model

**GitHub and many Markdown previews shrink wide images to the column width.** For readable views, open the raw SVG and scroll/zoom:

- **[Full schema (all tables & relations)](./data-model-full-erd.svg)** — authoritative.
- **[Core slice](./data-model-erd.svg)** — **User**, **Event**, **EventMember**, and every table not delegated to a domain slice below (omits packing, rides, tasks, and notification tables).
- **[Packing slice](./packing-data-model-erd.svg)** — packing tables only (no **User** / **Event** / **EventMember**).
- **[Rides slice](./rides-data-model-erd.svg)** — ride tables only (no **User** / **Event** / **EventMember**).
- **[Tasks slice](./tasks-data-model-erd.svg)** — **EventTask** and **EventTaskAssignment** only (no **User** / **Event** / **EventMember**).
- **[Notifications slice](./notifications-data-model-erd.svg)** — **Notification**, **UserNotificationPreferences**, **EventMemberNotificationPreferences** only (no **User** / **Event** / **EventMember**).

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
