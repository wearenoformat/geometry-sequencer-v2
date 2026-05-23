import type { GradientStop } from '../types';

export interface SvgRecolorOptions {
    fillEnabled?: boolean;
    fillColor?: string;
    strokeEnabled?: boolean;
    strokeColor?: string;
    // gradientEnabled is the legacy "applies to both" flag. When the per-target
    // flags below are undefined it acts as the default for both.
    gradientEnabled?: boolean;
    strokeGradientEnabled?: boolean;
    fillGradientEnabled?: boolean;
    gradientStops?: GradientStop[];
}

// Elements whose fill/stroke attributes affect the visible shape. Container-like
// elements (<defs>, <g>, <svg> itself) are walked through but not rewritten —
// setting fill on a <g> works via inheritance, but writing explicit attributes
// on leaf nodes is more predictable when the source SVG mixes styling patterns.
const PAINTABLE_TAGS = new Set([
    'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan',
]);

const GRADIENT_ID = '__gs_fill_gradient__';

// Build a deterministic cache key for a given color config. Empty string means
// "no recoloring" (render the base SVG unchanged).
export function buildColorKey(opts: SvgRecolorOptions): string {
    const legacyGrad = opts.gradientEnabled ?? false;
    const sg = opts.strokeGradientEnabled ?? legacyGrad;
    const fg = opts.fillGradientEnabled ?? legacyGrad;
    const anyOn = opts.fillEnabled || opts.strokeEnabled || sg || fg;
    if (!anyOn) return '';
    const f = opts.fillEnabled ? (opts.fillColor ?? '') : 'x';
    const s = opts.strokeEnabled ? (opts.strokeColor ?? '') : 'x';
    const gStops = (sg || fg)
        ? (opts.gradientStops ?? []).map(st => `${st.offset}:${st.color}`).join(',')
        : 'x';
    return `f=${f}|s=${s}|sg=${sg ? 1 : 0}|fg=${fg ? 1 : 0}|g=${gStops}`;
}

// Reads the currently-resolved paint on an element, honoring inline style
// (which beats the presentation attribute in SVG). Returns the raw string or
// null if unset. We use this to preserve explicit `none` values — typically
// framing rects or stroke-only paths where the author intended transparency.
function currentPaint(el: Element, prop: 'fill' | 'stroke'): string | null {
    const style = el.getAttribute('style');
    if (style) {
        const re = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i');
        const match = style.match(re);
        if (match) return match[1].trim().toLowerCase();
    }
    const attr = el.getAttribute(prop);
    return attr ? attr.trim().toLowerCase() : null;
}

// Rewrite `fill:` / `stroke:` declarations in a CSS string (either a <style>
// block or an inline style attribute), replacing real colors with our paint
// but preserving `none` / `transparent`. This keeps elements that were
// explicitly made transparent via CSS (common with Illustrator-exported
// class-based SVGs) from being filled in by our gradient.
function rewriteCssPaints(css: string, fillPaint: string | null, strokePaint: string | null): string {
    let result = css;
    const rewrite = (prop: 'fill' | 'stroke') =>
        new RegExp(`(${prop}\\s*:\\s*)([^;}!]+)`, 'gi');
    if (fillPaint !== null) {
        result = result.replace(rewrite('fill'), (_, prefix, val) => {
            const trimmed = val.trim().toLowerCase();
            if (trimmed === 'none' || trimmed === 'transparent') return `${prefix}${val}`;
            return `${prefix}${fillPaint}`;
        });
    }
    if (strokePaint !== null) {
        result = result.replace(rewrite('stroke'), (_, prefix, val) => {
            const trimmed = val.trim().toLowerCase();
            if (trimmed === 'none' || trimmed === 'transparent') return `${prefix}${val}`;
            return `${prefix}${strokePaint}`;
        });
    }
    return result;
}

export function recolorSvg(svgText: string, opts: SvgRecolorOptions): string {
    if (!buildColorKey(opts)) return svgText;

    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, 'image/svg+xml');
    const svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== 'svg') return svgText;

    const ns = svg.namespaceURI || 'http://www.w3.org/2000/svg';

    // Resolve paint targets. Monochromatic icons often mix filled paths with
    // stroked paths under a single visual "color"; so when only one of
    // fill/stroke is enabled, we extend that paint to both. Users who want
    // separate fill and stroke colors enable both toggles explicitly. Gradient,
    // when on, also covers strokes unless a stroke color was set separately.
    // In gradient mode the gradient applies to BOTH fills and strokes — the
    // user-facing model is "one color (or gradient) paints whatever the shape
    // already paints". Without this, stroke-only icons render in the flat
    // strokeColor while gradient mode is "on" and the gradient never appears.
    const legacyGrad = opts.gradientEnabled ?? false;
    const sg = opts.strokeGradientEnabled ?? legacyGrad;
    const fg = opts.fillGradientEnabled ?? legacyGrad;
    const gradientPaint = (sg || fg) ? `url(#${GRADIENT_ID})` : null;
    const rawFill = opts.fillEnabled ? (opts.fillColor ?? null) : null;
    const rawStroke = opts.strokeEnabled ? (opts.strokeColor ?? null) : null;
    const fillGradientPaint = fg ? gradientPaint : null;
    const strokeGradientPaint = sg ? gradientPaint : null;
    const fillPaint = fillGradientPaint ?? rawFill ?? rawStroke;
    const strokePaint = strokeGradientPaint ?? rawStroke ?? rawFill;

    // Rewrite <style> blocks in place — preserves `fill: none` on background
    // classes while replacing real colors with our paint. CSS beats presentation
    // attributes, so for CSS-styled SVGs this is what actually takes effect.
    svg.querySelectorAll('style').forEach(el => {
        if (el.textContent) el.textContent = rewriteCssPaints(el.textContent, fillPaint, strokePaint);
    });

    if ((sg || fg) && (opts.gradientStops ?? []).length > 0) {
        let defs: Element | null = svg.querySelector('defs');
        if (!defs) {
            defs = doc.createElementNS(ns, 'defs');
            svg.insertBefore(defs, svg.firstChild);
        }
        const grad = doc.createElementNS(ns, 'linearGradient');
        grad.setAttribute('id', GRADIENT_ID);
        grad.setAttribute('x1', '0');
        grad.setAttribute('y1', '0');
        grad.setAttribute('x2', '1');
        grad.setAttribute('y2', '0');
        for (const stop of opts.gradientStops ?? []) {
            const s = doc.createElementNS(ns, 'stop');
            // Pixi v8's SVG parser uses Number(value) for stop offsets and rejects
            // the "36%" form (yields NaN, which then makes canvas addColorStop throw
            // and the gradient texture build silently fails — paths render invisible).
            // Stops are stored as 0–100 in the editor; emit them as 0–1 decimals.
            const offset = Math.max(0, Math.min(1, (stop.offset ?? 0) / 100));
            s.setAttribute('offset', String(offset));
            s.setAttribute('stop-color', stop.color);
            grad.appendChild(s);
        }
        defs.appendChild(grad);
    }

    // Walk with inherited paint so we only recolor regions that already had
    // paint. SVG default fill is `black` (so unset = visible fill, do recolor);
    // SVG default stroke is `none` (so unset = invisible, DON'T add a stroke).
    // Without this, a stroke-only icon picks up our fill paint on every node
    // and an icon without strokes picks up our stroke paint everywhere — both
    // visible to users as "weird fills" / accidental outlines.
    const walk = (el: Element, inheritedFill: string, inheritedStroke: string) => {
        const ownFill = currentPaint(el, 'fill');
        const ownStroke = currentPaint(el, 'stroke');
        const resolvedFill = ownFill ?? inheritedFill;
        const resolvedStroke = ownStroke ?? inheritedStroke;

        const tag = el.nodeName.toLowerCase();
        if (PAINTABLE_TAGS.has(tag)) {
            const applyFill = fillPaint !== null && resolvedFill !== 'none';
            const applyStroke = strokePaint !== null && resolvedStroke !== 'none';
            if (applyFill) el.setAttribute('fill', fillPaint!);
            if (applyStroke) el.setAttribute('stroke', strokePaint!);
            const inline = el.getAttribute('style');
            if (inline) {
                // Rewrite inline fill/stroke (preserving `none`) so CSS doesn't
                // override the attributes we just set.
                const rewritten = rewriteCssPaints(inline, applyFill ? fillPaint : null, applyStroke ? strokePaint : null);
                if (rewritten !== inline) el.setAttribute('style', rewritten);
            }
        }
        for (const child of Array.from(el.children)) walk(child, resolvedFill, resolvedStroke);
    };
    walk(svg, 'black', 'none');

    return new XMLSerializer().serializeToString(doc);
}
