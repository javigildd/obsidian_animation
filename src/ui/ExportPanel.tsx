import { useState } from 'react';
import { useTimeline } from '../timeline/store';
import { downloadBlob, ExportProgress, exportMp4 } from '../export/recorder';

type Preset = '1080p30' | '1080sq30' | '720p30' | '4k30';
const PRESETS: Record<Preset, { width: number; height: number; fps: number; label: string }> = {
  '1080p30': { width: 1920, height: 1080, fps: 30, label: '1920×1080 · 30fps' },
  '1080sq30': { width: 1080, height: 1080, fps: 30, label: '1080×1080 · 30fps' },
  '720p30': { width: 1280, height: 720, fps: 30, label: '1280×720 · 30fps' },
  '4k30': { width: 3840, height: 2160, fps: 30, label: '3840×2160 · 30fps (slow)' },
};

export function ExportPanel() {
  const [preset, setPreset] = useState<Preset>('1080p30');
  const [crf, setCrf] = useState(20);
  const [seed, setSeed] = useState(1);
  const [warmup, setWarmup] = useState(60);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [exporting, setExporting] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const duration = useTimeline((s) => s.duration);

  const onExport = async () => {
    setExporting(true);
    setProgress({ phase: 'init', message: 'Starting…', progress: 0 });
    setLogs([]);
    try {
      const cfg = PRESETS[preset];
      const blob = await exportMp4(
        {
          width: cfg.width,
          height: cfg.height,
          fps: cfg.fps,
          duration,
          crf,
          warmup,
          seed,
        },
        (p) => setProgress(p)
      );
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      downloadBlob(blob, `obsidian-graph-${cfg.width}x${cfg.height}-${stamp}.mp4`);
    } catch (err: any) {
      console.error(err);
      setProgress({
        phase: 'error',
        message: err?.message ?? String(err),
        progress: 0,
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="panel panel-right">
      <div className="section">
        <h3 className="section-title">Export MP4</h3>

        <div className="row">
          <label>Preset</label>
          <select value={preset} onChange={(e) => setPreset(e.target.value as Preset)} style={{ width: 'auto' }}>
            {Object.entries(PRESETS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>

        <div className="row">
          <label>Quality (CRF)</label>
          <input
            type="number"
            min={12}
            max={32}
            step={1}
            value={crf}
            onChange={(e) => setCrf(parseInt(e.target.value || '20'))}
            style={{ width: 60 }}
          />
        </div>
        <p className="muted" style={{ marginTop: -4 }}>
          Lower = higher quality, larger file. 18–23 is a good range.
        </p>

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
          {exporting ? 'Rendering…' : `Export ${duration.toFixed(1)}s MP4`}
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
          Expect ~30–60s of encoding per second of 1080p video on a modern Mac.
        </p>
        <p className="muted">
          For deterministic exports, set a fixed seed and warmup. Changing them produces a different
          layout but otherwise the same animation.
        </p>
      </div>
    </div>
  );
}
