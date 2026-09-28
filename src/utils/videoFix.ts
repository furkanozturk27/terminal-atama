// Tarayıcı içinde dosya düzeltme: videolar ffmpeg.wasm (tek-thread, tembel yüklenir),
// görseller canvas ile. Planı fixPlan.ts üretir; çıktı yeniden analiz edilip doğrulanır.
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';
import type { FixPlan } from './fixPlan';
import { analyzeMediaLocally } from './mediaInfo';
import { evaluateForPlaylist, type Content } from './matching';
import { contentIssues } from './contentIssues';

let _ffmpeg: FFmpeg | null = null;
let _loading: Promise<FFmpeg> | null = null;
let _log: string[] = [];
let _queue: Promise<unknown> = Promise.resolve(); // tek ffmpeg örneği → işler sırayla

// ESM çekirdek: @ffmpeg/ffmpeg worker'ı modül worker'dır; UMD çekirdeği yükleyemez.
// (Çok çekirdekli @ffmpeg/core-mt 0.12 pthread'lerde 'function signature mismatch' ile çöktüğü için kullanılmıyor.)
function coreBase(dir: string): string {
  return new URL(`${dir}/`, new URL(import.meta.env.BASE_URL || './', window.location.href)).href;
}

export async function loadFFmpeg(): Promise<FFmpeg> {
  if (_ffmpeg) return _ffmpeg;
  if (_loading) return _loading;
  _loading = (async () => {
    const ff = new FFmpeg();
    ff.on('log', ({ message }) => { _log.push(message); if (_log.length > 60) _log.shift(); });
    const base = coreBase('ffmpeg');
    const load = ff.load({
      coreURL: await toBlobURL(`${base}ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${base}ffmpeg-core.wasm`, 'application/wasm'),
    });
    // Worker başlatılamazsa ff.load hiç dönmez → kullanıcıyı sonsuz beklemede bırakma.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { ff.terminate(); reject(new Error('Video motoru başlatılamadı (zaman aşımı). Sayfayı yenileyip tekrar deneyin.')); }, 45_000);
    });
    try { await Promise.race([load, timeout]); } finally { clearTimeout(timer); }
    _ffmpeg = ff;
    return ff;
  })();
  _loading.catch(() => { _loading = null; });
  return _loading;
}

export const isFFmpegLoaded = () => !!_ffmpeg;

function inputName(file: File): string {
  const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
  return `in.${ext}`;
}

async function transcodeVideo(file: File, plan: FixPlan, onProgress?: (r: number) => void): Promise<Blob> {
  const ff = await loadFFmpeg();
  const inName = inputName(file);
  const outName = 'out.mp4';
  await ff.writeFile(inName, await fetchFile(file));

  const vf: string[] = [];
  if (plan.deinterlace) vf.push('yadif=0:-1:0');
  if (plan.outW !== plan.srcW || plan.outH !== plan.srcH) {
    vf.push(`scale=${plan.outW}:${plan.outH}:force_original_aspect_ratio=increase:flags=lanczos`, `crop=${plan.outW}:${plan.outH}`);
  }
  vf.push('setsar=1', 'format=yuv420p');

  // Yarım saniyelik tampon: kısa ve çok detaylı videolarda bile ortalama bitrate tavanı aşmaz
  const bufsize = Math.max(1, Math.floor(plan.maxBitrateMbps / 2));
  const args = [
    '-i', inName,
    '-map', '0:v:0', '-map', '0:a:0?',
    '-vf', vf.join(','),
    ...(plan.fps ? ['-r', String(plan.fps)] : []),
    '-c:v', 'libx264', '-preset', 'superfast', '-profile:v', 'high', '-crf', '20',
    '-maxrate', `${plan.maxBitrateMbps}M`, '-bufsize', `${bufsize}M`,
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
    '-movflags', '+faststart',
    outName,
  ];

  const onProg = ({ progress }: { progress: number }) => onProgress?.(Math.max(0, Math.min(1, progress)));
  ff.on('progress', onProg);
  _log = [];
  let code: number;
  try {
    code = await ff.exec(args);
  } finally {
    ff.off('progress', onProg);
  }
  try {
    if (code !== 0) {
      const tail = _log.filter((l) => /error|invalid|not|fail/i.test(l)).slice(-3).join(' · ') || _log.slice(-3).join(' · ');
      throw new Error(`ffmpeg hata kodu ${code}: ${tail}`);
    }
    const data = await ff.readFile(outName);
    const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
    return new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'video/mp4' });
  } finally {
    try { await ff.deleteFile(inName); } catch { /* yoksay */ }
    try { await ff.deleteFile(outName); } catch { /* yoksay */ }
  }
}

async function transcodeImage(file: File, plan: FixPlan): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = plan.outW; canvas.height = plan.outH;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, plan.outW, plan.outH);
  // "cover": hedefi doldur, taşan kısmı ortadan kırp (oran farkı tolerans içinde)
  const s = Math.max(plan.outW / bmp.width, plan.outH / bmp.height);
  const dw = bmp.width * s, dh = bmp.height * s;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, (plan.outW - dw) / 2, (plan.outH - dh) / 2, dw, dh);
  bmp.close();
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Görsel kodlanamadı'))), 'image/jpeg', 0.93));
}

// Planı uygula. Video işleri tek ffmpeg örneği üzerinde sıraya girer.
export function applyFix(file: File, plan: FixPlan, onProgress?: (r: number) => void): Promise<Blob> {
  if (plan.kind === 'image') return transcodeImage(file, plan);
  const job = _queue.then(() => transcodeVideo(file, plan, onProgress));
  _queue = job.catch(() => undefined);
  return job;
}

export type Verification = { ok: boolean; meta: Content; problems: string[]; warnings: string[] };

// Düzeltilmiş çıktıyı yeniden analiz edip hedef ekrana karşı doğrula.
export async function verifyOutput(blob: Blob, name: string, plan: FixPlan): Promise<Verification> {
  const file = new File([blob], name, { type: blob.type || (plan.kind === 'image' ? 'image/jpeg' : 'video/mp4') });
  const raw = await analyzeMediaLocally(file);
  const meta: Content = { ...raw, id: 'verify_' + name, filename: name };
  const ev = evaluateForPlaylist(meta, plan.target, 100);
  const warnings = contentIssues(meta).filter((i) => i.level === 'warn').map((i) => i.text);
  return { ok: ev.feasible, meta, problems: ev.blockReasons, warnings };
}
