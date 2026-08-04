# geometry-sequencer-v2

v2 of Sacred Geometry Sequencer — parallel app sharing v1's Supabase backend (users, projects). v1 will eventually retire; until then both run side-by-side.

## Key pointers

- **v1 repo:** https://github.com/ianbrewer/geometry-app-keyframes
- **v1 live:** https://geometrysequencer.vercel.app
- **v2 live:** https://geometry-sequencer-v2.vercel.app
- **Supabase project:** `ttalbvgdxtnyppighwgf` (shared with v1)
- **Follow-ups + granular task list:** [tasks.tsv](./tasks.tsv) is the single source of truth — check it before starting new work, and append rows when tasks get deferred. Regenerate the human-facing [Task list.xlsx](./Task%20list.xlsx) (with dropdowns + filters) via `python3 scripts/tasks_to_xlsx.py`. If edits happen in the xlsx, sync back with `python3 scripts/xlsx_to_tasks.py`. Schema + dropdown options: [scripts/tasks_schema.py](./scripts/tasks_schema.py).

## Critical: schema ownership

Migrations live **only** in the v1 repo at `App/supabase/migrations/`. Never add a `supabase/migrations/` folder here. For any schema change:

1. Open a PR in the v1 repo adding the migration file.
2. From v1 repo's `App/` directory: `supabase db push`.
3. Both apps see the change (shared DB).

Running `supabase db push` from this repo would do nothing useful and could confuse the tracking table.

## Shared backend conventions

- **`projects.schema_version`** — v1 rows are `1`, v2 rows should be `2`. v1 doesn't yet filter on this (tracked in tasks.tsv); until it does, be careful not to write v2-shaped data to rows v1 will try to render.
- **`asset_folders` + `assets`** tables — v2-only. Flat folder structure. Metadata only; blob lives in Storage.
- **Storage bucket `v2-user-assets`** — private, 25MB cap, MIME allowlist (`image/svg+xml`, `image/png`, `image/jpeg`, `text/plain`, `audio/mpeg`). Path convention: `{user_id}/{asset_id}.{ext}`. RLS enforces first path segment = `auth.uid()`. The app enforces a tighter 10MB cap for images/text; only mp3 music tracks may use the full 25MB.
- **Project JSON `formatVersion`** — every saved project payload carries `formatVersion` (see [App/src/utils/projectMigrations.ts](./App/src/utils/projectMigrations.ts) for the current number, migration registry, and policy). Additive optional fields need no bump; bump only when old builds would mis-render the new shape, and register a migration. Loads auto-migrate older payloads (in memory, persisted on save); payloads newer than the build are refused with a message. v2 saves also stamp the `projects.schema_version` column with `2`.
- **`profiles`** (with `is_admin` flag) — shared with v1. Admin policies already exist on all tables.
- **Project `id`** — `text` column, not DB-generated. v2 should prefix IDs (e.g. `v2_<uuid>`) to make eventual migration from v1 trivial (`WHERE id LIKE 'v2_%'`).

## Auth

Supabase Site URL points at v1 (`geometrysequencer.vercel.app`). Both v1 and v2 URLs are in the redirect allowlist. **Any v2 auth call that sends an email must pass `redirectTo: window.location.origin`** — otherwise the email link goes to v1. Password reset in `App/src/components/AuthModal.tsx` currently doesn't; that's tracked in tasks.tsv ("Auth redirectTo on v2 password reset").

Anon key + URL come from env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`); no hardcoded fallback. If you run locally, create `App/.env.local` with both.

## Dev

```
cd App
npm install
npm run dev     # Vite on port 3008
```

Build commands in `App/package.json` include multiple `build:*` scripts for separate bundles (player, pixi, astro, amino) — inherited from v1.

### Pre-commit bundle rebuild

`App/public/{player,pixi-bundle,astro-data,amino-data}.js` are committed build artifacts that the HTML / React Native exporters fetch at export time. The editor itself never reads them — it bundles `src/` via the main vite config — so they go stale silently when you change renderer / player / entry sources. The stale bundle only blows up later, in the user's exported HTML.

A pre-commit hook at [.githooks/pre-commit](.githooks/pre-commit) detects staged source changes in `src/player.ts`, `src/rendering/**`, `src/utils/**`, `src/constants/**`, `src/types/**`, `src/{pixi,astro,amino}-entry.ts`, or `src/data/{astro,amino,molecules}.ts`, then rebuilds the matching bundles and re-stages them into the commit. To enable it on a fresh clone:

```
git config core.hooksPath .githooks
```

Bypass with `git commit --no-verify` if you have a real reason; don't make a habit of it.
