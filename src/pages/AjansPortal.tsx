import React, { useEffect, useMemo, useState } from 'react';
import {
  Upload as UploadIcon, CheckCircle2, AlertTriangle, XCircle, Loader2, X, FileVideo, Image as ImageIcon,
  Send, FileText, Monitor, Wrench, Mail,
} from 'lucide-react';
import { pdf } from '@react-pdf/renderer';
import { upload } from '@vercel/blob/client';
import { analyzeMediaLocally } from '../utils/mediaInfo';
import { DEFAULT_PLAYLISTS, hydratePlaylist, type EditablePlaylist, type Playlist } from '../data/terminalKadikoy';
import { evaluateForPlaylist, h264Cap, parseFps, type Content, type SingleEval } from '../utils/matching';
import { warningIssues, isImageContent } from '../utils/contentIssues';
import { apiJson, API_BASE } from '../utils/api';
import FixButton, { verificationSummary } from '../components/FixButton';
import OlcuFoyuPDF from '../components/OlcuFoyuPDF';

const TOLERANCE = 10;

type LinkInfo = { token: string; campaign: string; agency: string; active: boolean; uploadsEnabled: boolean };
type Entry = { id: string; file: File; analyzing: boolean; metadata?: Content; error?: string; fixed?: boolean };
type Verdict =
  | { kind: 'ok' | 'risky'; ev: SingleEval; notes: string[] }
  | { kind: 'blocked'; ev: SingleEval }
  | { kind: 'nofit'; nearest?: SingleEval };

// Her dosyayı diğerlerinden bağımsız değerlendir (aynı ekrana alternatif içerik göndermek serbest).
function judge(c: Content, playlists: Playlist[]): Verdict {
  const evs = playlists.map((p) => evaluateForPlaylist(c, p, TOLERANCE));
  const score = (e: SingleEval) => (e.resolutionExact ? 0 : 1000) + (e.deviation ?? 999);
  const ok = evs.filter((e) => e.assignable).sort((a, b) => score(a) - score(b));
  const warns = warningIssues(c).map((i) => i.text);
  if (ok.length) {
    const best = ok[0];
    const notes = [...(best.riskNote ? [best.riskNote] : []), ...warns];
    return { kind: best.resolutionExact && !warns.length ? 'ok' : 'risky', ev: best, notes };
  }
  const ratioOk = evs.filter((e) => e.deviation !== null && e.deviation <= TOLERANCE).sort((a, b) => a.deviation! - b.deviation!);
  if (ratioOk.length) return { kind: 'blocked', ev: ratioOk[0] };
  const nearest = evs.filter((e) => e.deviation !== null).sort((a, b) => a.deviation! - b.deviation!)[0];
  return { kind: 'nofit', nearest };
}

const sizeText = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);
const safePath = (name: string) => name.normalize('NFKD').replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').slice(-120) || 'dosya';

export default function AjansPortal({ token }: { token: string }) {
  const [link, setLink] = useState<LinkInfo | null>(null);
  const [linkErr, setLinkErr] = useState('');
  const [editable, setEditable] = useState<EditablePlaylist[]>(DEFAULT_PLAYLISTS);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [dragging, setDragging] = useState(false);
  const [sender, setSender] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [sendErr, setSendErr] = useState('');
  const [sent, setSent] = useState<number | null>(null);
  const [foy, setFoy] = useState(false);

  useEffect(() => {
    apiJson<LinkInfo>(`/api/links?token=${encodeURIComponent(token)}`)
      .then(setLink)
      .catch((e) => setLinkErr(e.status === 404 ? 'Bu link geçersiz ya da kaldırılmış.' : 'Sunucuya ulaşılamadı, lütfen sayfayı yenileyin.'));
    apiJson<{ playlists: EditablePlaylist[] | null }>('/api/playlists')
      .then((d) => { if (Array.isArray(d.playlists) && d.playlists.length) setEditable(d.playlists); })
      .catch(() => { /* varsayılan liste */ });
  }, [token]);

  const playlists = useMemo(() => editable.map(hydratePlaylist), [editable]);

  const addFiles = (files: File[]) => {
    const fresh: Entry[] = files.map((file) => ({ id: Math.random().toString(36).slice(2) + '_' + file.name, file, analyzing: true }));
    setEntries((p) => [...p, ...fresh]);
    setSent(null);
    fresh.forEach(async (e) => {
      try {
        const meta = await analyzeMediaLocally(e.file);
        setEntries((p) => p.map((x) => (x.id === e.id ? { ...x, analyzing: false, metadata: { ...meta, id: e.id, filename: e.file.name } } : x)));
      } catch {
        setEntries((p) => p.map((x) => (x.id === e.id ? { ...x, analyzing: false, error: 'Dosya okunamadı' } : x)));
      }
    });
  };

  const verdicts = useMemo(() => {
    const m = new Map<string, Verdict>();
    entries.forEach((e) => { if (e.metadata?.width && e.metadata?.height) m.set(e.id, judge(e.metadata, playlists)); });
    return m;
  }, [entries, playlists]);

  const sendable = entries.filter((e) => { const v = verdicts.get(e.id); return v && (v.kind === 'ok' || v.kind === 'risky'); });
  const notSendable = entries.filter((e) => !e.analyzing && !sendable.includes(e));
  const covered = new Set(sendable.map((e) => (verdicts.get(e.id) as { ev: SingleEval }).ev.playlist.id));
  const missing = playlists.filter((p) => !covered.has(p.id));
  const analyzing = entries.some((e) => e.analyzing);

  const send = async () => {
    if (!link) return;
    setSending(true); setSendErr(''); setProgress({});
    try {
      const files = [];
      for (const e of sendable) {
        const v = verdicts.get(e.id) as Extract<Verdict, { kind: 'ok' | 'risky' }>;
        const blob = await upload(`ajans/${token}/${safePath(e.file.name)}`, e.file, {
          access: 'public',
          handleUploadUrl: `${API_BASE}/api/upload`,
          clientPayload: JSON.stringify({ token }),
          multipart: e.file.size > 20 * 1024 * 1024,
          contentType: e.file.type || undefined,
          onUploadProgress: (p) => setProgress((prev) => ({ ...prev, [e.id]: p.percentage })),
        });
        files.push({
          url: blob.url, name: e.file.name, size: e.file.size,
          status: e.fixed ? 'fixed' : v.kind, target: v.ev.playlist.name,
          summary: verificationSummary(e.metadata!), issues: v.notes,
        });
      }
      await apiJson('/api/submissions', { method: 'POST', body: JSON.stringify({ token, sender, note, files }) });
      setSent(files.length);
      setEntries([]); setNote('');
    } catch (e: any) {
      const m = String(e?.message || e);
      setSendErr(/BLOB_NOT_CONFIGURED/.test(m) ? 'Gönderim şu an kapalı. Lütfen Pixecta ile iletişime geçin.' : `Gönderilemedi: ${m}`);
    } finally { setSending(false); }
  };

  const downloadFoy = async () => {
    setFoy(true);
    try {
      const blob = await pdf(<OlcuFoyuPDF playlists={playlists} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'Terminal-Kadikoy-Olcu-Foyu.pdf';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally { setFoy(false); }
  };

  if (linkErr) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 max-w-md text-center">
          <XCircle size={36} className="text-rose-400 mx-auto mb-3" />
          <div className="font-bold text-slate-800 mb-1">Link açılamadı</div>
          <div className="text-sm text-slate-500">{linkErr}</div>
          <a href="mailto:info@pixecta.com" className="inline-flex items-center gap-1.5 text-sm text-primary mt-4"><Mail size={14} /> info@pixecta.com</a>
        </div>
      </div>
    );
  }
  if (!link) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 md:px-10 md:py-10">
      <div className="max-w-4xl mx-auto space-y-5">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-primary mb-1"><span lang="en">Pixecta</span> · Terminal Kadıköy</div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800">{link.campaign}</h1>
          <p className="text-slate-500 mt-1 text-sm">
            {link.agency && <>{link.agency} · </>}İçeriklerinizi yükleyin; sistem her dosyanın hangi ekrana uyduğunu ve ekranda sorunsuz oynayıp oynamayacağını anında kontrol eder.
            Sorunlu dosyaları çoğu zaman tek tıkla düzeltebilirsiniz. Kontrol ve düzeltme tamamen sizin bilgisayarınızda yapılır.
          </p>
        </div>

        {!link.active && (
          <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">Bu link gönderime kapatılmış. Dosyalarınızı kontrol edebilirsiniz ama gönderemezsiniz.</div>
        )}

        {/* Ekran ölçüleri */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
            <Monitor size={17} className="text-primary" />
            <h2 className="font-bold text-slate-800 text-sm">Ekran Ölçüleri</h2>
            <span className="flex-1" />
            <button onClick={downloadFoy} disabled={foy} className="flex items-center gap-1.5 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 px-2.5 py-1.5 rounded-lg disabled:opacity-60">
              {foy ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />} Ölçü Föyü (PDF)
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400">
                <tr><th className="text-left px-4 py-2">Ekran</th><th className="text-left px-3 py-2">Ölçü (px)</th><th className="text-left px-3 py-2">Yön</th><th className="text-left px-3 py-2">Video limiti</th><th className="px-3 py-2"></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {playlists.map((p) => {
                  const cap = h264Cap(p);
                  return (
                    <tr key={p.id}>
                      <td className="px-4 py-2 font-medium text-slate-800">{p.name}</td>
                      <td className="px-3 py-2 font-semibold text-primary whitespace-nowrap">{p.targetWidth} × {p.targetHeight}{p.altSizes?.length ? <span className="block text-[10px] font-normal text-slate-400">{p.altSizes.map((a) => `${a.w}×${a.h}`).join(', ')} de kabul</span> : null}</td>
                      <td className="px-3 py-2 text-slate-500">{p.targetHeight > p.targetWidth ? 'Dikey' : 'Yatay'}</td>
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">MP4 H.264 · ≤{cap.maxFps} fps · ≤{cap.maxBitrateMbps} Mbps</td>
                      <td className="px-3 py-2 text-right">{entries.length > 0 && (covered.has(p.id) ? <CheckCircle2 size={15} className="text-emerald-500 inline" /> : <span className="text-[10px] text-slate-400">içerik yok</span>)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Yükleme */}
        <div
          className={`relative bg-white rounded-2xl border-2 border-dashed shadow-sm flex flex-col items-center justify-center text-center p-8 transition-all ${dragging ? 'border-primary bg-primary/5' : 'border-slate-300 hover:border-primary/50'}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
          onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files?.length) addFiles(Array.from(e.dataTransfer.files)); }}
        >
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3"><UploadIcon size={24} className="text-primary" /></div>
          <span className="font-semibold text-slate-700">Video ve görselleri sürükleyin veya seçin</span>
          <span className="text-xs text-slate-500 mt-1">MP4 / MOV / JPG / PNG / WebP · birden fazla dosya seçebilirsiniz</span>
          <input type="file" multiple title="Dosya seç" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            accept=".mp4,.mov,.m4v,.mkv,.webm,.jpg,.jpeg,.png,.webp"
            onChange={(e) => { if (e.target.files?.length) addFiles(Array.from(e.target.files)); e.target.value = ''; }} />
        </div>

        {sent !== null && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4 flex items-center gap-3">
            <CheckCircle2 className="text-emerald-500" size={26} />
            <div>
              <div className="font-bold text-emerald-800">{sent} dosya gönderildi — teşekkürler!</div>
              <div className="text-sm text-emerald-700">Dosyalarınız Pixecta ekibine iletildi. Başka dosya göndermek için tekrar yükleyebilirsiniz.</div>
            </div>
          </div>
        )}

        {/* Sonuçlar */}
        {entries.length > 0 && (
          <div className="space-y-2.5">
            {entries.map((e) => {
              const v = verdicts.get(e.id);
              const img = e.metadata ? isImageContent(e.metadata) : e.file.type.startsWith('image/');
              const tone = !v ? 'border-slate-200' : v.kind === 'ok' ? 'border-emerald-200' : v.kind === 'risky' ? 'border-amber-200' : 'border-rose-200';
              const fps = parseFps(e.metadata?.avg_frame_rate);
              return (
                <div key={e.id} className={`bg-white rounded-xl border ${tone} shadow-sm p-4`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${img ? 'bg-emerald-50 text-emerald-500' : 'bg-indigo-50 text-indigo-500'}`}>
                      {img ? <ImageIcon size={18} /> : <FileVideo size={18} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-800 text-sm truncate" title={e.file.name}>
                        {e.file.name}
                        {e.fixed && <span className="ml-2 text-[10px] font-bold text-primary bg-primary/10 rounded px-1.5 py-0.5 align-middle"><Wrench size={10} className="inline -mt-0.5" /> DÜZELTİLDİ</span>}
                      </div>
                      <div className="text-xs text-slate-400">
                        {e.analyzing ? 'Kontrol ediliyor…' : e.error ? e.error : e.metadata?.width
                          ? [`${e.metadata.width}×${e.metadata.height}`, e.metadata.codec_name, fps ? `${Math.round(fps * 100) / 100} fps` : '', e.metadata.bit_rate ? `${(e.metadata.bit_rate / 1e6).toFixed(1)} Mbps` : '', sizeText(e.file.size)].filter(Boolean).join(' · ')
                          : 'Çözünürlük okunamadı'}
                      </div>
                      {v?.kind === 'ok' && <div className="mt-1.5 text-sm font-semibold text-emerald-700 flex items-center gap-1.5"><CheckCircle2 size={15} /> Uygun → {v.ev.playlist.name}</div>}
                      {v && 'ev' in v && v.kind !== 'blocked' && v.ev.sizeNote && <div className="mt-1 text-[12px] text-sky-800">ⓘ {v.ev.sizeNote}</div>}
                      {v?.kind === 'risky' && (
                        <>
                          <div className="mt-1.5 text-sm font-semibold text-amber-700 flex items-center gap-1.5"><AlertTriangle size={15} /> Kullanılabilir ama dikkat → {v.ev.playlist.name}</div>
                          <ul className="mt-1 text-[12px] text-amber-800 space-y-0.5">{v.notes.map((n, i) => <li key={i}>• {n}</li>)}</ul>
                        </>
                      )}
                      {v?.kind === 'blocked' && (
                        <>
                          <div className="mt-1.5 text-sm font-semibold text-rose-700 flex items-center gap-1.5"><XCircle size={15} /> {v.ev.playlist.name} ekranında oynamaz</div>
                          <ul className="mt-1 text-[12px] text-rose-700 space-y-0.5">{v.ev.blockReasons.map((r, i) => <li key={i}>• {r}</li>)}</ul>
                        </>
                      )}
                      {v?.kind === 'nofit' && (
                        <div className="mt-1.5 text-sm font-semibold text-rose-700 flex items-center gap-1.5">
                          <XCircle size={15} /> Hiçbir ekranın oranına uymuyor{v.nearest ? ` (en yakın: ${v.nearest.playlist.name} ${v.nearest.playlist.targetWidth}×${v.nearest.playlist.targetHeight}, %${v.nearest.deviation!.toFixed(0)} fark)` : ''}
                        </div>
                      )}
                      {e.metadata && v && v.kind !== 'nofit' && (
                        <FixButton
                          file={e.file} content={e.metadata} target={v.ev.playlist}
                          onFixed={(file, ver) => setEntries((p) => p.map((x) => (x.id === e.id
                            ? { ...x, file, fixed: true, metadata: { ...ver.meta, id: e.id, filename: file.name } } : x)))}
                        />
                      )}
                      {sending && progress[e.id] !== undefined && (
                        <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
                          Yükleniyor %{Math.round(progress[e.id])}
                          <span className="inline-block w-32 h-1.5 bg-slate-200 rounded-full overflow-hidden"><span className="block h-full bg-primary" style={{ width: `${progress[e.id]}%` }} /></span>
                        </div>
                      )}
                    </div>
                    {!sending && <button onClick={() => setEntries((p) => p.filter((x) => x.id !== e.id))} className="text-slate-300 hover:text-rose-500"><X size={16} /></button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Gönder */}
        {entries.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
            {missing.length > 0 && !analyzing && (
              <div className="text-[12px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <b>Henüz içerik gelmeyen ekranlar:</b> {missing.map((p) => `${p.name} (${p.targetWidth}×${p.targetHeight})`).join(', ')}
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-3">
              <input value={sender} onChange={(e) => setSender(e.target.value)} placeholder="Adınız / ajans (isteğe bağlı)"
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" />
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Not (örn. yayın tarihi, sıralama)"
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={send} disabled={sending || analyzing || !sendable.length || !link.active || !link.uploadsEnabled}
                className="flex items-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow-sm shadow-primary/20">
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {sending ? 'Gönderiliyor…' : `${sendable.length} dosyayı gönder`}
              </button>
              {notSendable.length > 0 && !analyzing && (
                <span className="text-[12px] text-rose-600">{notSendable.length} dosya gönderilmeyecek — düzeltin ya da listeden çıkarın.</span>
              )}
              {!link.uploadsEnabled && <span className="text-[12px] text-amber-700">Gönderim şu an kapalı; dosyaları kontrol edip düzeltebilirsiniz.</span>}
            </div>
            {sendErr && <div className="text-sm text-rose-600">{sendErr}</div>}
          </div>
        )}

        <div className="text-center text-[11px] text-slate-400 pt-4">
          Pixecta · <a href="mailto:info@pixecta.com" className="hover:text-primary">info@pixecta.com</a>
        </div>
      </div>
    </div>
  );
}
