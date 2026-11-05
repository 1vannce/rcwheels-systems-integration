# RCWheels Business Management System (prototype)

A browser-based academic prototype for RCWheels Corporation (PC 316 Systems Integration and Architecture 1, Group 5). It connects Requisition, Inventory, Purchasing, and Delivery for the main location through one central database, so staff can follow a request from submission to acceptance with its quantities and history in one place. The full plan is in [docs/PLAN.md](docs/PLAN.md).

Stack: Next.js (App Router, TypeScript), Tailwind CSS and shadcn/ui, Supabase (PostgreSQL, Auth, Storage), Drizzle ORM with postgres.js, Zod, Vitest, and Vercel.

## Setup

1. Install Node.js 20 or later, then install dependencies:

   ```powershell
   npm install
   ```

2. Copy the environment template and fill in the values from the Supabase dashboard:

   ```powershell
   Copy-Item .env.example .env.local
   ```

   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Project Settings > API.
   - `DATABASE_URL`: the connection pooler string in transaction mode (port 6543).
   - `TEST_DATABASE_URL`: a separate database on the local PostgreSQL 18 service.

   Drizzle commands read `.env`, so copy the same `DATABASE_URL` there when you run them. Never commit either file.

3. Run the app at http://localhost:3000:

   ```powershell
   npm run dev
   ```

| Script | Does |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run test` / `npm run test:run` | Vitest in watch mode / once |
| `npm run db:generate` | Generate a migration from `src/db/schema/` into `drizzle/` |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |
| `npm run db:studio` | Open Drizzle Studio |

Docker is not installed on the team's computers, so `supabase start` does not work. Use the hosted Supabase project.

## Structure

```
src/
  app/              routes only; pages import from modules
  modules/          core, inventory, requisition, purchasing, delivery
    <module>/       components/ actions/ services/ repositories/ schemas/ types/ index.ts
  db/               Drizzle client (index.ts) and tables (schema/)
  components/ui/    shadcn components
  lib/              Supabase clients, utils
drizzle/            generated migrations
```

| Layer | Does | Does not |
| --- | --- | --- |
| `app/` page | Loads data through a service, renders module components | Hold business logic |
| `components/` | UI, forms, tables | Import repositories or the db client |
| `actions/` | `"use server"`: gets the user, checks the role, parses input with Zod, calls one service, revalidates | Touch the database directly |
| `services/` | Business rules and status changes, one `db.transaction` per business event | Trust a user ID, role, or stock figure from the browser |
| `repositories/` | Drizzle queries only; every function takes `tx` | Contain rules or call other modules |
| `schemas/` | Zod schemas for forms and action input | Define database tables |
| `types/` | Shared TypeScript types | |
| `index.ts` | Public API: services and types | Re-export components or repositories |

Rules:

1. Tables live in `src/db/schema/`, not in the modules.
2. Modules talk only through `index.ts`, and only to services.
3. Dependency order, lowest first: core, inventory, requisition, purchasing, delivery. A module imports only from modules below it.
4. Only `inventory/services/stock.service.ts` changes stock balances.
5. Services and repositories start with `import "server-only"`. Client components import from their own module by direct path.
6. File names are kebab-case `<name>.<layer>.ts`, for example `purchase-order.service.ts`.

## Git workflow

- `main` is protected and always runs. Nobody pushes to it directly.
- One branch per feature or fix (`feat/requisition-form`), merged through a pull request reviewed by one teammate.
- Commit messages use [Conventional Commits](https://www.conventionalcommits.org/): `feat(inventory): add stock reservation`.
