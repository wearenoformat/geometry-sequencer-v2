import type { Layer, LayerKeyframe, Project } from '../types';
import { DEFAULT_ANIMATABLES } from '../constants/defaults';

/**
 * Project JSON format versioning.
 *
 * Every saved project carries `formatVersion` inside its JSON payload
 * (independent of the `projects.schema_version` DB column, which marks app
 * generation v1/v2). Projects written before versioning existed have no field
 * and are treated as version 2 — the keyframes era; the pre-keyframe legacy
 * shape is indistinguishable without the field, but the 2→3 sub-migrations
 * are idempotent so running them on any unstamped project is safe.
 *
 * Policy for future changes:
 *  - Prefer additive optional fields — old builds ignore unknown keys, no
 *    bump needed.
 *  - Bump PROJECT_FORMAT_VERSION (and register a migration) only when old
 *    builds would MIS-RENDER the new shape. Old builds already in the wild
 *    can't be fixed retroactively; they degrade silently. Current builds
 *    refuse to open a project stamped newer than they understand.
 *
 * Version history:
 *  - (unstamped / ≤2): v1 legacy `layer.animation` start/middle/end shape,
 *    or early-v2 keyframes without seeded radialArc animatables.
 *  - 3: first stamped version. Keyframe layers with seeded radialArc/radialArc2;
 *    introduced alongside the project music track (`project.audio`).
 */
export const PROJECT_FORMAT_VERSION = 3;

export class ProjectTooNewError extends Error {
    fileVersion: number;

    constructor(fileVersion: number) {
        super(
            `This project was saved with a newer version of Geometry Sequencer ` +
            `(format ${fileVersion}, this app supports up to ${PROJECT_FORMAT_VERSION}).`
        );
        this.name = 'ProjectTooNewError';
        this.fileVersion = fileVersion;
    }
}

const migrateLegacyAnimationLayer = (layer: any): Layer => {
    if (layer.keyframes) return layer as Layer;

    const startVal: any = {};
    const midVal: any = {};
    const endVal: any = {};

    if (layer.animation) {
        // Only copy values that are actually present. A missing start/middle/end
        // (common in legacy data where a property wasn't fully keyed) must fall
        // through to DEFAULT_ANIMATABLES — spreading an `undefined` would clobber
        // the default and feed NaN into interpolation, snapping the element to a
        // fallback position around that keyframe's time.
        const assign = (target: any, key: string, val: unknown) => {
            if (val !== undefined) target[key] = val;
        };
        Object.keys(layer.animation).forEach(key => {
            const prop = layer.animation[key];
            if (prop && typeof prop === 'object') {
                assign(startVal, key, prop.start);
                assign(midVal, key, prop.middle);
                assign(endVal, key, prop.end);
            }
        });
    }

    const fill = (obj: any) => ({ ...DEFAULT_ANIMATABLES, ...obj });
    const duration = (layer.timeline?.end || 10) - (layer.timeline?.start || 0);

    return {
        ...layer,
        keyframes: [
            { id: 'kf-start', time: 0, value: fill(startVal), easing: layer.animation?.easingSM || 'easeInOutSine' },
            { id: 'kf-mid', time: duration / 2, value: fill(midVal), easing: layer.animation?.easingME || 'easeInOutSine' },
            { id: 'kf-end', time: duration, value: fill(endVal), easing: 'linear' }
        ]
    } as Layer;
};

// radialArc / radialArc2 were promoted from layer.config to animatable keyframe
// properties. Keyframes authored before the promotion don't carry them, and a
// missing key interpolates toward 0 (see interpolateValues) — which would collapse
// the ring. Seed each keyframe from the layer's config value (defaulting to a full
// 360 ring) so existing projects keep their arc and interpolation stays stable.
const seedPromotedAnimatables = (layer: Layer): Layer => {
    if (!layer.keyframes?.length) return layer;
    const cfg = layer.config as any;
    const arc = cfg?.radialArc ?? 360;
    const arc2 = cfg?.radialArc2 ?? 360;

    let changed = false;
    const keyframes: LayerKeyframe[] = layer.keyframes.map(kf => {
        const value = kf.value as any;
        if (value?.radialArc !== undefined && value?.radialArc2 !== undefined) return kf;
        changed = true;
        return {
            ...kf,
            value: {
                ...value,
                radialArc: value?.radialArc ?? arc,
                radialArc2: value?.radialArc2 ?? arc2,
            },
        };
    });
    return changed ? { ...layer, keyframes } : layer;
};

type ProjectMigration = {
    from: number;
    to: number;
    migrate: (project: any) => any;
};

// Ordered chain: each entry's `to` is the next entry's `from`. migrateProject
// walks the chain from the file's version up to PROJECT_FORMAT_VERSION.
// Migrations must be pure and must not depend on store/network state — the
// asset-folder retype pass (normalizeSeedFolders in useStore) stays outside the
// chain precisely because it needs fetched assetFolders and no-ops without them.
const MIGRATIONS: ProjectMigration[] = [
    {
        from: 2,
        to: 3,
        migrate: (project: any) => ({
            ...project,
            layers: (project.layers || []).map((raw: any) =>
                seedPromotedAnimatables(migrateLegacyAnimationLayer(raw))
            ),
        }),
    },
];

export interface MigrationResult {
    project: Project;
    /** The version the file was at before migration, or null if already current. */
    upgradedFrom: number | null;
}

/**
 * Bring a raw project payload (from the DB, a JSON file, or an export) up to
 * PROJECT_FORMAT_VERSION. Throws ProjectTooNewError when the payload is
 * stamped with a version this build doesn't understand.
 */
export function migrateProject(raw: any): MigrationResult {
    const fileVersion = typeof raw?.formatVersion === 'number' ? raw.formatVersion : 2;

    if (fileVersion > PROJECT_FORMAT_VERSION) {
        throw new ProjectTooNewError(fileVersion);
    }

    let project = raw;
    let version = fileVersion;
    for (const step of MIGRATIONS) {
        if (version <= step.from && step.to <= PROJECT_FORMAT_VERSION) {
            project = step.migrate(project);
            version = step.to;
        }
    }

    project = { ...project, formatVersion: PROJECT_FORMAT_VERSION };
    return {
        project: project as Project,
        upgradedFrom: fileVersion < PROJECT_FORMAT_VERSION ? fileVersion : null,
    };
}
