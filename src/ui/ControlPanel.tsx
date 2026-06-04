import { useTimeline, ANIM_PROPS, AnimProp, PROP_META, ColorSettings } from '../timeline/store';

type ColorKey = {
  [K in keyof ColorSettings]: ColorSettings[K] extends string ? K : never;
}[keyof ColorSettings];

const COLOR_FIELDS: { key: ColorKey; label: string }[] = [
  { key: 'nodeBig', label: 'Big nodes' },
  { key: 'nodeSmall', label: 'Small nodes' },
  { key: 'link', label: 'Links' },
  { key: 'background', label: 'Background' },
];

export function ControlPanel() {
  return (
    <div className="panel panel-left">
      <div className="section">
        <h3 className="section-title">Colors</h3>
        {COLOR_FIELDS.map((f) => (
          <ColorRow key={f.key} field={f.key} label={f.label} />
        ))}
        <BigThresholdSlider />
        <p className="muted" style={{ marginBottom: 0 }}>
          A node is "big" when at least this many nodes attached to it directly
          (direct children). Everything else uses the "Small nodes" color.
        </p>
      </div>

      <div className="section">
        <h3 className="section-title">Parameters</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Move a slider to set the value at the current time. Click the diamond to add a keyframe;
          click again to remove it. Defaults are used when a track has no keyframes.
        </p>
        {ANIM_PROPS.map((prop) => (
          <PropSlider key={prop} prop={prop} />
        ))}
      </div>

      <div className="section">
        <h3 className="section-title">Tips</h3>
        <ul style={{ margin: 0, paddingLeft: 16, color: 'var(--text-dim)', fontSize: 11, lineHeight: 1.5 }}>
          <li>Double-click an empty spot in a timeline lane to drop a keyframe.</li>
          <li>Click a keyframe to select it; press <b>Delete</b> or <b>Backspace</b> to remove it.</li>
          <li>Right-click a keyframe to delete it directly.</li>
          <li>× next to a track label clears all keyframes on that track.</li>
          <li>Alt-click a keyframe to cycle easing (linear → easeIn → easeOut → easeInOut).</li>
          <li>Scrub the timeline by dragging anywhere on the body.</li>
        </ul>
      </div>
    </div>
  );
}

function ColorRow({ field, label }: { field: ColorKey; label: string }) {
  const value = useTimeline((s) => s.colors[field]);
  const setColor = useTimeline((s) => s.setColor);
  return (
    <div className="row color-row">
      <label>{label}</label>
      <span className="value">{value}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => setColor(field, e.target.value)}
        title={`${label} color`}
      />
    </div>
  );
}

function BigThresholdSlider() {
  const value = useTimeline((s) => s.colors.bigThreshold);
  const setColor = useTimeline((s) => s.setColor);
  return (
    <div className="slider-row" style={{ marginTop: 10 }}>
      <div className="header">
        <div className="label-group">
          <span>Min direct children (big)</span>
        </div>
        <span className="value">{Math.round(value)}</span>
      </div>
      <input
        type="range"
        min={1}
        max={30}
        step={1}
        value={value}
        onChange={(e) => setColor('bigThreshold', parseInt(e.target.value))}
      />
    </div>
  );
}

function PropSlider({ prop }: { prop: AnimProp }) {
  const meta = PROP_META[prop];
  const currentTime = useTimeline((s) => s.currentTime);
  const value = useTimeline((s) => s.valueAt(prop, s.currentTime));
  const hasKey = useTimeline((s) => s.hasKeyAt(prop, s.currentTime));
  const kfsCount = useTimeline((s) => s.tracks[prop]?.length ?? 0);
  const upsertKey = useTimeline((s) => s.upsertKey);
  const removeKey = useTimeline((s) => s.removeKey);
  const setDefault = useTimeline((s) => s.setDefault);

  const handleChange = (v: number) => {
    // If there is at least one keyframe, edits create/update a keyframe at current time.
    // Otherwise, edits update the default.
    if (kfsCount > 0) {
      upsertKey(prop, currentTime, v);
    } else {
      setDefault(prop, v);
    }
  };

  const toggleKey = () => {
    if (hasKey) removeKey(prop, currentTime);
    else upsertKey(prop, currentTime, value);
  };

  const formatted = meta.format ? meta.format(value) : value.toFixed(2);

  return (
    <div className="slider-row">
      <div className="header">
        <div className="label-group">
          <span
            className={`kf-dot${hasKey ? ' active' : ''}`}
            title={hasKey ? 'Remove keyframe at current time' : 'Add keyframe at current time'}
            onClick={toggleKey}
          />
          <span>{meta.label}</span>
        </div>
        <span className="value">{formatted}</span>
      </div>
      <input
        type="range"
        min={meta.min}
        max={meta.max}
        step={meta.step}
        value={value}
        onChange={(e) => handleChange(parseFloat(e.target.value))}
      />
    </div>
  );
}
