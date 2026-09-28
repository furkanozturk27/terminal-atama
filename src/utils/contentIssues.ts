// Cihaz limitlerinden bağımsız "gizli" riskler: dosya ölçü/FPS/bitrate açısından uygun görünse de
// LED oynatıcıda siyah ekran, donma, takılma veya yanlış renk üreten özellikler.
//  - level 'block': donanım çözücüsü oynatamaz → atanamaz (otomatik düzeltme ile giderilebilir)
//  - level 'warn' : oynar ama sorun çıkarabilir
//  - fix 'auto'   : "Otomatik Düzelt" giderir · 'agency': ajansın yeniden çıkarması gerekir
import type { Content } from './matching';

export type IssueLevel = 'block' | 'warn';
export type IssueCode =
  | 'CHROMA' | 'BITDEPTH' | 'PROFILE' | 'LEVEL' | 'VFR' | 'INTERLACED'
  | 'HDR' | 'CONTAINER' | 'BARS' | 'CMYK' | 'PROGRESSIVE';
export type ContentIssue = { code: IssueCode; level: IssueLevel; text: string; fix: 'auto' | 'agency' };

export const isImageContent = (c: Content) =>
  String(c.file_type || '').startsWith('image/') ||
  /\.(jpe?g|png|webp|gif|bmp)$/i.test(c.filename);

function barsText(c: Content): string {
  const b = c.bars!;
  const parts: string[] = [];
  if (b.top || b.bottom) parts.push(`üst ${b.top}px / alt ${b.bottom}px`);
  if (b.left || b.right) parts.push(`sol ${b.left}px / sağ ${b.right}px`);
  return parts.join(', ');
}

export function contentIssues(c: Content): ContentIssue[] {
  const out: ContentIssue[] = [];

  if (isImageContent(c)) {
    if (c.jpeg_cmyk) out.push({ code: 'CMYK', level: 'block', fix: 'auto', text: 'CMYK JPEG (baskı renk modu) — oynatıcılar siyah ya da ters renkli gösterir. RGB olmalı.' });
    if (c.jpeg_progressive) out.push({ code: 'PROGRESSIVE', level: 'warn', fix: 'auto', text: 'Progressive JPEG — bazı oynatıcılar açamaz; baseline JPEG önerilir.' });
    if (c.bars) out.push({ code: 'BARS', level: 'warn', fix: 'agency', text: `Görselde siyah bant var (${barsText(c)}) — içerik ekranı doldurmuyor, tam kadraj isteyin.` });
    return out;
  }

  const codec = String(c.codec_name || '').toLowerCase();
  const isAvc = codec === 'avc' || codec.includes('264');
  const isHevc = codec === 'hevc' || codec.includes('265');
  const chroma = String(c.chroma || '');
  const profile = String(c.profile || '');

  if (chroma && !chroma.startsWith('4:2:0')) {
    out.push({ code: 'CHROMA', level: 'block', fix: 'auto', text: `Renk örnekleme ${chroma} — oynatıcının donanım çözücüsü yalnızca 4:2:0 çözer (siyah ekran nedeni).` });
  }
  if (c.bit_depth && c.bit_depth > 8) {
    if (isAvc || c.bit_depth > 10) {
      out.push({ code: 'BITDEPTH', level: 'block', fix: 'auto', text: `${c.bit_depth}-bit ${isAvc ? 'H.264 (High 10)' : 'video'} — donanımda çözülmez (siyah ekran nedeni). 8-bit olmalı.` });
    } else {
      out.push({ code: 'BITDEPTH', level: 'warn', fix: 'auto', text: `${c.bit_depth}-bit ${isHevc ? 'HEVC (Main 10)' : 'video'} — bazı cihazlarda siyah ekran/renk bozulması; 8-bit önerilir.` });
    }
  }
  if (isAvc && /4:4:4|4:2:2|high ?10|hi10|hi422|hi444/i.test(profile) && !out.some((i) => i.level === 'block')) {
    out.push({ code: 'PROFILE', level: 'block', fix: 'auto', text: `H.264 profili "${profile}" — oynatıcılar yalnızca Baseline/Main/High profili çözer.` });
  }
  const lvl = parseFloat(String(c.level || '').replace(',', '.'));
  if (isAvc && lvl > 5.1) {
    out.push({ code: 'LEVEL', level: 'warn', fix: 'auto', text: `H.264 Level ${lvl} > 5.1 — donanım çözücüsü zorlanabilir, takılma/siyah ekran riski.` });
  }
  if (/^vfr$/i.test(String(c.fps_mode || ''))) {
    out.push({ code: 'VFR', level: 'warn', fix: 'auto', text: 'Değişken kare hızı (VFR) — LED oynatıcıda takılma/donma yapar; sabit FPS olmalı.' });
  }
  if (c.scan_type && !/progressive/i.test(c.scan_type)) {
    out.push({ code: 'INTERLACED', level: 'warn', fix: 'auto', text: `Geçmeli (${c.scan_type}) video — LED'de tarak çizgisi/titreme görünür; progressive olmalı.` });
  }
  if (c.hdr || /pq|2084|hlg/i.test(String(c.transfer || '')) || /2020/.test(String(c.primaries || ''))) {
    out.push({ code: 'HDR', level: 'warn', fix: 'agency', text: 'HDR / BT.2020 renk — LED oynatıcıda soluk ya da yanlış renk görünür; ajanstan SDR (BT.709) çıktı isteyin.' });
  }
  if (/quicktime|matroska/i.test(String(c.container || ''))) {
    out.push({ code: 'CONTAINER', level: 'warn', fix: 'auto', text: `${/quicktime/i.test(c.container!) ? 'MOV' : 'MKV'} kapsayıcı — oynatıcılar için MP4 önerilir.` });
  }
  if (c.bars) {
    out.push({ code: 'BARS', level: 'warn', fix: 'agency', text: `Videoda siyah bant var (${barsText(c)}) — içerik ekranı doldurmuyor, tam kadraj isteyin.` });
  }
  return out;
}

export const blockingIssues = (c: Content) => contentIssues(c).filter((i) => i.level === 'block');
export const warningIssues = (c: Content) => contentIssues(c).filter((i) => i.level === 'warn');
