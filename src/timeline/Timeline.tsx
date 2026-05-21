import { useRef, useState, useCallback, MouseEvent, useEffect } from 'react';
import { useTimeline, ANIM_PROPS, AnimProp, PROP_META } from './store';
import { Easing } from './interpolate';

const EPS = 1e-3;
const TRACK_LABEL_WIDTH = 130;
const EASINGS: Easing[] = ['linear', 'easeIn', 'easeOut', 'easeInOut'];

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
  const removeSelected = useTimeline((s) => s.removeSelected);
  const clearAllKeyframes = useTimeline((s) => s.clearAllKeyframes);
  const selected = useTimeline((s) => s.selected);
  const setKeyEasing = useTimeline((s) => s.setKeyEasing);

  // Selected keyframe's current easing (for the toolbar picker).
  const selectedEase = useTimeline((s) => {
    if (!s.selected) return null;
    const k = (s.tracks[s.selected.prop] ?? []).find(
      (kf) => Math.abs(kf.t - s.selected!.t) < EPS
    );
    return k?.ease ?? null;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selected) {
          e.preventDefault();
          removeSelected();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, removeSelected]);

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
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
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

        {selected && selectedEase && (
          <div className="easing-picker" title="Easing for the selected keyframe">
            <span className="muted">Easing</span>
            {EASINGS.map((e) => (
              <button
                key={e}
                className={`ease-btn${selectedEase === e ? ' active' : ''}`}
                onClick={() => setKeyEasing(selected.prop, selected.t, e)}
                title={e}
              >
                {easingGlyph(e)}
                <span className="ease-label">{e}</span>
              </button>
            ))}
          </div>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {selected && (
            <button onClick={() => removeSelected()} className="danger" title="Delete selected keyframe (Del)">
              Delete keyframe
            </button>
          )}
          <button
            onClick={() => {
              if (confirm('Remove all keyframes from every track?')) clearAllKeyframes();
            }}
            title="Clear all keyframes on every track"
          >
            Clear all
          </button>
        </div>
      </div>

      <div
        className="timeline-body"
        ref={laneRef}
        onMouseDown={(e) => {
          // Ignore mousedown that started on a keyframe (it stops propagation).
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

        {/* Spacer so the last track's keyframes don't sit on the bottom edge. */}
        <div className="timeline-spacer" />

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
  const moveKey = useTimeline((s) => s.moveKey);
  const valueAt = useTimeline((s) => s.valueAt);
  const selected = useTimeline((s) => s.selected);
  const selectKey = useTimeline((s) => s.selectKey);
  const clearTrack = useTimeline((s) => s.clearTrack);

  const laneRef = useRef<HTMLDivElement | null>(null);

  return (
    <div className="timeline-track">
      <div className="track-label">
        <span style={{ flex: 1 }}>{PROP_META[prop].label}</span>
        {kfs.length > 0 && (
          <button
            className="track-clear"
            title={`Clear all keyframes on "${PROP_META[prop].label}"`}
            onClick={(e) => {
              e.stopPropagation();
              clearTrack(prop);
            }}
          >
            ×
          </button>
        )}
      </div>
      <div
        className="track-lane"
        ref={laneRef}
        onDoubleClick={(e) => {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const u = (e.clientX - rect.left) / rect.width;
          const t = u * duration;
          upsertKey(prop, t, valueAt(prop, t));
          setTime(t);
        }}
      >
        {kfs.map((k) => {
          const isSelected =
            selected && selected.prop === prop && Math.abs(selected.t - k.t) < EPS;
          return (
            <div
              key={k.t}
              className={`kf${isSelected ? ' selected' : ''}`}
              title={`t=${k.t.toFixed(2)}s, v=${k.v.toFixed(2)}, ease=${k.ease}  ·  Drag to move  ·  Right-click or Delete to remove  ·  Alt-click to cycle easing`}
              style={{ left: `${(k.t / duration) * 100}%` }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                removeKey(prop, k.t);
              }}
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
                // Select immediately and start a drag-or-click sequence.
                selectKey({ prop, t: k.t });
                setTime(k.t);

                const lane = laneRef.current;
                if (!lane) return;
                const rect = lane.getBoundingClientRect();
                const startX = e.clientX;
                let currentT = k.t;
                let moved = false;

                const onMove = (ev: globalThis.MouseEvent) => {
                  if (!moved && Math.abs(ev.clientX - startX) < 3) return;
                  moved = true;
                  const u = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
                  const newT = u * duration;
                  currentT = moveKey(prop, currentT, newT);
                  setTime(currentT);
                };
                const onUp = () => {
                  window.removeEventListener('mousemove', onMove);
                  window.removeEventListener('mouseup', onUp);
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function easingGlyph(e: Easing): string {
  switch (e) {
    case 'linear':
      return '╱';
    case 'easeIn':
      return '⌐';
    case 'easeOut':
      return '⌙';
    case 'easeInOut':
      return '∿';
  }
}

function computeTicks(duration: number): { t: number; label: string }[] {
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
