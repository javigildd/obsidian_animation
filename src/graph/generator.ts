export interface Node {
  /** Birth order. Lower id = earlier birth. */
  id: number;
  /** Per-node random size factor (multiplier). 1 = average. */
  sizeFactor: number;
  /** Node degree at full graph (used for sizing). */
  degree: number;
  /** Per-node random jitter ∈ [0, 1) for misc visual variation. */
  rand: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  /** Time (timeline seconds) when this node became live. Used for pop-in. */
  birthT?: number;
}

export interface Link {
  source: number | Node;
  target: number | Node;
}

export interface Graph {
  nodes: Node[];
  links: Link[];
}

export function makeRng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * Generate a scale-free graph with Barabási–Albert preferential attachment.
 * The output node array is ordered by birth — node[0] is born first, node[N-1] last —
 * so the spawn animation only needs to walk the array in order.
 *
 *   - Each new node attaches to `m` existing nodes chosen with probability
 *     proportional to their degree (so hubs naturally emerge).
 *   - A small extra link is added with probability `extraLinkProb` for the
 *     "wispy" cross-links you see in Obsidian.
 *   - Node sizes are derived from degree (logarithmic) plus a small random kick;
 *     this gives Obsidian's "few big notes, many small ones" feel.
 */
export function generateGraph(
  N: number,
  seed: number = 1,
  opts: { m?: number; extraLinkProb?: number } = {}
): Graph {
  const m = opts.m ?? 1;
  const extraLinkProb = opts.extraLinkProb ?? 0.18;
  const rng = makeRng(seed);

  const nodes: Node[] = [];
  const links: Link[] = [];
  if (N <= 0) return { nodes, links };

  // Selection list: each node appears (degree+1) times, so picking a uniform
  // index from it yields a preferential-attachment draw in O(1). This is the
  // classic BA implementation and avoids re-summing degrees each step.
  const selection: number[] = [];
  const degree: number[] = [];

  // Initial seed: one isolated node.
  nodes.push({ id: 0, sizeFactor: 1, degree: 0, rand: rng() });
  selection.push(0);
  degree.push(0);

  for (let i = 1; i < N; i++) {
    nodes.push({ id: i, sizeFactor: 1, degree: 0, rand: rng() });
    degree.push(0);
    selection.push(i); // appears once before any links

    // Pick up to m unique existing nodes via preferential attachment.
    const picked = new Set<number>();
    const wanted = Math.min(m, i);
    let safety = 0;
    while (picked.size < wanted && safety++ < 64) {
      const j = selection[Math.floor(rng() * selection.length)];
      if (j !== i) picked.add(j);
    }
    for (const j of picked) {
      links.push({ source: i, target: j });
      degree[i]++;
      degree[j]++;
      selection.push(i, j);
    }

    // Occasional extra link for the "wispy" look.
    if (rng() < extraLinkProb && i > 2) {
      let tries = 0;
      while (tries++ < 32) {
        const j = selection[Math.floor(rng() * selection.length)];
        if (j !== i && !picked.has(j)) {
          links.push({ source: i, target: j });
          degree[i]++;
          degree[j]++;
          selection.push(i, j);
          break;
        }
      }
    }
  }

  // Bake sizeFactor based on degree. We want a few clearly large connector
  // hubs and many small leaves (matches the Obsidian reference).
  //   * `norm` is the log-normalized degree (0..1).
  //   * Quadratic term keeps leaves small while letting hubs shoot up.
  //   * Linear term gives every node *some* size scaling with degree.
  //   * Jitter breaks ties between equally-degreed nodes.
  // We then re-normalize so the mean sizeFactor is 1 across the graph. This
  // makes `sizeVariance` behave intuitively: at 0 every node has radius
  // `particleSize`; at 1, hubs are big and leaves are small.
  const maxDeg = Math.max(1, ...degree);
  for (let i = 0; i < nodes.length; i++) {
    const d = degree[i];
    nodes[i].degree = d;
    const norm = Math.log(d + 1) / Math.log(maxDeg + 1);
    const fromDegree = norm * norm * 7.5 + norm * 1.5;
    const jitter = (nodes[i].rand - 0.5) * 0.3;
    nodes[i].sizeFactor = Math.max(0.2, 0.2 + fromDegree + jitter);
  }
  // Normalize so mean = 1.
  let total = 0;
  for (let i = 0; i < nodes.length; i++) total += nodes[i].sizeFactor;
  const mean = total / Math.max(1, nodes.length);
  if (mean > 0) {
    for (let i = 0; i < nodes.length; i++) nodes[i].sizeFactor /= mean;
  }

  return { nodes, links };
}
