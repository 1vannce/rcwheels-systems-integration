<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# RCWheels systems integration

Academic prototype: Next.js 16 App Router + TypeScript, Supabase Postgres/Auth, Drizzle ORM, Zod, Vitest. This file is the single source of agent instructions; `CLAUDE.md` only imports it.

Read [docs/PLAN.md](docs/PLAN.md) before changing behavior. It is the source of truth for scope, final decisions (section 3), structure (section 4), data model and stock events (section 7), and build phases (section 8). Do not ask the instructor or client to confirm anything; resolve gaps from the plan.

## Commands

- Install with `npm install`; npm is the package manager and `package-lock.json` is committed.
- `npm run dev` starts the app at http://localhost:3000.
- `npm run lint` runs ESLint across the repo.
- `npm run test:run` runs Vitest once. `npm run test` is watch mode, so do not use it in CI.
- Single test: `npm run test:run -- src/app/api/health/route.test.ts`.
- `npm run build` is the production build and also runs the TypeScript check.
- Before committing or opening a PR: `npm run lint && npm run test:run && npm run build`.
- Drizzle: `npm run db:generate`, `npm run db:migrate`, `npm run db:studio`. These read `.env`; the app reads `.env.local`.

## Architecture

Each module lives in `src/modules/<module>/`. `src/app/` holds routes only and loads data through module services.

### Layers

| Layer | Does | Does not |
| --- | --- | --- |
| `app/` page | Loads data through a service, renders module components | Hold business logic |
| `components/` | UI, forms, tables | Import repositories or the db client |
| `actions/` | `"use server"`: gets the user, checks the role, parses input with Zod, calls one service, revalidates | Touch the database directly |
| `services/` | Business rules and status changes | Trust a user ID, role, or stock figure from the browser |
| `repositories/` | Drizzle queries only; every function takes `tx` | Contain rules or call other modules |
| `schemas/` | Zod schemas for forms and action input | Define database tables |
| `types/` | Shared TypeScript types | |
| `index.ts` | Public API: services and types | Re-export components or repositories |

### Structure rules

1. Tables live in `src/db/schema/`, not in the modules.
2. Modules talk only through `index.ts`, and only to services. Never import another module's repository or components.
3. Dependency order, lowest first: core, inventory, requisition, purchasing, delivery. A module imports only from modules below it. Dispatch lives in `requisition`; supplier receiving lives in `delivery`.
4. Only `inventory/services/stock.service.ts` changes stock balances. Other modules call it and pass their `tx`.
5. Services and repositories start with `import "server-only"`. Client components import from their own module by direct path, not through `index.ts`.
6. File names are kebab-case `<name>.<layer>.ts`, for example `purchase-order.service.ts`.

### Data and transactions

- Each business event runs in one `db.transaction`: the record, stock movement, status history, audit log, and notifications commit together or not at all.
- History is append-only. Corrections use linked reversals or new versions.
- Connect through the Supabase transaction pooler on port 6543 with postgres.js `prepare: false`.
- `users` stores the Supabase auth ID as a plain unique `uuid`. Never add a foreign key to `auth.users`; the local test database has no Supabase auth schema.
- `next.config.ts` enables `cacheComponents` and `partialPrefetching`; read the bundled Next 16 docs before using caching or dynamic APIs.

## Setup and testing

- Docker is unavailable on team machines; use the hosted Supabase project instead of `supabase start`.
- Copy `.env.example` to `.env.local`; Drizzle commands also need the same values in `.env`.
- Use fictional data only. Never commit secrets or `.env*` files other than `.env.example`.
- Vitest only collects `src/**/*.test.{ts,tsx}`, runs in a Node environment, and aliases `@` to `src`.
- DB-backed tests use `TEST_DATABASE_URL` (local PostgreSQL 18), kept separate from `DATABASE_URL`. No DB-backed tests exist yet.

## CI

`.github/workflows/ci.yml` runs on pushes and pull requests to `main`: `npm ci`, lint, `test:run`, then `build`. CI has no secrets or database, so it injects placeholder Supabase/DB env values; unit tests must not require a live DB or real Supabase project.

## Git and pull requests

- `main` is protected: work on a feature/fix branch, then merge through a PR reviewed by one teammate.
- Commit messages use Conventional Commits: `type(scope): short description`, lowercase, imperative, no trailing period, for example `feat(inventory): add stock reservation`.
- Run `npm run lint && npm run test:run && npm run build` before committing or opening a PR.
- Every PR an agent creates must use [docs/PULL_REQUEST_TEMPLATE.md](docs/PULL_REQUEST_TEMPLATE.md). Read it at PR time, keep its headings and order (Summary, Changes, Type of Change, Testing, Screenshots / References, Checklist, Additional Notes), and fill every section. Tick only the Type of Change and Checklist boxes that are true, and write "N/A" for a section that does not apply instead of deleting it. Pass the filled text with `gh pr create --body-file <file>`, not an ad-hoc body.
