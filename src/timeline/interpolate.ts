export type Easing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';

export interface Keyframe {
  /** Time in seconds. */
  t: number;
  /** Scalar value. */
  v: number;
  /** Easing applied as we approach this keyframe (curve segment leading into it). */
  ease: Easing;
}

export function ease(u: number, kind: Easing): number {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  // Sine-based easings — softer than the quadratic family. The quad versions
  // (u², 1-(1-u)²) look "punchy" / "hard" because the second derivative is
  // constant; the sine versions taper smoothly at both ends.
  switch (kind) {
    case 'linear':
      return u;
    case 'easeIn':
      return 1 - Math.cos((u * Math.PI) / 2);
    case 'easeOut':
      return Math.sin((u * Math.PI) / 2);
    case 'easeInOut':
      return -(Math.cos(Math.PI * u) - 1) / 2;
  }
}

/**
 * Sample a track of keyframes at time `t`. If empty, returns `fallback`.
 * Keyframes are assumed sorted by `t` ascending.
 */
export function sampleTrack(kfs: Keyframe[], fallback: number, t: number): number {
  if (kfs.length === 0) return fallback;
  if (kfs.length === 1) return kfs[0].v;
  if (t <= kfs[0].t) return kfs[0].v;
  if (t >= kfs[kfs.length - 1].t) return kfs[kfs.length - 1].v;

  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t;
      if (span <= 0) return b.v;
      const u = (t - a.t) / span;
      const e = ease(u, b.ease);
      return a.v + (b.v - a.v) * e;
    }
  }
  return kfs[kfs.length - 1].v;
}
