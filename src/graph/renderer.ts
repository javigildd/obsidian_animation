import { Graph, Node } from './generator';

export interface RenderParams {
  /** World→screen zoom. 1 = identity. */
  zoom: number;
  /** World-space rotation in radians. */
  rotation: number;
  /** World-space pan (x, y). */
  panX: number;
  panY: number;
  /** Base particle size (multiplied by per-node sizeFactor * sizeVariance). */
  particleSize: number;
  /** 0 = all nodes uniform size, 1 = full per-node sizeFactor. */
  sizeVariance: number;
  nodeOpacity: number;
  linkOpacity: number;
  /** Glow intensity 0..1 (0 = no glow). */
  glow: number;
  /** Pixel ratio for crisp rendering on hi-DPI / export. */
  dpr: number;
  /** Canvas size in CSS pixels. */
  width: number;
  height: number;
  /** Current timeline time, used to drive per-node birth animation. */
  currentTime: number;
  /** Birth animation duration in seconds (per-particle scale-in). */
  birthDuration: number;
  /** 0..1 — sequentially fades particles (last-born first) by opacity only.
   *  At 1 the entire graph is invisible. Does not affect physics. */
  turnOff: number;
  /** Background color. Set to `null` to leave the canvas transparent
   *  (used when exporting ProRes 4444 with alpha). */
  background?: string | null;
  /** Node fill color. */
  nodeColor?: string;
  /** Link stroke color. */
  linkColor?: string;
}

const DEFAULTS = {
  background: '#0a0a0a',
  nodeColor: '#e8e8e8',
  linkColor: '#777777',
};

function birthFactor(birthT: number | undefined, now: number, duration: number): number {
  const bt = birthT ?? 0;
  if (duration <= 0) return now >= bt ? 1 : 0;
  if (now < bt) return 0;
  const u = Math.min(1, (now - bt) / duration);
  // easeOut quad — fast pop, gentle settle to 1.
  return 1 - (1 - u) * (1 - u);
}

/**
 * Sequential opacity fade-out — last-born particles vanish first, first-born
 * vanish last. With `liveCount` live nodes and progress `t` ∈ [0,1]:
 *   - At t = 0 → factor = 1 (visible).
 *   - At t = 1 → factor = 0 (gone).
 *   - In between: each node's individual fade is a window of width `w`
 *     centered around its own deathT, so the cohort dies in a smooth wave.
 */
function deathFactor(nodeIndex: number, liveCount: number, turnOff: number): number {
  if (turnOff <= 0) return 1;
  if (turnOff >= 1) return 0;
  if (liveCount <= 0) return 1;
  // Per-node death threshold (0 = dies first, ~1 = dies last).
  const deathT = (liveCount - 1 - nodeIndex) / Math.max(1, liveCount);
  // Width of each individual fade window. A bit of `1 / liveCount` so each
  // fade is at least one-particle-wide, plus a small constant for taste.
  const w = Math.max(1 / Math.max(1, liveCount), 0.04);
  // Normalize progress against this node's window.
  const u = (turnOff - deathT) / w;
  if (u <= 0) return 1;
  if (u >= 1) return 0;
  // Smoothstep — no harsh edges.
  return 1 - u * u * (3 - 2 * u);
}

function nodeRadius(n: Node, p: RenderParams): number {
  // Lerp between uniform 1 and the node's intrinsic sizeFactor.
  const f = 1 + (n.sizeFactor - 1) * p.sizeVariance;
  return Math.max(0.25 / p.zoom, f * p.particleSize);
}

export function render(ctx: CanvasRenderingContext2D, graph: Graph, p: RenderParams) {
  const { width, height, dpr, zoom, rotation, panX, panY } = p;
  // `background === null` means transparent — used by alpha export so the
  // ProRes 4444 file has a real alpha channel instead of a black plate.
  const bg = p.background === null ? null : (p.background ?? DEFAULTS.background);
  const nodeColor = p.nodeColor ?? DEFAULTS.nodeColor;
  const linkColor = p.linkColor ?? DEFAULTS.linkColor;

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Clear first (also clears any previous frame); then fill if we have a bg.
  ctx.clearRect(0, 0, width, height);
  if (bg !== null) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
  }

  // Center the world at canvas center, then apply rotation, zoom, pan.
  const cx = width / 2;
  const cy = height / 2;
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  ctx.scale(zoom, zoom);
  ctx.translate(panX, panY);

  // Pre-compute birth + death factors for the live subset.
  //   bf[i] — birth (drives radius AND opacity)
  //   df[i] — death (opacity-only, doesn't shrink the node so no faux motion)
  const N = graph.nodes.length;
  const bf = new Float32Array(N);
  const df = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    bf[i] = birthFactor(graph.nodes[i].birthT, p.currentTime, p.birthDuration);
    df[i] = deathFactor(i, N, p.turnOff);
  }
  const idxById = new Map<number, number>();
  for (let i = 0; i < N; i++) idxById.set(graph.nodes[i].id, i);

  // Links — opacity gated by the youngest endpoint AND the closest-to-death.
  ctx.lineWidth = Math.max(0.4, 0.6 / zoom);
  for (const link of graph.links) {
    const s = link.source as Node;
    const t = link.target as Node;
    if (s.x == null || s.y == null || t.x == null || t.y == null) continue;
    const si = idxById.get(s.id);
    const ti = idxById.get(t.id);
    if (si == null || ti == null) continue;
    const a = Math.min(bf[si], bf[ti]) * Math.min(df[si], df[ti]);
    if (a <= 0) continue;
    ctx.strokeStyle = withAlpha(linkColor, p.linkOpacity * a);
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(t.x, t.y);
    ctx.stroke();
  }

  // Glow pass (cheap radial). Intensity scales with the glow parameter.
  // The user can drop the Glow slider to 0 on very large graphs where the
  // radial-gradient pass becomes the bottleneck.
  if (p.glow > 0) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < N; i++) {
      const n = graph.nodes[i];
      if (n.x == null || n.y == null) continue;
      const a = bf[i] * df[i];
      if (a <= 0) continue;
      // Radius driven by birth only — turnOff is opacity-only on purpose.
      const r = nodeRadius(n, p) * bf[i];
      const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 3.2);
      grad.addColorStop(0, withAlpha(nodeColor, 0.22 * p.nodeOpacity * a * p.glow));
      grad.addColorStop(1, withAlpha(nodeColor, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r * 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // Nodes.
  for (let i = 0; i < N; i++) {
    const n = graph.nodes[i];
    if (n.x == null || n.y == null) continue;
    const a = bf[i] * df[i];
    if (a <= 0) continue;
    const r = nodeRadius(n, p) * bf[i]; // radius unaffected by turnOff
    ctx.fillStyle = withAlpha(nodeColor, p.nodeOpacity * a);
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function withAlpha(hex: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  let r = 255,
    g = 255,
    b = 255;
  if (hex.startsWith('#')) {
    if (hex.length === 4) {
      r = parseInt(hex[1] + hex[1], 16);
      g = parseInt(hex[2] + hex[2], 16);
      b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) {
      r = parseInt(hex.slice(1, 3), 16);
      g = parseInt(hex.slice(3, 5), 16);
      b = parseInt(hex.slice(5, 7), 16);
    }
  }
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function fitCanvas(canvas: HTMLCanvasElement, width: number, height: number, dpr: number) {
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
}
