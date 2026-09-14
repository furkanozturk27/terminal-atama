import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import type { Playlist } from '../data/terminalKadikoy';

Font.register({
  family: 'Inter',
  fonts: [
    { src: '/fonts/inter-regular.ttf', fontWeight: 400 },
    { src: '/fonts/inter-semibold.ttf', fontWeight: 600 },
    { src: '/fonts/inter-bold.ttf', fontWeight: 700 },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

const C = { ink: '#0f172a', body: '#334155', muted: '#64748b', faint: '#94a3b8', hair: '#e5e7eb', accent: '#6d28d9', tile: '#f8fafc', webm: '#059669', webmBg: '#ecfdf5', webmBd: '#a7f3d0' };

const s = StyleSheet.create({
  page: { paddingTop: 42, paddingBottom: 54, paddingHorizontal: 44, fontFamily: 'Inter', color: C.body, fontSize: 9 },
  kicker: { fontSize: 8, fontWeight: 600, color: C.accent, letterSpacing: 2, textTransform: 'uppercase' },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 6 },
  title: { fontSize: 19, fontWeight: 700, color: C.ink, letterSpacing: -0.3 },
  date: { fontSize: 8, color: C.faint },
  intro: { fontSize: 9, color: C.muted, marginTop: 6, lineHeight: 1.5, maxWidth: 460 },
  rule: { height: 1, backgroundColor: C.hair, marginTop: 14, marginBottom: 18 },

  thead: { flexDirection: 'row', backgroundColor: C.tile, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.hair, paddingVertical: 8, paddingHorizontal: 10 },
  th: { fontSize: 7, fontWeight: 600, color: C.muted, letterSpacing: 0.6, textTransform: 'uppercase' },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingVertical: 11, paddingHorizontal: 10, alignItems: 'center' },

  cEkran: { width: '30%', paddingRight: 8 },
  cOlcu: { width: '17%' },
  cYon: { width: '8%' },
  cAdet: { width: '6%' },
  cCihaz: { width: '15%' },
  cLimit: { width: '24%' },

  ekran: { fontSize: 9.5, fontWeight: 600, color: C.ink },
  olcu: { fontSize: 11, fontWeight: 700, color: C.accent },
  olcuSub: { fontSize: 7, color: C.faint, marginTop: 1 },
  cell: { fontSize: 9, color: C.body },
  webmTag: { fontSize: 6.5, fontWeight: 700, color: C.webm, marginTop: 3, letterSpacing: 0.3 },
  limRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginBottom: 1 },
  limCodec: { fontSize: 7, fontWeight: 700, color: C.muted, width: 30 },
  limVal: { fontSize: 8, color: C.ink },

  fmtBox: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, backgroundColor: C.tile, borderWidth: 1, borderColor: C.hair, borderRadius: 8, padding: 11, marginBottom: 16 },
  fmtItem: { flexDirection: 'row', alignItems: 'center', gap: 5, marginRight: 14 },
  fmtLabel: { fontSize: 7, fontWeight: 700, color: C.faint, letterSpacing: 0.5, textTransform: 'uppercase' },
  fmtVal: { fontSize: 9, fontWeight: 600, color: C.ink },
  fmtNote: { fontSize: 8, color: C.muted, width: '100%', marginTop: 2 },
  fmtDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.webm },
  footer: { position: 'absolute', bottom: 26, left: 44, right: 44, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: C.hair, paddingTop: 8 },
  footTxt: { fontSize: 7.5, color: C.faint },
});

function gcd(a: number, b: number): number { return b ? gcd(b, a % b) : a; }
function ratioLabel(w: number, h: number): string {
  const g = gcd(w, h) || 1; const rw = w / g, rh = h / g;
  return rw <= 40 && rh <= 40 ? `${rw}:${rh}` : (w / h).toFixed(2);
}

type Props = { playlists: Playlist[]; locationName?: string };

const OlcuFoyuPDF: React.FC<Props> = ({ playlists, locationName = 'Terminal Kadıköy' }) => {
  const now = new Date().toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' });
  const hasWebm = (p: Playlist) => p.controllers.length > 0 && p.controllers.every((c) => 'VP9' in c.codec_limits || 'VP8' in c.codec_limits);
  const webmScreens = playlists.filter(hasWebm).map((p) => p.name);
  // Playlistteki tüm cihazların ortak (en kısıtlı) FPS/bitrate limiti — bir codec için
  const cap = (p: Playlist, family: 'H.264' | 'H.265'): { fps: number | null; br: number | null } | null => {
    if (!p.controllers.length) return null;
    let fps = Infinity, br = Infinity;
    for (const c of p.controllers) {
      const key = Object.keys(c.codec_limits).find((k) => {
        const kl = k.toLowerCase();
        return family === 'H.264' ? kl.includes('264') : kl.includes('265') || kl.includes('hevc');
      });
      if (!key) return null;
      const lim = c.codec_limits[key];
      if (lim.max_fps != null) fps = Math.min(fps, lim.max_fps);
      if (lim.max_bitrate_mbps != null) br = Math.min(br, lim.max_bitrate_mbps);
    }
    return { fps: isFinite(fps) ? fps : null, br: isFinite(br) ? br : null };
  };
  const capText = (c: { fps: number | null; br: number | null } | null) =>
    c ? [c.fps != null ? `${c.fps} fps` : null, c.br != null ? `${c.br} Mbps` : null].filter(Boolean).join(' · ') : '-';
  return (
    <Document title={`${locationName} — Ekran Ölçü Föyü`}>
      <Page size="A4" style={s.page}>
        <Text style={s.kicker}>{locationName}  ·  Ekran Ölçü Föyü</Text>
        <View style={s.titleRow}>
          <Text style={s.title}>İçerik Hazırlama Ölçüleri</Text>
          <Text style={s.date}>{now}</Text>
        </View>
        <Text style={s.intro}>
          İçerikleri lütfen aşağıdaki birebir ölçülerde hazırlayın. Farklı ölçüde gönderilen içerikler oynatıcı tarafından
          döndürülerek/ölçeklenerek gösterilir; bu durum görüntü kalitesi açısından risklidir. İkiz ekranlar tek ölçüde tek içerik alır.
        </Text>
        <View style={s.rule} />

        <View style={s.fmtBox}>
          <View style={s.fmtItem}><Text style={s.fmtLabel}>Video</Text><Text style={s.fmtVal}>MP4 · H.264 / H.265</Text></View>
          <View style={s.fmtItem}><Text style={s.fmtLabel}>Görsel</Text><Text style={s.fmtVal}>JPEG · WebP</Text></View>
          <View style={s.fmtItem}><View style={s.fmtDot} /><Text style={s.fmtVal}>WebM</Text></View>
          <Text style={s.fmtNote}>
            Video (MP4) ve görsel (JPEG, WebP) tüm ekranlarda geçerlidir. WebM yalnızca “+ WebM” işaretli ekranlarda{webmScreens.length ? ` (${webmScreens.join(', ')})` : ''} oynatılır. Aşağıdaki “Video Limiti” sütunu her ekranın maksimum FPS ve bitrate sınırını gösterir; bu sınırlar aşılırsa içerik oynatılmaz.
          </Text>
        </View>

        <View style={s.thead}>
          <Text style={[s.th, s.cEkran]}>Ekran / Playlist</Text>
          <Text style={[s.th, s.cOlcu]}>Doğru Ölçü</Text>
          <Text style={[s.th, s.cYon]}>Yön</Text>
          <Text style={[s.th, s.cAdet]}>Adet</Text>
          <Text style={[s.th, s.cCihaz]}>Cihaz</Text>
          <Text style={[s.th, s.cLimit]}>Video Limiti (maks)</Text>
        </View>

        {playlists.map((p, i) => {
          const portrait = p.targetHeight > p.targetWidth;
          return (
            <View key={i} style={s.row} wrap={false}>
              <View style={s.cEkran}><Text style={s.ekran}>{p.name}</Text></View>
              <View style={s.cOlcu}><Text style={s.olcu}>{p.targetWidth} × {p.targetHeight}</Text><Text style={s.olcuSub}>{ratioLabel(p.targetWidth, p.targetHeight)} · piksel</Text></View>
              <Text style={[s.cell, s.cYon]}>{portrait ? 'Dikey' : 'Yatay'}</Text>
              <Text style={[s.cell, s.cAdet]}>{p.screenCount}</Text>
              <View style={s.cCihaz}>
                <Text style={s.cell}>{p.controllers.map((c) => c.name).join(', ') || '-'}</Text>
                {hasWebm(p) && <Text style={s.webmTag}>+ WebM</Text>}
              </View>
              <View style={s.cLimit}>
                <View style={s.limRow}><Text style={s.limCodec}>H.264</Text><Text style={s.limVal}>{capText(cap(p, 'H.264'))}</Text></View>
                <View style={s.limRow}><Text style={s.limCodec}>H.265</Text><Text style={s.limVal}>{capText(cap(p, 'H.265'))}</Text></View>
              </View>
            </View>
          );
        })}

        <View style={s.footer} fixed>
          <Text style={s.footTxt}>{locationName} · Ekran Ölçü Föyü</Text>
          <Text style={s.footTxt} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
};

export default OlcuFoyuPDF;
