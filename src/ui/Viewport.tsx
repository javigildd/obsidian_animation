import { useEffect, useRef } from 'react';
import { createGraphState, setLiveCount, tick, updateForces } from '../graph/simulation';
import { fitCanvas, render } from '../graph/renderer';
import { useTimeline } from '../timeline/store';

/** Max pre-generated nodes. The simulation only operates on the *live* subset,
 *  so this is a cap on the universe, not on per-frame cost. Generation is
 *  O(N) and a 50k-node graph builds in ~50 ms with negligible memory. */
const MAX_NODES = 50000;
/** Random seed for the BA generator (could be exposed in UI later). */
const SEED = 1;

export function Viewport() {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    const initialSnap = useTimeline.getState().snapshotAt(0);
    let state = createGraphState(
      MAX_NODES,
      {
        forceStrength: initialSnap.forceStrength,
        linkDistance: initialSnap.linkDistance,
        centerStrength: 0.06,
        collideMultiplier: 1.2,
        particleSize: initialSnap.particleSize,
        sizeVariance: initialSnap.sizeVariance,
        ambientMotion: initialSnap.ambientMotion,
      },
      SEED
    );

    // Reveal the initial count (zero by default) and let the sim settle.
    setLiveCount(state, Math.max(0, Math.round(initialSnap.particleCount)), 0);

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
          if (tl.loop) {
            next = 0;
            // On loop wrap: reset the live subset so the reveal replays.
            setLiveCount(state, 0, 0);
          } else {
            next = tl.duration;
            useTimeline.setState({ playing: false });
          }
        }
        useTimeline.setState({ currentTime: next });
      }

      const nowT = useTimeline.getState().currentTime;
      const snap = tl.snapshotAt(nowT);

      const desired = Math.max(0, Math.round(snap.particleCount));
      if (desired !== state.liveCount) {
        setLiveCount(state, desired, nowT);
      }

      updateForces(state, {
        forceStrength: snap.forceStrength,
        linkDistance: snap.linkDistance,
        centerStrength: 0.06,
        collideMultiplier: 1.2,
        particleSize: snap.particleSize,
        sizeVariance: snap.sizeVariance,
        ambientMotion: snap.ambientMotion,
      });

      tick(state, 1);

      render(
        ctx,
        { nodes: state.liveNodes, links: state.liveLinks },
        {
          zoom: snap.zoom,
          rotation: (snap.rotation * Math.PI) / 180,
          panX: snap.panX,
          panY: snap.panY,
          particleSize: snap.particleSize,
          sizeVariance: snap.sizeVariance,
          nodeOpacity: snap.nodeOpacity,
          linkOpacity: snap.linkOpacity,
          glow: snap.glow,
          dpr,
          width,
          height,
          currentTime: nowT,
          birthDuration: 0.5,
          turnOff: snap.turnOff,
          collapse: snap.collapse,
          collapseRandom: snap.collapseRandom,
          nodeColorSmall: useTimeline.getState().colors.nodeSmall,
          nodeColorBig: useTimeline.getState().colors.nodeBig,
          linkColor: useTimeline.getState().colors.link,
          background: useTimeline.getState().colors.background,
        }
      );

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
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
      {' · '}live={Math.round(snap.particleCount)} · zoom={snap.zoom.toFixed(2)}× · size={snap.particleSize.toFixed(2)}
    </div>
  );
}

