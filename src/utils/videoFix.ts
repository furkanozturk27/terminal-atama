// In-browser video auto-fix using ffmpeg.wasm (lazy-loaded, single-thread).
// Fixes FPS + bitrate + codec (output H.264 MP4). Does NOT rescale resolution.
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';

let _ffmpeg: FFmpeg | null = null;
let _loading: Promise<FFmpeg> | null = null;

// ffmpeg-core dosyaları public/ffmpeg/ altında (Electron file:// altında CDN çalışmaz)
const BASE = 'ffmpeg';

async function resolveBase(): Promise<string> {
  // Vite/Electron: köke göreli yol. import.meta.env.BASE_URL varsa ona göre çöz.
  const b = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return `${b.replace(/\/$/, '')}/${BASE}`;
}

export async function loadFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (_ffmpeg) return _ffmpeg;
  if (_loading) return _loading;
  _loading = (async () => {
    const ff = new FFmpeg();
    if (onLog) ff.on('log', ({ message }) => onLog(message));
    const base = await resolveBase();
    await ff.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    _ffmpeg = ff;
    return ff;
  })();
  return _loading;
}

export type FixParams = {
  curFps?: number;
  curBitrateMbps?: number;
  maxFps: number;
  maxBitrateMbps: number;
};

// Basit uzantı → giriş dosya adı
function inputName(file: File): string {
  const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
  return `in.${ext}`;
}

/**
 * Videoyu hedef ekranın H.264 limitlerine göre yeniden kodlar.
 * - FPS yalnızca mevcut FPS limiti aşıyorsa düşürülür (-r maxFps).
 * - Bitrate her zaman -maxrate ile sınırlanır, -bufsize = 2x.
 * - Çıktı: H.264 MP4 + AAC 128k. Çözünürlük DEĞİŞTİRİLMEZ.
 */
export async function fixVideo(
  file: File,
  p: FixParams,
  onProgress?: (ratio: number) => void
): Promise<Blob> {
  const ff = await loadFFmpeg();
  const inName = inputName(file);
  const outName = 'out.mp4';

  await ff.writeFile(inName, await fetchFile(file));

  const args: string[] = ['-i', inName];

  // FPS: sadece mevcut değer bilinmiyorsa ya da limiti aşıyorsa uygula
  const needFps = p.curFps == null || p.curFps > p.maxFps + 0.1;
  if (needFps) args.push('-r', String(p.maxFps));

  // Video: H.264, kalite tabanlı ama bitrate tavanı ile sınırla
  const bufsize = Math.max(1, Math.round(p.maxBitrateMbps * 2));
  args.push(
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    '-maxrate', `${p.maxBitrateMbps}M`,
    '-bufsize', `${bufsize}M`,
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-c:a', 'aac',
    '-b:a', '128k',
    outName
  );

  let progHandler: ((e: { progress: number }) => void) | null = null;
  if (onProgress) {
    progHandler = ({ progress }) => onProgress(Math.max(0, Math.min(1, progress)));
    ff.on('progress', progHandler);
  }

  try {
    await ff.exec(args);
  } finally {
    if (progHandler) ff.off('progress', progHandler);
  }

  const data = await ff.readFile(outName);
  // temizle
  try { await ff.deleteFile(inName); } catch { /* yoksay */ }
  try { await ff.deleteFile(outName); } catch { /* yoksay */ }

  const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Blob([ab], { type: 'video/mp4' });
}
