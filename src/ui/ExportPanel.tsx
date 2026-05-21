import { useState } from 'react';
import { useTimeline } from '../timeline/store';
import {
  downloadBlob,
  ExportProgress,
  exportMp4,
  Codec,
  codecFileExtension,
} from '../export/recorder';

type Preset = '1080p30' | '1080sq30' | '720p30' | '4k30';
const PRESETS: Record<Preset, { width: number; height: number; fps: number; label: string }> = {
  '1080p30': { width: 1920, height: 1080, fps: 30, label: '1920×1080 · 30fps' },
  '1080sq30': { width: 1080, height: 1080, fps: 30, label: '1080×1080 · 30fps' },
  '720p30': { width: 1280, height: 720, fps: 30, label: '1280×720 · 30fps' },
  '4k30': { width: 3840, height: 2160, fps: 30, label: '3840×2160 · 30fps (slow)' },
};

const CODECS: { value: Codec; label: string; note: string }[] = [
  { value: 'h264', label: 'H.264 (MP4)', note: 'Smaller files, broad compatibility. Lossy.' },
  { value: 'prores_lt', label: 'ProRes 422 LT (MOV)', note: '~102 Mbps @ 1080p. Lighter than 422.' },
  { value: 'prores_422', label: 'ProRes 422 (MOV)', note: '~147 Mbps @ 1080p. Standard broadcast.' },
  { value: 'prores_hq', label: 'ProRes 422 HQ (MOV)', note: '~220 Mbps @ 1080p. Editing-grade.' },
  { value: 'prores_4444', label: 'ProRes 4444 + alpha (MOV)', note: '~330 Mbps @ 1080p. Transparent background.' },
];

export function ExportPanel() {
  const [preset, setPreset] = useState<Preset>('1080p30');
  const [codec, setCodec] = useState<Codec>('h264');
  const [crf, setCrf] = useState(20);
  const [seed, setSeed] = useState(1);
  const [warmup, setWarmup] = useState(60);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [exporting, setExporting] = useState(false);
  const duration = useTimeline((s) => s.duration);

  const codecInfo = CODECS.find((c) => c.value === codec)!;
  const isProRes = codec !== 'h264';

  const onExport = async () => {
    setExporting(true);
    setProgress({ phase: 'init', message: 'Starting…', progress: 0 });
    try {
      const cfg = PRESETS[preset];
      const blob = await exportMp4(
        {
          width: cfg.width,
          height: cfg.height,
          fps: cfg.fps,
          duration,
          codec,
          crf,
          warmup,
          seed,
        },
        (p) => setProgress(p)
      );
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const ext = codecFileExtension(codec);
      downloadBlob(blob, `obsidian-graph-${cfg.width}x${cfg.height}-${codec}-${stamp}.${ext}`);
    } catch (err: any) {
      console.error(err);
      setProgress({ phase: 'error', message: err?.message ?? String(err), progress: 0 });
    } finally {
      setExporting(false);
    }
  };

  const expectedSizeNote = isProRes
    ? estimateProResSize(codec, PRESETS[preset], duration)
    : null;

  return (
    <>
      <div className="section">
        <h3 className="section-title">Export video</h3>

        <div className="row">
          <label>Codec</label>
          <select
            value={codec}
            onChange={(e) => setCodec(e.target.value as Codec)}
            style={{ width: 'auto', flex: 1 }}
          >
            {CODECS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <p className="muted" style={{ marginTop: -4 }}>
          {codecInfo.note}
          {expectedSizeNote && <> · {expectedSizeNote}</>}
        </p>

        <div className="row">
          <label>Resolution</label>
          <select value={preset} onChange={(e) => setPreset(e.target.value as Preset)} style={{ width: 'auto', flex: 1 }}>
            {Object.entries(PRESETS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>

        {!isProRes && (
          <>
            <div className="row">
              <label>Quality (CRF)</label>
              <input
                type="number"
                min={0}
                max={32}
                step={1}
                value={crf}
                onChange={(e) => setCrf(parseInt(e.target.value || '20'))}
                style={{ width: 60 }}
              />
            </div>
            <p className="muted" style={{ marginTop: -4 }}>
              Lower = higher quality, larger file. 18–23 typical. 0 = lossless.
            </p>
          </>
        )}

        <div className="row">
          <label>Seed</label>
          <input
            type="number"
            value={seed}
            onChange={(e) => setSeed(parseInt(e.target.value || '1'))}
            style={{ width: 60 }}
          />
        </div>
        <div className="row">
          <label>Warmup ticks</label>
          <input
            type="number"
            min={0}
            max={500}
            step={10}
            value={warmup}
            onChange={(e) => setWarmup(parseInt(e.target.value || '60'))}
            style={{ width: 60 }}
          />
        </div>
        <p className="muted" style={{ marginTop: -4 }}>
          Pre-runs the simulation before t=0 so the graph starts settled.
        </p>

        <button
          className="primary"
          onClick={onExport}
          disabled={exporting}
          style={{ width: '100%', marginTop: 8 }}
        >
          {exporting
            ? 'Rendering…'
            : `Export ${duration.toFixed(1)}s ${codecFileExtension(codec).toUpperCase()}`}
        </button>

        {progress && (
          <div style={{ marginTop: 10 }}>
            <div className="muted">{progress.message}</div>
            <div className="export-progress">
              <div style={{ width: `${Math.round(progress.progress * 100)}%` }} />
            </div>
            {progress.phase === 'error' && (
              <div style={{ color: 'var(--danger)', marginTop: 6, fontSize: 11 }}>
                {progress.message}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="section">
        <h3 className="section-title">Notes</h3>
        <p className="muted">
          Encoding happens entirely in your browser via ffmpeg.wasm — nothing leaves your machine.
        </p>
        <p className="muted">
          <b>ProRes</b> exports are near-lossless and ideal as a master file for editing. ProRes 4444
          preserves the alpha channel (transparent background) so you can comp the graph over any
          footage in your NLE.
        </p>
        <p className="muted">
          For deterministic exports, set a fixed seed and warmup. Changing them produces a different
          layout but otherwise the same animation.
        </p>
      </div>
    </>
  );
}

// Rough Mbps reference values for ProRes @ 1080p30. Other resolutions scale by
// pixel count; other framerates scale linearly. Result in MB.
function estimateProResSize(
  codec: Exclude<Codec, 'h264'>,
  preset: { width: number; height: number; fps: number },
  durationSec: number
): string {
  const mbps1080p30: Record<Exclude<Codec, 'h264'>, number> = {
    prores_lt: 102,
    prores_422: 147,
    prores_hq: 220,
    prores_4444: 330,
  };
  const pixelScale = (preset.width * preset.height) / (1920 * 1080);
  const fpsScale = preset.fps / 30;
  const mbps = mbps1080p30[codec] * pixelScale * fpsScale;
  const totalMB = (mbps * durationSec) / 8;
  if (totalMB >= 1024) return `≈ ${(totalMB / 1024).toFixed(1)} GB`;
  return `≈ ${Math.round(totalMB)} MB`;
}
