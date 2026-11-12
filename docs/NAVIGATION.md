# Navigation and next steps

A map for anyone joining this codebase mid-build, plus the login/seed issue we
debugged while setting it up. Read this once, then keep it open as a index.

If you only have ten minutes: read "Start here", then "Follow one feature", then
"Current state" below.

## Start here

Reading order that avoids confusion:

1. [`README.md`](../README.md) — setup, commands, Git workflow.
2. [`docs/PLAN.md`](PLAN.md) — the source of truth. Sections that matter:
   - §3 decisions (why the data model looks like this)
   - §4 structure and roles
   - §7 data model and stock events
   - §8 build phases (this is your task list)
   - §9 scenarios (how the app will be demoed)
3. [`docs/ERD/ERD.md`](ERD/ERD.md) — 29 tables and the reason for every change
   from the original FigJam diagram. The `.svg` files in that folder are the
   visual versions.
4. [`AGENTS.md`](../AGENTS.md) and [`CLAUDE.md`](../CLAUDE.md) — the layer
   contract and invariants. Short; read them before writing code.
5. [`docs/PROJECT_STRUCTURE.md`](PROJECT_STRUCTURE.md) — folder-by-folder tour.
   Slightly older than the code (it still calls the project "foundation"), but
   the layer explanations are accurate.

## Current state at a glance

| Area | State | Where the code is |
| --- | --- | --- |
| Schema, migrations, seed | Done, all 29 tables exist in the hosted DB | `src/db/schema/*`, `drizzle/*.sql`, `src/db/seed.ts` |
| Login, roles, screens, audit, notifications, attachments | Done (Phase 1) | `src/modules/core/`, `src/app/login`, `src/app/(app)/layout.tsx` |
| Inventory: items, stock, adjustments, sales deductions | Done (Phase 2), DB-backed tests exist | `src/modules/inventory/`, `src/app/(app)/inventory/`, `src/db/schema/inventory.ts` |
| Requisition (RF, approval, reserve, AR, dispatch) | **Phase 3 built** — see [REQUISITION_MODULE.md](REQUISITION_MODULE.md) | `src/modules/requisition/`, screens under `src/app/(app)/requisitions/` and `.../inventory/` |
| Purchasing | **Not started** | `src/modules/purchasing/index.ts` |
| Delivery / supplier receiving | **Not started** | `src/modules/delivery/index.ts` |
| Dashboard, timeline, low-stock review | Dashboard exists; timeline is a placeholder | `src/app/(app)/dashboard/page.tsx`, `src/app/(app)/[...path]/page.tsx` |

Anything not built yet still has a route: `src/app/(app)/[...path]/page.tsx`
serves a "later phase" page after the real role check, so navigation never 404s.
The list of screens, their URLs and which ones are built lives in
[`src/modules/core/services/navigation.service.ts`](../src/modules/core/services/navigation.service.ts)
(`builtScreens` and `screenRoutes`). Role → screen permissions live in
[`src/modules/core/services/role-access.service.ts`](../src/modules/core/services/role-access.service.ts).

## Follow one feature

The inventory adjustments screen is the best template: it is small, complete,
and touches every layer. Read these in order.

| Step | File | What to notice |
| --- | --- | --- |
| 1. URL | `src/app/(app)/inventory/adjustments/page.tsx` | Calls `requireScreen(...)`, then services only. No queries. |
| 2. Guard | `src/modules/core/services/session.service.ts` | `requireUser`, `requireScreen`, `requireRole`. Identity comes from the Supabase cookie, role from the `users` table. |
| 3. Business rules | `src/modules/inventory/services/adjustment.service.ts` | Custodian requests, manager approves; wrapped in `runBusinessEvent` (one transaction, audit log). |
| 4. Queries | `src/modules/inventory/repositories/adjustment.repository.ts` | Drizzle only, every function takes `tx`. |
| 5. Stock rules | `src/modules/inventory/services/stock.service.ts` | The **only** file allowed to change stock balances. Other modules call it with their own `tx`. |
| 6. Form | `src/modules/inventory/components/adjustment-form.tsx` | Client component, imports its own module by direct path. |
| 7. Action | `src/modules/inventory/actions/adjustment.actions.ts` | `"use server"` → `requireRole` → Zod parse → one service call → `revalidatePath`. |
| 8. Validation | `src/modules/inventory/schemas/inventory.schema.ts` | Zod schemas for form input. |

The same shape repeats for items
(`src/modules/inventory/actions/item.actions.ts`) and sales deductions
(`src/modules/inventory/actions/sales-deduction.actions.ts`). Copy the pattern;
do not invent a new one.

### Request path, end to end

```text
Browser
  └─ src/proxy.ts  →  src/lib/proxy.ts        session refresh, redirect to /login
       └─ src/app/(app)/layout.tsx            requireUser + navigation + unread count
            └─ src/app/(app)/.../page.tsx     requireScreen(<screen>)
                 ├─ service                  src/modules/<module>/services/*
                 │    └─ repository           src/modules/<module>/repositories/*
                 │         └─ src/db/index.ts (Drizzle client, transaction type Tx)
                 └─ <form action={...}>       src/modules/<module>/actions/*
                      └─ same service path
```

## Login and the seed (what we debugged)

Files involved:

- `src/db/seed.ts` — creates roles, users, items, suppliers, the storage bucket,
  and the Supabase Auth accounts.
- `src/modules/core/services/auth.service.ts` — `signIn()` calls
  `supabase.auth.signInWithPassword`, then requires an active row in `users`.
- `src/modules/core/actions/auth.actions.ts` — the server action behind the form;
  redirects to `/dashboard` on success.
- `src/modules/core/components/login-form.tsx` — the form at `/login`.
- `src/lib/server.ts`, `src/lib/client.ts`, `src/lib/proxy.ts` — Supabase clients.
- `.env.example` — the full list of settings.

### Seeded accounts

All 11 use the same password: the value of `SEED_USER_PASSWORD` at the moment
the seed created them. Emails are fictional `@rcwheels.test` addresses.

| Email | Role |
| --- | --- |
| `requester@rcwheels.test` | requester (approver: `approver@`) |
| `mechanic1@rcwheels.test` | requester (approver: `depthead@`) |
| `mechanic2@rcwheels.test` | requester (approver: `depthead@`) |
| `approver@rcwheels.test` | requisition_approver |
| `depthead@rcwheels.test` | requisition_approver |
| `custodian@rcwheels.test` | inventory_custodian |
| `invmanager@rcwheels.test` | inventory_manager |
| `purchasing@rcwheels.test` | purchasing_staff |
| `accounting@rcwheels.test` | associate |
| `delivery@rcwheels.test` | delivery_operations |
| `admin@rcwheels.test` | system_administrator (all screens) |

Sign in at <http://localhost:3000/login> after `npm run dev`.

### The "Supabase Auth was skipped" message

`ensureAuthUsers()` in `src/db/seed.ts` returns `null` unless **all three** of
these are set:

```text
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SECRET_KEY=
SEED_USER_PASSWORD=
```

Common causes:

1. Only `SEED_USER_PASSWORD` is set. `SUPABASE_SECRET_KEY` is a separate value —
   it is **not** `SUPABASE_DB_PASSWORD` (that one is the Postgres password).
   Get the secret key from Supabase Dashboard → Project Settings → API keys
   (`sb_secret_…`, or the legacy `service_role` JWT). Server-side only.
2. Values were put in `.env.local`, but the seed uses `dotenv/config`, which
   reads **`.env` only**. Drizzle and the seed read `.env`; the app reads
   `.env.local` (and falls back to `.env`). See
   [`.env.example`](../.env.example) and the notes in `README.md`.
3. The seed was run from another directory, so `.env` was not found.

### Passwords are not reset by re-running the seed

`ensureAuthUsers()` skips any email that already exists:

```ts
if (authIds.has(email)) continue;
```

So once the 11 accounts exist, changing `SEED_USER_PASSWORD` and re-running
`npm run db:seed` does nothing to their passwords. To change one:

- Supabase Dashboard → Authentication → Users → open the user → update password, or
- call `supabase.auth.admin.updateUserById(id, { password })` with a script, or
- delete the Auth users and re-run the seed (the seed's `onConflictDoUpdate` on
  `email` rewrites `auth_user_id`, so the links recover).

`users.auth_user_id` must match the Supabase Auth user ID — that is how
`findActiveUserByAuthId` in
`src/modules/core/repositories/user.repository.ts` maps a session to a role.
There is deliberately no foreign key to `auth.users`.

Useful checks:

```bash
# Which emails have both an app row and an Auth account, and do the IDs match?
psql "$DATABASE_URL" -c "select email, auth_user_id from users order by email;"
psql "$DATABASE_URL" -c "select id, email, email_confirmed_at is not null as confirmed from auth.users;"
```

## Testing

- Runner: [`vitest.config.ts`](../vitest.config.ts). Only `src/**/*.test.ts(x)`,
  Node environment, `@` → `src`, `server-only` stubbed by `src/test/server-only.ts`.
- Env handling: `src/test/setup.ts` forces `DATABASE_URL` to point at a dead
  address, so tests can never reach the hosted database.
- DB-backed tests: `src/test/db.ts` exposes `describeWithDatabase`, which
  `it.skip`s unless `TEST_DATABASE_URL` is set. `src/test/test-env.ts` reads it
  from the environment or from **`.env.local`** — not `.env`.
  `src/test/global-setup.ts` migrates that database once per run.
- Result: with no `.env.local`, `npm run test:run` reports roughly
  "16 passed / 40 skipped". That is expected, not a failure. Add
  `TEST_DATABASE_URL` to `.env.local` (local PostgreSQL 18) to run the rest.
- Fixtures: `src/test/stock-fixtures.ts`, `createUsersForEveryRole()` in
  `src/test/db.ts`.
- Schema guard: `src/db/schema/schema.test.ts` asserts the table list and the
  enum values — update it when you add a table.

Before every PR: `npm run lint && npm run test:run && npm run build`.
CI (`.github/workflows/ci.yml`) runs the same with placeholder env values and
no database.

## Gotchas worth knowing

- `src/modules/<module>/index.ts` is a public API. Other modules import only
  from it, and only services/types. Client components import their own module
  by direct path.
- Dependency order is one-way: core → inventory → requisition → purchasing →
  delivery. Requisition must not import purchasing, etc.
- Only `src/modules/inventory/services/stock.service.ts` may change stock
  balances. Requisition dispatch will call it with its own `tx`.
- Services and repositories start with `import "server-only"`. Tables live in
  `src/db/schema/`, never in modules.
- `next.config.ts` enables `cacheComponents` and `partialPrefetching`. Next 16
  changed caching and dynamic APIs; the bundled docs are in
  `node_modules/next/dist/docs/` — read the relevant guide before adding
  `"use cache"`, `connection()`, or other data-fetching config.
- `.env*` is gitignored except `.env.example`. Never commit the secret key.
- The database client (`src/db/index.ts`) needs the Supabase transaction pooler
  on port 6543 with `prepare: false`.

## Possible next actions

Pick one track. Track A unblocks everyone; B and C are the real feature work.

### A. Make the environment boringly reliable (small, do first)

1. Add `SUPABASE_SECRET_KEY` to `.env`, run `npm run db:seed`, confirm the
   success message and the `documents` storage bucket.
2. Set every seeded password to a known `SEED_USER_PASSWORD` (Dashboard or an
   admin script) and verify login for `custodian@`, `invmanager@`, `admin@`.
3. Create `.env.local` from `.env.example` and add `TEST_DATABASE_URL`, so the
   40 skipped DB tests actually run.
4. Update `docs/PROJECT_STRUCTURE.md` line 5: it still says "Current stage:
   foundation", but Phases 1–3 are merged.

### B. Phase 3 — requisition (done)

The requisition module is built and documented in
[REQUISITION_MODULE.md](REQUISITION_MODULE.md): submit → approve/reject →
resubmit → reserve → AR preparation → dispatch, with DTOs, DB-backed tests, and
screens under `src/app/(app)/requisitions/` and `src/app/(app)/inventory/`.
Phases 4 (internal delivery, acceptance, returns) and 5 (purchasing) remain.

### C. Finish the visibility work that is cheap now (small, parallel)

- Request timeline page `/timeline` — `findScreenByPath` already maps it; build
  `src/app/(app)/timeline/page.tsx` using `audit_log` and status history.
- Low-stock review `/inventory/low-stock` — data is already in
  `listItemsWithStock()` (`src/modules/inventory/services/item.service.ts`).
- Dashboard cards — `src/app/(app)/dashboard/page.tsx` currently only lists
  navigation; add counts (pending approvals, low stock, unread).

### D. Cleanup that pays for itself

- Backfill `.env.local` for every teammate and note the `.env` vs `.env.local`
  split in the README setup step.
- Add a seed helper for resetting passwords (see "Login and the seed").
- Keep `docs/PLAN.md` §8 status in sync as phases merge; it is what the
  instructor will read.

## Cheat sheet

| I want to... | Look in |
| --- | --- |
| Understand scope and phases | `docs/PLAN.md` §3, §8 |
| Understand a table | `src/db/schema/<module>.ts`, then `docs/ERD/ERD.md` |
| Change a business rule | `src/modules/<module>/services/` |
| Add or change a query | `src/modules/<module>/repositories/` |
| Add a screen | `src/app/(app)/<path>/page.tsx` + `src/modules/<module>/components/` |
| Change who can see a screen | `src/modules/core/services/role-access.service.ts` + `.../navigation.service.ts` |
| Debug "not allowed" | `src/modules/core/services/authorization.service.ts`, `audit_log` table |
| See stock rules | `src/modules/inventory/services/stock.service.ts` |
| Reset local data | `npm run db:seed` (idempotent), or `psql` against `TEST_DATABASE_URL` |
| See available migrations | `drizzle/` (`0000`–`0002`) |
