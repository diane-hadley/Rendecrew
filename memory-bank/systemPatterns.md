# System Patterns

## Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  app/ pages │ ──► │  lib/ modules │ ──► │   Prisma    │
│  (RSC)      │     │  + Clerk      │     │  PostgreSQL │
└─────────────┘     └──────────────┘     └─────────────┘
       │                    ▲
       ▼                    │
┌─────────────┐     ┌──────────────┐
│ components/ │ ──► │ app/actions/ │
│ (client UI) │     │ server actions │
└─────────────┘     └──────────────┘
```

- **Pages** (`app/`) are React Server Components that load data via `lib/` and Clerk, then pass props to client components.
- **Mutations** go through **server actions** (`app/actions/`, `"use server"`), which call `lib/` helpers and Prisma, then `revalidatePath` as needed.
- **HTTP route handlers** (`app/api/`) are reserved for cron jobs, Liveblocks auth, and other non-action endpoints.

## Directory Conventions

| Path | Role |
|------|------|
| `app/` | Next.js App Router routes, layouts, actions, API |
| `components/` | React UI grouped by feature (`events/`, `packing/`, `tasks/`, etc.) |
| `hooks/` | Client-only React hooks |
| `lib/` | Shared TypeScript modules usable from RSC, actions, and route handlers |
| `prisma/` | Schema, migrations, ERD generators |
| `docs/specs/` | Numbered feature specifications |
| `scripts/` | Prisma session helpers, ERD post-processing |

## Key Technical Decisions

### Server Actions over REST for mutations

Business logic and authorization live in server actions and `lib/` modules, not in client-side fetch calls. This keeps mutations colocated with the UI that triggers them.

### Shared types in `lib/*-types.ts`

Types that cross the UI boundary live in dedicated type files under `lib/`, not exported from action files.

### Auth: Clerk + local User row

`middleware.ts` protects dashboard routes. `getOrCreateUser()` syncs the Clerk session to a `User` record (keyed by `clerkId`) on first access. Event membership is modeled in `EventMember` with roles.

### Realtime: Liveblocks for packing

Each `PackingList` has a `liveblocksRoomId`. Collaborative editing uses `@liveblocks/react` with auth via `app/api/liveblocks-auth/route.ts`. Embedded and standalone packing surfaces join the same room.

### AI: server-only Anthropic calls

`lib/anthropic.ts` wraps the SDK. All Claude calls happen in server actions or `lib/` functions—never from the client. Event context for chat is assembled in `lib/event-ai-context.ts`.

### Notifications at mutation sites

Notification emitters live next to authoritative server mutations (packing sign-ups, ride changes, task updates, membership changes)—not only in UI components. See spec 0006.

### Date/time: wall time + IANA zones

Events and tasks store UTC timestamps plus IANA timezone strings for display. `lib/event-datetime.ts` and Luxon handle formatting; `hooks/use-event-wall-datetime-fields` supports form inputs.

## Domain Module Map

| Module prefix | Domain |
|---------------|--------|
| `lib/events`, `lib/event-*` | Event CRUD, roles, tabs, member policy |
| `lib/packing-*` | Lists, sections, sign-ups, suggestions, collab page data |
| `lib/event-rides-*` | Ride board types and logic |
| `lib/notifications`, `lib/notification-*` | Inbox, kinds, messages, preferences |
| `lib/event-ai-context`, `lib/parse-event-natural-language` | AI grounding and NL parsing |
| `lib/dashboard-events` | Dashboard event listing |

## Testing Patterns

- **Framework:** Vitest + `@testing-library/react` + jsdom
- **Location:** Co-located `*.test.ts` / `*.test.tsx` next to source
- **Setup:** `vitest.setup.tsx`
- **CI:** `npm run test:coverage` on every push/PR to `main`

## Data Model

- PostgreSQL via Supabase; schema in `prisma/schema.prisma`
- Domain slices documented as SVG ERDs in `docs/data-model-svgs/`
- ERDs regenerate on `prisma generate`; CI verifies SVG diffs when schema changes
- Migrations in `prisma/migrations/`; session-specific push/migrate scripts in `scripts/`

## Feature Specifications

Numbered specs in `docs/specs/` are authoritative for feature design:

| Spec | Topic |
|------|-------|
| 0001 | Advanced packing list |
| 0002 | Packing list sections |
| 0003 | Event roles and settings |
| 0004 | Event rides board |
| 0005 | Event task board |
| 0006 | Notifications |
| 0007 | Task board assignee modes and filters |
| 0008 | Embedded packing collab on event tab |
