export interface Node {
  id: number;
  size: number;
  cluster: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
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
 * Procedurally generate a graph that mimics the Obsidian look:
 *   - A dense central region with multiple clusters that share hubs.
 *   - An outer halo of short chains (disconnected components) that settle
 *     into a ring once charge + centering forces reach equilibrium.
 */
export function generateGraph(count: number, seed: number = 1): Graph {
  const rng = makeRng(seed);
  const nodes: Node[] = [];
  const links: Link[] = [];

  const K = Math.max(4, Math.min(24, Math.floor(count / 60)));
  const centralCount = Math.max(K, Math.floor(count * 0.78));
  const hubIndices: number[] = [];

  // Hubs first (bigger).
  for (let k = 0; k < K; k++) {
    nodes.push({
      id: nodes.length,
      cluster: k,
      size: 2.4 + rng() * 1.8,
      x: Math.cos((k / K) * Math.PI * 2) * 40 + (rng() - 0.5) * 20,
      y: Math.sin((k / K) * Math.PI * 2) * 40 + (rng() - 0.5) * 20,
    });
    hubIndices.push(k);
  }

  // Sub-hubs: ~10% of central, medium size, connected to a random main hub.
  const subHubCount = Math.max(0, Math.floor(centralCount * 0.08));
  const subHubIndices: number[] = [];
  for (let i = 0; i < subHubCount; i++) {
    const parentCluster = Math.floor(rng() * K);
    const id = nodes.length;
    nodes.push({
      id,
      cluster: parentCluster,
      size: 1.4 + rng() * 0.9,
      x: nodes[hubIndices[parentCluster]].x! + (rng() - 0.5) * 30,
      y: nodes[hubIndices[parentCluster]].y! + (rng() - 0.5) * 30,
    });
    subHubIndices.push(id);
    links.push({ source: id, target: hubIndices[parentCluster] });
  }

  // Leaf nodes attached to either a hub or sub-hub.
  while (nodes.length < centralCount) {
    const parentCluster = Math.floor(rng() * K);
    const useSub = subHubIndices.length > 0 && rng() < 0.55;
    let parent: number;
    if (useSub) {
      const candidates = subHubIndices.filter((id) => nodes[id].cluster === parentCluster);
      parent = candidates.length
        ? candidates[Math.floor(rng() * candidates.length)]
        : hubIndices[parentCluster];
    } else {
      parent = hubIndices[parentCluster];
    }
    const id = nodes.length;
    nodes.push({
      id,
      cluster: parentCluster,
      size: 0.7 + rng() * 0.6,
      x: nodes[parent].x! + (rng() - 0.5) * 50,
      y: nodes[parent].y! + (rng() - 0.5) * 50,
    });
    links.push({ source: id, target: parent });
    // Occasional sibling cross-link inside the cluster for the wispy look.
    if (rng() < 0.04) {
      const sibling = Math.floor(rng() * id);
      if (nodes[sibling].cluster === parentCluster && sibling !== parent) {
        links.push({ source: id, target: sibling });
      }
    }
  }

  // Hub-to-hub interconnect.
  for (let i = 0; i < hubIndices.length; i++) {
    for (let j = i + 1; j < hubIndices.length; j++) {
      if (rng() < 0.45) {
        links.push({ source: hubIndices[i], target: hubIndices[j] });
      }
    }
  }

  // Outer ring: short chains placed in a circle far from origin.
  const outerCount = count - nodes.length;
  let placed = 0;
  while (placed < outerCount) {
    const chainLen = 2 + Math.floor(rng() * 5);
    const angle = rng() * Math.PI * 2;
    const radius = 320 + rng() * 80;
    const baseX = Math.cos(angle) * radius;
    const baseY = Math.sin(angle) * radius;
    let prev = -1;
    for (let k = 0; k < chainLen && placed < outerCount; k++, placed++) {
      const id = nodes.length;
      nodes.push({
        id,
        cluster: -1,
        size: 0.55 + rng() * 0.4,
        x: baseX + (rng() - 0.5) * 14,
        y: baseY + (rng() - 0.5) * 14,
      });
      if (prev !== -1) links.push({ source: prev, target: id });
      prev = id;
    }
  }

  return { nodes, links };
}
