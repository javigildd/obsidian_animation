import { useEffect, useRef } from 'react';
import { createGraphState, resizeGraph, tick, updateForces } from '../graph/simulation';
import { fitCanvas, render } from '../graph/renderer';
import { useTimeline, AnimProp } from '../timeline/store';

export function Viewport() {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    // Initial state.
    const initialSnap = useTimeline.getState().snapshotAt(0);
    let state = createGraphState(
      Math.round(initialSnap.particleCount),
      {
        forceStrength: initialSnap.forceStrength,
        linkDistance: initialSnap.linkDistance,
        centerStrength: 0.05,
        collideMultiplier: 1.3,
        particleSize: initialSnap.particleSize,
      },
      1
    );

    // Warm up the simulation so the first frame isn't a random mess.
    for (let i = 0; i < 60; i++) state.sim.tick();

    let width = wrapper.clientWidth;
    let height = wrapper.clientHeight;
    fitCanvas(canvas, width, height, dpr);

    const ro = new ResizeObserver(() => {
      width = wrapper.clientWidth;
      height = wrapper.clientHeight;
      fitCanvas(canvas, width, height, dpr);
    });
    ro.observe(wrapper);

    let lastTs = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const dt = (now - lastTs) / 1000;
      lastTs = now;

      const tl = useTimeline.getState();
      if (tl.playing) {
        let next = tl.currentTime + dt;
        if (next >= tl.duration) {
          if (tl.loop) next = next % tl.duration;
          else {
            next = tl.duration;
            useTimeline.setState({ playing: false });
          }
        }
        useTimeline.setState({ currentTime: next });
      }

      const snap = tl.snapshotAt(useTimeline.getState().currentTime);

      // Particle count change → rebuild simulation.
      const desiredCount = Math.max(1, Math.round(snap.particleCount));
      if (desiredCount !== state.particleCount) {
        state = resizeGraph(state, desiredCount);
      }

      updateForces(state, {
        forceStrength: snap.forceStrength,
        linkDistance: snap.linkDistance,
        centerStrength: 0.05,
        collideMultiplier: 1.3,
        particleSize: snap.particleSize,
      });

      tick(state, 1);

      render(ctx, state.graph, {
        zoom: snap.zoom,
        panX: snap.panX,
        panY: snap.panY,
        particleSize: snap.particleSize,
        nodeOpacity: snap.nodeOpacity,
        linkOpacity: snap.linkOpacity,
        dpr,
        width,
        height,
        glow: true,
      });

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // Expose state for export pipeline.
    (window as any).__obsidianAnim = {
      getState: () => state,
      setState: (s: typeof state) => {
        state = s;
      },
      render,
      resizeGraph,
      updateForces,
      tick,
      createGraphState,
    };

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      delete (window as any).__obsidianAnim;
    };
  }, []);

  return (
    <div className="viewport" ref={wrapperRef}>
      <canvas ref={canvasRef} />
      <ViewportOverlay />
    </div>
  );
}

function ViewportOverlay() {
  const t = useTimeline((s) => s.currentTime);
  const d = useTimeline((s) => s.duration);
  const snap = useTimeline((s) => s.snapshotAt(s.currentTime));
  return (
    <div className="viewport-overlay">
      t={t.toFixed(2)}s / {d.toFixed(2)}s
      {' · '}zoom={snap.zoom.toFixed(2)}× · count={Math.round(snap.particleCount)} · size={snap.particleSize.toFixed(2)}
    </div>
  );
}

// Helper kept here so other modules can import the same prop list.
export const VIEWPORT_PROPS_ORDER: AnimProp[] = [
  'zoom',
  'panX',
  'panY',
  'particleSize',
  'particleCount',
  'nodeOpacity',
  'linkOpacity',
  'forceStrength',
  'linkDistance',
];
