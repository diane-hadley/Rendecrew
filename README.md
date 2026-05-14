# 🎉 Rendecrew

A collaborative trip/event planner with an embedded AI coordinator

Rendecrew turns plain-English ideas into fully organized plans.

Describe your event —

```
"30 friends camping in the woods over Labor Day, music gear, shared meals"
```

—and Rendecrew generates everything you need to make it happen:

- 🗓️ Task board for organizing who's doing what

- 🎒 Group packing list to track shared items

- 🚗 Ride coordination to match drivers and passengers

Then, just ask:

```
"Who still needs a ride?"
"What's left before Friday?"
```

Rendecrew learns from your past events, making planning faster, smarter, and easier every time. Use Rendecrew for your next event, no matter how big (group international trip?) or small (potluck?).

## Getting Started

To set up Rendecrew on your local machine, follow these guides in order:

1. **[Setup guide](./docs/SETUP.md)** - Complete local setup
2. **[GitHub PAT](./docs/SETUP_PAT.md)** - Personal Access Token (only if needed for pushing code)

## Tech Stack

### Product / UI

- **Language**: TypeScript
- **JS Framework**: Next.js (React based; runs on Node.js)
  - Logic done by Server Actions
- **CSS Framework**: Tailwind
  - Using predesigned components from shadcn/ui

### Data

- **DB System**: PostgreSQL
- **Managed Service**: Supabase (PostgreSQL)
- **ORM**: Prisma

### Backend

- **Auth / Session Management:** Clerk
- **Realtime collaboration SDK**: Liveblocks
- Once there are heavier or batched workloads:
  - **Language**: Python
  - **Python Web Framework**: FastAPI

### AI

- **LLM**: Claude Sonnet 4.5 (`claude-sonnet-4-5`)
- **SDK**: [@anthropic-ai/sdk](https://www.npmjs.com/package/@anthropic-ai/sdk) (Anthropic Claude API)

### Hosting

- **Hosting Platform**: Vercel
  - _Built specifically for Next.js with GitHub integration_

## Project Structure

```
app/                      # Next.js App Router
  ├── layout.tsx          # Root layout (ClerkProvider, fonts, globals)
  ├── page.tsx            # Home route (composes components/home)
  ├── globals.css
  ├── actions/            # Server Actions ("use server") — mutations, revalidatePath
  ├── api/                # Route handlers (HTTP), e.g. cron, Liveblocks auth
  ├── dashboard/          # Authenticated app pages (events, settings, notifications)
  ├── packing/            # Public/shared packing room pages
  ├── sign-in/            # Clerk sign-in
  └── sign-up/            # Clerk sign-up

components/               # React UI (feature folders + shared pieces)

hooks/                    # Client-only React hooks (e.g. dismiss-on-outside-pointer)

lib/                      # TypeScript modules usable from RSC, actions, and route handlers

prisma/
  └── schema.prisma       # Database schema (PostgreSQL via Supabase)

middleware.ts             # Clerk middleware for route protection
```

**Conventions:** RSC pages load data via **`lib/`** (and Clerk), then pass props into client components. **`app/actions`** call **`lib`** and Prisma; UI imports actions for mutations. Shared **types** that cross the UI boundary live in **`lib/*-types.ts`** (not in action files). **Tests** stay next to the code they cover (`*.test.ts` / `*.test.tsx`).
