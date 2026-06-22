// İçerik <-> Playlist eşleştirme motoru (tamamen client-side).
// - Cihaz decode uygunluğu (hard gate): codec / çözünürlük / fps / bitrate limitleri
//   (bir playlistteki TÜM ekranların cihazları için kontrol edilir)
// - En-boy oranı uyumu: playlist hedef ölçüsüne göre sapma % (tolerans dahilinde atanabilir)
// - Optimal birebir atama: Hungarian (min toplam sapma, birebir uyum önceliği)

import type { Controller, Playlist, CodecLimit } from '../data/terminalKadikoy';

export type Content = {
  id: string;
  filename: string;
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string | number;
  bit_rate?: number;
  duration?: number;
  file_type?: string;
};

export type PairKlass = 'EXACT' | 'TOLERANT' | 'MISMATCH' | 'BLOCKED';

export type PairEval = {
  feasible: boolean; // playlistteki tüm cihazlar oynatabilir mi
  blockReasons: string[]; // oynatamama nedenleri
  deviation: number | null; // en-boy oranı sapma %
  klass: PairKlass;
  assignable: boolean; // feasible && deviation <= tolerance
};

const CODEC_MAP: Record<string, string> = {
  hevc: 'H.265', h265: 'H.265', 'h.265': 'H.265',
  avc: 'H.264', h264: 'H.264', 'h.264': 'H.264',
  vp8: 'VP8', vp9: 'VP9', av1: 'AV1', mpeg4: 'MPEG4', 'mpeg-4': 'MPEG4',
  mjpeg: 'JPEG', jpeg: 'JPEG', jpg: 'JPEG',
  png: 'PNG', gif: 'GIF', webp: 'WEBP', bmp: 'BMP',
};

const IMAGE_CODECS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'mjpeg'];

function resolveLimitKey(codecName: string | undefined, limits: Record<string, CodecLimit>): string | null {
  const c = String(codecName || '').toLowerCase().trim();
  if (!c) return null;
  const std = CODEC_MAP[c];
  if (std) {
    const sl = std.toLowerCase();
    for (const k of Object.keys(limits)) {
      const kl = k.toLowerCase();
      if (kl === sl || kl.includes(sl) || sl.includes(kl)) return k;
    }
  }
  for (const k of Object.keys(limits)) {
    const kl = k.toLowerCase();
    if (kl.includes(c) || c.includes(kl)) return k;
  }
  if (IMAGE_CODECS.includes(c) && limits['JPEG']) return 'JPEG';
  return null;
}

export function parseFps(v: string | number | undefined): number | null {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim();
  if (s.includes('/')) {
    const [num, den] = s.split('/');
    const n = parseFloat(num), d = parseFloat(den);
    if (!d) return null;
    return n / d;
  }
  const f = parseFloat(s);
  return isNaN(f) ? null : f;
}

export function aspectDeviation(content: Content, w: number, h: number): number | null {
  if (!content.width || !content.height || !w || !h) return null;
  const cr = content.width / content.height;
  const sr = w / h;
  return (Math.abs(sr - cr) / sr) * 100;
}

// Tek bir cihazın bu içeriği oynatıp oynatamayacağı (engel nedenleri)
function deviceBlockReasons(content: Content, controller: Controller): string[] {
  const reasons: string[] = [];
  const limits = controller.codec_limits;
  const key = resolveLimitKey(content.codec_name, limits);
  if (!key) {
    reasons.push(`'${content.codec_name || '?'}' formatı ${controller.name} tarafından desteklenmiyor.`);
    return reasons;
  }
  const lim = limits[key];
  // Yön-duyarlı çözünürlük kontrolü: dikey içerik, cihazın yatay limitine
  // döndürülerek sığabiliyorsa oynatılabilir kabul edilir (uzun/kısa kenar kıyası).
  if (content.width && content.height && lim.max_width && lim.max_height) {
    const cLong = Math.max(content.width, content.height);
    const cShort = Math.min(content.width, content.height);
    const limLong = Math.max(lim.max_width, lim.max_height);
    const limShort = Math.min(lim.max_width, lim.max_height);
    if (cLong > limLong || cShort > limShort) {
      reasons.push(`Çözünürlük ${content.width}×${content.height} > ${controller.name} ${key} limiti ${lim.max_width}×${lim.max_height} (döndürme dahil).`);
    }
  }
  const fps = parseFps(content.avg_frame_rate);
  if (fps && lim.max_fps && fps > lim.max_fps + 0.5) {
    reasons.push(`FPS ${fps.toFixed(1)} > ${controller.name} limiti ${lim.max_fps} (${key}).`);
  }
  if (content.bit_rate && lim.max_bitrate_mbps) {
    const mbps = content.bit_rate / 1_000_000;
    if (mbps > lim.max_bitrate_mbps) {
      reasons.push(`Bitrate ${mbps.toFixed(1)} Mbps > ${controller.name} limiti ${lim.max_bitrate_mbps} Mbps (${key}).`);
    }
  }
  return reasons;
}

// İçerik <-> Playlist değerlendirmesi (oran playlist hedefine göre, cihaz tüm üyeler için)
export function evaluatePlaylist(content: Content, pl: Playlist, tolerance: number): PairEval {
  const blockReasons: string[] = [];
  const multi = pl.controllers.length > 1;
  pl.controllers.forEach((c) => {
    deviceBlockReasons(content, c).forEach((r) => blockReasons.push(multi ? `[${c.name}] ${r}` : r));
  });

  const dev = aspectDeviation(content, pl.targetWidth, pl.targetHeight);
  const feasible = blockReasons.length === 0;
  let klass: PairKlass;
  if (!feasible) klass = 'BLOCKED';
  else if (dev !== null && dev < 0.1) klass = 'EXACT';
  else if (dev !== null && dev <= tolerance) klass = 'TOLERANT';
  else klass = 'MISMATCH';

  const assignable = feasible && dev !== null && dev <= tolerance;
  return { feasible, blockReasons, deviation: dev, klass, assignable };
}

// ---- Hungarian (Kuhn-Munkres), kare matris, min maliyet ----
function hungarian(cost: number[][]): number[] {
  const n = cost.length;
  const INF = Number.MAX_SAFE_INTEGER;
  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0); // p[col] = row
  const way = new Array(n + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(INF);
    const used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF;
      let j1 = -1;
      for (let j = 1; j <= n; j++) {
        if (!used[j]) {
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
          if (minv[j] < delta) { delta = minv[j]; j1 = j; }
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
        else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }

  const rowToCol = new Array(n).fill(-1);
  for (let j = 1; j <= n; j++) if (p[j] > 0) rowToCol[p[j] - 1] = j - 1;
  return rowToCol;
}

export type Assignment = {
  content: Content;
  playlist: Playlist;
  deviation: number;
  klass: PairKlass;
  resolutionExact: boolean; // içerik çözünürlüğü hedef ölçüye birebir eşit mi
  riskNote?: string;        // ölçü farklıysa "hedef X olmalı, bu hâliyle riskli" uyarısı
};
export type UnmatchKind = 'INVALID' | 'NO_FIT' | 'DEVICE' | 'CONTENTION';
export type UnmatchedContent = {
  content: Content;
  bestPlaylist?: Playlist;
  bestDeviation?: number;
  kind: UnmatchKind;
  reason: string;
};

export type MatchResult = {
  assignments: Assignment[];
  unmatchedContents: UnmatchedContent[];
  emptyPlaylists: Playlist[];
  // evalMatrix[contentId][playlistId] = PairEval
  evalMatrix: Map<string, Map<string, PairEval>>;
};

// Katmanlı maliyet bantları (öncelik): atama sayısı > birebir uyum > az sapma > çözünürlük yakınlığı.
const EXACT_BONUS = 1000;
const ESCAPE = 1e5;
const INFEASIBLE = 1e9;
const FORBIDDEN = 1e12;
const RES_EPS = 1e-3; // aynı oranlı playlistler arasında çözünürlüğü en yakın olanı seçmek için çok küçük ek maliyet

// İçerik ile playlist hedef çözünürlüğü arasındaki göreli uzaklık (oran eşitliklerini kırmak için)
function resDistance(content: Content, p: Playlist): number {
  if (!content.width || !content.height) return 0;
  return Math.abs(content.width - p.targetWidth) / p.targetWidth + Math.abs(content.height - p.targetHeight) / p.targetHeight;
}

export function buildAssignment(contents: Content[], playlists: Playlist[], tolerance: number): MatchResult {
  const nC = contents.length;
  const nP = playlists.length;

  const evalMatrix = new Map<string, Map<string, PairEval>>();
  contents.forEach((c) => {
    const row = new Map<string, PairEval>();
    playlists.forEach((p) => row.set(p.id, evaluatePlaylist(c, p, tolerance)));
    evalMatrix.set(c.id, row);
  });

  const result: MatchResult = { assignments: [], unmatchedContents: [], emptyPlaylists: [], evalMatrix };

  if (nC === 0) {
    result.emptyPlaylists = [...playlists];
    return result;
  }

  // N = nC + nP kare matris. Sağ blok: içerik "atanmadı" kaçışı; alt blok: playlist "boş" kaçışı.
  const N = nC + nP;
  const cost: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));

  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (i < nC && j < nP) {
        const ev = evalMatrix.get(contents[i].id)!.get(playlists[j].id)!;
        cost[i][j] = ev.assignable
          ? ev.deviation! - (ev.klass === 'EXACT' ? EXACT_BONUS : 0) + RES_EPS * resDistance(contents[i], playlists[j])
          : INFEASIBLE;
      } else if (i < nC && j >= nP) {
        cost[i][j] = j - nP === i ? ESCAPE : FORBIDDEN;
      } else if (i >= nC && j < nP) {
        cost[i][j] = i - nC === j ? ESCAPE : FORBIDDEN;
      } else {
        cost[i][j] = 0;
      }
    }
  }

  const rowToCol = hungarian(cost);
  const matchedPlaylistIds = new Set<string>();

  for (let i = 0; i < nC; i++) {
    const j = rowToCol[i];
    if (j >= 0 && j < nP && cost[i][j] < INFEASIBLE) {
      const ev = evalMatrix.get(contents[i].id)!.get(playlists[j].id)!;
      const pl = playlists[j];
      const c = contents[i];
      // Birebir ölçü: 1-2 piksellik kodlama yuvarlamalarını (örn. 1224↔1225) tolere et.
      const near = (a?: number, b?: number) => a !== undefined && b !== undefined && Math.abs(a - b) <= Math.max(2, b * 0.005);
      const resolutionExact = near(c.width, pl.targetWidth) && near(c.height, pl.targetHeight);
      const riskNote = resolutionExact
        ? undefined
        : `Ekranın birebir ölçüsü ${pl.targetWidth}×${pl.targetHeight}. İçerik ${c.width}×${c.height} olarak gönderildiği için otomatik eşlendi; bu ölçü döndürülerek/ölçeklenerek oynatılır — birebir değil, riskli.`;
      result.assignments.push({ content: c, playlist: pl, deviation: ev.deviation!, klass: ev.klass, resolutionExact, riskNote });
      matchedPlaylistIds.add(pl.id);
    } else {
      const row = evalMatrix.get(contents[i].id)!;
      const content = contents[i];
      // bestAny: orana en yakın (cihaz dikkate alınmaz)
      // bestAssignable: cihazı uygun + tolerans içi en yakın (gerçekten oynatılabilir)
      let bestAny: { pl: Playlist; ev: PairEval } | null = null;
      let bestAssignable: { pl: Playlist; ev: PairEval } | null = null;
      let hasAssignable = false;
      let hasRatioOk = false;
      const better = (cand: Playlist, ce: PairEval, cur: { pl: Playlist; ev: PairEval } | null) =>
        !cur || ce.deviation! < cur.ev.deviation! ||
        (ce.deviation! === cur.ev.deviation! && resDistance(content, cand) < resDistance(content, cur.pl));
      playlists.forEach((p) => {
        const ev = row.get(p.id)!;
        if (ev.assignable) hasAssignable = true;
        if (ev.deviation !== null && ev.deviation <= tolerance) hasRatioOk = true;
        if (ev.deviation === null) return;
        if (better(p, ev, bestAny)) bestAny = { pl: p, ev };
        if (ev.assignable && better(p, ev, bestAssignable)) bestAssignable = { pl: p, ev };
      });

      const bAny = bestAny as { pl: Playlist; ev: PairEval } | null;
      const bAsg = bestAssignable as { pl: Playlist; ev: PairEval } | null;

      let kind: UnmatchKind;
      let reason: string;
      let suggestion: { pl: Playlist; ev: PairEval } | null;

      if (!content.width || !content.height) {
        kind = 'INVALID';
        suggestion = null;
        reason = 'İçerik çözünürlüğü okunamadı (geçersiz/desteklenmeyen dosya).';
      } else if (hasAssignable) {
        // Oynatılabilir + tolerans içi bir playlist vardı ama başka içeriğe atandı
        kind = 'CONTENTION';
        suggestion = bAsg;
        reason = suggestion
          ? `Bu içeriğe uyan playlist (${suggestion.pl.name}, %${suggestion.ev.deviation!.toFixed(1)} sapma) başka bir içeriğe atandı; 1'e 1 eşleştirmede bu dosyaya boş playlist kalmadı.`
          : 'Uygun playlist başka içeriğe atandı.';
      } else if (hasRatioOk) {
        // Oran uyan ekran(lar) var ama cihazları bu dosyayı oynatamıyor
        kind = 'DEVICE';
        suggestion = bAny;
        reason = suggestion
          ? `Oran uyan ekranın cihazı bu dosyayı oynatamıyor (codec/çözünürlük/bitrate). Oran uyan ekran: ${suggestion.pl.name} (hedef ${suggestion.pl.targetWidth}×${suggestion.pl.targetHeight}). İçeriği bu ölçüye göre küçültün.`
          : 'Oran uyan ekranın cihazı bu dosyayı oynatamıyor.';
      } else {
        kind = 'NO_FIT';
        suggestion = bAny;
        reason = suggestion
          ? `Hiçbir playliste oran uymuyor (tolerans %${tolerance}). Orana en yakın: ${suggestion.pl.name} (%${suggestion.ev.deviation!.toFixed(1)} sapma).`
          : 'Uygun playlist bulunamadı.';
      }
      result.unmatchedContents.push({
        content,
        bestPlaylist: suggestion?.pl,
        bestDeviation: suggestion?.ev.deviation ?? undefined,
        kind,
        reason,
      });
    }
  }

  result.emptyPlaylists = playlists.filter((p) => !matchedPlaylistIds.has(p.id));
  result.assignments.sort((a, b) => a.deviation - b.deviation);
  return result;
}
