import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import type { Playlist } from '../data/terminalKadikoy';

Font.register({ family: 'Roboto', src: '/fonts/roboto-regular.ttf' });
Font.register({ family: 'Roboto-Bold', src: '/fonts/roboto-bold.ttf' });

const C = { ink: '#1e293b', sub: '#64748b', faint: '#94a3b8', line: '#e2e8f0', primary: '#6d28d9', slateBg: '#f8fafc' };

const s = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 50, paddingHorizontal: 36, fontFamily: 'Roboto', color: C.ink, fontSize: 9.5 },
  header: { borderBottomWidth: 3, borderBottomColor: C.primary, paddingBottom: 14, marginBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  wordmark: { fontSize: 26, fontFamily: 'Roboto-Bold', color: C.primary, letterSpacing: 1 },
  kicker: { fontSize: 8, color: C.primary, fontFamily: 'Roboto-Bold', letterSpacing: 1, textTransform: 'uppercase', marginTop: 6 },
  title: { fontSize: 17, fontFamily: 'Roboto-Bold', marginTop: 6 },
  intro: { fontSize: 9.5, color: C.sub, marginBottom: 16, lineHeight: 1.4 },
  date: { fontSize: 8.5, color: C.faint },
  tableHead: { flexDirection: 'row', backgroundColor: C.slateBg, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.line, paddingVertical: 7, paddingHorizontal: 6 },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderColor: C.line, paddingVertical: 8, paddingHorizontal: 6, alignItems: 'center' },
  th: { fontSize: 8, fontFamily: 'Roboto-Bold', color: C.sub, textTransform: 'uppercase' },
  cEkran: { width: '34%' }, cOlcu: { width: '20%' }, cOran: { width: '13%' }, cYon: { width: '13%' }, cAdet: { width: '8%' }, cCihaz: { width: '12%' },
  ekranName: { fontSize: 10, fontFamily: 'Roboto-Bold', color: C.ink },
  cell: { fontSize: 9, color: C.ink },
  cellSub: { fontSize: 8, color: C.faint },
  olcuBig: { fontSize: 11, fontFamily: 'Roboto-Bold', color: C.primary },
  footer: { position: 'absolute', bottom: 26, left: 36, right: 36, textAlign: 'center', color: C.faint, fontSize: 7.5, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8 },
});

function gcd(a: number, b: number): number { return b ? gcd(b, a % b) : a; }
function ratioLabel(w: number, h: number): string {
  const g = gcd(w, h) || 1; const rw = w / g, rh = h / g;
  return rw <= 40 && rh <= 40 ? `${rw}:${rh}` : (w / h).toFixed(2);
}

type Props = { playlists: Playlist[]; locationName?: string };

const OlcuFoyuPDF: React.FC<Props> = ({ playlists, locationName = 'Terminal Kadıköy' }) => {
  const now = new Date().toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' });
  return (
    <Document title={`${locationName} — Ekran Ölçü Föyü`}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.wordmark}>VECTA<Text style={{ color: '#b45309' }}>.</Text></Text>
            <Text style={s.kicker}>{locationName} · Ekran Ölçü Föyü</Text>
            <Text style={s.title}>İçerik Hazırlama Ölçüleri</Text>
          </View>
          <Text style={s.date}>{now}</Text>
        </View>

        <Text style={s.intro}>
          Aşağıdaki ekranlar için içerikleri lütfen belirtilen <Text style={{ fontFamily: 'Roboto-Bold' }}>birebir ölçülerde</Text> hazırlayın.
          Farklı ölçüde gönderilen içerikler oynatıcı tarafından döndürülerek/ölçeklenerek gösterilir; bu durum görüntü kalitesi açısından risklidir.
          İkiz ekranlar tek ölçüde tek içerik alır.
        </Text>

        <View style={s.tableHead}>
          <Text style={[s.th, s.cEkran]}>Ekran / Playlist</Text>
          <Text style={[s.th, s.cOlcu]}>Doğru Ölçü</Text>
          <Text style={[s.th, s.cOran]}>Oran</Text>
          <Text style={[s.th, s.cYon]}>Yön</Text>
          <Text style={[s.th, s.cAdet]}>Adet</Text>
          <Text style={[s.th, s.cCihaz]}>Cihaz</Text>
        </View>

        {playlists.map((p, i) => {
          const portrait = p.targetHeight > p.targetWidth;
          return (
            <View key={i} style={s.row} wrap={false}>
              <View style={s.cEkran}><Text style={s.ekranName}>{p.name}</Text></View>
              <View style={s.cOlcu}><Text style={s.olcuBig}>{p.targetWidth} × {p.targetHeight}</Text><Text style={s.cellSub}>piksel</Text></View>
              <Text style={[s.cell, s.cOran]}>{ratioLabel(p.targetWidth, p.targetHeight)}</Text>
              <Text style={[s.cell, s.cYon]}>{portrait ? 'Dikey' : 'Yatay'}</Text>
              <Text style={[s.cell, s.cAdet]}>{p.screenCount}</Text>
              <Text style={[s.cell, s.cCihaz]}>{p.controllers.map((c) => c.name).join(', ') || '-'}</Text>
            </View>
          );
        })}

        <Text style={s.footer} fixed>
          Bu föy Vecta İçerik Kontrol Platformu tarafından oluşturulmuştur · {locationName}
        </Text>
      </Page>
    </Document>
  );
};

export default OlcuFoyuPDF;
