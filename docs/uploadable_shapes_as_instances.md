# Plan: Uploadable shapes & symbol sets as instances

> **Prompt for an AI agent.** This file turns the [draft notes for app.md](../draft%20notes%20for%20app.md) into an
> executable plan. **Read this whole file before writing code.** The headline finding is below — most of
> the vision is *already built*. Your job is to close gaps and verify, **not** to rebuild what exists.

---

## TL;DR for the agent

The draft notes ask for: basic math shapes in the dropdown; the ability to upload a single image/SVG and use
it as one instance; and the ability to upload a *folder* of images/SVGs and have them laid out as instances
(like the 12 astrology signs around a circle), auto-adapting to however many were uploaded.

**This already exists** as the `asset_single` and `asset_set` shape types. Before doing anything, run the app
and reproduce the "upload a folder → instances around a circle" flow yourself. Then work only the gap tasks in
[Part 3](#part-3--task-list-the-actual-work). Do **not** re-implement the instance engine, the asset upload
pipeline, or the dropdown.

---

## Part 1 — The vision (from the draft notes)

Paraphrased and de-duplicated from [draft notes for app.md](../draft%20notes%20for%20app.md):

1. **Basic shapes are first-class, in the dropdown.** Mathematical / poly shapes — circle, square, vesica,
   polyhedron, line, polygon, star — are picked from the shape pull-down and drawn natively.
2. **A single uploaded graphic = one instance.** A user can upload a single PNG / JPEG / SVG and drop it into
   the animation as one shape, manipulated like any other instance (effects, transforms, etc.).
3. **A folder of uploaded graphics = a set of instances.** Anything that is *not* a basic shape (astrology
   signs, amino acids, a user's own icon set) should be uploaded as a **series** of images/SVGs and treated as
   instances — laid out and animated exactly like the astrology signs are today.
4. **Layout auto-adapts to the count.** 12 signs → 12 evenly-spaced sectors around a circle (the default). 25
   icons → 25 sectors / a carousel. The system reads the number of items in the folder and spaces them.
5. **The hardcoded symbol sets are retired in favor of uploads.** Amino acids, astrology, I-Ching etc. should
   stop being baked-in dropdown options and instead live as uploaded, user-editable asset sets.

---

## Part 2 — What already exists (verified in code)

> Verified 2026-06-10 against `App/src/`. Re-verify before relying on any line number.

| Vision item | Status | Where |
|---|---|---|
| Basic shapes in dropdown | ✅ Done | `Inspector.tsx:700-707` — polygon, star, ellipse/arc, vesica, polyhedron, line, molecule, i-ching |
| Single uploaded graphic as one instance | ✅ Done | `ShapeType` `'asset_single'` (`types/index.ts:3`); UI `Inspector.tsx:903-915`; render `GeometryRenderer.ts` asset branch |
| Folder of graphics as instance set | ✅ Done | `ShapeType` `'asset_set'`; UI `Inspector.tsx:893-902`; `AssetFolderPicker` `Inspector.tsx:116-178` |
| Same instance-geometry engine for assets | ✅ Done | `createInstanceGroup()` `GeometryRenderer.ts:588-622` — orbit + linear spacing + per-instance rotation/scale, shared by all types |
| Count auto-adapts to folder size | ✅ Done | `GeometryRenderer.ts:~627` uses `assetFolderAssets.length`; Inspector shows it `Inspector.tsx:1334-1341` (instances slider disabled for `asset_set`) |
| Default = circle like astrology | ✅ Done | `applyAssetSetFolder()` `Inspector.tsx:382-408` sets `radialArc: 360`, `alignToPath: true`, `orbitRadius: 300` |
| SVG **and** raster (PNG/JPEG) supported | ✅ Done | `AssetCache.ts` — `getGraphicsContextSync` (SVG) / `getTextureSync` (raster); per-instance fill/stroke recolor |
| Folder upload preserving structure | ✅ Done | `AssetLibrary.tsx` drag-drop via `webkitRelativePath`; `useStore.ts:~1870` upload → Supabase `assets`/`asset_folders` + `v2-user-assets` bucket |
| Legacy types migrated to asset sets | ⚠️ Partial | `seedDefaultAssetFolders()` `useStore.ts:2089` seeds astrology + amino as asset folders; legacy dropdown options hidden for new layers (`Inspector.tsx:711-714`) |

**Conclusion:** the architecture the notes ask for is the `asset_set` / `asset_single` system, and it is largely
operational. The remaining work is *finishing the migration off the hardcoded sets*, *verification*, and a few
*UX/quality gaps*.

---

## Part 3 — Task list (the actual work)

Each task has an **acceptance check**. Work top-to-bottom; tasks are roughly ordered by dependency. Stop and
flag if a "Done" item from Part 2 turns out not to work — that changes the plan.

### T0. Baseline: reproduce the existing flow (no code)
- Run `cd App && npm run dev` (Vite on 3008). Log in.
- Create a layer, set type to **Asset Folder**, upload a folder of ~12 SVGs, confirm they lay out around a
  circle and respond to orbit/spacing/rotation. Repeat with ~25 items to confirm the count adapts.
- Repeat with **Asset (Single)** and a single PNG.
- **Acceptance:** you can demonstrate the core vision already works, and you've written down anything that
  *doesn't* behave as the notes expect. Those observations feed the tasks below.

### T1. Auto-migrate existing legacy-typed layers → `asset_set` / `asset_single`
The notes want astrology/amino/I-Ching to stop being special. New layers already can't pick them, and the seed
folders exist — but existing saved projects still have `type: 'astrology' | 'amino' | 'iching_lines'` layers.
- Add a one-time, idempotent migration (on project load) that rewrites a legacy-typed layer to `asset_set`
  pointing at the corresponding seeded folder (`SEED_FOLDER_NAMES.*`), preserving keyframes/effects.
- Guard it so it only runs once the seeded folders exist for that user (`seedDefaultAssetFolders()` ran).
- Confirm `seedDefaultAssetFolders()` also seeds **I-Ching** (verify — `useStore.ts:2095-2096` only listed
  astrology + amino; add I-Ching strokes if missing).
- **Acceptance:** open a pre-existing project containing an astrology layer; it renders identically but the
  layer is now `asset_set`. Re-opening doesn't double-migrate. Old projects with no network access still render
  (keep the hardcoded path fallback until migration is confirmed safe to remove).

### T2. Count-aware default layout (line vs circle)
The notes imply the default should be sensible for the count: a handful → circle; many → carousel/line. Today
`applyAssetSetFolder()` always uses a 360° circle.
- Decide a heuristic (e.g. ≤ N items → full circle; > N → keep circle but expose a quick "Circle / Line / Grid"
  layout toggle near the folder picker). **Confirm the heuristic with the user before coding** — the notes are
  ambiguous ("default is circle" vs "25 → carousel").
- Wire the toggle to the existing `gridLayout` (`'radial' | 'linear' | 'hexagonal'`) + `radialArc` / `spacingX`.
- **Acceptance:** picking a folder applies a default appropriate to its size; a visible control lets the user
  switch circle ↔ line ↔ grid without hand-editing orbit/spacing.

### T3. Make "upload a set" discoverable from the shape flow
Right now uploading is in the Asset Library; the shape dropdown just references a folder. Tighten the loop.
- From an `asset_set` layer with no folder yet, offer an inline "Upload a folder…" action that opens the
  folder upload and auto-attaches the result via `applyAssetSetFolder()`.
- Show the resolved instance count (e.g. "12 items") next to the picker so the auto-adapt behavior is legible.
- **Acceptance:** a new user can go dropdown → "Asset Folder" → upload → see instances, without first knowing
  the Asset Library exists.

### T4. Single-asset parity check
Confirm `asset_single` is manipulable "like all other instances" (notes item 2): transforms, the full effects/
filter stack, recolor, fade. 
- **Acceptance:** an `asset_single` PNG and SVG each support the same transform + effect controls a primitive
  shape does, or gaps are listed as sub-tasks.

### T5. "Editable as graphics" — clarify & scope
The notes say uploaded series should be "editable by the user as graphics." Today the only per-asset editing is
recolor (fill/stroke). **Ask the user what "editable" means** — likely (a) recolor per instance (exists),
(b) reorder/remove items in the set, (c) replace one item, not a full vector editor.
- Implement the clarified, in-scope subset (most likely reorder/remove/replace within a folder, surfaced on the
  `asset_set` layer).
- **Acceptance:** matches the user's clarified definition; out-of-scope interpretations (e.g. full path editing)
  are explicitly logged in `tasks.tsv` as deferred.

### T6. Basic-shape presets gap (square)
The notes name "square" explicitly; the dropdown offers "polygon" (sides) and "star" but no one-click square.
- Either confirm polygon-with-4-sides is sufficient (cheapest) or add square/triangle quick presets.
- **Acceptance:** a user can get a square without manually setting `sides: 4` — or it's confirmed unnecessary
  and noted.

### T7. Plan to delete the hardcoded sets (do NOT delete yet)
Once T1 migration is proven, the endgame is removing `data/astro.ts`, `data/amino.ts`, the legacy `ShapeType`
members, and their renderer branches.
- Write a removal checklist (search for `'astrology'`, `'amino'`, `ASTRO_PATHS`, `AMINO_PATHS`, `iching_lines`)
  but leave deletion as a final, separate PR after migration has shipped and soaked.
- **Acceptance:** a documented, ordered removal list exists; nothing is deleted in this round.

---

## Part 4 — Guardrails (read `CLAUDE.md` for the full set)

- **Bundles go stale silently.** If you touch `src/player.ts`, `src/rendering/**`, `src/utils/**`,
  `src/data/{astro,amino,molecules}.ts`, or the `*-entry.ts` files, the committed `App/public/*.js` bundles
  must be rebuilt (the pre-commit hook does this; don't bypass it). Exports break otherwise.
- **No schema changes here.** `asset_folders` / `assets` / the `v2-user-assets` bucket already exist. Any DB
  change is a migration in the **v1 repo** only (see `CLAUDE.md` → "Critical: schema ownership"). T1–T6 should
  need no schema change.
- **`schema_version`.** v2 rows are `2`; don't write v2-shaped data onto v1 rows.
- **Track deferrals in `tasks.tsv`** (the single source of truth), not in a new TODO file.
- **SVG safety.** Uploaded SVGs are sanitized (`utils/sanitizeSvg.ts`) before storage/render — keep that on any
  new upload path.

## Part 5 — Definition of done
- The hardcoded astrology/amino/I-Ching layers in existing projects render via `asset_set` after an idempotent
  migration, with the hardcoded fallback still present as a safety net.
- A user can: pick a basic shape; upload one graphic as a single instance; upload a folder and get a
  count-adaptive instance layout with a circle/line/grid choice — all without touching raw orbit/spacing math.
- Every "ask the user" point (T2 heuristic, T5 "editable") is resolved and reflected in the code or in `tasks.tsv`.
- No bundle left stale; no DB migration added in this repo.
