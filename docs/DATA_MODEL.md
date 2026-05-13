# Data model

Diagrams are generated from `prisma/schema.prisma` with [prisma-erd-generator](https://github.com/keonik/prisma-erd-generator) when you run `npm run prisma:generate`. Mermaid emits `width="100%"` on the SVG root; `scripts/fix-data-model-erd-svg.mjs` sets width/height from the `viewBox` afterward.

## How slices relate to each other

- **`data-model-full-erd.svg`** (`generator erdFull`) includes **every** table and **every** Prisma relation line the tool can draw (including enums). This is the **canonical** diagram for “does this FK / relation exist?”
- **`data-model-erd.svg`**, **`packing-data-model-erd.svg`**, and **`rides-data-model-erd.svg`** use **`ignorePattern`** to hide whole models. **prisma-erd-generator only emits a relation when both connected models are still present**, so you do not get dangling “half” foreign keys in a slice—edges simply are not drawn if the other table was filtered out.
- Slices use **`ignoreEnums = true`** so enum boxes do not dominate the picture; **full** keeps enums so nothing is hidden there.

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
