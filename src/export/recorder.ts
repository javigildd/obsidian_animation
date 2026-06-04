import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { createGraphState, setLiveCount, tick, updateForces } from '../graph/simulation';
import { render, fitCanvas } from '../graph/renderer';
import { useTimeline } from '../timeline/store';

// Served locally from `public/ffmpeg/` so we don't depend on any CDN.
const FFMPEG_CORE_BASE = '/ffmpeg';
const MAX_NODES = 50000;

export type Codec =
  | 'h264'         // libx264, .mp4, controlled by CRF
  | 'prores_lt'    // ProRes 422 LT
  | 'prores_422'   // ProRes 422 (standard)
  | 'prores_hq'    // ProRes 422 HQ (recommended for editing)
  | 'prores_4444'; // ProRes 4444 (with alpha channel)

export interface ExportSettings {
  width: number;
  height: number;
  fps: number;
  /** Duration in seconds (defaults to timeline duration). */
  duration?: number;
  /** Encoder + container. */
  codec: Codec;
  /** libx264 CRF (lower = higher quality, 18..28 typical). Ignored for ProRes. */
  crf: number;
  /** Initial simulation warmup ticks before t=0. */
  warmup: number;
  /** Random seed for the graph. */
  seed: number;
}

const PRORES_PROFILE: Record<Exclude<Codec, 'h264'>, string> = {
  prores_lt: '1',    // ProRes 422 LT
  prores_422: '2',   // ProRes 422
  prores_hq: '3',    // ProRes 422 HQ
  prores_4444: '4',  // ProRes 4444 (alpha)
};

export function codecHasAlpha(c: Codec): boolean {
  return c === 'prores_4444';
}

export function codecFileExtension(c: Codec): string {
  return c === 'h264' ? 'mp4' : 'mov';
}

export function codecMime(c: Codec): string {
  return c === 'h264' ? 'video/mp4' : 'video/quicktime';
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

export async function exportMp4(
  settings: ExportSettings,
  onProgress: ProgressCb
): Promise<Blob> {
  onProgress({ phase: 'init', message: 'Loading ffmpeg.wasm…', progress: 0 });
  const ff = await getFfmpeg();

  const { width, height, fps, crf, warmup, seed, codec } = settings;
  const wantsAlpha = codecHasAlpha(codec);
  const tl = useTimeline.getState();
  const duration = settings.duration ?? tl.duration;
  const totalFrames = Math.max(1, Math.round(duration * fps));

  const canvas = document.createElement('canvas');
  fitCanvas(canvas, width, height, 1);
  const ctx = canvas.getContext('2d', { willReadFrequently: false })!;

  const initial = tl.snapshotAt(0);
  const state = createGraphState(
    MAX_NODES,
    {
      forceStrength: initial.forceStrength,
      linkDistance: initial.linkDistance,
      centerStrength: 0.06,
      collideMultiplier: 1.2,
      particleSize: initial.particleSize,
      sizeVariance: initial.sizeVariance,
      ambientMotion: initial.ambientMotion,
    },
    seed
  );
  setLiveCount(state, Math.max(0, Math.round(initial.particleCount)), 0);
  for (let i = 0; i < warmup; i++) state.sim.tick();

  const frameNames: string[] = [];
  for (let i = 0; i < totalFrames; i++) {
    const t = i / fps;
    const snap = tl.snapshotAt(t);

    const desired = Math.max(0, Math.round(snap.particleCount));
    if (desired !== state.liveCount) setLiveCount(state, desired, t);

    updateForces(state, {
      forceStrength: snap.forceStrength,
      linkDistance: snap.linkDistance,
      centerStrength: 0.06,
      collideMultiplier: 1.2,
      particleSize: snap.particleSize,
      sizeVariance: snap.sizeVariance,
      ambientMotion: snap.ambientMotion,
    });
    tick(state, 2);

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
        dpr: 1,
        width,
        height,
        currentTime: t,
        birthDuration: 0.5,
        turnOff: snap.turnOff,
        collapse: snap.collapse,
        collapseRandom: snap.collapseRandom,
        nodeColorSmall: tl.colors.nodeSmall,
        nodeColorBig: tl.colors.nodeBig,
        bigThreshold: tl.colors.bigThreshold,
        linkColor: tl.colors.link,
        background: wantsAlpha ? null : tl.colors.background,
      }
    );

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
      progress: ((i + 1) / totalFrames) * 0.7,
      frame: i + 1,
      totalFrames,
    });

    if (i % 8 === 0) await sleep(0);
  }

  const ext = codecFileExtension(codec);
  const outFile = `out.${ext}`;
  const encMsg =
    codec === 'h264'
      ? 'Encoding MP4 with libx264…'
      : `Encoding ${ext.toUpperCase()} with ProRes (${codec.replace('prores_', '').toUpperCase()})…`;

  onProgress({ phase: 'encoding', message: encMsg, progress: 0.7, totalFrames });

  const offProgress = ff.on('progress', ({ progress }) => {
    onProgress({
      phase: 'encoding',
      message: encMsg,
      progress: 0.7 + Math.min(1, Math.max(0, progress)) * 0.28,
    });
  });

  // Build the encode command per codec.
  let args: string[];
  if (codec === 'h264') {
    args = [
      '-framerate', String(fps),
      '-i', 'f_%06d.png',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', String(crf),
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      outFile,
    ];
  } else {
    // ProRes via prores_ks. 4444 uses 10-bit YUVA so alpha is preserved.
    const profile = PRORES_PROFILE[codec];
    const pixFmt = codec === 'prores_4444' ? 'yuva444p10le' : 'yuv422p10le';
    args = [
      '-framerate', String(fps),
      '-i', 'f_%06d.png',
      '-c:v', 'prores_ks',
      '-profile:v', profile,
      '-pix_fmt', pixFmt,
      '-vendor', 'apl0',
      '-qscale:v', '9',
      outFile,
    ];
  }

  await ff.exec(args);

  if (typeof offProgress === 'function') (offProgress as any)();

  const data = (await ff.readFile(outFile)) as Uint8Array;

  for (const n of frameNames) {
    try { await ff.deleteFile(n); } catch { /* ignore */ }
  }
  try { await ff.deleteFile(outFile); } catch { /* ignore */ }

  const part = data.slice().buffer as ArrayBuffer;
  const blob = new Blob([part], { type: codecMime(codec) });
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
