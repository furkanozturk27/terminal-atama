// Görüntü kenarlarındaki siyah bant (letterbox / pillarbox) tespiti.
// Videodan birkaç kare (veya görselin kendisi) küçültülmüş bir canvas'a çizilir;
// kenarlardan içeri doğru "tamamen siyah" satır/sütunlar sayılır.

export type Bars = { top: number; bottom: number; left: number; right: number }; // kaynak piksel

// Gerçek letterbox/pillarbox bandı saf siyahtır, içinde hiçbir içerik yoktur ve görüntüyle
// arasında KESKİN bir sınır vardır. Koyu tasarımlar (siyah zemin, siyaha karışan sahne,
// koyu yasal metin şeridi) bant SAYILMAMALI — onlarda siyahtan görüntüye geçiş yumuşaktır.
const SAMPLE_LONG = 640; // analiz çözünürlüğü (uzun kenar) — küçük yazılar küçültmede kaybolmasın
const CHANNEL_MAX = 22; // piksel "siyah" = R, G ve B'nin hepsi bu değerin altında (koyu renkler değil)
const BLACK_SHARE = 0.998; // satırın neredeyse tamamı siyah olmalı (yalnızca sıkıştırma gürültüsü payı)
const EDGE_MIN = 30; // bandın hemen içindeki 3 satırın parlaklığı (p90, 0-255): gerçek bantlarda 45+, koyu tasarımlarda 0-4
const FRAME_COUNT = 12; // bant videonun tamamında olmalı: 12 farklı anda da görülmesi şart

type Frame = { luma: Uint8Array; dark: Uint8Array; bars: Bars };
type Side = keyof Bars;

function readFrame(ctx: CanvasRenderingContext2D, w: number, h: number): Frame | null {
  const { data } = ctx.getImageData(0, 0, w, h);
  const luma = new Uint8Array(w * h);
  const dark = new Uint8Array(w * h);
  let darkTotal = 0;
  for (let i = 0, p = 0; i < dark.length; i++, p += 4) {
    luma[i] = (0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]) | 0;
    if (data[p] <= CHANNEL_MAX && data[p + 1] <= CHANNEL_MAX && data[p + 2] <= CHANNEL_MAX) { dark[i] = 1; darkTotal++; }
  }
  if (darkTotal > dark.length * 0.9) return null; // kare neredeyse tamamen karanlık → karar verilemez
  const rowBlack = (y: number) => { let n = 0; for (let x = 0; x < w; x++) n += dark[y * w + x]; return n >= w * BLACK_SHARE; };
  const colBlack = (x: number) => { let n = 0; for (let y = 0; y < h; y++) n += dark[y * w + x]; return n >= h * BLACK_SHARE; };
  let top = 0; while (top < h && rowBlack(top)) top++;
  let bottom = 0; while (bottom < h - top && rowBlack(h - 1 - bottom)) bottom++;
  let left = 0; while (left < w && colBlack(left)) left++;
  let right = 0; while (right < w - left && colBlack(w - 1 - right)) right++;
  return { luma, dark, bars: { top, bottom, left, right } };
}

// Bandın bittiği yerden içeri doğru 3 satır/sütunun 90. yüzdelik parlaklığı
function edgeBrightness(f: Frame, w: number, h: number, side: Side, b: number): number {
  const vals: number[] = [];
  for (let k = 0; k < 3; k++) {
    if (side === 'top' || side === 'bottom') {
      const y = side === 'top' ? b + k : h - 1 - b - k;
      if (y < 0 || y >= h) continue;
      for (let x = 0; x < w; x++) vals.push(f.luma[y * w + x]);
    } else {
      const x = side === 'left' ? b + k : w - 1 - b - k;
      if (x < 0 || x >= w) continue;
      for (let y = 0; y < h; y++) vals.push(f.luma[y * w + x]);
    }
  }
  if (!vals.length) return 0;
  vals.sort((a, c) => a - c);
  return vals[Math.floor(vals.length * 0.9)];
}

function makeCanvas(srcW: number, srcH: number) {
  const scale = SAMPLE_LONG / Math.max(srcW, srcH);
  const w = Math.max(8, Math.round(srcW * Math.min(1, scale)));
  const h = Math.max(8, Math.round(srcH * Math.min(1, scale)));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  return { ctx, w, h };
}

// Karelerde ortak (en küçük) bantlar → keskin sınır kontrolü → kaynak piksel.
function finalize(frames: Frame[], w: number, h: number, srcW: number, srcH: number): Bars | null {
  if (!frames.length) return null;
  const min = (k: Side) => Math.min(...frames.map((f) => f.bars[k]));
  const cand: Bars = { top: min('top'), bottom: min('bottom'), left: min('left'), right: min('right') };
  // Bir kenar: herhangi bir karede sınırın hemen içinde belirgin görüntü varsa "keskin"
  const hard = (s: Side) => cand[s] > 0 && Math.max(...frames.map((f) => edgeBrightness(f, w, h, s, cand[s]))) >= EDGE_MIN;
  const similar = (a: number, b: number) => a > 0 && b > 0 && Math.abs(a - b) <= Math.max(3, 0.1 * Math.max(a, b));
  const keep = (s: Side, opp: Side) => hard(s) || (hard(opp) && similar(cand[s], cand[opp])); // simetrik eşi de bant
  const kept: Bars = {
    top: keep('top', 'bottom') ? cand.top : 0,
    bottom: keep('bottom', 'top') ? cand.bottom : 0,
    left: keep('left', 'right') ? cand.left : 0,
    right: keep('right', 'left') ? cand.right : 0,
  };
  const toSrcY = (v: number) => Math.round((v * srcH) / h);
  const toSrcX = (v: number) => Math.round((v * srcW) / w);
  const sig = (px: number, dim: number) => (px >= Math.max(6, dim * 0.02) ? px : 0);
  const out: Bars = {
    top: sig(toSrcY(kept.top), srcH), bottom: sig(toSrcY(kept.bottom), srcH),
    left: sig(toSrcX(kept.left), srcW), right: sig(toSrcX(kept.right), srcW),
  };
  return out.top || out.bottom || out.left || out.right ? out : null;
}

export async function detectImageBars(file: File): Promise<Bars | null> {
  try {
    const bmp = await createImageBitmap(file);
    const { ctx, w, h } = makeCanvas(bmp.width, bmp.height);
    ctx.drawImage(bmp, 0, 0, w, h);
    const f = readFrame(ctx, w, h);
    const res = finalize(f ? [f] : [], w, h, bmp.width, bmp.height);
    bmp.close();
    return res;
  } catch {
    return null;
  }
}

export async function detectVideoBars(file: File, srcW: number, srcH: number): Promise<Bars | null> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.preload = 'auto'; video.src = url;
  const once = (ev: string, ms: number) => new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => { cleanup(); reject(new Error('timeout')); }, ms);
    const ok = () => { cleanup(); resolve(); };
    const bad = () => { cleanup(); reject(new Error('video error')); };
    const cleanup = () => { clearTimeout(t); video.removeEventListener(ev, ok); video.removeEventListener('error', bad); };
    video.addEventListener(ev, ok); video.addEventListener('error', bad);
  });
  try {
    await once('loadeddata', 8000); // tarayıcının çözemediği codec'lerde (ProRes vb.) burada düşer
    const dur = isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const times = dur ? Array.from({ length: FRAME_COUNT }, (_, i) => ((i + 0.5) / FRAME_COUNT) * dur) : [0];
    const { ctx, w, h } = makeCanvas(srcW || video.videoWidth, srcH || video.videoHeight);
    const frames: Frame[] = [];
    for (const t of times) {
      if (Math.abs(video.currentTime - t) > 0.01) { video.currentTime = t; await once('seeked', 5000); }
      ctx.drawImage(video, 0, 0, w, h);
      const f = readFrame(ctx, w, h);
      if (f) frames.push(f);
    }
    return finalize(frames, w, h, srcW || video.videoWidth, srcH || video.videoHeight);
  } catch {
    return null;
  } finally {
    video.removeAttribute('src'); video.load();
    URL.revokeObjectURL(url);
  }
}
