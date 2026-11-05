<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# RCWheels systems integration

Academic prototype: Next.js 16 App Router + TypeScript, Supabase Postgres/Auth, Drizzle ORM, Zod, Vitest. Read `docs/PLAN.md` before changing behavior; it is the source of truth for scope, decisions, data model, stock rules, and build phases. `CLAUDE.md` has the full layer contract.

## Commands

- Install with `npm install`; npm is the package manager and `package-lock.json` is committed.
- `npm run dev` starts the app at http://localhost:3000.
- `npm run lint` runs ESLint across the repo.
- `npm run test:run` runs Vitest once. `npm run test` is watch mode, so do not use it in CI.
- Single test: `npm run test:run -- src/app/api/health/route.test.ts`.
- `npm run build` is the production build and also runs the TypeScript check.
- Before committing or opening a PR: `npm run lint && npm run test:run && npm run build`.
- Drizzle: `npm run db:generate`, `npm run db:migrate`, `npm run db:studio`. These read `.env`; the app reads `.env.local`.

## CI

`.github/workflows/ci.yml` runs on pushes and pull requests to `main`: `npm ci`, lint, `test:run`, then `build`. CI has no secrets or database, so it injects placeholder Supabase/DB env values; unit tests must not require a live DB or real Supabase project.

## Architecture

Read `CLAUDE.md` for the full layer contract. The non-obvious invariants:

- `src/modules/<module>/` is the unit; `src/app/` holds routes only and loads data through module services.
- Modules import each other only through `index.ts`, and only services. Dependency order, lowest first: core, inventory, requisition, purchasing, delivery.
- Tables live in `src/db/schema/`, not in modules. Only `inventory/services/stock.service.ts` may change stock balances.
- Services own business rules and wrap each event in one `db.transaction`; repositories are Drizzle queries only and always receive `tx`. Both start with `import "server-only"`.
- Actions are `"use server"`: authenticate, check role, parse with Zod, call one service, revalidate. Never touch the database directly.
- Client components import their own module by direct path, not through `index.ts`.
- File names are kebab-case `<name>.<layer>.ts`, for example `purchase-order.service.ts`.
- `users` stores the Supabase auth ID as a plain unique UUID. Never add a foreign key to `auth.users`; the local test database has no Supabase auth schema.
- Connect through the Supabase transaction pooler on port 6543 with postgres.js `prepare: false`.
- `next.config.ts` enables `cacheComponents` and `partialPrefetching`; read the bundled Next 16 docs before using caching or dynamic APIs.

## Setup and testing

- Docker is unavailable on team machines; use the hosted Supabase project instead of `supabase start`.
- Copy `.env.example` to `.env.local`; Drizzle commands also need the same values in `.env`. Never commit either file, and use fictional data only.
- Vitest only collects `src/**/*.test.{ts,tsx}`, runs in a Node environment, and aliases `@` to `src`.
- DB-backed tests use `TEST_DATABASE_URL` (local PostgreSQL 18), kept separate from `DATABASE_URL`. No DB-backed tests exist yet.

## Git

- `main` is protected: work on a feature/fix branch, then merge through a PR reviewed by one teammate.
- Use Conventional Commits, lowercase and imperative: `feat(inventory): add stock reservation`.
