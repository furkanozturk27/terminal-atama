// Görüntü kenarlarındaki siyah bant (letterbox / pillarbox) tespiti.
// Videodan birkaç kare (veya görselin kendisi) küçültülmüş bir canvas'a çizilir;
// kenarlardan içeri doğru "tamamen siyah" satır/sütunlar sayılır.

export type Bars = { top: number; bottom: number; left: number; right: number }; // kaynak piksel

// Gerçek letterbox/pillarbox bandı saf siyahtır ve içinde hiçbir içerik yoktur.
// Koyu tasarım öğeleri (ör. koyu mor zemin üzerinde küçük yasal metin şeridi) bant SAYILMAMALI.
const SAMPLE_LONG = 640; // analiz çözünürlüğü (uzun kenar) — küçük yazılar küçültmede kaybolmasın
const CHANNEL_MAX = 22; // piksel "siyah" = R, G ve B'nin hepsi bu değerin altında (koyu renkler değil)
const BLACK_SHARE = 0.998; // satırın neredeyse tamamı siyah olmalı (yalnızca sıkıştırma gürültüsü payı)

function barsOnCanvas(ctx: CanvasRenderingContext2D, w: number, h: number): Bars | null {
  const { data } = ctx.getImageData(0, 0, w, h);
  const dark = new Uint8Array(w * h);
  let darkTotal = 0;
  for (let i = 0, p = 0; i < dark.length; i++, p += 4) {
    if (data[p] <= CHANNEL_MAX && data[p + 1] <= CHANNEL_MAX && data[p + 2] <= CHANNEL_MAX) { dark[i] = 1; darkTotal++; }
  }
  if (darkTotal > dark.length * 0.9) return null; // kare neredeyse tamamen karanlık → karar verilemez
  const rowBlack = (y: number) => { let n = 0; for (let x = 0; x < w; x++) n += dark[y * w + x]; return n >= w * BLACK_SHARE; };
  const colBlack = (x: number) => { let n = 0; for (let y = 0; y < h; y++) n += dark[y * w + x]; return n >= h * BLACK_SHARE; };
  let top = 0; while (top < h && rowBlack(top)) top++;
  let bottom = 0; while (bottom < h - top && rowBlack(h - 1 - bottom)) bottom++;
  let left = 0; while (left < w && colBlack(left)) left++;
  let right = 0; while (right < w - left && colBlack(w - 1 - right)) right++;
  return { top, bottom, left, right };
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

// Karelerde ortak (en küçük) bantları al, kaynak piksele çevir, anlamsız küçükleri at.
function finalize(frames: Bars[], w: number, h: number, srcW: number, srcH: number): Bars | null {
  if (!frames.length) return null;
  const min = (k: keyof Bars) => Math.min(...frames.map((f) => f[k]));
  const toSrcY = (v: number) => Math.round((v * srcH) / h);
  const toSrcX = (v: number) => Math.round((v * srcW) / w);
  const out: Bars = { top: toSrcY(min('top')), bottom: toSrcY(min('bottom')), left: toSrcX(min('left')), right: toSrcX(min('right')) };
  const sig = (px: number, dim: number) => (px >= Math.max(6, dim * 0.02) ? px : 0);
  out.top = sig(out.top, srcH); out.bottom = sig(out.bottom, srcH);
  out.left = sig(out.left, srcW); out.right = sig(out.right, srcW);
  return out.top || out.bottom || out.left || out.right ? out : null;
}

export async function detectImageBars(file: File): Promise<Bars | null> {
  try {
    const bmp = await createImageBitmap(file);
    const { ctx, w, h } = makeCanvas(bmp.width, bmp.height);
    ctx.drawImage(bmp, 0, 0, w, h);
    const f = barsOnCanvas(ctx, w, h);
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
    // Bant videonun tamamında olmalı: 5 farklı anda da görülmesi şart
    const times = dur ? [0.1, 0.3, 0.5, 0.7, 0.9].map((r) => r * dur) : [0];
    const { ctx, w, h } = makeCanvas(srcW || video.videoWidth, srcH || video.videoHeight);
    const frames: Bars[] = [];
    for (const t of times) {
      if (Math.abs(video.currentTime - t) > 0.01) { video.currentTime = t; await once('seeked', 5000); }
      ctx.drawImage(video, 0, 0, w, h);
      const f = barsOnCanvas(ctx, w, h);
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
