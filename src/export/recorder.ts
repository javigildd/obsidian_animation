import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { createGraphState, resizeGraph, tick, updateForces } from '../graph/simulation';
import { render, fitCanvas } from '../graph/renderer';
import { useTimeline } from '../timeline/store';

const FFMPEG_CORE_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';

export interface ExportSettings {
  width: number;
  height: number;
  fps: number;
  /** Duration in seconds (defaults to timeline duration). */
  duration?: number;
  /** libx264 CRF (lower = higher quality, 18..28 typical). */
  crf: number;
  /** Initial simulation warmup ticks before t=0. */
  warmup: number;
  /** Random seed for the graph. */
  seed: number;
}

export interface ExportProgress {
  phase: 'init' | 'rendering' | 'encoding' | 'done' | 'error';
  message: string;
  /** 0..1, when known. */
  progress: number;
  frame?: number;
  totalFrames?: number;
}

export type ProgressCb = (p: ExportProgress) => void;

let ffmpegInstance: FFmpeg | null = null;

async function getFfmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  const ff = new FFmpeg();
  if (onLog) ff.on('log', ({ message }) => onLog(message));
  await ff.load({
    coreURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
  });
  ffmpegInstance = ff;
  return ff;
}

/**
 * Render the animation deterministically (fresh seed, fixed timestep) and
 * encode the frames to MP4 with libx264. Returns a Blob (video/mp4).
 */
export async function exportMp4(
  settings: ExportSettings,
  onProgress: ProgressCb
): Promise<Blob> {
  onProgress({ phase: 'init', message: 'Loading ffmpeg.wasm…', progress: 0 });
  const ff = await getFfmpeg();

  const { width, height, fps, crf, warmup, seed } = settings;
  const tl = useTimeline.getState();
  const duration = settings.duration ?? tl.duration;
  const totalFrames = Math.max(1, Math.round(duration * fps));

  // Offscreen canvas at export resolution.
  const canvas = document.createElement('canvas');
  fitCanvas(canvas, width, height, 1); // dpr=1: exact pixel count
  const ctx = canvas.getContext('2d', { willReadFrequently: false })!;

  // Fresh simulation matching t=0 snapshot.
  const initial = tl.snapshotAt(0);
  let state = createGraphState(
    Math.max(1, Math.round(initial.particleCount)),
    {
      forceStrength: initial.forceStrength,
      linkDistance: initial.linkDistance,
      centerStrength: 0.05,
      collideMultiplier: 1.3,
      particleSize: initial.particleSize,
    },
    seed
  );
  for (let i = 0; i < warmup; i++) state.sim.tick();

  // Render + write each frame as a PNG into ffmpeg's virtual FS.
  const frameNames: string[] = [];
  for (let i = 0; i < totalFrames; i++) {
    const t = i / fps;
    const snap = tl.snapshotAt(t);

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
    // A couple of substeps gives stabler motion at low fps.
    tick(state, 2);

    render(ctx, state.graph, {
      zoom: snap.zoom,
      panX: snap.panX,
      panY: snap.panY,
      particleSize: snap.particleSize,
      nodeOpacity: snap.nodeOpacity,
      linkOpacity: snap.linkOpacity,
      dpr: 1,
      width,
      height,
      glow: true,
    });

    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
        'image/png'
      )
    );
    const buf = new Uint8Array(await blob.arrayBuffer());
    const name = `f_${i.toString().padStart(6, '0')}.png`;
    await ff.writeFile(name, buf);
    frameNames.push(name);

    onProgress({
      phase: 'rendering',
      message: `Rendering frame ${i + 1} / ${totalFrames}`,
      progress: (i + 1) / totalFrames * 0.7,
      frame: i + 1,
      totalFrames,
    });

    // Let the UI breathe.
    if (i % 8 === 0) await sleep(0);
  }

  onProgress({
    phase: 'encoding',
    message: 'Encoding MP4 with libx264…',
    progress: 0.7,
    totalFrames,
  });

  // ffmpeg progress events fire during exec.
  const offProgress = ff.on('progress', ({ progress }) => {
    onProgress({
      phase: 'encoding',
      message: 'Encoding MP4 with libx264…',
      progress: 0.7 + Math.min(1, Math.max(0, progress)) * 0.28,
    });
  });

  await ff.exec([
    '-framerate', String(fps),
    '-i', 'f_%06d.png',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', String(crf),
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    'out.mp4',
  ]);

  // ffmpeg.wasm v0.12 returns the unsubscribe handler from `on()`; if not, fall back gracefully.
  if (typeof offProgress === 'function') (offProgress as any)();

  const data = (await ff.readFile('out.mp4')) as Uint8Array;

  // Cleanup virtual FS so subsequent exports don't accumulate.
  for (const n of frameNames) {
    try { await ff.deleteFile(n); } catch { /* ignore */ }
  }
  try { await ff.deleteFile('out.mp4'); } catch { /* ignore */ }

  // Use ArrayBuffer slice for tightest fit; cast keeps TS happy for BlobPart.
  const part = data.slice().buffer as ArrayBuffer;
  const blob = new Blob([part], { type: 'video/mp4' });
  onProgress({ phase: 'done', message: 'Done.', progress: 1 });
  return blob;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
