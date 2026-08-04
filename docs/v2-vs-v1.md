# What's New in v2 vs v1

A skim-friendly summary of everything in v2 (Sacred Geometry Sequencer 2) that v1 doesn't have, organized by area. Both apps share the same Supabase backend (users + projects), so users keep their accounts and existing work.

- **v1 live:** https://geometrysequencer.vercel.app
- **v2 live:** https://geometry-sequencer-v2.vercel.app
- **Status:** v2 runs in parallel with v1. v1 will retire eventually; until then both work side-by-side.

---

## Headline changes

1. **Asset Library** — users can now upload their own SVGs / PNGs / JPEGs into folders and use them as shape sources. The hardcoded astrology / amino-acid / I-Ching-stroke icon sets in v1 are now seeded as regular asset folders that users can edit, extend, or replace with their own.
2. **Project thumbnails + new dashboard** — every project gets a snapshot thumbnail. The dashboard has a list/grid view toggle and a resizable sidebar, defaulting to a wider grid view of thumbnails.
3. **Direct-link URLs** — share a link to any project; the recipient lands directly in that project (provided they have access).
4. **Saveable color + gradient palette** — colors and gradients you save persist across all projects.
5. **Editor polish** — drag-to-reorder layers, SVG recolor in place, instance rename + grouping, onboarding guidance for new projects, cleaner instance tooltips.

---

## Asset Library (the biggest change)

In v1, "Astrology", "Amino Acids", and "I-Ching Strokes" were hardcoded shape types — fixed, not editable, not extendable.

In v2 they are **seeded asset folders** — real folders of SVGs in the new asset system. Users can:

- Upload their own SVGs, PNGs, or JPEGs (drag-drop a whole folder onto the dashboard's Assets tab).
- Organize assets into folders.
- Reorder assets within a folder.
- Use any folder as an `asset_set` shape (one instance per asset, auto-laid-out radially or linearly based on count).
- Use a single asset as an `asset_single` shape.
- Recolor SVGs / apply color tints to PNGs (PNG tint via Pixi `ColorOverlayFilter`).

**Backend bits:**
- New tables: `asset_folders`, `assets`.
- New Supabase Storage bucket: `v2-user-assets` (private, 25 MB cap, MIME-allowlisted incl. `audio/mpeg`, RLS scoped to the user's first path segment).
- **Music track** — one mp3 per project (`project.audio`), shown as a pinned blue waveform row in the timeline, played in sync in the editor, and carried into video (muxed), HTML, React, and React Native exports.
- Pre-upload compression: SVGO for SVG, sharp/pngquant for PNG, mozjpeg for JPEG. Bucket cap is the ceiling, not a target — most assets land around 200 KB.
- Mipmaps + anisotropic filtering on raster textures so PNG/JPEG layers stay sharp at any zoom.
- SVGs are rasterized at 4× resolution for fast Pixi rendering. (Optional pure-vector mode planned — see "Coming soon".)
- On project load, any layer still using the legacy `astrology` / `amino` / `iching_lines` types gets rewritten in-memory to `asset_set` pointing at the seeded folder. Legacy renderers stay as a safety net until an audit confirms zero rows reference them.

**For the team day-to-day:** if a user complains an icon set looks different, point them at the seeded folder in their Assets tab — they can re-order or substitute.

---

## Dashboard

- **Project thumbnails** — each project has a 320×180 PNG snapshot. Auto-captured on Save (snapshots whatever frame is currently on screen). Stored in the same `v2-user-assets` bucket under `{user_id}/_project-thumbnails/{project_id}.png`.
- **List vs Grid view** — toggle in the top-right of the search box. Defaults to grid for new browsers.
- **Resizable sidebar** — drag the divider between the project list and the live preview. Both view-mode and width persist in localStorage.
- **Folder structure preserved in grid view** — folders show as the same collapsible section headers as in list view, with cards inside instead of rows.
- **"Set Thumbnail" button (editor)** — capture the current canvas frame as the project thumbnail. Lets users pick a representative moment instead of using whatever was on screen at last Save.
- **"Regenerate All Thumbnails" (user menu)** — bulk-recapture every project's thumbnail. Useful after thumbnail logic changes.

---

## Sharing & links

- **Direct-link URLs** — opening a project mirrors the project ID into the URL as `?p=<id>`. Refreshing the page keeps you in that project. Pasting a copied URL in another tab loads that project.
- **"Copy Link" in TopBar** — project name dropdown → Copy Link copies the share URL to clipboard.
- Access still flows through Supabase RLS, so direct links only resolve for users who have read access to that project.

---

## Saveable global palette

- New "Saved" row inside the color picker popover (every Inspector color field) and inside the gradient editor.
- `+` button captures the current color/gradient. Click a swatch to apply. Hover for the X to delete.
- Colors are deduped on hex; gradients are saved with stop positions so you can reuse complex multi-stop gradients across projects.
- Scope: per-browser (localStorage). Cross-device sync is a follow-up — would require a new `user_palettes` table on the shared Supabase.

---

## Editor / UX polish

- **Drag-to-reorder layers** in the timeline + layer stack.
- **Instance UI polish** — rename instances, group them, live tooltips while editing.
- **Onboarding guidance** — a banner + pulsing first keyframe for fresh projects so new users know where to click.
- **Animation entry guidance** — clearer signaling of "click a keyframe to edit this property at this time."
- **Canvas surround** — the area around the canvas is now a cool dark gray instead of pure black, so the canvas edges read more clearly.
- **SVG asset thumbnails** — flat 50 % gray background instead of checkerboard so silhouettes pop. (Raster thumbnails keep the checkerboard since transparency matters.)
- **Bugfixes:** shape-type switch from SVG → polygon now actually clears the SVG path; deleting all keyframes no longer leaves the layer in an unrecoverable state.

---

## Auth

- Any v2 auth call that sends an email (signup confirmation, password reset) now passes `redirectTo: window.location.origin`, so the email link comes back to v2 instead of v1's Site URL.
- Both v1 and v2 URLs are in the Supabase redirect allowlist. Users can switch between apps without re-authenticating.

---

## Exports

- HTML / React Native exports now fetch separated runtime bundles by file (`player.js`, `pixi-bundle.js`, `astro-data.js`, `amino-data.js`) instead of inlining everything. Smaller deliverables, easier to debug.
- A pre-commit hook detects staged source changes that affect those bundles and rebuilds them before letting the commit through, so exports never go stale silently.
- Filter usage detection: heavy filters (blur, glow, etc.) only get bundled into exports that actually use them.

---

## Coexistence with v1

| Concern | What we do |
| --- | --- |
| Project schema version | v1 rows are `schema_version = 1`, v2 rows are `schema_version = 2` — v2's `saveProject` now stamps the column on every save. v1 doesn't yet filter on this (tracked; now actionable in the v1 repo). Separately, the JSON payload itself carries `formatVersion` (see `App/src/utils/projectMigrations.ts`). |
| Project IDs | v2 prefixes its IDs with `v2_` so eventual migration is `WHERE id LIKE 'v2_%'`. |
| Migrations | All schema migrations live in the **v1 repo** at `App/supabase/migrations/`. Never add a `supabase/migrations/` folder in the v2 repo. |
| Asset RLS | First path segment must equal `auth.uid()`. Sharing a project to a different user doesn't share the underlying asset blobs — a clone-on-share mechanism is planned. |

---

## Coming soon (in tasks.tsv)

- **Optional pure-vector rendering for SVG assets** — opt-in per layer, for hero / close-up shapes where the 4× raster softens.
- **Asset clone on project share / transfer** — copy referenced assets into the receiving user's space when a project moves between accounts.
- **Cross-device sync for the saved palette** — `user_palettes` table.
- **Custom domain on Vercel** — replace `geometry-sequencer-v2.vercel.app` with a real domain so shareable links look professional.
- **v1 filter for `schema_version`** — v1's project list should filter to rows with `schema_version = 1 OR NULL` once v2 starts writing schema_version=2 rows in earnest. Lives in the v1 repo.

---

## Where to look

- **`CLAUDE.md`** — agent-facing repo rules (auth notes, schema ownership, dev commands).
- **`docs/project.md`** — what we're building and why.
- **`docs/process.md`** — how we ship work on v2.
- **`plan-asset-based-shapes.md`** — full plan for the asset rebuild initiative.
- **`tasks.tsv`** — single source of truth for follow-ups + bugs + ideas. Regen the human-friendly `Task list.xlsx` with `python3 scripts/tasks_to_xlsx.py`.
