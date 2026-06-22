// Terminal Kadıköy playlist/ekran verisi + kontrol cihazı limitleri.
// Cihaz limitleri dump.sql'den alınmıştır (controller_devices).
// Playlist çözünürlükleri/cihazları artık kullanıcı tarafından arayüzden düzenlenebilir;
// buradaki DEFAULT_PLAYLISTS yalnızca ilk/sıfırlama değeridir.

export type CodecLimit = {
  max_width?: number;
  max_height?: number;
  max_fps?: number;
  max_bitrate_mbps?: number;
};

export type Controller = {
  name: string;
  codec_limits: Record<string, CodecLimit>;
};

// Kısa yardımcı: {maxW,maxH,maxFps?,maxBitrate?}
const L = (w: number, h: number, f?: number, b?: number): CodecLimit => ({
  max_width: w, max_height: h,
  ...(f !== undefined ? { max_fps: f } : {}),
  ...(b !== undefined ? { max_bitrate_mbps: b } : {}),
});

// Tüm kontrol cihazları (dump.sql -> controller_devices)
export const CONTROLLERS_LIST: Controller[] = [
  { name: 'TU15 PRO', codec_limits: { JPEG: L(4096, 2304, 60, 100), 'H.265/HEVC': L(4096, 2304, 60, 100), 'H.264': L(4096, 2304, 30, 80) } },
  { name: 'TU20 PRO', codec_limits: { JPEG: L(4096, 2304, 60, 100), 'H.265/HEVC': L(4096, 2304, 60, 100), 'H.264': L(4096, 2304, 30, 80) } },
  { name: 'TU4K PRO', codec_limits: { JPEG: L(8000, 8000, 60, 100), 'H.265/HEVC': L(4096, 2304, 60, 100), 'H.264': L(4096, 2304, 30, 100) } },
  { name: 'TU40 PRO', codec_limits: { JPEG: L(8000, 8000, 60, 100), 'H.265/HEVC': L(4096, 2304, 60, 100), 'H.264': L(4096, 2304, 30, 100) } },
  { name: 'T10 PLUS', codec_limits: { JPEG: L(4096, 2304, 60, 100), 'H.264': L(4096, 2304, 30, 60), 'H.265/HEVC': L(4096, 2304, 60, 100) } },
  { name: 'T20 PLUS', codec_limits: { JPEG: L(4096, 2304, 60, 100), 'H.264': L(4096, 2304, 30, 60), 'H.265/HEVC': L(4096, 2304, 60, 100) } },
  { name: 'TB30', codec_limits: { JPEG: L(4096, 2304, 60, 100), 'H.264': L(4096, 2304, 30, 80), 'H.265/HEVC': L(8000, 8000, 60, 100) } },
  { name: 'TB40', codec_limits: { JPEG: L(4096, 2304, 60, 100), 'H.264': L(4096, 2304, 30, 80), 'H.265/HEVC': L(4096, 2304, 60, 100) } },
  { name: 'TB50', codec_limits: { JPEG: L(4096, 2304, 60, 100), 'H.264': L(4096, 2304, 30, 80), 'H.265/HEVC': L(4096, 2304, 60, 100) } },
  { name: 'TB60', codec_limits: { JPEG: L(4096, 2304, 60, 100), 'H.264': L(4096, 2304, 30, 80), 'H.265/HEVC': L(4096, 2304, 60, 100) } },
  { name: 'TCC160', codec_limits: { JPEG: L(4096, 2304, 60, 100), 'H.264': L(4096, 2304, 30, 80), 'H.265/HEVC': L(4096, 2304, 60, 100) } },
  { name: 'LCB2K', codec_limits: { JPEG: L(4096, 2304, 60, 100), 'H.264': L(3840, 2160, 30, 100), 'H.265/HEVC': L(3840, 2160, 60, 100) } },
  { name: 'LCB4K', codec_limits: { JPEG: L(4096, 2304, 60, 100), 'H.264': L(4096, 2304, 30, 80), 'H.265/HEVC': L(4096, 2304, 60, 100) } },
  { name: 'TB1-4G', codec_limits: { JPEG: L(4096, 2160), 'H.264': L(1920, 1088, 30, 57), 'H.265': L(1920, 1088, 60, 57) } },
  // T1-4G: 1080p sınıfı Taurus oynatıcı (TB1-4G ile aynı decode limiti). Dikey içerik
  // yön-duyarlı kontrolle 1920×1088 zarfına sığarsa oynatılabilir.
  { name: 'T1-4G', codec_limits: { JPEG: L(4096, 2160), 'H.264': L(1920, 1088, 30, 57), 'H.265': L(1920, 1088, 60, 57) } },
];

export const CONTROLLERS_BY_NAME: Record<string, Controller> = Object.fromEntries(
  CONTROLLERS_LIST.map((c) => [c.name, c])
);

// Düzenlenebilir playlist (localStorage'a bu şekilde kaydedilir)
export type EditablePlaylist = {
  id: string;
  name: string;
  targetWidth: number;   // içeriğin hazırlanması gereken hedef ölçü
  targetHeight: number;
  controllerNames: string[]; // bu playlistteki ekranların cihazları (hepsi oynatabilmeli)
  screenCount: number;   // kaç fiziksel ekran (yalnızca gösterim)
};

// Çalışma zamanı playlist (cihazlar çözülmüş)
export type Playlist = EditablePlaylist & { controllers: Controller[] };

export function hydratePlaylist(e: EditablePlaylist): Playlist {
  return { ...e, controllers: e.controllerNames.map((n) => CONTROLLERS_BY_NAME[n]).filter(Boolean) };
}

// Varsayılan playlistler — DİKKAT: dump.sql'den geldi, gerçek LED sistemiyle
// doğrulanmalı/düzeltilmeli (arayüzdeki "Ekranları Düzenle" panelinden).
export const DEFAULT_PLAYLISTS: EditablePlaylist[] = [
  { id: 'bar', name: 'İÇ BARLAR (Küçük + Büyük)', targetWidth: 2304, targetHeight: 1280, controllerNames: ['TU20 PRO'], screenCount: 2 },
  { id: 'merdiven', name: 'MERDİVEN EKRANLAR', targetWidth: 1536, targetHeight: 1024, controllerNames: ['TB60'], screenCount: 2 },
  { id: 'arabica', name: 'ARABICA / PARİBU ART KÖŞE', targetWidth: 1344, targetHeight: 588, controllerNames: ['TU40 PRO', 'TB40'], screenCount: 2 },
  { id: 'kahve', name: 'KAHVE DÜNYASI YANI', targetWidth: 1008, targetHeight: 588, controllerNames: ['TB40'], screenCount: 1 },
  { id: 'cezayir', name: 'CEZAYİR USTA / CAFER EROĞLU', targetWidth: 700, targetHeight: 1225, controllerNames: ['TB40', 'TB50'], screenCount: 2 },
  { id: 'rossman', name: 'ROSSMAN YANI', targetWidth: 504, targetHeight: 840, controllerNames: ['T1-4G'], screenCount: 1 },
  { id: 'paribu-duvar', name: 'PARİBU ART DUVAR YANI', targetWidth: 336, targetHeight: 672, controllerNames: ['T1-4G'], screenCount: 1 },
  { id: 'raketler', name: 'RAKETLER', targetWidth: 336, targetHeight: 588, controllerNames: ['TB1-4G'], screenCount: 7 },
];
