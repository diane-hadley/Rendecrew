# Product Context

## Why Rendecrew Exists

Planning a group event means juggling many parallel workstreams: who does what, who brings what, and how everyone gets there. Rendecrew centralizes those workstreams into a single event workspace so organizers spend less time chasing updates and participants always know where to look.

## How It Should Work

### Entry

1. User signs up or signs in (Clerk).
2. From the dashboard, they create an event—either by describing it in plain English or filling in a form.
3. Claude parses natural-language descriptions into structured fields (title, location, dates, general information Markdown).

### Event Workspace

Each event has tabbed detail pages (`?tab=` deep links):

| Tab          | Purpose                                                               |
| ------------ | --------------------------------------------------------------------- |
| **Overview** | General information (Markdown), event metadata, AI drafting assistant |
| **Tasks**    | Task board with assignments, due dates, filters (when enabled)        |
| **Packing**  | Group packing list with Liveblocks collaboration (when enabled)       |
| **Rides**    | Driver/passenger coordination board (when enabled)                    |
| **Members**  | Participant list and invitations                                      |
| **Settings** | Optional features, roles, notification prefs, delete event            |

Optional features (`packingEnabled`, `ridesEnabled`, `taskBoardEnabled`) are toggled per event in settings so small events (e.g. a potluck) stay lightweight.

### AI Interactions

Three AI surfaces, all server-side via Claude Sonnet 4.5:

1. **Natural-language create** — Parses a sentence or two into event fields on creation.
2. **General information assistant** — Organizers ask for drafts or edits to the Overview Markdown.
3. **Event chat** — Members ask questions; answers use only data loaded from the database (event details, packing sign-ups, etc.). The assistant must say when information is not in context rather than inventing details.

### Packing Flows

- **Organizers** manage list structure (sections, template), share a public URL, and optionally require approval for member suggestions.
- **Members** sign up for items, adjust quantities, maintain personal packing items, and collaborate in real time.
- **Embedded collab** — Signed-in members use the full Liveblocks experience directly on the event Packing tab (spec 0008).
- **Standalone route** — `/packing/[roomId]` remains the canonical share entry for guests and link-only access.

### Notifications

In-app only (v1). Four categories—Event, Packing, Rides, Tasks—with independent toggles per kind. Global account preferences apply by default; per-event overrides take precedence when set. Opening the notifications inbox marks all rows read. Rows are purged after 30 days.

### Roles and Permissions

- **Organizers** can manage event settings, members, packing template, and use AI drafting.
- **Members** participate in boards and chat; some actions depend on `memberManagementPolicy` and packing visibility settings (see spec 0003).

## User Experience Goals

- **Practical tone** — Content and AI responses suit real participants, not corporate boilerplate.
- **Grounded AI** — Never guess parking, dress code, or other details absent from event data.
- **Progressive complexity** — Disable rides/tasks/packing when an event doesn't need them.
- **Timezone-aware** — Users have a default timezone; events store IANA zones for wall-time display of start, end, and task due dates.
