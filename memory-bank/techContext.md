# Tech Context

## Runtime Requirements

- **Node.js:** 20.19+, 22.12+, or 24.0+ (see `package.json` engines)
- **npm:** 9.0.0+
- Other major versions (18, 21, 23) are not supported (Prisma constraint)

## Stack

### Frontend

| Technology    | Version / Notes                                   |
| ------------- | ------------------------------------------------- |
| TypeScript    | 5.5+                                              |
| Next.js       | 14 (App Router)                                   |
| React         | 18                                                |
| Tailwind CSS  | 3.4                                               |
| UI components | shadcn/ui patterns                                |
| Drag-and-drop | `@dnd-kit/core`, `@dnd-kit/sortable`              |
| Markdown      | `react-markdown`, `remark-gfm`, `rehype-sanitize` |

### Backend / Data

| Technology    | Notes                                             |
| ------------- | ------------------------------------------------- |
| PostgreSQL    | Hosted on Supabase                                |
| Prisma        | 7.x with `@prisma/adapter-pg`                     |
| Clerk         | Auth and session management (`@clerk/nextjs` 5.x) |
| Liveblocks    | Realtime packing collaboration                    |
| Anthropic SDK | `@anthropic-ai/sdk`; model `claude-sonnet-4-5`    |

### Dates

- **Luxon** (`luxon`) for timezone-aware formatting and manipulation

## Environment Variables

Copy `.env.example` to `.env.local`:

| Variable                            | Purpose                                 |
| ----------------------------------- | --------------------------------------- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk client key                        |
| `CLERK_SECRET_KEY`                  | Clerk server key                        |
| `DATABASE_URL`                      | PostgreSQL connection string (Supabase) |
| `ANTHROPIC_API_KEY`                 | Claude API access                       |
| `LIVEBLOCKS_SECRET_KEY`             | Liveblocks server auth                  |

Never commit secrets. CI uses a dummy `DATABASE_URL`.

## Development Commands

```bash
npm install          # postinstall runs prisma:generate
npm run dev          # Next.js dev server
npm run build        # Production build
npm run lint         # ESLint (Next + TypeScript + Tailwind)
npm run format       # Prettier write
npm run format:check # Prettier check (CI)
npm run test         # Vitest watch mode
npm run test:run     # Vitest single run
npm run test:coverage # Coverage report (CI)
```

### Prisma

```bash
npm run prisma:generate       # Generate client + ERD SVGs
npm run prisma:migrate:dev      # Create/apply migrations (dev)
npm run prisma:migrate:deploy   # Apply migrations (prod)
npm run prisma:push             # db push (dev shortcut)
npm run prisma:studio           # GUI browser
```

Session-scoped variants (`*:session`) use `scripts/prisma-*-session.cjs` for multi-database local setups.

## CI/CD

**Workflow:** `.github/workflows/node.js.yml`

Triggers on push/PR to `main`:

1. `npm ci`
2. Regenerate ERD SVGs if `prisma/schema.prisma` changed (requires Puppeteer/Chrome deps on ubuntu-22.04)
3. `npm run build`
4. `npm run lint`
5. `npm run format:check`
6. `npm run test:coverage`

`DISABLE_ERD=true` in CI except when schema changes.

## Hosting

- **Intended platform:** Vercel (Next.js-native, GitHub integration)
- **Database:** Supabase PostgreSQL
- **Auth:** Clerk hosted
- **Collab:** Liveblocks cloud
