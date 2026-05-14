# Data model

**GitHub and many Markdown previews shrink wide images to the column width.** For readable views, open the raw SVG and scroll/zoom:

- **[Full schema (all tables & relations)](./data-model-full-erd.svg)** — authoritative.
- **[Core slice](./data-model-erd.svg)** — omits packing and rides tables.
- **[Packing slice](./packing-data-model-erd.svg)** — packing + **User** + **Event** for FK context.
- **[Rides slice](./rides-data-model-erd.svg)** — rides + **User**, **Event**, **EventMember**.

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
