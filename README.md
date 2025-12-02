# 🎉 Rendecrew
A collaborative trip/event planner with an embedded AI coordinator

Rendecrew turns plain-English ideas into fully organized plans.

Describe your event —

```
“30 friends camping in the woods over Labor Day, music gear, shared meals”
```

—and Rendecrew generates everything you need to make it happen:

* 🗓️ Task board for organizing who’s doing what

* 🎒 Group packing list to track shared items

* 🚗 Ride coordination to match drivers and passengers

* 💸 Budget reminders to keep expenses fair and transparent

Then, just ask:
```
“Who still needs a ride?”
“What’s left before Friday?”
```
Rendecrew learns from your past events, making planning faster, smarter, and easier every time. Use Rendecrew for your next event, no matter how big (group international trip?) or small (potluck?).


## Tech Stack Plan

### Product / UI

- **Language**: TypeScript
- **JS Framework**: Next.js (React based; runs on Node.js)
    - Logic done by Server Actions
- **CSS Framework**: Tailwind
    - Using predesigned components from shadcn/ui

### Data

- **DB System**: PostgreSQL
- **Managed Service**: Azure Database for PostgreSQL
- **ORM**: Prisma

### Backend

- **Auth / Session Management:** Clerk
- **Realtime collaboration SDK**: Liveblocks
- Once I have heavier or batched workloads:
    - **Language**: Python
    - **Python Web Framework**: FastAPI
    - **Backend Development Platform**: Supabase (for Postgres)

### AI

- **LLM**: GPT-4o
- **AI Runtime**: Azure OpenAI

### Hosting

- **Hosting Platform**: Vercel
    - *Built specifically for Next.js with GitHub integration*