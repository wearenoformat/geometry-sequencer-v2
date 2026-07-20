---
name: geometry-sequencer-json
description: Reference for editing exported Sacred Geometry Sequencer project JSON files (the `embeddedProjectData` blob in exported index.html, or the standalone .json loaded via `?project=`). Covers the full schema — project, layers, keyframes, animatable properties, easing, symmetry, shape types, value ranges. Use whenever creating or editing animation JSON outside of the editor app.
---

# Editing Geometry Sequencer JSON (no app required)

Exported HTML bundles include:
- `index.html` — embeds the project JSON as a `const embeddedProjectData = {...}` literal, and also accepts `?project=foo.json` to load an external file.
- `player.js` — runtime that reads the JSON and drives the animation loop.
- `pixi-bundle.js` — PixiJS renderer.
- `astro-data.js` / `amino-data.js` (optional) — SVG data for astrology / amino acid shape types.
- `assets-registry.js` (optional) — base64-inlined custom assets for `asset_set` / `asset_single` layer types.

**You can edit the JSON freely without the app.** The renderer interpolates between keyframes at runtime; just update fields and reload the page. If you change anything other than the embedded JSON, re-zip and re-open.

---

## Top-level: `Project`

```jsonc
{
  "id": "v2_<uuid>",            // string. v2 exports prefix with "v2_".
  "name": "My Animation",        // string
  "duration": 10,                // seconds. Total loop length. Range 0.1–3600.
  "backgroundColor": "#000000",  // hex. Overridden if exporter set transparent bg.
  "zoom": 1,                     // global scale factor (0.1–10). URL param ?zoom= overrides.
  "lastModified": 1716000000000, // epoch ms (optional, informational)
  "gradientColor": "#d4af37",    // legacy single accent (rarely used)

  // Global style — applied to all layers when styleOverrideEnabled is false on the layer
  "globalLineColor": "#7a7a7a",
  "globalStrokeWeight": 1,
  "globalStyleEnabled": false,
  "globalGradientEnabled": false,
  "globalGradientStops": [
    { "id": "1", "offset": 36, "color": "#793720" },
    { "id": "2", "offset": 63, "color": "#FCC698" }
  ],

  "layers": [ /* Layer[] — see below */ ]
}
```

Notes:
- `globalGradientStops[].offset` is 0–100 (percentage along gradient).
- Set `globalStyleEnabled: true` to make every layer inherit `globalLineColor`/`globalStrokeWeight`/`globalGradient*` unless that layer sets `config.styleOverrideEnabled: true`.

---

## `Layer`

```jsonc
{
  "id": "layer-abc123",         // unique string; "layer-" + random suffix is the convention
  "name": "Hexagon",            // display name
  "type": "polygon",            // ShapeType (see list below)
  "parentId": "layer-xyz",      // optional — id of a group layer; used for hierarchy
  "collapsed": false,           // UI-only (safe to omit)
  "visible": true,              // boolean. False hides the layer entirely.

  "timeline": {
    "start": 0,                 // seconds — when the layer becomes active
    "end": 0                    // seconds — when it stops animating. end === start means "static / point mode" (renders indefinitely from start).
  },

  "fadeIn":  { "enabled": false, "duration": 2 },   // duration in seconds
  "fadeOut": { "enabled": false, "duration": 2 },

  "config":   { /* LayerConfig — fixed (non-animated) properties; see below */ },
  "keyframes":[ /* LayerKeyframe[] — animated property values over time; see below */ ],
  "symmetry": { /* SymmetryConfig — see below */ }
}
```

### `ShapeType` (allowed values for `type`)

```
polygon       // n-sided regular polygon (sides controlled by config.sides)
star          // n-pointed star (sides = points, starInnerRadius controls inner)
circle        // circle (use shapeArc for arcs)
diamond       // diamond / rhombus
vesica        // vesica piscis
line          // straight line (lineAnchor controls origin)
custom        // SVG path (config.customPath or config.customPaths[])
molecule      // chemical molecule SVG (config.molecule, e.g. "threonine")
iching        // I-Ching hexagram (config.ichingInputId 1–64)
iching_lines  // I-Ching lines variant
polyhedron    // 3D polyhedron (config.polyhedronName)
group         // container — children reference via parentId
astrology     // astro symbol (requires astro-data.js in export)
amino         // amino acid SVG (requires amino-data.js in export)
asset_set     // cycles through every asset in config.assetFolderId
asset_single  // single asset by config.assetId
```

---

## `LayerConfig` (non-animated, per-layer)

Only the fields relevant to the layer's `type` matter — extras are ignored.

```jsonc
{
  "sides": 6,                     // 3–32. Polygon sides / star points / etc.
  "instances": 1,                 // 1–100. Number of primary instances (radial/grid copies).
  "instances2": 0,                // 1–100. Second-level recursion count (0 disables).
  "density": 0,                   // deprecated, keep 0
  "densitySelective": false,      // deprecated

  "drawOutline": true,            // render the shape outline
  "drawSpokes": true,             // render spokes from center
  "drawWeb": false,               // render web/connecting lines between instances
  "drawStar": false,              // render star inscribed lines
  "starSkip": 2,                  // 2–sides. Star line-skip parameter.
  "starInnerRadius": 0.5,         // 0–1. (Also animatable via keyframes.)

  "internalLines": "none",        // "none" | "center" | "all"

  "gridLayout":  "",              // "" | "radial" | "hexagonal" | "linear"
  "gridLayout2": "",              // same options, for recursive instances2
  "gridSpacing": 0,               // legacy / unused for most layouts

  "radialArc":  360,              // -360..360. Total sweep for radial layout (negative reverses).
  "radialArc2": 360,
  "alignToPath":  false,          // rotate instances to match radial path tangent
  "alignToPath2": false,

  // Stroke / fill
  "strokeColor": "#ffffff",
  "strokeEnabled": true,
  "strokeStyleType": "solid",     // "solid" | "dotted" | "dashed"
  "dashLength": 10,               // 0.1–100, for dashed/dotted
  "gapLength": 10,                // 1–100, for dashed/dotted
  "fillColor": "#ffffff",
  "fillEnabled": false,
  "scaleLocked": true,            // when true, radiusY mirrors radiusX in keyframes

  // Dots-on-vertices
  "dotsEnabled": false,
  "dotSize": 3,                   // 1–20
  "dotType": "filled",            // "filled" | "outlined"
  "dotOffset": false,             // offset dots between vertex pairs

  // Per-layer gradient (overrides strokeColor when enabled)
  "gradientEnabled": false,
  "gradientStops": [
    { "id": "1", "offset": 0,   "color": "#ff0000" },
    { "id": "2", "offset": 100, "color": "#0000ff" }
  ],

  "shapeArc": 360,                // 0–360. (Also animatable.) Used by circle/polygon.

  // Line shape only
  "lineAnchor": "center",         // "center" | "start" | "end"

  // Molecule
  "molecule": "threonine",        // see Renderer molecule list
  "moleculeSize": 1,              // 0.1–5
  "moleculeFill": false,

  // Polyhedron
  "polyhedronName": "tetrahedron",

  // I-Ching
  "ichingInputId": 1,             // 1–64
  "ichingHighlightIndex": 0,      // 0–6 (0 = no highlight)
  "ichingAnimationDuration": 5,   // 0.5–30. Independent of layer timeline.

  // Asset layers
  "assetFolderId": null,          // for asset_set
  "assetId": null,                // for asset_single

  // Custom SVG
  "customPath": "M0,0 L100,100", // single path
  "customPaths": [ "M..." ],     // alternative: array of paths

  // Timeline behaviour
  "loopIndependently": false,     // layer animation loops within timeline window
  "persistVisible": false,        // remain rendered (with last keyframe values) after timeline.end

  // Group style override
  "styleOverrideEnabled": false   // when true, ignore project.global* style fields
}
```

---

## `LayerKeyframe` — animated values

```jsonc
{
  "id": "kf-abc123",
  "time": 0,                      // SECONDS RELATIVE TO timeline.start (not absolute).
  "easing": "easeInOutSine",      // see EasingType list
  "bezier": [0.42, 0, 0.58, 1],   // only if easing === "custom" — cubic-bezier control points
  "value": {
    "radiusX": 100,
    "radiusY": 100,
    "opacity": 255,
    /* … any subset of AnimatableProperties — missing fields fall back to DEFAULT_ANIMATABLES … */
  }
}
```

Rules:
- A layer with **one keyframe** holds those values forever (static).
- A layer with **two or more** interpolates between them in order of `time`.
- The first keyframe should usually have `time: 0`. Layer bounds are `timeline.start + min(time)` → `timeline.start + max(time)`.
- `value` may omit properties — missing ones inherit defaults (see table below). For continuity, copy unchanged values into each keyframe.
- `scaleLocked: true` in `config` means: keep `radiusX === radiusY` across keyframes.

### `EasingType`

```
linear
easeInSine     easeOutSine     easeInOutSine
easeInQuad     easeOutQuad     easeInOutQuad
easeInCubic    easeOutCubic    easeInOutCubic
easeInQuart    easeOutQuart    easeInOutQuart
easeInQuint    easeOutQuint    easeInOutQuint
easeInExpo     easeOutExpo     easeInOutExpo
easeInCirc     easeOutCirc     easeInOutCirc
easeInBack     easeOutBack     easeInOutBack
easeInElastic  easeOutElastic  easeInOutElastic
easeInBounce   easeOutBounce   easeInOutBounce
custom         // requires bezier: [x1, y1, x2, y2]
```

### `AnimatableProperties` (every field in keyframe `value`)

| Property | Default | Range (Inspector slider) | Notes |
|---|---|---|---|
| `radiusX` | 100 | 0–∞ | Horizontal radius / half-width. |
| `radiusY` | 100 | 0–∞ | Vertical radius. Locked to radiusX if `config.scaleLocked`. |
| `radiusOffset` | 0 | — | Adds to each instance's radius (primary group). |
| `offsetMult` | 0 | — | Multiplier applied as instance index grows. |
| `rotateGlobal` | 0 | -360..360 | Rotation of the whole layer in plane. |
| `rotateLayer` | 0 | 0–720 | Additional layer-level rotation accumulator. |
| `rotateShape` | 0 | -360..360 | Per-shape rotation. |
| `rotateX` | 0 | -360..360 | 3D X-axis tilt (needs `perspective`). |
| `rotateY` | 0 | -360..360 | 3D Y-axis tilt. |
| `perspective` | 1200 | 100–3000 | 3D perspective distance. |
| `orbitRadius` | 0 | — | Distance from layer center for orbit motion. |
| `rotateOrbit` | 0 | — | Orbit angle in degrees. |
| `posX` | 0 | — | Layer center X offset (pixels). |
| `posY` | 0 | — | Layer center Y offset. |
| `spacingX` | 0 | — | Per-instance X step (linear / grid layouts). |
| `spacingY` | 0 | — | Per-instance Y step. |
| `vSpacing` | 0 | — | Deprecated alias — prefer spacingX/spacingY. |
| `instanceRotation` | 0 | — | Rotation applied at first instance. |
| `instanceRotationMult` | 0 | — | Added per subsequent instance. |
| `orbitRadius2`, `rotateOrbit2`, `radiusOffset2`, `offsetMult2`, `vSpacing2`, `spacingX2`, `spacingY2`, `instanceRotation2`, `instanceRotationMult2` | 0 | — | Same as above, applied to recursive `instances2` group. |
| `shapeArc` | 360 | 0–360 | Partial arc of the shape (degrees). Animatable. |
| `starInnerRadius` | 0.5 | 0–1 | Star inner-radius ratio. Animatable. |
| `strokeWeight` | 1 | 0.1–20 | Stroke thickness in px. |
| `opacity` | 255 | 0–255 | **Not 0–1.** |
| `blur` | 0 | 0–20 | Per-layer blur (Pixi BlurFilter). |
| `canvasBlur` | 0 | 0–20 | Whole-canvas blur. |
| `glowStrength` | 0 | 0–10 | Glow filter intensity. |
| `noise` | 0 | 0–1 | Noise filter amount. |
| `displacementScale` | 0 | 0–200 | Displacement filter scale. |
| `shockwaveTime` | 0 | 0–1 | Shockwave filter progress (animate to ripple). |
| `twistAngle` | 0 | -10..10 (radians-ish) | Twist filter angle. |
| `twistRadius` | 200 | 10–1000 | Twist filter radius. |
| `twistOffsetX`, `twistOffsetY` | 0 | -500..500 | Twist filter center offset. |
| `bulgeStrength` | 0 | -10..10 | Bulge/pinch strength. |
| `bulgeRadius` | 200 | 0–600 | Bulge filter radius. |
| `bulgeCenterX`, `bulgeCenterY` | 0 | -500..500 | Bulge center offset. |
| `motionBlurStrength` | 0 | 0–10 | Motion blur. |
| `bloomThreshold` | 0 | 0–1 | Advanced bloom threshold. |
| `bloomStrength` | 0 | 0–5 | Advanced bloom strength. |
| `bloomRadius` | 0 | 0–20 | Advanced bloom radius. |

Slider ranges are UI guidance — the renderer accepts any number, but values far outside the ranges may look broken.

---

## `SymmetryConfig`

```jsonc
"symmetry": {
  "enabled": false,
  "mode": "3-way",                // "3-way" | "6-way" | "horizontal" | "vertical"
  "masked": true,                 // clip each segment to its wedge
  "mirrorSegments": false         // alternate mirror flips between segments
}
```

---

## Common editing recipes

### Add a new keyframe
```jsonc
{
  "id": "kf-fade",
  "time": 3.5,                    // 3.5s after the layer's timeline.start
  "easing": "easeOutCubic",
  "value": { "radiusX": 300, "radiusY": 300, "opacity": 0, "rotateGlobal": 180 }
}
```
Append to the layer's `keyframes` array. If `time` exceeds the current `timeline.end - timeline.start`, also bump `timeline.end` accordingly so the layer keeps animating.

### Add a new layer
Minimum viable layer:
```jsonc
{
  "id": "layer-newtri",
  "name": "Triangle",
  "type": "polygon",
  "visible": true,
  "timeline": { "start": 0, "end": 5 },
  "fadeIn": { "enabled": false, "duration": 2 },
  "fadeOut": { "enabled": false, "duration": 2 },
  "config": {
    "sides": 3, "instances": 1, "density": 0, "densitySelective": false,
    "drawOutline": true, "drawSpokes": false, "drawWeb": false, "drawStar": false,
    "starSkip": 2, "starInnerRadius": 0.5,
    "internalLines": "none", "gridLayout": "", "gridSpacing": 0,
    "instances2": 0, "gridLayout2": "",
    "strokeColor": "#ffffff", "strokeEnabled": true, "strokeStyleType": "solid",
    "dashLength": 10, "gapLength": 10,
    "fillColor": "#ffffff", "fillEnabled": false, "scaleLocked": true,
    "dotsEnabled": false, "dotSize": 3, "dotType": "filled", "dotOffset": false,
    "shapeArc": 360, "radialArc": 360, "alignToPath": false, "lineAnchor": "center",
    "persistVisible": false, "styleOverrideEnabled": false
  },
  "keyframes": [
    { "id": "kf-a", "time": 0, "easing": "linear",
      "value": { "radiusX": 100, "radiusY": 100, "opacity": 255, "strokeWeight": 1 } },
    { "id": "kf-b", "time": 5, "easing": "easeInOutSine",
      "value": { "radiusX": 250, "radiusY": 250, "opacity": 0, "rotateGlobal": 360, "strokeWeight": 1 } }
  ],
  "symmetry": { "enabled": false, "mode": "3-way", "masked": true, "mirrorSegments": false }
}
```

### Group layers
Set every child layer's `parentId` to the group layer's `id`. The group layer itself should have `type: "group"`.

### Change colors globally
Set `globalStyleEnabled: true` on the project and set `globalLineColor` / `globalStrokeWeight`. Any layer with `config.styleOverrideEnabled: false` (the default) will pick it up.

### Re-time an existing animation
The keyframe `time` is **relative to `timeline.start`**, not absolute project time. To shift a layer later: increase `timeline.start` (and `timeline.end` by the same amount). To stretch its duration: scale each keyframe's `time` and update `timeline.end`.

### Loop a sub-animation within a longer project duration
Set the layer's `config.loopIndependently: true`. The layer's keyframes will repeat across the project's `duration`.

---

## Editing rules of thumb for AI

1. **Keep all required fields.** Player code reads `project.duration`, `project.layers`, and each layer's `timeline`, `config`, `keyframes`, `symmetry`. Missing required nested fields cause runtime errors.
2. **`opacity` is 0–255, not 0–1.** This is the single most common mistake.
3. **Keyframe `time` is relative.** Absolute time = `layer.timeline.start + keyframe.time`.
4. **IDs must be unique within their array** (layers, keyframes, gradient stops). Random short suffixes are fine: `"layer-" + 9 random base36 chars`.
5. **Color values are hex strings** (`"#rrggbb"`), no alpha channel — opacity is its own animated property.
6. **Asset-typed layers (`asset_set` / `asset_single`)** only work if the export was made with that asset's data inlined (`assets-registry.js` present). You can't add a new asset id that wasn't bundled.
7. **`astrology` / `amino` types** need `astro-data.js` / `amino-data.js` present in the export folder.
8. **Don't add fields the schema doesn't define.** They'll be silently ignored at best, or throw at worst.
9. **Validate JSON before reloading** — the embedded literal must be valid JS object syntax (trailing commas and comments NOT allowed inside `embeddedProjectData`).

---

## Loading a separate JSON file (recommended for AI editing)

Instead of editing the giant `embeddedProjectData` literal inside `index.html`:

1. Save your edited project as `myproject.json` next to `index.html`.
2. Open `index.html?project=myproject.json`.

This skips the embedded data and fetches your file at runtime. File-protocol (`file://`) browsers may block `fetch` — host the folder over a tiny local server (`python3 -m http.server`) or use a browser with `--allow-file-access-from-files`.

---

## Authoritative schema references (in this repo)

For future updates, the canonical definitions live in the v2 source:
- Types: `App/src/types/index.ts` (interfaces `Project`, `Layer`, `LayerConfig`, `LayerKeyframe`, `AnimatableProperties`, `SymmetryConfig`, `EasingType`).
- Defaults: `App/src/constants/defaults.ts` (`DEFAULT_ANIMATABLES`).
- Layer factory: `App/src/store/useStore.ts` → `createDefaultLayer`.
- Runtime entry: `App/src/player.ts` (`window.GeometryApp.init`).
