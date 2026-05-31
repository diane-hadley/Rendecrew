# Active Context

## Last Updated

2026-05-31 — Memory bank initialized.

## Current Focus

No active feature branch or in-progress task was identified at initialization. The codebase is in a stable post-refactor state following recent reorganization and data model documentation work.

## Recent Changes (from git history)

- Cursor rules fix (`2590f31`)
- Refactor and reorganization merges (PRs #151, #152)
- Data model ERD documentation and CI workflow for SVG generation (PR #149)
- Project structure consolidation (`app/actions`, `lib/`, co-located tests)

## Current State Summary

The core Rendecrew application is functional end-to-end:

- Auth, dashboard, event CRUD, all event detail tabs
- Packing with embedded Liveblocks collab on the event tab (spec 0008 implemented)
- Rides board, task board, notifications
- AI: NL event parsing, general-information assistant, event chat
- Vitest test suite with CI coverage gate

## Active Decisions

| Decision | Rationale |
|----------|-----------|
| Server Actions for mutations | Colocated with UI; simpler than REST API layer |
| In-app notifications only (v1) | Spec 0006 scope; email/push deferred |
| Liveblocks for packing collab | Real-time shared list editing without custom websocket infra |
| Claude Sonnet 4.5 | Default model for all AI features |
| Optional per-event features | Keeps small events lightweight |

## References

- Specs: `docs/specs/`
- Progress tracker: `memory-bank/progress.md`
- Setup: `docs/SETUP.md`
