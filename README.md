# 🎉 Rendecrew
A collaborative trip/event planner with an embedded AI coordinator

Rendecrew turns plain-English ideas into fully organized plans.

Describe your event —

```
"30 friends camping in the woods over Labor Day, music gear, shared meals"
```

—and Rendecrew generates everything you need to make it happen:

* 🗓️ Task board for organizing who's doing what

* 🎒 Group packing list to track shared items

* 🚗 Ride coordination to match drivers and passengers

* 💸 Budget reminders to keep expenses fair and transparent

Then, just ask:
```
"Who still needs a ride?"
"What's left before Friday?"
```
Rendecrew learns from your past events, making planning faster, smarter, and easier every time. Use Rendecrew for your next event, no matter how big (group international trip?) or small (potluck?).

## Getting Started

To set up Rendecrew on your local machine, follow these guides in order:

1. **[SETUP.md](./SETUP.md)** - Complete setup guide
2. **[SETUP_PAT.md](./SETUP_PAT.md)** - GitHub Personal Access Token setup (only if needed for pushing code)


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

- **LLM**: GPT-4o
- **AI Runtime**: Azure OpenAI

### Hosting

- **Hosting Platform**: Vercel
    - *Built specifically for Next.js with GitHub integration*

## Project Structure

```
app/
  ├── layout.tsx          # Root layout with ClerkProvider
  ├── page.tsx            # Home page with sign-in/sign-up
  ├── globals.css         # Global styles with Tailwind
  ├── sign-in/            # Sign-in page
  ├── sign-up/            # Sign-up page
  └── dashboard/          # Protected dashboard page

components/
  ├── UserButton.tsx      # User button component
  └── ProtectedRoute.tsx  # Client-side route protection

lib/
  └── prisma.ts           # Prisma Client singleton (database access)

prisma/
  └── schema.prisma       # Database schema (platform-agnostic PostgreSQL)

middleware.ts             # Clerk middleware for route protection
```

## Authentication Flow

- **Public routes**: `/`, `/sign-in`, `/sign-up`
- **Protected routes**: `/dashboard` and all other routes (protected by middleware)
- Users are automatically redirected to `/sign-in` if not authenticated