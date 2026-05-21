import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
  Simulation,
  ForceLink,
} from 'd3-force';
import { Graph, Node, Link, generateGraph, makeRng } from './generator';

export interface SimParams {
  /** Repulsion strength (negative = repel). Typical range: -120..-10. */
  forceStrength: number;
  /** Ideal link distance in world units. */
  linkDistance: number;
  /** Centering force pull toward origin. */
  centerStrength: number;
  /** Collision radius multiplier (multiplies particleSize * sizeFactor). */
  collideMultiplier: number;
  /** Base particle size. */
  particleSize: number;
  /** How much of the per-node sizeFactor is applied (0 = uniform, 1 = full). */
  sizeVariance: number;
  /** 0..1 — strength of the per-tick Brownian kick that keeps the graph
   *  gently "breathing" after the simulation has otherwise settled. */
  ambientMotion: number;
}

/**
 * `graph` always contains the *full* pre-generated network (all max nodes).
 * `liveCount` is the number of nodes currently revealed. The simulation
 * operates only on the first `liveCount` nodes (slice from the front), so
 * the user sees the graph grow one node at a time as `liveCount` increases.
 */
export interface GraphState {
  graph: Graph;
  /** Live subset arrays handed to the simulation. */
  liveNodes: Node[];
  liveLinks: Link[];
  sim: Simulation<Node, Link>;
  params: SimParams;
  liveCount: number;
  maxCount: number;
  seed: number;
}

function effectiveRadius(n: Node, p: SimParams): number {
  const factor = 1 + (n.sizeFactor - 1) * p.sizeVariance;
  return Math.max(0.1, factor * p.particleSize) * p.collideMultiplier;
}

function buildSim(liveNodes: Node[], liveLinks: Link[], params: SimParams, seed: number) {
  const rng = makeRng(seed + 999);
  // We deliberately leave alphaDecay at d3's default (≈0.0228) and velocityDecay
  // at 0.4 — these are the values Obsidian uses, so the network settles into a
  // quiet rest state after the reveal finishes (no perpetual vibration). When
  // we add nodes we bump alpha back up to give the new arrival room to settle.
  // The link force gets its default per-link strength (1 / min(deg(s), deg(t)))
  // which gives stronger pulls between leaves and weaker pulls between hubs —
  // again, this is what Obsidian does.
  const sim = forceSimulation<Node>(liveNodes)
    .randomSource(rng)
    .force(
      'charge',
      forceManyBody<Node>()
        .strength(params.forceStrength)
        .distanceMax(800)
        .theta(0.9)
    )
    .force(
      'link',
      forceLink<Node, Link>(liveLinks)
        .id((d: any) => d.id)
        .distance(params.linkDistance)
    )
    .force('center', forceCenter(0, 0).strength(params.centerStrength))
    .force(
      'collide',
      forceCollide<Node>((n) => effectiveRadius(n, params)).iterations(1)
    )
    .alpha(0.4)
    .velocityDecay(0.4)
    .alphaMin(0.001)
    .stop();
  return sim;
}

/**
 * Build the full pre-generated graph (with `maxCount` nodes) and a simulation
 * that starts empty. Use `setLiveCount` to reveal nodes over time.
 */
export function createGraphState(
  maxCount: number,
  params: SimParams,
  seed: number = 1
): GraphState {
  const graph = generateGraph(maxCount, seed);
  const liveNodes: Node[] = [];
  const liveLinks: Link[] = [];
  const sim = buildSim(liveNodes, liveLinks, params, seed);
  return { graph, liveNodes, liveLinks, sim, params, liveCount: 0, maxCount, seed };
}

function paramsEqual(a: SimParams, b: SimParams): boolean {
  return (
    a.forceStrength === b.forceStrength &&
    a.linkDistance === b.linkDistance &&
    a.centerStrength === b.centerStrength &&
    a.collideMultiplier === b.collideMultiplier &&
    a.particleSize === b.particleSize &&
    a.sizeVariance === b.sizeVariance &&
    a.ambientMotion === b.ambientMotion
  );
}

/**
 * Update force parameters in place. Cheap when nothing actually changed
 * (called every frame from the render loop), but when something changes we
 * have to re-initialize each force so d3-force re-reads our accessors —
 * d3-force caches per-link distance/strength and per-node collide radius
 * on first init and ignores accessor changes otherwise. We also nudge alpha
 * so the new forces actually move the network.
 */
export function updateForces(state: GraphState, params: SimParams) {
  if (paramsEqual(state.params, params)) return;
  state.params = { ...params };
  const sim = state.sim;
  const charge = sim.force('charge') as any;
  const link = sim.force('link') as any;
  const center = sim.force('center') as any;
  const collide = sim.force('collide') as any;

  charge.strength(params.forceStrength);
  link.distance(params.linkDistance);
  center.strength(params.centerStrength);
  collide.radius((n: Node) => effectiveRadius(n, params));

  // Recompute internal caches.
  const random = sim.randomSource();
  charge.initialize?.(state.liveNodes, random);
  link.initialize?.(state.liveNodes, random);
  collide.initialize?.(state.liveNodes, random);

  // Re-energize so the new values actually take effect.
  sim.alpha(Math.max(sim.alpha(), 0.18));
}

/**
 * Reveal or hide nodes so that `liveCount` total are live. Newly revealed
 * nodes are stamped with `birthT = currentTime` and positioned next to one of
 * their already-live neighbours (so the network grows outward organically,
 * the way an Obsidian graph history plays back).
 */
export function setLiveCount(state: GraphState, newCount: number, currentTime: number): void {
  newCount = Math.max(0, Math.min(state.maxCount, Math.round(newCount)));
  if (newCount === state.liveCount) return;

  const { graph, liveNodes, liveLinks, sim } = state;

  if (newCount > state.liveCount) {
    // Reveal nodes one at a time (typically just a handful per frame).
    for (let i = state.liveCount; i < newCount; i++) {
      const n = graph.nodes[i];

      // Find an already-live neighbour to spawn next to.
      let parent: Node | null = null;
      for (const link of graph.links) {
        const sId = typeof link.source === 'object' ? (link.source as Node).id : (link.source as number);
        const tId = typeof link.target === 'object' ? (link.target as Node).id : (link.target as number);
        if (sId === i && tId < i) {
          parent = liveNodes[tId];
          if (parent) break;
        } else if (tId === i && sId < i) {
          parent = liveNodes[sId];
          if (parent) break;
        }
      }

      if (parent && parent.x != null && parent.y != null) {
        // Spawn exactly on top of the parent (Obsidian behavior). The link
        // force will gently push it out to the link distance; the birth
        // animation handles the visual pop.
        n.x = parent.x;
        n.y = parent.y;
        // Inherit a fraction of the parent's velocity so the new node doesn't
        // appear to "fight" the cluster's drift.
        n.vx = (parent.vx ?? 0) * 0.5;
        n.vy = (parent.vy ?? 0) * 0.5;
      } else {
        // First node ever: drop at origin, no velocity.
        n.x = 0;
        n.y = 0;
        n.vx = 0;
        n.vy = 0;
      }
      n.birthT = currentTime;
      liveNodes.push(n);

      // Activate any links whose endpoints are both already live.
      for (const link of graph.links) {
        const sId = typeof link.source === 'object' ? (link.source as Node).id : (link.source as number);
        const tId = typeof link.target === 'object' ? (link.target as Node).id : (link.target as number);
        if ((sId === i && tId < i) || (tId === i && sId < i)) {
          liveLinks.push({ source: sId, target: tId });
        }
      }
    }
  } else {
    // Hide nodes by popping from the end (preserves order).
    while (liveNodes.length > newCount) liveNodes.pop();
    // Drop any link whose endpoint is no longer live.
    const cutoff = newCount;
    for (let i = liveLinks.length - 1; i >= 0; i--) {
      const link = liveLinks[i];
      const sId = typeof link.source === 'object' ? (link.source as Node).id : (link.source as number);
      const tId = typeof link.target === 'object' ? (link.target as Node).id : (link.target as number);
      if (sId >= cutoff || tId >= cutoff) liveLinks.splice(i, 1);
    }
  }

  // Re-bind nodes and links so d3-force re-resolves link ids → Node refs.
  sim.nodes(liveNodes);
  (sim.force('link') as ForceLink<Node, Link>).links(liveLinks);
  // A small alpha nudge — just enough to absorb the new arrival. Too large
  // and the network gets "kicked" and existing nodes fly. Obsidian uses a
  // very modest re-energization on add.
  sim.alpha(Math.max(sim.alpha(), 0.18));

  state.liveCount = newCount;
}

export function tick(state: GraphState, n: number = 1) {
  if (state.liveNodes.length === 0) return;
  const ambient = state.params.ambientMotion;

  // Keep the simulation "warm" indefinitely when ambient motion is on by
  // pinning alphaTarget slightly above 0 — that way forces (charge/link/
  // collide/center) keep applying weakly and the kick has something to push
  // against, instead of decaying into a static frame.
  const desiredTarget = ambient > 0 ? 0.01 : 0;
  if (state.sim.alphaTarget() !== desiredTarget) state.sim.alphaTarget(desiredTarget);

  // When ambient is off and the sim has cooled, skip ticks (no static-frame burn).
  if (ambient <= 0 && state.sim.alpha() < (state.sim.alphaMin() ?? 0.001)) return;

  // Brownian kick: scaled so that 0.15 (the default) gives clearly visible
  // perpetual drift without the layout drifting apart. Velocity decay (0.4)
  // damps it back; link/charge pull it toward equilibrium.
  const kick = ambient * 3.5;
  const rng = state.sim.randomSource();

  for (let i = 0; i < n; i++) {
    if (kick > 0) {
      for (const node of state.liveNodes) {
        node.vx = (node.vx ?? 0) + (rng() - 0.5) * kick;
        node.vy = (node.vy ?? 0) + (rng() - 0.5) * kick;
      }
    }
    state.sim.tick();
  }
}
