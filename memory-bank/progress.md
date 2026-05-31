# Progress

## What Works

### Authentication and Users

- [x] Clerk sign-in / sign-up
- [x] Middleware route protection for dashboard
- [x] `User` sync from Clerk (`getOrCreateUser`)
- [x] User settings: timezone, global notification preferences

### Dashboard

- [x] Events list (upcoming)
- [x] Past events page
- [x] Create event (form + natural-language parsing)
- [x] Notifications inbox page

### Event Detail

- [x] Overview tab — general information (Markdown), edit forms, AI drafting panel
- [x] Tasks tab — task board with assignments, due dates, status, filters (spec 0005, 0007)
- [x] Packing tab — embedded Liveblocks collab for members (spec 0008); organizer share panel
- [x] Rides tab — ride coordination board (spec 0004)
- [x] Members tab — participant list
- [x] Settings tab — optional features, roles, event notification prefs, delete event (spec 0003)

### Packing

- [x] Sections and items with sign-ups and quantities
- [x] Personal packing items
- [x] Suggestions with optional organizer approval
- [x] Public standalone route `/packing/[roomId]`
- [x] Real-time collaboration via Liveblocks
- [x] Packing list visibility settings (`URL_PUBLIC`, etc.)

### Rides

- [x] Ride cars with drivers and passengers
- [x] Custom field definitions and values
- [x] Unified/separate ride modes
- [x] Per-event enable/disable

### Tasks

- [x] Task CRUD with sort order
- [x] Multi-assignee with ANY/EACH completion modes
- [x] Due dates with timezone
- [x] Per-event enable/disable

### Notifications

- [x] In-app notification rows with categories/kinds (spec 0006)
- [x] Global and per-event preference overrides
- [x] Actor suppression (actor doesn't get notified for own action)
- [x] Mark all read on inbox open
- [x] Cron purge after 30 days (`app/api/cron/purge-notifications`)

### AI

- [x] Natural-language event parsing on create (`lib/parse-event-natural-language.ts`)
- [x] General information drafting/revision (`app/actions/event-general-information-ai.ts`)
- [x] Event chat grounded in DB context (`app/actions/event-chat.ts`, `lib/event-ai-context.ts`)

### Infrastructure

- [x] Prisma schema with migrations
- [x] Domain ERD SVGs with CI verification
- [x] GitHub Actions: build, lint, format, test coverage
- [x] Extensive Vitest test suite (co-located `*.test.ts(x)`)

## Specifications

| Spec | Title | Status |
|------|-------|--------|
| 0001 | Advanced packing list | Implemented |
| 0002 | Packing list sections | Implemented |
| 0003 | Event roles and settings | Implemented |
| 0004 | Event rides board | Implemented |
| 0005 | Event task board | Implemented |
| 0006 | Notifications | Implemented (in-app v1) |
| 0007 | Task board assignee modes and filters | Implemented |
| 0008 | Embedded packing collab on event tab | Implemented |

## Test Coverage

CI runs `npm run test:coverage` on every push/PR to `main`. Workspace rule targets >75% coverage for new code; existing suite is substantial across `lib/`, `app/actions/`, and `components/`.
