# Project Brief

## Name

Rendecrew

## One-liner

A collaborative trip/event planner with an embedded AI coordinator.

## Problem

Group events—camping trips, potlucks, reunions, international travel—require coordinating tasks, shared supplies, rides, and communication across many people. Spreadsheets, group chats, and ad-hoc tools fragment the work and leave gaps (who is bringing what, who still needs a ride, what's due before departure).

## Solution

Rendecrew turns plain-English event descriptions into structured, actionable plans. Organizers and members work in one app with dedicated boards for tasks, packing, and rides, plus an AI assistant grounded in live event data.

Example input:

```
30 friends camping in the woods over Labor Day, music gear, shared meals
```

The app generates and maintains the organizational scaffolding; users can then ask questions like "Who still needs a ride?" or "What's left before Friday?"

## Core Requirements

1. **Event lifecycle** — Create, edit, and manage events with title, schedule, location, and Markdown general information.
2. **Membership** — Invite and manage participants with role-based permissions (organizers vs members).
3. **Task board** — Assign and track tasks with due dates, statuses, and flexible assignee completion modes.
4. **Group packing list** — Shared list with sections, sign-ups, quantities, suggestions, and real-time collaboration (Liveblocks).
5. **Ride coordination** — Match drivers and passengers with configurable ride modes and custom fields.
6. **Notifications** — In-app inbox with per-category preferences (global and per-event overrides).
7. **AI assistance** — Natural-language event creation, general-information drafting, and event-scoped chat grounded in database context.

## Users

- **Organizers** — Create events, configure optional features, manage members, approve packing suggestions (when required).
- **Members** — Participate in tasks, packing, and rides; receive notifications; use AI chat about the event.

All users authenticate via Clerk; there is no guest dashboard access (public packing URLs may be shared separately).

## Success Criteria

Organizers can describe an event in natural language, invite members, and coordinate tasks, packing, and rides in one place—with AI help that stays grounded in actual event data.

## Source of Truth Documents

- `README.md` — Product overview and project structure
- `docs/specs/*.md` — Feature specifications
- `docs/DATA_MODEL.md` — Database ERDs and schema slices
- `docs/SETUP.md` — Local development setup
