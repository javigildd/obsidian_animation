import { create } from 'zustand';
import { Easing, Keyframe, sampleTrack } from './interpolate';

export type AnimProp =
  | 'zoom'
  | 'rotation'
  | 'panX'
  | 'panY'
  | 'particleSize'
  | 'particleCount'
  | 'sizeVariance'
  | 'nodeOpacity'
  | 'linkOpacity'
  | 'glow'
  | 'forceStrength'
  | 'linkDistance'
  | 'ambientMotion'
  | 'turnOff'
  | 'collapse'
  | 'collapseRandom';

export const PROP_META: Record<
  AnimProp,
  {
    label: string;
    min: number;
    max: number;
    step: number;
    default: number;
    integer?: boolean;
    format?: (v: number) => string;
  }
> = {
  zoom: { label: 'Zoom', min: 0.1, max: 6, step: 0.01, default: 1, format: (v) => v.toFixed(2) + '×' },
  rotation: { label: 'Rotation', min: -360, max: 360, step: 1, default: 0, format: (v) => v.toFixed(0) + '°' },
  panX: { label: 'Pan X', min: -400, max: 400, step: 1, default: 0, format: (v) => v.toFixed(0) },
  panY: { label: 'Pan Y', min: -400, max: 400, step: 1, default: 0, format: (v) => v.toFixed(0) },
  particleSize: { label: 'Particle size', min: 0.2, max: 6, step: 0.05, default: 1.4, format: (v) => v.toFixed(2) },
  particleCount: { label: 'Particle count', min: 0, max: 50000, step: 1, default: 0, integer: true, format: (v) => Math.round(v).toString() },
  sizeVariance: { label: 'Size variance', min: 0, max: 1, step: 0.01, default: 1, format: (v) => Math.round(v * 100) + '%' },
  nodeOpacity: { label: 'Node opacity', min: 0, max: 1, step: 0.01, default: 1, format: (v) => v.toFixed(2) },
  linkOpacity: { label: 'Link opacity', min: 0, max: 1, step: 0.01, default: 0.45, format: (v) => v.toFixed(2) },
  glow: { label: 'Glow', min: 0, max: 1, step: 0.01, default: 1, format: (v) => Math.round(v * 100) + '%' },
  forceStrength: { label: 'Repulsion', min: -500, max: 500, step: 1, default: -45, format: (v) => v.toFixed(0) },
  linkDistance: { label: 'Link distance', min: 1, max: 400, step: 1, default: 28, format: (v) => v.toFixed(0) },
  ambientMotion: { label: 'Ambient motion', min: 0, max: 1, step: 0.01, default: 0.15, format: (v) => Math.round(v * 100) + '%' },
  turnOff: { label: 'Turn off', min: 0, max: 1, step: 0.01, default: 0, format: (v) => Math.round(v * 100) + '%' },
  collapse: { label: 'Collapse', min: 0, max: 1, step: 0.01, default: 0, format: (v) => Math.round(v * 100) + '%' },
  collapseRandom: { label: 'Collapse random', min: 0, max: 1, step: 0.01, default: 0, format: (v) => Math.round(v * 100) + '%' },
};

export const ANIM_PROPS = Object.keys(PROP_META) as AnimProp[];

export interface SelectedKey {
  prop: AnimProp;
  t: number;
}

export interface TimelineState {
  duration: number;
  fps: number;
  currentTime: number;
  playing: boolean;
  loop: boolean;
  /** Holds the "base" / "no-keyframe" value for each prop. */
  defaults: Record<AnimProp, number>;
  /** Sorted keyframes per prop. */
  tracks: Record<AnimProp, Keyframe[]>;
  /** Currently selected keyframe (for Delete/Backspace). */
  selected: SelectedKey | null;
  /** Non-animated visual settings (colors are not keyframeable scalars). */
  colors: ColorSettings;

  setTime: (t: number) => void;
  setPlaying: (p: boolean) => void;
  setDuration: (d: number) => void;
  setFps: (f: number) => void;
  setLoop: (l: boolean) => void;
  setDefault: (prop: AnimProp, v: number) => void;
  /** Insert or overwrite the keyframe at exactly time t (within 1e-3 tolerance). */
  upsertKey: (prop: AnimProp, t: number, v: number, ease?: Easing) => void;
  removeKey: (prop: AnimProp, t: number) => void;
  clearTrack: (prop: AnimProp) => void;
  clearAllKeyframes: () => void;
  setKeyEasing: (prop: AnimProp, t: number, ease: Easing) => void;
  /** Move a keyframe to a new time. Returns the new time (after snapping/clamping). */
  moveKey: (prop: AnimProp, oldT: number, newT: number) => number;
  selectKey: (sel: SelectedKey | null) => void;
  removeSelected: () => void;
  setColor: <K extends keyof ColorSettings>(key: K, value: ColorSettings[K]) => void;

  /** Sample the animated value of a prop at time t. */
  valueAt: (prop: AnimProp, t: number) => number;
  /** Snapshot all props at time t into a flat object. */
  snapshotAt: (t: number) => Record<AnimProp, number>;
  /** Does the prop have a keyframe at the given time? */
  hasKeyAt: (prop: AnimProp, t: number) => boolean;
  /** Serialize the persistable bits of the timeline. */
  exportSnapshot: () => {
    duration: number;
    fps: number;
    loop: boolean;
    defaults: Record<AnimProp, number>;
    tracks: Record<AnimProp, Keyframe[]>;
    colors?: ColorSettings;
  };
  /** Replace the timeline state with a previously serialized snapshot. */
  loadSnapshot: (data: {
    duration: number;
    fps: number;
    loop: boolean;
    defaults: Record<AnimProp, number>;
    tracks: Record<AnimProp, Keyframe[]>;
    colors?: ColorSettings;
  }) => void;
}

export interface ColorSettings {
  /** Color for the smallest particles. */
  nodeSmall: string;
  /** Color for the biggest particles (hubs). */
  nodeBig: string;
  /** Link stroke color. */
  link: string;
  /** Viewport/export background. */
  background: string;
  /** Intrinsic sizeFactor at/above which a node counts as "big".
   *  Mean sizeFactor across a graph is ~1; hubs reach ~4-6. */
  bigThreshold: number;
}

export const DEFAULT_COLORS: ColorSettings = {
  nodeSmall: '#e8e8e8',
  nodeBig: '#ffffff',
  link: '#777777',
  background: '#0a0a0a',
  bigThreshold: 1.8,
};

const initialDefaults: Record<AnimProp, number> = Object.fromEntries(
  ANIM_PROPS.map((p) => [p, PROP_META[p].default])
) as Record<AnimProp, number>;

const initialTracks: Record<AnimProp, Keyframe[]> = Object.fromEntries(
  ANIM_PROPS.map((p) => [p, [] as Keyframe[]])
) as Record<AnimProp, Keyframe[]>;

// Default growth animation: clearly-visible sequential reveal at ~40 nodes/sec.
// 0 → 300 over 7.5 s.
initialTracks.particleCount = [
  { t: 0, v: 0, ease: 'linear' },
  { t: 7.5, v: 300, ease: 'linear' },
];

const EPS = 1e-3;

export const useTimeline = create<TimelineState>((set, get) => ({
  duration: 10,
  fps: 30,
  currentTime: 0,
  playing: false,
  loop: true,
  defaults: { ...initialDefaults },
  tracks: { ...initialTracks },
  selected: null,
  colors: { ...DEFAULT_COLORS },

  setTime: (t) => set({ currentTime: Math.max(0, Math.min(get().duration, t)) }),
  setPlaying: (playing) => set({ playing }),
  setDuration: (duration) =>
    set((s) => ({ duration: Math.max(0.1, duration), currentTime: Math.min(s.currentTime, duration) })),
  setFps: (fps) => set({ fps: Math.max(1, Math.min(120, Math.round(fps))) }),
  setLoop: (loop) => set({ loop }),
  setDefault: (prop, v) => set((s) => ({ defaults: { ...s.defaults, [prop]: v } })),

  upsertKey: (prop, t, v, ease = 'easeInOut') =>
    set((s) => {
      const list = [...(s.tracks[prop] ?? [])];
      const idx = list.findIndex((k) => Math.abs(k.t - t) < EPS);
      if (idx >= 0) list[idx] = { ...list[idx], v };
      else {
        list.push({ t, v, ease });
        list.sort((a, b) => a.t - b.t);
      }
      return { tracks: { ...s.tracks, [prop]: list } };
    }),

  removeKey: (prop, t) =>
    set((s) => {
      const list = (s.tracks[prop] ?? []).filter((k) => Math.abs(k.t - t) >= EPS);
      const stillSelected =
        s.selected && s.selected.prop === prop && Math.abs(s.selected.t - t) < EPS
          ? null
          : s.selected;
      return { tracks: { ...s.tracks, [prop]: list }, selected: stillSelected };
    }),

  clearTrack: (prop) =>
    set((s) => {
      const stillSelected = s.selected && s.selected.prop === prop ? null : s.selected;
      return { tracks: { ...s.tracks, [prop]: [] }, selected: stillSelected };
    }),

  clearAllKeyframes: () =>
    set((s) => {
      const cleared = Object.fromEntries(ANIM_PROPS.map((p) => [p, [] as Keyframe[]])) as Record<
        AnimProp,
        Keyframe[]
      >;
      return { tracks: cleared, selected: null };
    }),

  setKeyEasing: (prop, t, ease) =>
    set((s) => {
      const list = (s.tracks[prop] ?? []).map((k) =>
        Math.abs(k.t - t) < EPS ? { ...k, ease } : k
      );
      return { tracks: { ...s.tracks, [prop]: list } };
    }),

  moveKey: (prop, oldT, newT) => {
    const s = get();
    const clamped = Math.max(0, Math.min(s.duration, newT));
    const list = [...(s.tracks[prop] ?? [])];
    const idx = list.findIndex((k) => Math.abs(k.t - oldT) < EPS);
    if (idx < 0) return oldT;
    // If another keyframe already lives at the destination, just delete the moving one.
    const collision = list.findIndex(
      (k, i) => i !== idx && Math.abs(k.t - clamped) < EPS
    );
    if (collision >= 0) {
      list.splice(idx, 1);
      set({
        tracks: { ...s.tracks, [prop]: list.sort((a, b) => a.t - b.t) },
        selected:
          s.selected && s.selected.prop === prop && Math.abs(s.selected.t - oldT) < EPS
            ? { prop, t: list[collision > idx ? collision - 1 : collision].t }
            : s.selected,
      });
      return list[collision > idx ? collision - 1 : collision].t;
    }
    list[idx] = { ...list[idx], t: clamped };
    list.sort((a, b) => a.t - b.t);
    set({
      tracks: { ...s.tracks, [prop]: list },
      selected:
        s.selected && s.selected.prop === prop && Math.abs(s.selected.t - oldT) < EPS
          ? { prop, t: clamped }
          : s.selected,
    });
    return clamped;
  },

  selectKey: (sel) => set({ selected: sel }),

  removeSelected: () => {
    const s = get();
    if (!s.selected) return;
    const { prop, t } = s.selected;
    const list = (s.tracks[prop] ?? []).filter((k) => Math.abs(k.t - t) >= EPS);
    set({ tracks: { ...s.tracks, [prop]: list }, selected: null });
  },

  setColor: (key, value) =>
    set((s) => ({ colors: { ...s.colors, [key]: value } })),

  valueAt: (prop, t) => {
    const s = get();
    return sampleTrack(s.tracks[prop] ?? [], s.defaults[prop], t);
  },

  snapshotAt: (t) => {
    const s = get();
    const out: Record<string, number> = {};
    for (const p of ANIM_PROPS) {
      out[p] = sampleTrack(s.tracks[p] ?? [], s.defaults[p], t);
    }
    return out as Record<AnimProp, number>;
  },

  hasKeyAt: (prop, t) => {
    const list = get().tracks[prop] ?? [];
    return list.some((k) => Math.abs(k.t - t) < EPS);
  },

  exportSnapshot: () => {
    const s = get();
    // Deep-clone so consumers can't accidentally mutate the live store.
    return {
      duration: s.duration,
      fps: s.fps,
      loop: s.loop,
      defaults: { ...s.defaults },
      tracks: Object.fromEntries(
        ANIM_PROPS.map((p) => [p, (s.tracks[p] ?? []).map((k) => ({ ...k }))])
      ) as Record<AnimProp, Keyframe[]>,
      colors: { ...s.colors },
    };
  },

  loadSnapshot: (data) => {
    // Merge with defaults so older snapshots (without newer props) still load
    // cleanly — missing props fall back to PROP_META defaults / empty tracks.
    const mergedDefaults = Object.fromEntries(
      ANIM_PROPS.map((p) => [p, data.defaults?.[p] ?? PROP_META[p].default])
    ) as Record<AnimProp, number>;
    const mergedTracks = Object.fromEntries(
      ANIM_PROPS.map((p) => [
        p,
        Array.isArray(data.tracks?.[p]) ? data.tracks[p].map((k) => ({ ...k })) : [],
      ])
    ) as Record<AnimProp, Keyframe[]>;
    set({
      duration: data.duration ?? 10,
      fps: data.fps ?? 30,
      loop: data.loop ?? true,
      defaults: mergedDefaults,
      tracks: mergedTracks,
      currentTime: 0,
      playing: false,
      selected: null,
      colors: { ...DEFAULT_COLORS, ...(data.colors ?? {}) },
    });
  },
}));
