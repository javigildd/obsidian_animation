import { create } from 'zustand';
import { Easing, Keyframe, sampleTrack } from './interpolate';

export type AnimProp =
  | 'zoom'
  | 'panX'
  | 'panY'
  | 'particleSize'
  | 'particleCount'
  | 'nodeOpacity'
  | 'linkOpacity'
  | 'forceStrength'
  | 'linkDistance';

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
  panX: { label: 'Pan X', min: -400, max: 400, step: 1, default: 0, format: (v) => v.toFixed(0) },
  panY: { label: 'Pan Y', min: -400, max: 400, step: 1, default: 0, format: (v) => v.toFixed(0) },
  particleSize: { label: 'Particle size', min: 0.2, max: 6, step: 0.05, default: 1.4, format: (v) => v.toFixed(2) },
  particleCount: { label: 'Particle count', min: 50, max: 3000, step: 1, default: 800, integer: true, format: (v) => Math.round(v).toString() },
  nodeOpacity: { label: 'Node opacity', min: 0, max: 1, step: 0.01, default: 1, format: (v) => v.toFixed(2) },
  linkOpacity: { label: 'Link opacity', min: 0, max: 1, step: 0.01, default: 0.45, format: (v) => v.toFixed(2) },
  forceStrength: { label: 'Repulsion', min: -200, max: 0, step: 1, default: -45, format: (v) => v.toFixed(0) },
  linkDistance: { label: 'Link distance', min: 5, max: 120, step: 1, default: 28, format: (v) => v.toFixed(0) },
};

export const ANIM_PROPS = Object.keys(PROP_META) as AnimProp[];

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

  setTime: (t: number) => void;
  setPlaying: (p: boolean) => void;
  setDuration: (d: number) => void;
  setFps: (f: number) => void;
  setLoop: (l: boolean) => void;
  setDefault: (prop: AnimProp, v: number) => void;
  /** Insert or overwrite the keyframe at exactly time t (within 1e-4 tolerance). */
  upsertKey: (prop: AnimProp, t: number, v: number, ease?: Easing) => void;
  removeKey: (prop: AnimProp, t: number) => void;
  clearTrack: (prop: AnimProp) => void;
  setKeyEasing: (prop: AnimProp, t: number, ease: Easing) => void;

  /** Sample the animated value of a prop at time t. */
  valueAt: (prop: AnimProp, t: number) => number;
  /** Snapshot all props at time t into a flat object. */
  snapshotAt: (t: number) => Record<AnimProp, number>;
  /** Does the prop have a keyframe at the given time? */
  hasKeyAt: (prop: AnimProp, t: number) => boolean;
}

const initialDefaults: Record<AnimProp, number> = Object.fromEntries(
  ANIM_PROPS.map((p) => [p, PROP_META[p].default])
) as Record<AnimProp, number>;

const initialTracks: Record<AnimProp, Keyframe[]> = Object.fromEntries(
  ANIM_PROPS.map((p) => [p, [] as Keyframe[]])
) as Record<AnimProp, Keyframe[]>;

const EPS = 1e-3;

export const useTimeline = create<TimelineState>((set, get) => ({
  duration: 8,
  fps: 30,
  currentTime: 0,
  playing: false,
  loop: true,
  defaults: { ...initialDefaults },
  tracks: { ...initialTracks },

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
      return { tracks: { ...s.tracks, [prop]: list } };
    }),

  clearTrack: (prop) =>
    set((s) => ({ tracks: { ...s.tracks, [prop]: [] } })),

  setKeyEasing: (prop, t, ease) =>
    set((s) => {
      const list = (s.tracks[prop] ?? []).map((k) =>
        Math.abs(k.t - t) < EPS ? { ...k, ease } : k
      );
      return { tracks: { ...s.tracks, [prop]: list } };
    }),

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
}));
