# Plan: Asset-Based Shapes Rebuild

Working plan for the rebuild described in [draft notes for app.md](./draft%20notes%20for%20app.md). The core shift: stop hardcoding icon sets (astrology, amino, I-Ching strokes) as shape types, and instead let users upload their own graphic sets that behave exactly like those hardcoded sets do today.

Keep [CLAUDE.md](./CLAUDE.md) and [tasks.tsv](./tasks.tsv) open when executing any of the prompts below — schema-ownership rules and the existing `assets` / `asset_folders` / `v2-user-assets` backend matter here.

## 1. Current state (what exists today)

- **Primitive shapes** rendered from math: `polygon`, `star`, `circle`, `vesica`, `line`, `diamond`, `polyhedron`, `molecule`, `iching`. These live in [App/src/rendering/PrimitiveRenderer.ts](App/src/rendering/PrimitiveRenderer.ts) + [App/src/rendering/shapes/](App/src/rendering/shapes/).
- **Hardcoded icon sets** rendered as instance series: `astrology` (12 SVG paths in [App/src/data/astro.ts](App/src/data/astro.ts)), `amino` (20 multi-path shapes in [App/src/data/amino.ts](App/src/data/amino.ts)), `iching_lines` (64). Count is hardcoded per type in [App/src/rendering/GeometryRenderer.ts:509](App/src/rendering/GeometryRenderer.ts#L509) and the Inspector's count slider is disabled for them ([App/src/components/Inspector.tsx:1035](App/src/components/Inspector.tsx#L1035)).
- **Custom SVG path** (`custom` type) — single-layer upload that parses `<path>` tags from one file and uses them as `customPath` / `customPaths`. Entry point: [App/src/components/Inspector.tsx:168-188](App/src/components/Inspector.tsx#L168-L188).
- **Backend already in place** (shared Supabase, see CLAUDE.md):
  - `asset_folders` + `assets` tables (v2-only, flat folder structure, metadata only)
  - Storage bucket `v2-user-assets` (private, 10MB cap, MIME allowlist `image/svg+xml`, `image/png`, `image/jpeg`, `text/plain`)
  - RLS enforces first path segment = `auth.uid()`
- **Not yet built:** any UI or store code that reads/writes `assets` / `asset_folders`. This is a greenfield area in the app layer.

## 2. Target model

Collapse the shape-type taxonomy into three clean buckets:

| Bucket                       | ShapeType values                                                                                   | Data source                                          | Instance count                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------- |
| **Primitive**          | `polygon`, `star`, `circle`, `vesica`, `line`, `diamond`, `polyhedron`, `molecule` | Math + config                                        | User-controlled                                          |
| **Asset set** (new)    | `asset_set`                                                                                      | Folder of uploaded images/SVGs from `assets` table | Equal to folder item count (auto)                        |
| **Asset single** (new) | `asset_single`                                                                                   | One uploaded image/SVG                               | 1 inner shape, tiled by instance controls like any other |

Existing `astrology` / `amino` / `iching` / `iching_lines` become **seed asset folders** owned by a system user (or shipped as built-in read-only folders) so existing projects migrate cleanly and new users still get the useful defaults.

### Default layouts for asset sets

When a user attaches a folder to a layer, the layer should auto-configure to something sensible based on item count:

- **≤ 20 items:** radial, `radialArc = 360`, `alignToPath = true`, `orbitRadius = 200` (matches today's astrology default).
- **21–40 items:** still radial, same defaults — a 25-sector circle is fine and matches the "carousel" framing.
- **> 40 items:** linear carousel — `gridLayout = 'linear'`, `spacingX` auto-computed from radius, `orbitRadius = 0`.

These are just starting values — the user can change anything after.

## 3. Implementation stages

Sequenced so each stage is shippable on its own.

**Prereqs** — knock these out first, they're already in [tasks.tsv](./tasks.tsv):

- SVG sanitization on upload (DOMPurify) — **blocks** any asset upload UI.
- Asset output optimizer (SVGO / pngquant / mozjpeg) — not strictly blocking, but you want it before users upload real folders.

### Stage A — Store + data layer for user assets

Add `assets` and `asset_folders` reads/writes to the zustand store ([App/src/store/useStore.ts](App/src/store/useStore.ts)). No UI yet. Supports: list folders, list assets in a folder, upload to a folder, delete asset, create folder, rename/delete folder. Mirror the existing project/folder patterns in the store.

### Stage B — Asset library UI

A browser/modal for the user to manage their asset folders and assets. Probably lives on the Dashboard ([App/src/components/Dashboard.tsx](App/src/components/Dashboard.tsx)) as a new tab, or as a modal invoked from the Inspector. Drag-drop upload of a whole folder → creates an asset folder + uploads each file. Per-file delete, rename folder, etc.

### Stage C — New shape types `asset_single` and `asset_set`

Add to `ShapeType` union in [App/src/types/index.ts:3](App/src/types/index.ts#L3). Extend `LayerConfig` with:

```ts
assetFolderId?: string;   // for asset_set
assetId?: string;         // for asset_single
```

Render path:

- `asset_single`: fetch the asset blob (cached), draw as Pixi Sprite (for PNG/JPEG) or parsed path (for SVG). One inner shape — reuse the existing instance loop.
- `asset_set`: fetch the folder's assets (cached, sorted by `order` or filename), render one per instance index `i % count`, exactly like astrology does today at [GeometryRenderer.ts:449-466](App/src/rendering/GeometryRenderer.ts#L449-L466). Count defaults to folder length but user can override.

Cache strategy: a single `assetCache: Map<assetId, Texture|string>` in the renderer, populated on first render, invalidated when assets update. PNG/JPEG → `Texture`; SVG → parsed `customPaths[]`.

### Stage D — Inspector: asset picker

Replace the Astrology / Amino Acids / I-Ching (Strokes) options in the shape-type `<select>` at [Inspector.tsx:487-498](App/src/components/Inspector.tsx#L487-L498) with:

- `Image / SVG (single)` → `asset_single` → opens asset picker constrained to single-file selection.
- `Image Set (folder)` → `asset_set` → opens asset picker constrained to folder selection.

Keep `Custom (SVG)` as a shortcut for "paste-one-SVG-now" without creating an asset record. (Or remove it and funnel all SVG intake through the asset library — cleaner but larger UX change.)

### Stage E — Auto-layout on folder attach

When a user selects an asset folder for a layer, compute sane defaults based on `folder.assets.length` and apply them to the layer's config + starting keyframe (same pattern as the astrology auto-setup at [Inspector.tsx:454-483](App/src/components/Inspector.tsx#L454-L483)).

### Stage F — Migrate hardcoded sets to seed folders

Two sub-options — pick one:

1. **Seed on first load:** when a user first signs in, detect no asset folders and seed `Astrology`, `Amino Acids`, `I-Ching Strokes` folders from the existing hardcoded paths in [App/src/data/](App/src/data/). They get real `assets` rows pointing at pre-uploaded SVGs in the bucket under a shared `public/` prefix.
2. **Read-only built-in folders:** expose the hardcoded arrays as virtual read-only folders in the UI. Simpler, no storage footprint, but users can't duplicate-and-tweak them.

Option 1 is preferable long-term. Option 2 ships faster.

### Stage G — Project migration for existing layers

Existing projects have layers with `type: 'astrology' | 'amino' | 'iching_lines'`. On project load, transparently rewrite them to `type: 'asset_set'` with `assetFolderId` pointing at the corresponding seed folder. Do it in `loadProject` ([useStore.ts](App/src/store/useStore.ts)) and save the converted form back on next save. Keep the old switch arms in `GeometryRenderer` + `PrimitiveRenderer` **until all rows are migrated** — they're a safety net, not long-term API.

## 4. Out of scope (for now)

- Re-ordering assets inside a folder via drag-drop — punt to a later pass; sort by filename is fine for v1 of this work.
- Per-instance asset override (layer 2 uses item 3 from folder X, layer 5 uses item 7 from folder Y). The whole point is uniform instance-geometry treatment across the set.
- Animating which folder a layer uses across the timeline. Folder assignment is static; *items* within the folder cycle by instance index.
- Multi-user shared libraries. Each user's `v2-user-assets` scope stays enforced by RLS.

## 5. Open questions

- **PNG vs SVG treatment inside a set.** SVGs get the stroke/fill/gradient treatment the rest of the app applies. PNGs/JPEGs are opaque — strokes/fills mean nothing. Should a mixed-format folder be allowed? Probably yes, but PNG items silently ignore stroke/fill controls. Flag in the Inspector when a mixed set is detected.

  -- error message if multiple types detected
- **Single-SVG custom type — keep or retire?** `custom` (paste an SVG, don't save it as an asset) is useful for quick experiments but becomes redundant once `asset_single` exists. Decision probably: retire after a deprecation window; auto-convert on project load.

  --retire
- **Aspect ratio for asset instances.** Amino/astrology both normalize to a square bounding box today. Assets (esp. PNGs) may not be square — respect original aspect ratio by default, with a "force square" toggle.

  --respect original bounding boxes

---

## 6. Prompts for future Claude sessions

Each prompt is self-contained so you can hand it to a cold session without replaying this whole plan. Run them in order; each builds on the previous stage landing.

### Prompt A — Store layer for assets

```
Read CLAUDE.md and plan-asset-based-shapes.md at the repo root. Implement Stage A of that plan:
add `assets` and `asset_folders` CRUD to App/src/store/useStore.ts using the existing Supabase
client (App/src/supabaseClient.ts) and the v2-user-assets Storage bucket.

Schema is already live (see CLAUDE.md — do NOT add a supabase/migrations/ folder in this repo;
migrations belong in v1). Mirror the patterns already used for projects/folders in useStore.ts.

Required actions:
- fetchAssetFolders(): load this user's asset_folders
- createAssetFolder(name)
- renameAssetFolder(id, name)
- deleteAssetFolder(id, deleteAssets?)
- fetchAssets(folderId): load assets for a folder
- uploadAsset(folderId, file): sanitize SVGs with DOMPurify before upload (see tasks.tsv — this is
  the gating item), upload blob to `{user_id}/{asset_id}.{ext}` in v2-user-assets, insert assets
  row
- deleteAsset(id): remove storage object + row
- signedUrlForAsset(id): return a short-lived URL for render consumption

No UI in this stage. Add types to App/src/types/index.ts. Add a small vitest or handwritten
smoke test for the upload path if a test runner is already wired up; otherwise skip.

Do not start Stage B.
```

### Prompt B — Asset library UI

```
Read plan-asset-based-shapes.md § Stage B. Build a minimal Asset Library UI that consumes the
store methods from Stage A.

Scope:
- Add an "Assets" tab to App/src/components/Dashboard.tsx (or a sibling pane — match existing
  Dashboard layout conventions).
- List asset folders on the left, assets in the selected folder on the right (thumbnail grid).
- Drag-drop an OS folder onto the pane → create an asset_folders row, upload each file.
  Reject anything outside the MIME allowlist (image/svg+xml, image/png, image/jpeg).
  Show per-file progress + errors.
- Delete-asset, rename-folder, delete-folder (with confirmation when non-empty, mirror
  existing folder-delete pattern from PRD-Folder-Management.md).
- Thumbnails: for SVG, render inline; for raster, use the signed URL.

No renderer or Inspector changes yet.
```

### Prompt C — asset_single and asset_set shape types

```
Read plan-asset-based-shapes.md § Stage C + § 4 (out of scope). Add two new ShapeType values,
`asset_single` and `asset_set`, and wire them through the renderer only. Inspector UI comes
next in Stage D — don't touch it here beyond whatever's needed to set assetFolderId/assetId
for manual testing.

Changes:
- App/src/types/index.ts: extend ShapeType; add `assetFolderId?: string` and `assetId?: string`
  to LayerConfig.
- App/src/rendering/GeometryRenderer.ts: in the inner-shape factory around line 434, add
  branches for `asset_single` and `asset_set`. For asset_set, count1 should default to the
  folder's asset count (fallback to layer.config.instances when the folder hasn't loaded yet).
- New file App/src/rendering/AssetCache.ts: Map<assetId, Texture | { paths: string[] }>.
  Populate lazily via signed URLs. Invalidate on asset mutations (subscribe to store).
- For PNG/JPEG assets in asset_set, render as a pooled Sprite sized by rx/ry. For SVG assets,
  parse on first load, cache paths, render via the existing custom-path branch in
  PrimitiveRenderer.
- Respect original aspect ratio by default; add `forceSquareAssets: boolean` to LayerConfig as
  the override (default false).

Manual test plan: hand-craft a project JSON with an asset_set layer pointing at a known folder
ID and load it — verify the layer renders one asset per instance slot and cycles correctly.
```

### Prompt D — Inspector asset picker

```
Read plan-asset-based-shapes.md § Stage D + § Stage E. Replace the hardcoded Astrology / Amino
Acids / I-Ching (Strokes) options in Inspector.tsx's shape-type <select> (around lines 487-498)
with `Image / SVG (single)` → asset_single and `Image Set (folder)` → asset_set. Build an
asset-picker popover that lists the user's asset folders and assets (reuse thumbnails from
Stage B).

For asset_set, when a folder is selected, auto-apply default layout from § 2 of the plan
(radial for ≤ 40 items, linear carousel for > 40). Follow the existing astrology auto-setup
pattern at Inspector.tsx:454-483 — update both config and the starting keyframe's values.

Keep the `custom` option for now (retiring it is tracked in § 5 of the plan, not this stage).
Keep `astrology` / `amino` / `iching_lines` invisible in the select but still functional in
the renderer — Stage G will migrate existing rows.
```

### Prompt E — Seed folders + project migration

```
Read plan-asset-based-shapes.md § Stage F + § Stage G. Ship both together: seed the three
hardcoded sets as real asset folders, then migrate existing projects on load.

Pick Option 1 from § Stage F: seed on first login. On the user's first fetchAssetFolders()
returning empty, create Astrology / Amino Acids / I-Ching Strokes folders and upload the
existing SVGs from App/src/data/astro.ts and amino.ts as assets. (I-Ching strokes are
procedurally drawn — generate SVG strings from IChingRenderer logic first, save as 64 files.)

For project migration: in loadProject (useStore.ts), walk project.layers, rewrite any layer
with type `astrology` | `amino` | `iching_lines` to type `asset_set` with `assetFolderId`
pointing at the seed folder. Persist on next save. Leave the legacy switch arms in
GeometryRenderer / PrimitiveRenderer intact as a safety net until a separate audit confirms
all rows are migrated (tracked in tasks.tsv — add that row as part of this prompt).

When done, append a tasks.tsv row for the eventual removal of the legacy astrology/amino/
iching_lines code paths.
```

### Prompt F — Cleanup + docs

```
Read plan-asset-based-shapes.md § 5 open questions. Audit Supabase to confirm zero rows still
reference the legacy types astrology / amino / iching_lines in projects.layers. If clean,
remove those branches from GeometryRenderer.ts, PrimitiveRenderer.ts, Inspector.tsx, and the
ShapeType union. Delete App/src/data/astro.ts and App/src/data/amino.ts.

Also: retire the `custom` shape type per § 5 — auto-convert any remaining `custom` layers on
load into asset_single layers (create an asset row for the pasted SVG, point the layer at it).
Remove the legacy handleFileUpload path in Inspector.tsx.

Update README.md and CLAUDE.md with the final shape taxonomy.
```
