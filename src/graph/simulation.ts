import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
  Simulation,
} from 'd3-force';
import { Graph, Node, Link, generateGraph, makeRng } from './generator';

export interface SimParams {
  /** Repulsion strength (negative = repel). Typical range: -120..-10. */
  forceStrength: number;
  /** Ideal link distance in world units. */
  linkDistance: number;
  /** Centering force pull toward origin. */
  centerStrength: number;
  /** Collision radius multiplier (multiplies particleSize). */
  collideMultiplier: number;
  /** Base particle size (scales every node's intrinsic size). */
  particleSize: number;
}

export interface GraphState {
  graph: Graph;
  sim: Simulation<Node, Link>;
  params: SimParams;
  particleCount: number;
  seed: number;
}

export function createGraphState(
  particleCount: number,
  params: SimParams,
  seed: number = 1
): GraphState {
  const graph = generateGraph(particleCount, seed);
  const sim = buildSimulation(graph, params, seed);
  return { graph, sim, params, particleCount, seed };
}

function buildSimulation(graph: Graph, params: SimParams, seed: number) {
  const rng = makeRng(seed + 999);
  const sim = forceSimulation<Node>(graph.nodes)
    .randomSource(rng)
    .force(
      'charge',
      forceManyBody<Node>()
        .strength(params.forceStrength)
        .distanceMax(600)
    )
    .force(
      'link',
      forceLink<Node, Link>(graph.links)
        .id((d: any) => d.id)
        .distance(params.linkDistance)
        .strength(0.6)
    )
    .force('center', forceCenter(0, 0).strength(params.centerStrength))
    .force(
      'collide',
      forceCollide<Node>(
        (n) => (n.size + 0.5) * params.collideMultiplier * params.particleSize
      ).iterations(1)
    )
    .alpha(1)
    .alphaDecay(0)
    .velocityDecay(0.42)
    .stop();
  return sim;
}

/**
 * Updates the simulation's force parameters in place. Cheap to call every frame.
 */
export function updateForces(state: GraphState, params: SimParams) {
  state.params = params;
  const sim = state.sim;
  (sim.force('charge') as any).strength(params.forceStrength);
  (sim.force('link') as any).distance(params.linkDistance);
  (sim.force('center') as any).strength(params.centerStrength);
  (sim.force('collide') as any).radius(
    (n: Node) => (n.size + 0.5) * params.collideMultiplier * params.particleSize
  );
}

/**
 * Rebuilds the graph for a new particle count. Reuses existing positions
 * for nodes that survive so the visual is continuous.
 */
export function resizeGraph(state: GraphState, newCount: number): GraphState {
  if (newCount === state.particleCount) return state;
  const fresh = generateGraph(newCount, state.seed);
  // Preserve positions/velocities for nodes whose id existed before.
  const oldById = new Map<number, Node>();
  for (const n of state.graph.nodes) oldById.set(n.id, n);
  for (const n of fresh.nodes) {
    const prev = oldById.get(n.id);
    if (prev && prev.x !== undefined) {
      n.x = prev.x;
      n.y = prev.y;
      n.vx = prev.vx;
      n.vy = prev.vy;
    }
  }
  const sim = buildSimulation(fresh, state.params, state.seed);
  // Lower alpha so the layout doesn't snap.
  sim.alpha(0.4);
  return {
    graph: fresh,
    sim,
    params: state.params,
    particleCount: newCount,
    seed: state.seed,
  };
}

export function tick(state: GraphState, n: number = 1) {
  for (let i = 0; i < n; i++) state.sim.tick();
}
