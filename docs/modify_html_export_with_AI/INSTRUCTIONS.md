# Editing your animation with AI (no app needed)

This guide is for **you, the human**. It tells you how to talk to an AI (Claude, ChatGPT, Cursor, etc.) to change an animation that was exported from Sacred Geometry Sequencer.

Pair it with [SKILL.md](SKILL.md) — that file teaches the AI the JSON schema. This file teaches you what to ask for.

---

## One-time setup

1. Unzip your exported animation folder. You should see:
   - `index.html`
   - `player.js`
   - `pixi-bundle.js`
   - sometimes `astro-data.js`, `amino-data.js`, `assets-registry.js`
2. Drop a copy of **SKILL.md** into that folder.
3. Open the folder in an AI coding tool (Claude Code, Cursor, VS Code + Copilot, etc.) — or paste `SKILL.md` + the contents of `index.html` into a chat.
4. To preview changes, either:
   - Double-click `index.html` (works for most edits, but some browsers block local file loading), or
   - Run a tiny server in the folder: `python3 -m http.server` then open `http://localhost:8000`.

---

## Where the animation data lives

Inside `index.html`, scroll until you see a giant line that starts with:

```
const embeddedProjectData = { … };
```

**That object is your entire animation.** Everything below comes down to: "ask the AI to change fields inside that object."

> **Tip:** For heavy editing, ask the AI to extract `embeddedProjectData` into a separate `myproject.json` file. Then open `index.html?project=myproject.json` to preview — way easier than editing inside a 5000-character HTML line.

---

## The prompt template that works

Start every chat with this. The two bracketed bits are all you change:

> Read SKILL.md in this folder — it documents the JSON schema for the animation in index.html. I want to **[describe the change]**. Edit the `embeddedProjectData` object in index.html accordingly. Don't change anything else.

That's it. The AI now knows the rules and what you want.

If the AI doesn't have file access (e.g. plain ChatGPT), paste SKILL.md first, then paste the `embeddedProjectData` object, then ask for the change.

---

## Common edits — copy-paste these prompts

### Change a shape

> Change the layer named "Hexagon" from a polygon to a star with 8 points.

> Make every polygon layer into a circle instead.

### Add or remove instances (copies)

> Increase `instances` on the "Petals" layer from 6 to 24.

> Add a second recursive ring around every layer: set `instances2` to 5 and `gridLayout2` to "radial" wherever it's currently 0.

### Speed it up / slow it down

> Slow the whole animation down by 2× — multiply `duration` by 2, and for every layer multiply `timeline.start`, `timeline.end`, and every keyframe's `time` by 2.

> Speed it up by 1.5× — divide `duration`, all `timeline.start`/`end`, and all keyframe `time`s by 1.5.

> Make just the "Mandala" layer twice as slow — leave `duration` alone, but double that layer's `timeline.end` and double every keyframe `time` inside it.

### Shift the timing

> Delay the "Outer Ring" layer by 2 seconds — add 2 to its `timeline.start` and `timeline.end`.

> Make the "Sparkles" layer start at 0 instead of 4 — shift its `timeline.start` and `timeline.end` back by 4.

### Change easing

> Change every keyframe in the project from `easeInOutSine` to `easeOutCubic`.

> On the "Triangle" layer, make the keyframes ease in slowly and snap out — set the first keyframe's easing to `easeInQuint` and the rest to `easeOutBack`.

> Use a custom cubic-bezier for layer "Wave": set easing to `custom` with bezier `[0.8, 0, 0.2, 1]`.

### Change color

> Change the stroke color of all layers to `#ff66cc`.

> Enable the global gradient: set `globalGradientEnabled` to true with stops at 0 `#1a0033` and 100 `#ff66cc`. Turn on `globalStyleEnabled` so layers pick it up.

> Give the "Hexagon" layer a per-layer gradient from gold `#d4af37` to deep red `#5a0000`, and set `styleOverrideEnabled` to true on that layer so it ignores the global style.

### Change size

> Double the size of every shape — for every keyframe, multiply `radiusX` and `radiusY` by 2.

> Make the "Inner Star" layer pulse from 50 to 200 instead of 100 to 150 — update its keyframes.

### Add a new keyframe (new motion)

> On layer "Halo", add a keyframe at time 4 seconds that scales the radius to 400 and fades opacity to 0. Use `easeOutCubic`. Bump `timeline.end` to 4 if it's shorter.

### Add rotation

> Make every layer rotate one full turn over the course of the animation — for each layer, set `rotateGlobal: 0` on its first keyframe and `rotateGlobal: 360` on its last.

> Add a slow 3D tilt to "Mandala": animate `rotateY` from -30 to 30 over its timeline, and set `perspective` to 1500.

### Add fade in / fade out

> Give every layer a 1-second fade in and a 2-second fade out — set `fadeIn.enabled` true with `duration: 1`, and `fadeOut.enabled` true with `duration: 2`.

### Add filters / effects

> Add a glow to the "Star" layer — set `glowStrength` to 2 on every keyframe.

> Animate a shockwave on "Ripple": keyframe `shockwaveTime` from 0 → 1 over 2 seconds.

> Add a subtle bloom across the project — on every keyframe set `bloomThreshold: 0.3`, `bloomStrength: 1.5`, `bloomRadius: 8`.

### Symmetry / kaleidoscope

> Turn on 6-way symmetry for the "Petals" layer: enable symmetry, mode `6-way`, masked true.

> Make the "Diamond" layer a mirrored kaleidoscope: symmetry enabled, mode `horizontal`, `mirrorSegments: true`.

### Loop a sub-animation

> Make the "Spinner" layer loop independently inside the project duration — set `config.loopIndependently: true`.

### Duplicate a layer

> Duplicate the "Hexagon" layer. Give the copy a new unique id, name it "Hexagon 2", offset its `posX` keyframes by +200, and set its color to cyan.

### Group layers

> Create a new group layer called "Foreground" and assign the "Star", "Sparkles", and "Halo" layers to it by setting their `parentId` to the group's id.

### Background

> Change the background to dark purple `#1a0033`.

> Make the background transparent — set `backgroundColor` to `transparent` (note: only works if the page CSS allows it).

---

## Recipes for bigger changes

### "Make it more dramatic"

> Make this animation more dramatic: increase all `strokeWeight` values by 50%, add `glowStrength: 1.5` to every keyframe, and change easing on all keyframes to `easeInOutCubic`. Also slow everything down by 1.3× (scale duration, timelines, and keyframe times).

### "Make it more subtle"

> Soften this animation: reduce all opacity peaks to 180 max, halve `strokeWeight` everywhere, remove any glow/bloom effects (set those to 0), and switch all easing to `easeInOutSine`.

### "Make it loop seamlessly"

> Make this loop seamlessly — for every layer, ensure the first keyframe's `value` exactly matches the last keyframe's `value` (except for things like `rotateGlobal` where the last value should be the first value + 360).

### "Stagger the entrances"

> Stagger the layers' entrances by 0.5 seconds each — set the first layer's `timeline.start` to 0, the second's to 0.5, the third's to 1.0, etc. Keep each layer's duration the same.

### "Reverse the animation"

> Reverse every layer's animation — for each layer, reverse the order of `keyframes` and rewrite each keyframe's `time` so the new first keyframe is at 0 and times count up the same way.

---

## Talking about values

Quick reference for what numbers mean (full table is in SKILL.md):

| You say… | AI should change… |
|---|---|
| "size" / "scale" | `radiusX`, `radiusY` in keyframes |
| "speed" / "duration" | project `duration`, layer `timeline.start`/`end`, keyframe `time` |
| "opacity 50%" | **`opacity: 128`** (range is 0–255, not 0–1) |
| "rotation" | `rotateGlobal` (in degrees, e.g. `360` = one full turn) |
| "thickness" / "line width" | `strokeWeight` |
| "blur" | `blur` per layer, or `canvasBlur` for whole canvas |
| "glow" | `glowStrength` (0–10) |
| "easing curve" | `easing` field on each keyframe |
| "copies" / "instances" | `config.instances` |

---

## When things go wrong

**Browser shows a blank screen after edit:**
- The JSON probably has a syntax error (missing comma, stray comment, wrong quote). Open the browser's DevTools Console (Cmd-Opt-I) — it'll point to the line.
- Or you accidentally removed a required field. Ask the AI: "Validate that every layer still has `id`, `timeline`, `config`, `keyframes`, and `symmetry`."

**Animation looks frozen:**
- A layer with only one keyframe is static. Add a second keyframe with a different `time`.
- `timeline.end` might be 0 (point mode). Set it to a value > `timeline.start`.

**A layer disappeared:**
- Check `visible: true`.
- Check that `timeline.start` ≤ project `duration`, and that `opacity` isn't 0 across all its keyframes.

**Opacity edits look wrong:**
- 0–255, not 0–1. "50% opacity" = `128`, not `0.5`.

**Asset / astrology / amino layer doesn't render:**
- Those layer types need the matching `*-data.js` or `assets-registry.js` bundle in the export folder. If your export didn't include it, that layer type won't work — ask the AI to change the layer to a regular shape type.

**Edits make the file unreadable:**
- Ask the AI to "extract `embeddedProjectData` into a separate `project.json` file, leave a comment in `index.html` pointing to it, and tell me how to load it via `?project=project.json`." Much easier to work with from here on.

---

## Good habits

- **Save a backup** before each big change. Copy `index.html` → `index.backup.html`.
- **Make one change at a time** when learning — easier to see what each parameter does.
- **Ask the AI to explain** what it changed: "After editing, list what you changed and why."
- **Keep SKILL.md in the folder.** As long as it's there, any AI can pick up the project cold.

---

## Full reference

Everything the AI needs (full schema, every property, every shape type, value ranges, defaults): see [SKILL.md](SKILL.md).
