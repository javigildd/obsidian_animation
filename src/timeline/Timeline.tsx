import { useRef, useState, useCallback, MouseEvent, useEffect } from 'react';
import { useTimeline, ANIM_PROPS, AnimProp, PROP_META } from './store';

const TRACK_LABEL_WIDTH = 130;

export function Timeline() {
  const duration = useTimeline((s) => s.duration);
  const currentTime = useTimeline((s) => s.currentTime);
  const playing = useTimeline((s) => s.playing);
  const fps = useTimeline((s) => s.fps);
  const loop = useTimeline((s) => s.loop);
  const setTime = useTimeline((s) => s.setTime);
  const setPlaying = useTimeline((s) => s.setPlaying);
  const setDuration = useTimeline((s) => s.setDuration);
  const setFps = useTimeline((s) => s.setFps);
  const setLoop = useTimeline((s) => s.setLoop);

  const laneRef = useRef<HTMLDivElement | null>(null);
  const [scrubbing, setScrubbing] = useState(false);

  const handleScrub = useCallback(
    (e: MouseEvent | globalThis.MouseEvent) => {
      const el = laneRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const laneStart = rect.left + TRACK_LABEL_WIDTH;
      const laneWidth = rect.width - TRACK_LABEL_WIDTH;
      const x = (e as MouseEvent).clientX - laneStart;
      const t = Math.max(0, Math.min(duration, (x / laneWidth) * duration));
      setTime(t);
    },
    [duration, setTime]
  );

  useEffect(() => {
    if (!scrubbing) return;
    const move = (e: globalThis.MouseEvent) => handleScrub(e as any);
    const up = () => setScrubbing(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [scrubbing, handleScrub]);

  const tickPositions = computeTicks(duration);

  return (
    <div className="timeline-root">
      <div className="timeline-toolbar">
        <button onClick={() => setPlaying(!playing)} className={playing ? '' : 'primary'}>
          {playing ? '⏸  Pause' : '▶  Play'}
        </button>
        <button onClick={() => setTime(0)}>⏮</button>
        <button onClick={() => setTime(duration)}>⏭</button>
        <span className="time">
          {currentTime.toFixed(2)}s / {duration.toFixed(2)}s
        </span>
        <div style={{ marginLeft: 16, display: 'flex', gap: 6, alignItems: 'center' }}>
          <span className="muted">Duration</span>
          <input
            type="number"
            min={0.5}
            max={120}
            step={0.5}
            value={duration}
            onChange={(e) => setDuration(parseFloat(e.target.value || '1'))}
            style={{ width: 60 }}
          />
          <span className="muted">s</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span className="muted">FPS</span>
          <input
            type="number"
            min={1}
            max={120}
            step={1}
            value={fps}
            onChange={(e) => setFps(parseInt(e.target.value || '30'))}
            style={{ width: 50 }}
          />
        </div>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
          <span className="muted">Loop</span>
        </label>
      </div>

      <div
        className="timeline-body"
        ref={laneRef}
        onMouseDown={(e) => {
          setScrubbing(true);
          handleScrub(e);
        }}
      >
        <div className="timeline-ruler" style={{ display: 'grid', gridTemplateColumns: `${TRACK_LABEL_WIDTH}px 1fr` }}>
          <div style={{ borderRight: '1px solid var(--border)' }} />
          <div style={{ position: 'relative' }}>
            {tickPositions.map((tp) => (
              <div
                key={tp.t}
                className="ruler-tick"
                style={{ left: `${(tp.t / duration) * 100}%` }}
              >
                {tp.label}
              </div>
            ))}
          </div>
        </div>

        {ANIM_PROPS.map((prop) => (
          <PropTrack key={prop} prop={prop} />
        ))}

        {/* Playhead overlay anchored at the lane region. */}
        <div
          className="playhead"
          style={{
            left: `calc(${TRACK_LABEL_WIDTH}px + ${(currentTime / duration) * 100}% - ${TRACK_LABEL_WIDTH * (currentTime / duration)}px)`,
          }}
        />
      </div>
    </div>
  );
}

function PropTrack({ prop }: { prop: AnimProp }) {
  const duration = useTimeline((s) => s.duration);
  const kfs = useTimeline((s) => s.tracks[prop]);
  const removeKey = useTimeline((s) => s.removeKey);
  const setTime = useTimeline((s) => s.setTime);
  const upsertKey = useTimeline((s) => s.upsertKey);
  const setKeyEasing = useTimeline((s) => s.setKeyEasing);
  const valueAt = useTimeline((s) => s.valueAt);

  return (
    <div className="timeline-track">
      <div className="track-label">{PROP_META[prop].label}</div>
      <div className="track-lane" onDoubleClick={(e) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const u = (e.clientX - rect.left) / rect.width;
        const t = u * duration;
        upsertKey(prop, t, valueAt(prop, t));
        setTime(t);
      }}>
        {kfs.map((k) => (
          <div
            key={k.t}
            className="kf"
            title={`t=${k.t.toFixed(2)}s, v=${k.v.toFixed(2)}, ease=${k.ease} (Alt+click: cycle easing, Shift+click: delete)`}
            style={{ left: `${(k.t / duration) * 100}%` }}
            onMouseDown={(e) => {
              e.stopPropagation();
              if (e.shiftKey) {
                removeKey(prop, k.t);
                return;
              }
              if (e.altKey) {
                const order: any[] = ['linear', 'easeIn', 'easeOut', 'easeInOut'];
                const next = order[(order.indexOf(k.ease) + 1) % order.length];
                setKeyEasing(prop, k.t, next);
                return;
              }
              setTime(k.t);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function computeTicks(duration: number): { t: number; label: string }[] {
  // Pick a nice step.
  const candidates = [0.1, 0.25, 0.5, 1, 2, 5, 10, 30];
  let step = 1;
  for (const c of candidates) {
    if (duration / c <= 12) {
      step = c;
      break;
    }
  }
  const out: { t: number; label: string }[] = [];
  for (let t = 0; t <= duration + 1e-9; t += step) {
    out.push({ t, label: t.toFixed(t < 1 ? 1 : 0) + 's' });
  }
  return out;
}
