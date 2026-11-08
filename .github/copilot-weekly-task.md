Read `AGENTS.md` and `docs/PLAN.md` first.

`docs/PLAN.md` section 8 has no progress markers. Work out the current build phase from what already exists under `src/` and from merged and open pull requests, then pick the next unbuilt item in that phase. Implement one small, self-contained slice of it (one domain function or one screen, not a whole phase). Do not duplicate work in an open pull request.

Requirements:
- Follow the layer contract in `CLAUDE.md`. Only `inventory/services/stock.service.ts` changes stock balances.
- Use a feature branch, never `main`, and Conventional Commits.
- Add Vitest unit tests that do not need a live database or real Supabase project.
- `npm run lint && npm run test:run && npm run build` must pass.
- Use fictional data only. Never commit secrets or `.env` files.
- In the PR description, say which plan item you did and what is left.
