# Plan: Intersection Dots Effect

Working plan for a potential future effect: **place a dot wherever the outlines of two independently-animated shapes cross**, applied at the group level. Example: a group containing an animated circle + an animated square draws a dot at each of the (up to) 8 points where the circle crosses the square's edges, and those dots slide along as the two shapes animate against each other. Dot size and color are user-configurable (solid / gradient / inherited from the underlying shapes).

Status: **not started** — this is a design/scoping doc, not committed work. Keep [CLAUDE.md](../CLAUDE.md) open when executing (schema-ownership + the pre-commit bundle-rebuild rules both matter here).

## 1. Does PixiJS support this?

Not directly — and that's fine. PixiJS is a *renderer*; it has no concept of "where do these two shapes cross." The work splits cleanly:

- **Computing intersection points** — our own code. Standard computational geometry: segment↔segment and segment↔ellipse intersection. This is the real work.
- **Drawing the dots** — trivial in Pixi, and the app already has the exact idiom: `g.circle(x, y, r)` + fill/stroke is how existing per-shape dots are drawn ([PrimitiveRenderer.ts:312-322](../App/src/rendering/PrimitiveRenderer.ts#L312)).

Verdict: **feasible**, moderate complexity. The hard part is not drawing — it's getting the two shapes' final transformed outlines into a shared coordinate space, and containing the cost when instances/symmetry multiply the outline count.

## 2. Current state (what the renderer gives us)

Render pipeline (two surfaces, same logic):
- **Editor + standalone player:** [GeometryRenderer.ts](../App/src/rendering/GeometryRenderer.ts) `render()` → `updatePrimitive()` in [PrimitiveRenderer.ts](../App/src/rendering/PrimitiveRenderer.ts). Imported by [player.ts](../App/src/player.ts), `GeometryPlayer.tsx`, `svgExport.ts`, `batchExport.ts`, `ExportModal.tsx` — **one shared class**.
- **Exported React projects:** [exportTemplates.ts](../App/src/data/exportTemplates.ts) embeds **string copies** of the renderer (`GEOMETRY_RENDERER` ~L710, `PRIMITIVE_RENDERER` ~L1488). A second copy to maintain — see §6.

Key facts that shape the design:

- **No retained vertex list.** `updatePrimitive(g, type, rx, ry, sides, …)` ([PrimitiveRenderer.ts:97](../App/src/rendering/PrimitiveRenderer.ts#L97)) draws directly into a Pixi `Graphics` and returns `void`. **But** the *unit* outline points are computed synchronously from cached helpers in [geometry.ts](../App/src/utils/geometry.ts): `getUnitPolygon(sides)` (L6), `getUnitStar(npoints)` (L20), `getUnitCustomShape(s)` (L41/L106). A polygon/star/custom outline is trivially reconstructable as `getUnitPolygon(sides).map(p => ({x: p.x*rx, y: p.y*ry}))`. **Circles/arcs/vesica are drawn analytically** (`g.ellipse`, `ellipticalArc`) and have **no point array** — they must be sampled from `rx, ry, shapeArc`.
- **Transform stack** (local vertices → screen), in `renderRecursive` ([GeometryRenderer.ts:122](../App/src/rendering/GeometryRenderer.ts#L122)): mix of baked coords and Pixi container transforms — `radiusX/Y` scale baked into verts; `rotateShape` as `g.rotation`; instance offsets as per-copy `child.x/y/rotation` ([:611-627](../App/src/rendering/GeometryRenderer.ts#L611)); `posX/posY` on a wrapper; symmetry legs as wrappers with `rotation` + `scale.x/y=-1`; then the **layer container** transform ([:263-286](../App/src/rendering/GeometryRenderer.ts#L263)) = position (`baseX/baseY`), rotation (`rotateLayer` [+`rotateGlobal` for groups]), scale (`zoom*scaleX/Y`). Pixel **filters** (blur/twist/bulge, [:290-373](../App/src/rendering/GeometryRenderer.ts#L290)) displace pixels but **not** logical vertices.
- **Groups** (`type: 'group'`, [types/index.ts:3](../App/src/types/index.ts#L3); `parentId` at [:265](../App/src/types/index.ts#L265)): one Pixi `Container` per group (cached by id). A group draws no shape itself — it applies `posX/posY` + `rotateGlobal` + `radiusX/Y`-as-percent-scale to its container, then renders children (`project.layers.filter(l => l.parentId === group.id)`) **into that container** ([:408-414](../App/src/rendering/GeometryRenderer.ts#L408)). **This container is the correct seam for the effect.**
- **World origin:** root layers position at `app.screen.width/2, height/2` ([:253-256](../App/src/rendering/GeometryRenderer.ts#L253)); children inherit the parent group's container position.
- **Instances & symmetry:** `createInstanceGroup` ([:595-630](../App/src/rendering/GeometryRenderer.ts#L595)) makes **one Pixi child per instance**, two nesting levels (`instances` × `instances2`). Symmetry ([:761-814](../App/src/rendering/GeometryRenderer.ts#L761)) duplicates the whole unit per leg (2/3/6 legs). So one layer can render as **instances1 × instances2 × legs** separate outlines.
- **Existing dots** (`dotsEnabled/dotSize/dotType/dotOffset`, [types/index.ts:191](../App/src/types/index.ts#L191)) are drawn inside `updatePrimitive` in shape-local space — the *drawing primitive* (`g.circle` + fill/stroke by `dotType`) is reusable; the *placement* is not (those sit on one shape's own verts).
- **Readback precedent:** [svgExport.ts:136](../App/src/utils/svgExport.ts#L136) `walk()` already traverses the built Pixi tree with accumulated world transforms — proof that pulling geometry back out of the tree works.

## 3. Proposed architecture

Run at the **group** level in `renderRecursive`, **every frame**, after the group's children have built their containers:

1. **Reconstruct each child shape's outline as a polyline.** Polygon/star/custom → exact, from `geometry.ts` helpers × radius. Circle/arc/vesica → sample analytically (~120–360 segments; precision/perf dial).
2. **Map both outlines into a shared space** (the group container's local space) using Pixi matrices — `worldTransform` / `toLocal` — which absorbs rotateShape, instance offsets, symmetry legs, group scale/rotation, root origin, and zoom automatically. (Prefer this over re-deriving the matrix math by hand.)
3. **Intersect** outline A vs outline B: segment↔segment for polylines, segment↔ellipse for circles. AABB (bounding-box) culling per outline-pair first, so most pairs are skipped cheaply.
4. **Draw dots** at each intersection into a dedicated **overlay `Graphics`** on the group container (not inside either shape's `updatePrimitive`), using `g.circle(x, y, size/2)` + fill/stroke.

This keeps the effect a **new overlay + new code path** — it does not touch any existing draw call, so existing render output stays byte-identical.

## 4. Data model

New optional effect on the group `Layer` (serializes into `project.data` JSON — **no DB migration**; absent = off, so every existing project is unaffected):

```ts
intersectionDots?: {
  enabled: boolean;
  size: number;                 // static for v1; could join AnimatableProperties later
  colorMode: 'solid' | 'gradient' | 'inherit';
  color?: string;
  gradientStops?: { id: string; offset: number; color: string }[];
}
```

## 5. Hard parts / risks

1. **Instances × symmetry explosion.** A layer can be `instances1 × instances2 × up-to-6 legs` outlines; all-pairwise intersection multiplies fast (12 instances/side ≈ 144 outline-pairs/frame). AABB culling handles moderate cases; **v1 should scope this** (e.g. single-instance shapes first) and cap/warn beyond a threshold rather than silently tanking frame rate.
2. **Circles/arcs are sampled, not exact** — intersection precision is bounded by sampling resolution.
3. **Filters desync.** Blur/twist/bulge move pixels, not vertices, so with heavy filters dots sit on the pre-filter geometry. Known limitation.
4. **Color at an intersection is ambiguous.** "Same as the underlying elements" has no obvious answer where a red circle crosses a blue square — needs a defined rule (effect solid/gradient is unambiguous; "inherit" needs a tiebreak, e.g. blend, or shape-A wins).
5. **Groups with >2 layers** — all-pairwise (generalizes, costs more) vs a designated pair.
6. **Perf budget** — segment↔segment is O(nA·nB) per pair; a 4-gon vs 180-sample circle ≈ 720 tests/frame (trivial), two 128-sample circles ≈ 16k (still <1ms), but instances push it into millions without culling. Culling + scoping is mandatory, not optional.

## 6. Player & export impact + versioning

**A separate "2.1" app is not needed.** Reasoning:

- **Exported projects can't break from this.** HTML/React export **bundles the renderer into the export at export time** — old exports carry a frozen copy of the old player code. Changing the live renderer never reaches back and alters them.
- **Live app is safe by construction.** The effect is additive behind `intersectionDots.enabled`; a project without the field runs today's exact code path. Keeping it a new overlay (not a refactor of existing draw calls) preserves byte-identical output for existing projects.
- The player code *does* change ([GeometryRenderer.ts](../App/src/rendering/GeometryRenderer.ts) + the committed `public/*.js` bundles get rebuilt) — but that only affects **new** renders/exports, which is the intent.

A 2.1 parallel deploy would only be justified if we changed **shared geometry/transform code** in a way that alters existing output. This effect doesn't require that — discipline (feature-flag guard + additive overlay) beats versioning here.

**The real maintenance cost** is the renderer duplication: `src/rendering/*` **and** the embedded string copies in [exportTemplates.ts](../App/src/data/exportTemplates.ts). The new effect must be written into **both**, or that export finally refactored to import shared source. Plus the pre-commit hook rebuilds `App/public/*.js` when `rendering/**` changes (see CLAUDE.md).

## 7. Suggested phasing

1. **Throwaway prototype (~½ day, de-risks everything):** hardcode a group of two simple shapes, compute + draw intersection dots live in the editor only. Proves the transform-into-shared-space step and per-frame cost on a circle-vs-square before any config/UI/export plumbing.
2. Config field + Inspector UI on groups.
3. Wire into shared renderer (overlay on group container).
4. Mirror into `exportTemplates.ts`; rebuild bundles; verify an actual HTML/React export.
5. Scope/caps + AABB culling for instances; document filter/circle-sampling limitations.

## 8. Open decisions (needed before build)

- **Color rule** at an intersection — solid/gradient (clean) vs "inherit" tiebreak.
- **v1 scope** for instances/symmetry — start with single-instance shapes only?
- **>2 layers** in a group — all-pairwise vs designated pair.

## Appendix: key files

- [App/src/rendering/GeometryRenderer.ts](../App/src/rendering/GeometryRenderer.ts) — render loop, group path, transform stack, instances, symmetry.
- [App/src/rendering/PrimitiveRenderer.ts](../App/src/rendering/PrimitiveRenderer.ts) — `updatePrimitive`, existing dot drawing.
- [App/src/utils/geometry.ts](../App/src/utils/geometry.ts) — unit outline helpers (reconstruct polylines here).
- [App/src/utils/svgExport.ts](../App/src/utils/svgExport.ts) — precedent for reading geometry back out of the Pixi tree.
- [App/src/data/exportTemplates.ts](../App/src/data/exportTemplates.ts) — duplicated renderer copy that must also get the effect.
- [App/src/types/index.ts](../App/src/types/index.ts) — `Layer` / group / dots config types.
- [App/src/player.ts](../App/src/player.ts) — standalone player entry (shares GeometryRenderer).
