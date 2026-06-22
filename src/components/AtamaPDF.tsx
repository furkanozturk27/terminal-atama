import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import type { MatchResult, Assignment } from '../utils/matching';

Font.register({
  family: 'Inter',
  fonts: [
    { src: '/fonts/inter-regular.ttf', fontWeight: 400 },
    { src: '/fonts/inter-semibold.ttf', fontWeight: 600 },
    { src: '/fonts/inter-bold.ttf', fontWeight: 700 },
  ],
});
// Otomatik tireleme kapalı (tire eklenmesin). Uzun dosya adlarını,
// taşmayı/tireyi tamamen önlemek için deterministik olarak (mümkünse ayraçtan) böleriz.
Font.registerHyphenationCallback((word) => [word]);
function breakable(str: string, max = 34): string {
  const t = String(str || '');
  if (t.length <= max) return t;
  const out: string[] = [];
  let i = 0;
  while (i < t.length) {
    let end = Math.min(i + max, t.length);
    if (end < t.length) {
      const slice = t.slice(i, end);
      const sep = Math.max(slice.lastIndexOf('_'), slice.lastIndexOf('-'), slice.lastIndexOf('.'), slice.lastIndexOf('x'), slice.lastIndexOf('×'));
      if (sep > 12) end = i + sep + 1;
    }
    out.push(t.slice(i, end));
    i = end;
  }
  return out.join('\n');
}

const C = {
  ink: '#0f172a', body: '#334155', muted: '#64748b', faint: '#94a3b8',
  hair: '#e5e7eb', accent: '#6d28d9',
  emerald: '#047857', emeraldBg: '#ecfdf5', emeraldBd: '#a7f3d0',
  amber: '#b45309', amberBg: '#fffbeb', amberBd: '#fde68a',
  rose: '#be123c', roseBg: '#fff1f2', roseBd: '#fecdd3',
  tile: '#f8fafc',
};

const s = StyleSheet.create({
  page: { paddingTop: 42, paddingBottom: 54, paddingHorizontal: 44, fontFamily: 'Inter', color: C.body, fontSize: 9 },

  // Header
  kicker: { fontSize: 8, fontWeight: 600, color: C.accent, letterSpacing: 2, textTransform: 'uppercase' },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 6 },
  title: { fontSize: 19, fontWeight: 700, color: C.ink, letterSpacing: -0.3 },
  date: { fontSize: 8, color: C.faint },
  subtitle: { fontSize: 9, color: C.muted, marginTop: 6, lineHeight: 1.4, maxWidth: 430 },
  rule: { height: 1, backgroundColor: C.hair, marginTop: 14, marginBottom: 18 },

  // Summary tiles
  tiles: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  tile: { flex: 1, borderWidth: 1, borderColor: C.hair, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 12 },
  tileVal: { fontSize: 21, fontWeight: 700, marginBottom: 4 },
  tileLabel: { fontSize: 7, fontWeight: 600, color: C.muted, letterSpacing: 0.6, textTransform: 'uppercase' },

  // Section
  section: { marginBottom: 22 },
  secHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  secBar: { width: 3, height: 13, borderRadius: 2, marginRight: 8 },
  secTitle: { fontSize: 12, fontWeight: 700, color: C.ink },
  secCount: { fontSize: 8, fontWeight: 700, color: C.muted, marginLeft: 6 },
  secDesc: { fontSize: 8.5, color: C.faint, marginBottom: 11, marginLeft: 11 },

  // Table
  thead: { flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.hair },
  th: { fontSize: 7, fontWeight: 600, color: C.faint, letterSpacing: 0.6, textTransform: 'uppercase' },
  rowGroup: { borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingVertical: 10 },
  rowMain: { flexDirection: 'row', alignItems: 'flex-start' },

  colContent: { width: '41%', paddingRight: 10 },
  colArrow: { width: '5%', alignItems: 'center', justifyContent: 'center' },
  colScreen: { width: '32%', paddingRight: 10 },
  colStatus: { width: '22%', alignItems: 'flex-end' },

  name: { fontSize: 9, fontWeight: 600, color: C.ink, lineHeight: 1.25 },
  meta: { fontSize: 7.5, color: C.faint, marginTop: 3 },
  arrow: { fontSize: 11, color: C.faint },

  badge: { fontSize: 7, fontWeight: 700, paddingVertical: 3, paddingHorizontal: 7, borderRadius: 20, borderWidth: 1, textAlign: 'center' },
  bGreen: { backgroundColor: C.emeraldBg, color: C.emerald, borderColor: C.emeraldBd },
  bAmber: { backgroundColor: C.amberBg, color: C.amber, borderColor: C.amberBd },
  bRose: { backgroundColor: C.roseBg, color: C.rose, borderColor: C.roseBd },

  note: { marginTop: 8, marginLeft: 0, fontSize: 8, color: C.amber, lineHeight: 1.45, backgroundColor: C.amberBg, borderLeftWidth: 2, borderLeftColor: '#f59e0b', borderTopLeftRadius: 2, borderBottomLeftRadius: 2, paddingVertical: 5, paddingHorizontal: 8 },

  // Flag rows (uymayan / boş)
  flagRow: { borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingVertical: 10 },
  flagTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  reason: { fontSize: 8, color: C.muted, marginTop: 5, lineHeight: 1.4 },
  action: { fontSize: 8, fontWeight: 600, marginTop: 4, lineHeight: 1.4 },

  footer: { position: 'absolute', bottom: 26, left: 44, right: 44, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: C.hair, paddingTop: 8 },
  footTxt: { fontSize: 7.5, color: C.faint },
});

function gcd(a: number, b: number): number { return b ? gcd(b, a % b) : a; }
function ratioLabel(w?: number, h?: number): string {
  if (!w || !h) return '-';
  const g = gcd(w, h) || 1; const rw = w / g, rh = h / g;
  return rw <= 40 && rh <= 40 ? `${rw}:${rh}` : (w / h).toFixed(2);
}
const dims = (w?: number, h?: number) => (w && h ? `${w} × ${h}` : '-');
const scr = (n: number) => `${n} ekran`;

type Props = { result: MatchResult; tolerance: number; locationName?: string };

const AtamaPDF: React.FC<Props> = ({ result, tolerance, locationName = 'Terminal Kadıköy' }) => {
  const { assignments, unmatchedContents, emptyPlaylists } = result;
  const risky = assignments.filter((a) => !!a.riskNote);
  const clean = assignments.filter((a) => !a.riskNote);
  const now = new Date().toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const contentCell = (a: Assignment) => (
    <View style={s.colContent}>
      <Text style={s.name}>{breakable(a.content.filename)}</Text>
      <Text style={s.meta}>{dims(a.content.width, a.content.height)}  ·  {ratioLabel(a.content.width, a.content.height)}  ·  {a.content.codec_name || '-'}</Text>
    </View>
  );
  const screenCell = (a: Assignment) => (
    <View style={s.colScreen}>
      <Text style={s.name}>{a.playlist.name}</Text>
      <Text style={s.meta}>{dims(a.playlist.targetWidth, a.playlist.targetHeight)}  ·  {scr(a.playlist.screenCount)}  ·  {a.playlist.controllers.map((c) => c.name).join(', ') || '-'}</Text>
    </View>
  );

  const cleanRow = (a: Assignment, i: number) => (
    <View key={i} style={s.rowGroup} wrap={false}>
      <View style={s.rowMain}>
        {contentCell(a)}
        <View style={s.colArrow}><Text style={s.arrow}>→</Text></View>
        {screenCell(a)}
        <View style={s.colStatus}><Text style={[s.badge, s.bGreen]}>✓ TAM UYUM</Text></View>
      </View>
    </View>
  );

  const riskyRow = (a: Assignment, i: number) => {
    const label = a.klass === 'EXACT' ? 'RİSKLİ' : `%${a.deviation.toFixed(1)} FARK`;
    return (
      <View key={i} style={s.rowGroup} wrap={false}>
        <View style={s.rowMain}>
          {contentCell(a)}
          <View style={s.colArrow}><Text style={s.arrow}>→</Text></View>
          {screenCell(a)}
          <View style={s.colStatus}><Text style={[s.badge, s.bAmber]}>{label}</Text></View>
        </View>
        {a.riskNote && <Text style={s.note}>{a.riskNote}</Text>}
      </View>
    );
  };

  return (
    <Document title={`${locationName} — İçerik / Ekran Eşleştirme Raporu`}>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <Text style={s.kicker}>{locationName}  ·  İçerik Atama Raporu</Text>
        <View style={s.titleRow}>
          <Text style={s.title}>İçerik / Ekran Eşleştirme Raporu</Text>
          <Text style={s.date}>{now}</Text>
        </View>
        <Text style={s.subtitle}>
          Ajans içerikleri; ekran çözünürlüğü, en-boy oranı ve oynatıcı (codec / FPS / bitrate) kapasitesine göre değerlendirilmiştir.
        </Text>
        <View style={s.rule} />

        {/* Summary */}
        <View style={s.tiles}>
          <View style={s.tile}><Text style={[s.tileVal, { color: C.emerald }]}>{assignments.length}</Text><Text style={s.tileLabel}>Eşleşen İçerik</Text></View>
          <View style={s.tile}><Text style={[s.tileVal, { color: C.amber }]}>{risky.length}</Text><Text style={s.tileLabel}>Riskli Eşleşme</Text></View>
          <View style={s.tile}><Text style={[s.tileVal, { color: C.rose }]}>{unmatchedContents.length}</Text><Text style={s.tileLabel}>Uymayan İçerik</Text></View>
          <View style={s.tile}><Text style={[s.tileVal, { color: C.muted }]}>{emptyPlaylists.length}</Text><Text style={s.tileLabel}>Boş Playlist</Text></View>
        </View>

        {/* Riskli */}
        {risky.length > 0 && (
          <View style={s.section}>
            <View style={s.secHead}>
              <View style={[s.secBar, { backgroundColor: '#f59e0b' }]} />
              <Text style={s.secTitle}>Riskli Eşleşmeler</Text>
              <Text style={s.secCount}>{risky.length}</Text>
            </View>
            <Text style={s.secDesc}>Eşleşti ve oynatılır; ancak içerik ekranın birebir ölçüsünde değil — döndürülerek/ölçeklenerek gösterilir.</Text>
            <View style={s.thead}>
              <Text style={[s.th, s.colContent]}>İçerik</Text>
              <View style={s.colArrow} />
              <Text style={[s.th, s.colScreen]}>Önerilen Ekran</Text>
              <Text style={[s.th, s.colStatus, { textAlign: 'right' }]}>Durum</Text>
            </View>
            {risky.map(riskyRow)}
          </View>
        )}

        {/* Eşleşen */}
        {clean.length > 0 && (
          <View style={s.section}>
            <View style={s.secHead}>
              <View style={[s.secBar, { backgroundColor: C.emerald }]} />
              <Text style={s.secTitle}>Eşleşen İçerikler</Text>
              <Text style={s.secCount}>{clean.length}</Text>
            </View>
            <Text style={s.secDesc}>Bu içerikler ilgili ekranlara birebir ölçüde, sorunsuz yüklenebilir.</Text>
            <View style={s.thead}>
              <Text style={[s.th, s.colContent]}>İçerik</Text>
              <View style={s.colArrow} />
              <Text style={[s.th, s.colScreen]}>Önerilen Ekran</Text>
              <Text style={[s.th, s.colStatus, { textAlign: 'right' }]}>Durum</Text>
            </View>
            {clean.map(cleanRow)}
          </View>
        )}

        {/* Uymayan */}
        {unmatchedContents.length > 0 && (
          <View style={s.section}>
            <View style={s.secHead}>
              <View style={[s.secBar, { backgroundColor: C.rose }]} />
              <Text style={s.secTitle}>Hiçbir Ekrana Uymayan İçerikler</Text>
              <Text style={s.secCount}>{unmatchedContents.length}</Text>
            </View>
            <Text style={s.secDesc}>Bu içeriklerin revize edilmesi gerekiyor.</Text>
            {unmatchedContents.map((u, i) => {
              const bp = u.bestPlaylist;
              let action = '';
              if (u.kind === 'INVALID') action = 'Lütfen geçerli bir video/görsel dosyası olarak yeniden gönderin.';
              else if (u.kind === 'DEVICE' && bp) action = `Lütfen ${bp.name} için uygun formatta hazırlayın (öneri: H.264/H.265, ${dims(bp.targetWidth, bp.targetHeight)}).`;
              else if (u.kind === 'CONTENTION' && bp) action = `Uygun ekran (${bp.name}, ${dims(bp.targetWidth, bp.targetHeight)}) başka bir içeriğe atandı; bu orana uygun ek içerik gönderebilirsiniz.`;
              else if (bp) action = `Lütfen ${bp.name} (${dims(bp.targetWidth, bp.targetHeight)} · ${ratioLabel(bp.targetWidth, bp.targetHeight)}) oranına göre revize edin.`;
              else action = 'Lütfen ekran oranlarından birine göre revize edin.';
              return (
                <View key={i} style={s.flagRow} wrap={false}>
                  <View style={s.flagTop}>
                    <Text style={[s.name, { width: '70%' }]}>{breakable(u.content.filename)}</Text>
                    <Text style={[s.meta, { marginTop: 0, textAlign: 'right' }]}>{dims(u.content.width, u.content.height)}  ·  {ratioLabel(u.content.width, u.content.height)}  ·  {u.content.codec_name || '-'}</Text>
                  </View>
                  <Text style={s.reason}>{u.reason}</Text>
                  <Text style={[s.action, { color: C.rose }]}>Öneri — {action}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Boş */}
        {emptyPlaylists.length > 0 && (
          <View style={s.section}>
            <View style={s.secHead}>
              <View style={[s.secBar, { backgroundColor: C.muted }]} />
              <Text style={s.secTitle}>İçerik Bekleyen Ekranlar</Text>
              <Text style={s.secCount}>{emptyPlaylists.length}</Text>
            </View>
            <Text style={s.secDesc}>Yüklenen içerikler arasından bu ekranlara uygun içerik çıkmadı.</Text>
            {emptyPlaylists.map((p, i) => (
              <View key={i} style={s.flagRow} wrap={false}>
                <View style={s.flagTop}>
                  <Text style={s.name}>{p.name}</Text>
                  <Text style={[s.meta, { marginTop: 0 }]}>{dims(p.targetWidth, p.targetHeight)}  ·  {ratioLabel(p.targetWidth, p.targetHeight)}  ·  {scr(p.screenCount)}</Text>
                </View>
                <Text style={[s.action, { color: C.muted }]}>Bu ekran için {dims(p.targetWidth, p.targetHeight)} ({ratioLabel(p.targetWidth, p.targetHeight)}) oranında içerik göndermeniz gerekiyor.</Text>
              </View>
            ))}
          </View>
        )}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footTxt}>{locationName} · İçerik Atama Raporu</Text>
          <Text style={s.footTxt} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
};

export default AtamaPDF;
