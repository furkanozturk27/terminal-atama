// Bir içeriği hedef playliste "yayına hazır" hale getirmek için ne yapılması gerektiğine karar verir.
// Tek dosya düzeltme butonu, "Hepsini Hazırla" paketi ve ajans portalı aynı planı kullanır.
import type { Playlist } from '../data/terminalKadikoy';
import { type Content, evaluatePlaylist, h264Cap, isResolutionExact, parseFps } from './matching';
import { contentIssues, isImageContent } from './contentIssues';

export type FixPlan = {
  kind: 'video' | 'image';
  target: Playlist;
  action: 'copy' | 'transcode';
  srcW: number; srcH: number;
  outW: number; outH: number;
  fps?: number;            // çıktı FPS (yalnızca değişecekse)
  maxBitrateMbps: number;
  deinterlace: boolean;
  steps: string[];         // yapılacak işlemler (insan okunur)
  unfixable: string[];     // otomatik giderilemeyen, ajansın düzeltmesi gereken sorunlar
  outExt: string;
};

const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);
const fmtFps = (f: number) => (Math.abs(f - Math.round(f)) < 0.01 ? String(Math.round(f)) : f.toFixed(2));

export function planFix(c: Content, pl: Playlist, opts: { scaleToTarget: boolean }): FixPlan {
  const srcW = c.width || 0, srcH = c.height || 0;
  const ev = evaluatePlaylist(c, pl, 100);
  const resBlock = ev.blockReasons.some((r) => /çözünürlük/i.test(r));
  const issues = contentIssues(c);
  const has = (code: string) => issues.some((i) => i.code === code);
  const wantScale = resBlock || (opts.scaleToTarget && !isResolutionExact(c, pl));
  const steps: string[] = [];
  const unfixable = issues.filter((i) => i.fix === 'agency').map((i) => i.text);
  const origExt = (c.filename.match(/\.[a-z0-9]+$/i)?.[0] || '').toLowerCase();

  if (isImageContent(c)) {
    const outW = wantScale ? pl.targetWidth : srcW;
    const outH = wantScale ? pl.targetHeight : srcH;
    if (wantScale) steps.push(`Çözünürlük ${srcW}×${srcH} → ${outW}×${outH} (ekrana birebir)`);
    if (has('CMYK')) steps.push('CMYK → RGB');
    if (has('PROGRESSIVE')) steps.push('Progressive → baseline JPEG');
    const action = steps.length ? 'transcode' : 'copy';
    return {
      kind: 'image', target: pl, action, srcW, srcH, outW, outH, maxBitrateMbps: 0, deinterlace: false,
      steps, unfixable, outExt: action === 'transcode' ? '.jpg' : origExt,
    };
  }

  // --- video ---
  let outW = wantScale ? even(pl.targetWidth) : even(srcW);
  let outH = wantScale ? even(pl.targetHeight) : even(srcH);
  if (!outW || !outH) { outW = srcW; outH = srcH; }
  if (wantScale) steps.push(`Çözünürlük ${srcW}×${srcH} → ${outW}×${outH} (ekrana birebir)`);

  const cap = h264Cap(pl);
  const cur = parseFps(c.avg_frame_rate);
  let fps: number | undefined;
  if (cur && cur > cap.maxFps + 0.5) {
    // Tam yarıya bölmek (50→25, 60→30) hareketi akıcı tutar; olmuyorsa limite in.
    fps = cur / 2 <= cap.maxFps + 0.01 ? Math.round((cur / 2) * 1000) / 1000 : cap.maxFps;
    steps.push(`${fmtFps(cur)} fps → ${fmtFps(fps)} fps`);
  } else if (has('VFR')) {
    fps = cur ? Math.min(Math.round(cur), cap.maxFps) : cap.maxFps;
    steps.push(`Değişken FPS → sabit ${fmtFps(fps)} fps`);
  }

  const mbps = c.bit_rate ? c.bit_rate / 1_000_000 : 0;
  if (mbps > cap.maxBitrateMbps) steps.push(`Bitrate ${mbps.toFixed(1)} → ≤${cap.maxBitrateMbps} Mbps`);

  const codec = String(c.codec_name || '').toLowerCase();
  const isAvc = codec === 'avc' || codec.includes('264');
  if (!isAvc) steps.push(`${c.codec_name || 'Bilinmeyen codec'} → H.264`);
  if (has('CHROMA') || has('BITDEPTH') || has('PROFILE')) steps.push(`${[c.bit_depth ? `${c.bit_depth}-bit` : '', c.chroma || ''].filter(Boolean).join(' ') || 'Renk formatı'} → 8-bit 4:2:0 (High profil)`);
  if (has('LEVEL')) steps.push(`H.264 Level ${c.level} → otomatik (≤5.1)`);
  if (has('INTERLACED')) steps.push('Geçmeli → progressive');
  if (has('CONTAINER')) steps.push(`${/quicktime/i.test(String(c.container)) ? 'MOV' : 'MKV'} → MP4`);
  if (!wantScale && (outW !== srcW || outH !== srcH) && steps.length) steps.push(`Tek sayılı ölçü ${srcW}×${srcH} → ${outW}×${outH}`);

  const action = steps.length ? 'transcode' : 'copy';
  return {
    kind: 'video', target: pl, action, srcW, srcH, outW, outH, fps,
    maxBitrateMbps: cap.maxBitrateMbps, deinterlace: has('INTERLACED'),
    steps, unfixable, outExt: action === 'transcode' ? '.mp4' : origExt,
  };
}
