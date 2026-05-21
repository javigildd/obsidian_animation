// Copies the ffmpeg-core UMD bundle into public/ffmpeg/ so the Vite dev server
// (and the production build) can serve it same-origin. We keep these files out
// of git because the wasm is ~32 MB.
import { mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
// Use the ESM build: @ffmpeg/ffmpeg spawns a `type: "module"` worker which
// can't use importScripts, so it falls back to `(await import(coreURL)).default`.
// The UMD bundle has no default export, only the ESM one does.
const src = resolve(root, 'node_modules/@ffmpeg/core/dist/esm');
const dst = resolve(root, 'public/ffmpeg');

if (!existsSync(src)) {
  console.warn('[copy-ffmpeg-core] @ffmpeg/core is not installed yet; skipping.');
  process.exit(0);
}

await mkdir(dst, { recursive: true });
for (const file of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  await copyFile(resolve(src, file), resolve(dst, file));
  console.log(`[copy-ffmpeg-core] public/ffmpeg/${file}`);
}
