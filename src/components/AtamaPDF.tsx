import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import type { MatchResult, Assignment } from '../utils/matching';

Font.register({ family: 'Roboto', src: '/fonts/roboto-regular.ttf' });
Font.register({ family: 'Roboto-Bold', src: '/fonts/roboto-bold.ttf' });

const C = {
  ink: '#1e293b',
  sub: '#64748b',
  faint: '#94a3b8',
  line: '#e2e8f0',
  emerald: '#059669',
  emeraldBg: '#ecfdf5',
  amber: '#b45309',
  amberBg: '#fffbeb',
  rose: '#be123c',
  roseBg: '#fff1f2',
  slateBg: '#f8fafc',
  primary: '#6d28d9',
};

const s = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 56, paddingHorizontal: 36, fontFamily: 'Roboto', color: C.ink, fontSize: 9.5 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, borderBottomWidth: 3, borderBottomColor: C.primary, paddingBottom: 14 },
  wordmark: { fontSize: 26, fontFamily: 'Roboto-Bold', color: C.primary, letterSpacing: 1 },
  wordmarkDot: { color: C.amber },
  headRight: { alignItems: 'flex-end' },
  kicker: { fontSize: 8, color: C.primary, fontFamily: 'Roboto-Bold', letterSpacing: 1, textTransform: 'uppercase' },
  title: { fontSize: 17, fontFamily: 'Roboto-Bold', marginTop: 8, color: C.ink },
  subtitle: { fontSize: 9, color: C.sub, marginTop: 3 },
  date: { fontSize: 8.5, color: C.faint },

  summaryRow: { flexDirection: 'row', gap: 10, marginTop: 16, marginBottom: 22 },
  statBox: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 12, backgroundColor: C.slateBg },
  statVal: { fontSize: 22, fontFamily: 'Roboto-Bold' },
  statLabel: { fontSize: 8, color: C.sub, marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.5 },

  sectionTitle: { fontSize: 12, fontFamily: 'Roboto-Bold', marginBottom: 2 },
  sectionDesc: { fontSize: 8.5, color: C.faint, marginBottom: 10 },
  sectionWrap: { marginBottom: 22 },

  // Assignment card
  aCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 10, marginBottom: 7 },
  aLeft: { width: '40%' },
  aArrow: { width: '6%', alignItems: 'center', color: C.faint, fontSize: 12 },
  aRight: { width: '34%' },
  aBadgeWrap: { width: '20%', alignItems: 'flex-end' },
  nameTxt: { fontSize: 10, fontFamily: 'Roboto-Bold', color: C.ink },
  metaTxt: { fontSize: 8, color: C.sub, marginTop: 2 },
  badge: { fontSize: 7.5, fontFamily: 'Roboto-Bold', paddingVertical: 3, paddingHorizontal: 6, borderRadius: 4, textAlign: 'center' },
  badgeExact: { backgroundColor: C.emeraldBg, color: C.emerald },
  badgeTol: { backgroundColor: C.amberBg, color: C.amber },
  reviseNote: { fontSize: 7.5, color: C.amber, marginTop: 6, paddingLeft: 4, borderLeftWidth: 2, borderLeftColor: '#fbbf24' },

  // Unmatched / empty rows
  flagCard: { borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 7 },
  flagRose: { borderColor: '#fecdd3', backgroundColor: C.roseBg },
  flagAmber: { borderColor: '#fde68a', backgroundColor: C.amberBg },
  flagHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reasonTxt: { fontSize: 8.5, marginTop: 5 },
  actionTxt: { fontSize: 8.5, fontFamily: 'Roboto-Bold', marginTop: 5 },

  footer: { position: 'absolute', bottom: 26, left: 36, right: 36, textAlign: 'center', color: C.faint, fontSize: 7.5, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8 },
  pageNo: { position: 'absolute', bottom: 26, right: 36, color: C.faint, fontSize: 7.5 },
});

function gcd(a: number, b: number): number { return b ? gcd(b, a % b) : a; }
function ratioLabel(w?: number, h?: number): string {
  if (!w || !h) return '-';
  const g = gcd(w, h) || 1;
  const rw = w / g, rh = h / g;
  if (rw <= 40 && rh <= 40) return `${rw}:${rh}`;
  return (w / h).toFixed(2);
}
const dims = (w?: number, h?: number) => (w && h ? `${w} × ${h}` : '-');
const screenCount = (n: number) => (n > 1 ? `${n} ekran` : '1 ekran');

type Props = { result: MatchResult; tolerance: number; locationName?: string };

const AtamaPDF: React.FC<Props> = ({ result, tolerance, locationName = 'Terminal Kadıköy' }) => {
  const { assignments, unmatchedContents, emptyPlaylists } = result;
  const risky = assignments.filter((a) => !!a.riskNote);
  const clean = assignments.filter((a) => !a.riskNote);
  const now = new Date().toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const card = (a: Assignment, i: number) => {
    const cleanExact = a.resolutionExact;
    const sameRatio = a.klass === 'EXACT';
    const badgeText = cleanExact ? 'TAM UYUM' : sameRatio ? 'RİSKLİ · ÖLÇEK FARKLI' : `%${a.deviation.toFixed(1)} · KULLANILABİLİR`;
    const pl = a.playlist;
    const ctrls = pl.controllers.map((c) => c.name).join(', ');
    return (
      <View key={i} style={s.aCard} wrap={false}>
        <View style={s.aLeft}>
          <Text style={s.nameTxt}>{a.content.filename}</Text>
          <Text style={s.metaTxt}>{dims(a.content.width, a.content.height)} · {ratioLabel(a.content.width, a.content.height)} · {a.content.codec_name || '-'}</Text>
        </View>
        <Text style={s.aArrow}>»</Text>
        <View style={s.aRight}>
          <Text style={s.nameTxt}>{pl.name}</Text>
          <Text style={s.metaTxt}>{dims(pl.targetWidth, pl.targetHeight)} · {ratioLabel(pl.targetWidth, pl.targetHeight)} · {screenCount(pl.screenCount)}{ctrls ? ` · ${ctrls}` : ''}</Text>
        </View>
        <View style={s.aBadgeWrap}>
          <Text style={[s.badge, cleanExact ? s.badgeExact : s.badgeTol]}>{badgeText}</Text>
        </View>
        {a.riskNote && (<Text style={[s.reviseNote, { width: '100%' }]} wrap>{a.riskNote}</Text>)}
        {!a.riskNote && !sameRatio && !cleanExact && (
          <Text style={[s.reviseNote, { width: '100%' }]} wrap>
            Birebir oran değil. İdeal görüntü için içeriğin {dims(pl.targetWidth, pl.targetHeight)} ({ratioLabel(pl.targetWidth, pl.targetHeight)}) oranında hazırlanması önerilir; mevcut hâliyle %{a.deviation.toFixed(1)} farkla kullanılabilir.
          </Text>
        )}
      </View>
    );
  };

  return (
    <Document title={`${locationName} — İçerik / Ekran Eşleştirme Raporu`}>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.wordmark}>VECTA<Text style={s.wordmarkDot}>.</Text></Text>
            <Text style={s.kicker}>{locationName} · İçerik Atama Raporu</Text>
            <Text style={s.title}>İçerik / Ekran Eşleştirme Raporu</Text>
            <Text style={s.subtitle}>
              Ajans içerikleri ekran çözünürlüğü, en-boy oranı ve oynatıcı (codec / FPS / bitrate) kapasitesine göre değerlendirilmiştir.
            </Text>
          </View>
          <View style={s.headRight}>
            <Text style={s.date}>{now}</Text>
          </View>
        </View>

        {/* Summary */}
        <View style={s.summaryRow}>
          <View style={s.statBox}>
            <Text style={[s.statVal, { color: C.emerald }]}>{assignments.length}</Text>
            <Text style={s.statLabel}>Eşleşen İçerik</Text>
          </View>
          <View style={s.statBox}>
            <Text style={[s.statVal, { color: C.rose }]}>{unmatchedContents.length}</Text>
            <Text style={s.statLabel}>Uymayan İçerik</Text>
          </View>
          <View style={s.statBox}>
            <Text style={[s.statVal, { color: C.amber }]}>{risky.length}</Text>
            <Text style={s.statLabel}>Riskli Eşleşme</Text>
          </View>
          <View style={s.statBox}>
            <Text style={[s.statVal, { color: C.sub }]}>{emptyPlaylists.length}</Text>
            <Text style={s.statLabel}>Boş Kalan Playlist</Text>
          </View>
        </View>

        {/* Riskli eşleşmeler (önce, dikkat çekici) */}
        {risky.length > 0 && (
          <View style={s.sectionWrap}>
            <Text style={[s.sectionTitle, { color: C.amber }]}>Riskli Eşleşmeler — Dikkat</Text>
            <Text style={s.sectionDesc}>Eşleşti ve oynatılır, ancak içerik ekranın birebir ölçüsünde değil; döndürülerek/ölçeklenerek gösterilir.</Text>
            {risky.map((a, i) => card(a, i))}
          </View>
        )}

        {/* Sorunsuz eşleşmeler */}
        {clean.length > 0 && (
          <View style={s.sectionWrap}>
            <Text style={s.sectionTitle}>Eşleşen İçerikler</Text>
            <Text style={s.sectionDesc}>Bu içerikler ilgili playlistlere (ekranlara) sorunsuz yüklenebilir.</Text>
            {clean.map((a, i) => card(a, i))}
          </View>
        )}

        {/* 2. Uymayan içerikler */}
        {unmatchedContents.length > 0 && (
          <View style={s.sectionWrap}>
            <Text style={s.sectionTitle}>2 · Hiçbir Ekrana Uymayan İçerikler</Text>
            <Text style={s.sectionDesc}>Bu içeriklerin revize edilmesi gerekiyor.</Text>
            {unmatchedContents.map((u, i) => {
              const bp = u.bestPlaylist;
              let action = '';
              if (u.kind === 'INVALID') {
                action = 'Lütfen geçerli bir video/görsel dosyası olarak yeniden gönderin.';
              } else if (u.kind === 'DEVICE' && bp) {
                action = `Lütfen ${bp.name} için codec/çözünürlük/bitrate açısından uygun formatta yeniden hazırlayın (öneri: H.264/H.265, ${dims(bp.targetWidth, bp.targetHeight)}).`;
              } else if (u.kind === 'CONTENTION' && bp) {
                action = `Bu içerik için uygun playlist başka bir içeriğe atandı. ${bp.name} (${dims(bp.targetWidth, bp.targetHeight)}) oranına uygun ek/alternatif içerik gönderebilirsiniz.`;
              } else if (bp) {
                action = `Lütfen bu içeriği ${bp.name} (${dims(bp.targetWidth, bp.targetHeight)} · ${ratioLabel(bp.targetWidth, bp.targetHeight)}) oranına göre revize edin.`;
              } else {
                action = 'Lütfen Terminal Kadıköy ekran oranlarından birine göre revize edin.';
              }
              return (
                <View key={i} style={[s.flagCard, s.flagRose]} wrap={false}>
                  <View style={s.flagHead}>
                    <Text style={s.nameTxt}>{u.content.filename}</Text>
                    <Text style={s.metaTxt}>{dims(u.content.width, u.content.height)} · {ratioLabel(u.content.width, u.content.height)} · {u.content.codec_name || '-'}</Text>
                  </View>
                  <Text style={[s.reasonTxt, { color: C.sub }]}>{u.reason}</Text>
                  <Text style={[s.actionTxt, { color: C.rose }]}>Öneri: {action}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* 3. Boş playlistler */}
        {emptyPlaylists.length > 0 && (
          <View style={s.sectionWrap}>
            <Text style={s.sectionTitle}>3 · İçerik Bekleyen (Boş Kalan) Playlistler</Text>
            <Text style={s.sectionDesc}>Yüklenen içerikler arasından bu playlistlere uygun içerik çıkmadı.</Text>
            {emptyPlaylists.map((pl, i) => (
              <View key={i} style={[s.flagCard, s.flagAmber]} wrap={false}>
                <View style={s.flagHead}>
                  <Text style={s.nameTxt}>{pl.name}</Text>
                  <Text style={s.metaTxt}>{dims(pl.targetWidth, pl.targetHeight)} · {ratioLabel(pl.targetWidth, pl.targetHeight)} · {screenCount(pl.screenCount)}</Text>
                </View>
                <Text style={[s.actionTxt, { color: C.amber }]}>
                  Öneri: Bu playlist için {dims(pl.targetWidth, pl.targetHeight)} ({ratioLabel(pl.targetWidth, pl.targetHeight)}) oranında içerik göndermeniz gerekiyor.
                </Text>
              </View>
            ))}
          </View>
        )}

        <Text style={s.footer} fixed>
          Bu rapor Vecta İçerik Kontrol Platformu tarafından otomatik oluşturulmuştur · Tolerans eşiği: %{tolerance}
        </Text>
        <Text style={s.pageNo} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
      </Page>
    </Document>
  );
};

export default AtamaPDF;
