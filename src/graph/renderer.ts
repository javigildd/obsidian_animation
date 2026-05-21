import { Graph, Node, Link } from './generator';

export interface RenderParams {
  /** World→screen zoom. 1 = identity. */
  zoom: number;
  /** World-space pan (x, y). */
  panX: number;
  panY: number;
  particleSize: number;
  nodeOpacity: number;
  linkOpacity: number;
  /** Pixel ratio for crisp rendering on hi-DPI / export. */
  dpr: number;
  /** Canvas size in CSS pixels. */
  width: number;
  height: number;
  /** Background color. */
  background?: string;
  /** Node fill color. */
  nodeColor?: string;
  /** Link stroke color. */
  linkColor?: string;
  /** Enable soft glow (slower). */
  glow?: boolean;
}

const DEFAULTS = {
  background: '#0a0a0a',
  nodeColor: '#e8e8e8',
  linkColor: '#777777',
};

export function render(
  ctx: CanvasRenderingContext2D,
  graph: Graph,
  p: RenderParams
) {
  const { width, height, dpr, zoom, panX, panY, particleSize } = p;
  const bg = p.background ?? DEFAULTS.background;
  const nodeColor = p.nodeColor ?? DEFAULTS.nodeColor;
  const linkColor = p.linkColor ?? DEFAULTS.linkColor;

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Clear.
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Center the world at canvas center, then apply zoom and pan (in world units).
  const cx = width / 2;
  const cy = height / 2;
  ctx.translate(cx, cy);
  ctx.scale(zoom, zoom);
  ctx.translate(panX, panY);

  // Links.
  ctx.lineWidth = Math.max(0.4, 0.6 / zoom);
  ctx.strokeStyle = withAlpha(linkColor, p.linkOpacity);
  ctx.beginPath();
  for (const link of graph.links) {
    const s = link.source as Node;
    const t = link.target as Node;
    if (s.x == null || s.y == null || t.x == null || t.y == null) continue;
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(t.x, t.y);
  }
  ctx.stroke();

  // Optional glow pass (cheap radial). Skip on huge graphs.
  if (p.glow && graph.nodes.length <= 2500) {
    ctx.globalCompositeOperation = 'lighter';
    for (const n of graph.nodes) {
      if (n.x == null || n.y == null) continue;
      const r = (n.size + 0.4) * particleSize;
      const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 3);
      grad.addColorStop(0, withAlpha(nodeColor, 0.18 * p.nodeOpacity));
      grad.addColorStop(1, withAlpha(nodeColor, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // Nodes.
  ctx.fillStyle = withAlpha(nodeColor, p.nodeOpacity);
  for (const n of graph.nodes) {
    if (n.x == null || n.y == null) continue;
    const r = Math.max(0.3 / zoom, n.size * particleSize);
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function withAlpha(hex: string, alpha: number): string {
  // Accept #rgb / #rrggbb. Falls back to rgba via canvas globalAlpha if unparsable.
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

/**
 * Resize canvas backing store to match CSS size × DPR for crisp output.
 */
export function fitCanvas(canvas: HTMLCanvasElement, width: number, height: number, dpr: number) {
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
}
