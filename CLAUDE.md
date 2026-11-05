@AGENTS.md

# RCWheels prototype

Read [docs/PLAN.md](docs/PLAN.md) before changing code. It holds the scope, final decisions (section 3), structure (section 4), data model and stock events (section 7), and build phases (section 8). Do not ask the instructor or client to confirm anything; resolve gaps from the plan.

## Layers (each module in `src/modules/<module>/`)

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

## Structure rules

1. Tables live in `src/db/schema/`, not in the modules.
2. Modules talk only through `index.ts`, and only to services. Never import another module's repository or components.
3. Dependency order, lowest first: core, inventory, requisition, purchasing, delivery. A module imports only from modules below it. Dispatch lives in `requisition`; supplier receiving lives in `delivery`.
4. Only `inventory/services/stock.service.ts` changes stock balances. Other modules call it and pass their `tx`.
5. Services and repositories start with `import "server-only"`. Client components import from their own module by direct path, not through `index.ts`.
6. File names are kebab-case `<name>.<layer>.ts`, for example `purchase-order.service.ts`.

## Other rules

- Each business event runs in one `db.transaction`: the record, stock movement, status history, audit log, and notifications commit together or not at all.
- History is append-only. Corrections use linked reversals or new versions.
- The database client uses the Supabase pooler (port 6543) with `prepare: false`. `users` stores the Supabase auth ID as a plain unique `uuid`, with no foreign key to `auth.users`.
- Use fictional data only. Never commit secrets or `.env*` files other than `.env.example`.
- Commit messages use Conventional Commits: `type(scope): short description`, lowercase, imperative, no trailing period.
- Before committing, run `npm run lint`, `npm run build`, and `npm run test:run`.
