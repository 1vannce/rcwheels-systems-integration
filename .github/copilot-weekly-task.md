Read `AGENTS.md` and `docs/PLAN.md` first.

Pick the next unfinished item in the current build phase from `docs/PLAN.md` section 8 and implement one small, self-contained slice of it (one domain function or one screen, not a whole phase).

Requirements:
- Follow the layer contract in `CLAUDE.md`. All stock changes go through the domain functions.
- Add Vitest unit tests that do not need a live database or real Supabase project.
- `npm run lint && npm run test:run && npm run build` must pass.
- Use fictional data only. Never commit secrets or `.env` files.
- In the PR description, say which plan item you did and what is left.
