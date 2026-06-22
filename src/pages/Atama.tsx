import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  Upload as UploadIcon, Monitor, CheckCircle, AlertTriangle, X, Loader2,
  ArrowRight, FileVideo, Image as ImageIcon, ChevronDown, ChevronUp, Server, Inbox, Download, Layers,
  Settings2, Plus, Trash2, RotateCcw, FileDown, FileUp, FileText, Cloud, CloudUpload, Loader2 as Spinner,
  Tag, Copy, Check,
} from 'lucide-react';
import { pdf } from '@react-pdf/renderer';
import { analyzeMediaLocally } from '../utils/mediaInfo';
import {
  DEFAULT_PLAYLISTS, hydratePlaylist, CONTROLLERS_LIST,
  type EditablePlaylist, type Playlist,
} from '../data/terminalKadikoy';
import { buildAssignment, type Content } from '../utils/matching';
import AtamaPDF from '../components/AtamaPDF';
import OlcuFoyuPDF from '../components/OlcuFoyuPDF';

// İçerik/ekran oranını küçük bir kutu olarak çizer (dikey/yatay görsel teyit)
function RatioBox({ w, h, tone = 'indigo' }: { w?: number; h?: number; tone?: 'indigo' | 'emerald' }) {
  if (!w || !h) return null;
  const box = 22;
  const scale = box / Math.max(w, h);
  const bw = Math.max(3, Math.round(w * scale));
  const bh = Math.max(3, Math.round(h * scale));
  const col = tone === 'emerald' ? { bg: '#d1fae5', br: '#10b981' } : { bg: '#e0e7ff', br: '#6366f1' };
  return (
    <span style={{ display: 'inline-flex', width: box, height: box, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} title={`${w}×${h}`}>
      <span style={{ width: bw, height: bh, background: col.bg, border: `1px solid ${col.br}`, borderRadius: 2, display: 'block' }} />
    </span>
  );
}

type FileEntry = { id: string; file: File; analyzing: boolean; metadata?: Content; error?: string };

const LS_KEY = 'tk_playlists_v4';
// Merkezi (bulut) ekran listesi API'si — web ve masaüstü aynı kaynağı kullanır.
const CLOUD_API = 'https://terminal-atama.vercel.app/api/playlists';

function loadPlaylists(): EditablePlaylist[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length) return arr;
    }
  } catch { /* ignore */ }
  return DEFAULT_PLAYLISTS;
}

function gcd(a: number, b: number): number { return b ? gcd(b, a % b) : a; }
function ratioLabel(w?: number, h?: number): string {
  if (!w || !h) return '-';
  const g = gcd(w, h) || 1;
  const rw = w / g, rh = h / g;
  if (rw <= 40 && rh <= 40) return `${rw}:${rh}`;
  return (w / h).toFixed(2);
}
function playlistMeta(pl: Playlist): string {
  const ctrls = pl.controllers.map((c) => c.name).join(', ') || 'cihaz tanımsız';
  return `${pl.targetWidth}×${pl.targetHeight} · ${ratioLabel(pl.targetWidth, pl.targetHeight)} · ${pl.screenCount} ekran · ${ctrls}`;
}

export default function Atama() {
  const [isDragging, setIsDragging] = useState(false);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [tolerance, setTolerance] = useState(10);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const [editablePlaylists, setEditablePlaylists] = useState<EditablePlaylist[]>(loadPlaylists);
  const [editing, setEditing] = useState(false);
  const [generatingFoy, setGeneratingFoy] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Bulut senkron durumu
  const [cloudState, setCloudState] = useState<'loading' | 'cloud' | 'local' | 'offline'>('loading');
  const [adminPw, setAdminPw] = useState('');
  const [savingCloud, setSavingCloud] = useState(false);
  const [cloudMsg, setCloudMsg] = useState('');

  // Dosya adı üretici (toplu yeniden adlandırma yardımcısı)
  const [renameLabel, setRenameLabel] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(editablePlaylists)); } catch { /* ignore */ }
  }, [editablePlaylists]);

  // Açılışta merkezi listeyi çek (varsa onu kullan — herkes aynı listeyi görür)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(CLOUD_API, { cache: 'no-store' });
        if (!r.ok) throw new Error('http ' + r.status);
        const data = await r.json();
        if (cancelled) return;
        if (Array.isArray(data.playlists) && data.playlists.length) {
          setEditablePlaylists(data.playlists.map((p: any, i: number) => ({
            id: String(p.id || 'pl_' + i),
            name: String(p.name ?? 'Playlist'),
            targetWidth: Number(p.targetWidth) || 0,
            targetHeight: Number(p.targetHeight) || 0,
            controllerNames: Array.isArray(p.controllerNames) ? p.controllerNames.map(String) : [],
            screenCount: Number(p.screenCount) || 1,
          })));
          setCloudState('cloud');
        } else {
          setCloudState('local'); // bulut boş → yerel/varsayılan kullanılıyor
        }
      } catch {
        if (!cancelled) setCloudState('offline'); // ulaşılamadı → yerel önbellek
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const saveToCloud = async () => {
    if (!adminPw) { setCloudMsg('Önce admin şifresini gir.'); return; }
    setSavingCloud(true); setCloudMsg('');
    try {
      const r = await fetch(CLOUD_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPw },
        body: JSON.stringify({ playlists: editablePlaylists }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) { setCloudState('cloud'); setCloudMsg('✓ Buluta kaydedildi — tüm kullanıcılar artık bu listeyi görecek.'); }
      else if (r.status === 401) setCloudMsg('Şifre hatalı.');
      else setCloudMsg('Hata: ' + (data.error || ('HTTP ' + r.status)));
    } catch {
      setCloudMsg('Sunucuya ulaşılamadı (internet?).');
    } finally { setSavingCloud(false); }
  };

  const playlists = useMemo(() => editablePlaylists.map(hydratePlaylist), [editablePlaylists]);
  const totalScreens = editablePlaylists.reduce((a, p) => a + (p.screenCount || 0), 0);

  const handleFiles = (files: File[]) => {
    const newEntries: FileEntry[] = files.map((file) => ({
      id: Math.random().toString(36).slice(2) + '_' + file.name,
      file, analyzing: true,
    }));
    setEntries((prev) => [...prev, ...newEntries]);
    newEntries.forEach(async (entry) => {
      try {
        const meta = await analyzeMediaLocally(entry.file);
        setEntries((prev) => prev.map((e) =>
          e.id === entry.id ? { ...e, analyzing: false, metadata: { ...meta, id: entry.id, filename: entry.file.name } } : e));
      } catch {
        setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, analyzing: false, error: 'Analiz edilemedi' } : e)));
      }
    });
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) handleFiles(Array.from(e.dataTransfer.files));
  }, []);

  const contents: Content[] = useMemo(
    () => entries.filter((e) => !e.analyzing && !e.error && e.metadata?.width && e.metadata?.height).map((e) => e.metadata!),
    [entries]
  );
  const analyzing = entries.some((e) => e.analyzing);

  const result = useMemo(() => buildAssignment(contents, playlists, tolerance), [contents, playlists, tolerance]);

  const playlistAssignment = useMemo(() => {
    const m = new Map<string, { content: Content; deviation: number; klass: string }>();
    result.assignments.forEach((a) => m.set(a.playlist.id, { content: a.content, deviation: a.deviation, klass: a.klass }));
    return m;
  }, [result]);

  const toggle = (id: string) => setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const removeEntry = (id: string) => setEntries((prev) => prev.filter((e) => e.id !== id));
  const fileById = (cid: string) => entries.find((e) => e.id === cid)?.file;
  const hasResults = result.assignments.length + result.unmatchedContents.length > 0;

  // --- Dosya adı üretici ---
  const assignmentByContent = useMemo(
    () => new Map(result.assignments.map((a) => [a.content.id, a])),
    [result]
  );
  const makeName = (e: FileEntry): string | null => {
    const m = e.metadata;
    if (!m?.width || !m?.height) return null;
    const ext = (e.file.name.match(/\.[a-z0-9]+$/i)?.[0] || '').toLowerCase();
    const brand = renameLabel.trim().toLocaleUpperCase('tr-TR').replace(/\s+/g, ' ');
    const base = brand ? `${brand}_${m.width}x${m.height}` : `${m.width}x${m.height}`;
    return base + ext;
  };
  const renameRows = useMemo(
    () => entries
      .filter((e) => !e.analyzing && !e.error && e.metadata?.width && e.metadata?.height)
      .map((e) => ({ id: e.id, original: e.file.name, name: makeName(e)!, screen: assignmentByContent.get(e.id)?.playlist.name })),
    [entries, renameLabel, assignmentByContent]
  );
  const copyText = async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
  };

  // --- Playlist düzenleme yardımcıları ---
  const updateRow = (id: string, patch: Partial<EditablePlaylist>) =>
    setEditablePlaylists((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const toggleController = (id: string, name: string) =>
    setEditablePlaylists((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const has = p.controllerNames.includes(name);
      return { ...p, controllerNames: has ? p.controllerNames.filter((n) => n !== name) : [...p.controllerNames, name] };
    }));
  const addRow = () =>
    setEditablePlaylists((prev) => [...prev, { id: 'pl_' + Date.now(), name: 'Yeni Playlist', targetWidth: 1920, targetHeight: 1080, controllerNames: [], screenCount: 1 }]);
  const deleteRow = (id: string) => setEditablePlaylists((prev) => prev.filter((p) => p.id !== id));
  const resetDefault = () => { if (confirm('Tüm playlistler varsayılana sıfırlansın mı?')) setEditablePlaylists(DEFAULT_PLAYLISTS); };

  const exportConfig = () => {
    const blob = new Blob([JSON.stringify(editablePlaylists, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'terminal-kadikoy-ekranlar.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  const importConfig = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const arr = JSON.parse(String(reader.result));
        if (!Array.isArray(arr) || !arr.length) throw new Error('boş');
        const ok = arr.every((p: any) => p && typeof p.name === 'string' && typeof p.targetWidth === 'number' && typeof p.targetHeight === 'number');
        if (!ok) throw new Error('format');
        const normalized: EditablePlaylist[] = arr.map((p: any, i: number) => ({
          id: String(p.id || 'pl_' + i),
          name: String(p.name),
          targetWidth: p.targetWidth, targetHeight: p.targetHeight,
          controllerNames: Array.isArray(p.controllerNames) ? p.controllerNames.map(String) : [],
          screenCount: typeof p.screenCount === 'number' ? p.screenCount : 1,
        }));
        setEditablePlaylists(normalized);
        alert('Ekran ayarları içe aktarıldı.');
      } catch {
        alert('Geçersiz dosya. Lütfen bu araçtan dışa aktarılmış bir JSON seçin.');
      }
    };
    reader.readAsText(file);
  };

  const handleDownloadFoy = async () => {
    setGeneratingFoy(true);
    try {
      const blob = await pdf(<OlcuFoyuPDF playlists={playlists} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'Terminal-Kadikoy-Olcu-Foyu.pdf';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Ölçü föyü hatası:', err);
      alert('Ölçü föyü oluşturulurken hata oluştu.');
    } finally { setGeneratingFoy(false); }
  };

  const handleDownloadPdf = async () => {
    setGeneratingPdf(true);
    try {
      const blob = await pdf(<AtamaPDF result={result} tolerance={tolerance} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'Terminal-Kadikoy-Atama-Raporu.pdf';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF oluşturma hatası:', err);
      alert('PDF oluşturulurken bir hata oluştu.');
    } finally { setGeneratingPdf(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Başlık */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-primary mb-1">Terminal Kadıköy · İçerik Atama</div>
            <h1 className="text-3xl font-bold text-slate-800">Ajans İçeriği → Ekran Eşleştirme</h1>
            <p className="text-slate-500 mt-1 text-sm">
              {editablePlaylists.length} playlist · {totalScreens} ekran · Videoları yükle, sistem her içeriği en uygun playliste atasın.
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 w-full md:w-72">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-slate-700">Oran Toleransı</span>
              <span className="text-sm font-bold text-primary">%{tolerance}</span>
            </div>
            <input type="range" min={0} max={30} step={1} value={tolerance}
              onChange={(e) => setTolerance(Number(e.target.value))} className="w-full" style={{ accentColor: '#6366f1' }} />
            <p className="text-[11px] text-slate-400 mt-1">Bu sapmaya kadar olan içerikler ekrana uyumlu sayılır.</p>
          </div>
        </div>

        {/* Ekran/Playlist Yönetimi */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <button
            onClick={() => setEditing((v) => !v)}
            className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
          >
            <span className="flex items-center gap-2 font-bold text-slate-800">
              <Settings2 size={18} className="text-primary" /> Ekran / Playlist Yönetimi
              <span className="text-xs font-normal text-slate-400 ml-1">· {editablePlaylists.length} playlist</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ml-1 flex items-center gap-1 ${
                cloudState === 'cloud' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                cloudState === 'loading' ? 'bg-slate-50 text-slate-500 border-slate-200' :
                'bg-amber-50 text-amber-700 border-amber-200'}`}>
                <Cloud size={11} />
                {cloudState === 'cloud' ? 'Bulut (senkron)' : cloudState === 'loading' ? 'Bulut yükleniyor…' : cloudState === 'local' ? 'Yerel (bulut boş)' : 'Çevrimdışı (yerel)'}
              </span>
            </span>
            {editing ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
          </button>
          {editing && (
            <div className="border-t border-slate-100 p-5 space-y-3">
              <div className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                Düzenle, sonra <b>Buluta Kaydet</b> (admin şifresiyle) → değişiklik tüm kullanıcılara anında yansır. Kaydetmezsen yaptığın değişiklik yalnızca bu tarayıcıda kalır.
              </div>
              {editablePlaylists.map((p) => (
                <div key={p.id} className="border border-slate-200 rounded-xl p-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="flex-1 min-w-[180px]">
                      <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Playlist Adı</label>
                      <input value={p.name} onChange={(e) => updateRow(p.id, { name: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" />
                    </div>
                    <div className="w-20">
                      <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Genişlik</label>
                      <input type="number" min={1} value={p.targetWidth} onChange={(e) => updateRow(p.id, { targetWidth: parseInt(e.target.value) || 0 })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" />
                    </div>
                    <div className="w-20">
                      <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Yükseklik</label>
                      <input type="number" min={1} value={p.targetHeight} onChange={(e) => updateRow(p.id, { targetHeight: parseInt(e.target.value) || 0 })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" />
                    </div>
                    <div className="w-24">
                      <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Oran</label>
                      <div className="px-2.5 py-1.5 text-sm text-slate-500 bg-slate-50 rounded-lg border border-slate-100">{ratioLabel(p.targetWidth, p.targetHeight)}</div>
                    </div>
                    <div className="w-20">
                      <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Ekran Sayısı</label>
                      <input type="number" min={1} value={p.screenCount} onChange={(e) => updateRow(p.id, { screenCount: parseInt(e.target.value) || 1 })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" />
                    </div>
                    <button onClick={() => deleteRow(p.id)} className="text-slate-300 hover:text-rose-500 p-2" title="Sil"><Trash2 size={16} /></button>
                  </div>
                  <div className="mt-2.5">
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Kontrol Cihaz(lar)ı — tümü bu içeriği oynatabilmeli</label>
                    <div className="flex flex-wrap gap-1.5">
                      {CONTROLLERS_LIST.map((c) => {
                        const active = p.controllerNames.includes(c.name);
                        return (
                          <button key={c.name} onClick={() => toggleController(p.id, c.name)}
                            className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${active ? 'bg-primary text-white border-primary' : 'bg-white text-slate-500 border-slate-200 hover:border-primary/50'}`}>
                            {c.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg p-2.5">
                <CloudUpload size={16} className="text-primary" />
                <span className="text-sm font-semibold text-slate-700">Buluta Kaydet (Admin):</span>
                <input type="password" value={adminPw} onChange={(e) => setAdminPw(e.target.value)} placeholder="Admin şifresi"
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm w-44 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" />
                <button onClick={saveToCloud} disabled={savingCloud}
                  className="flex items-center gap-1.5 text-sm font-semibold bg-primary text-white hover:bg-primary/90 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60">
                  {savingCloud ? <Spinner size={15} className="animate-spin" /> : <CloudUpload size={15} />} Buluta Kaydet
                </button>
                {cloudMsg && <span className={`text-xs font-medium ${cloudMsg.startsWith('✓') ? 'text-emerald-600' : 'text-rose-600'}`}>{cloudMsg}</span>}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 mt-1">
                <button onClick={addRow} className="flex items-center gap-1.5 text-sm font-medium text-primary hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-colors">
                  <Plus size={16} /> Yeni Playlist
                </button>
                <div className="flex-1" />
                <button onClick={handleDownloadFoy} disabled={generatingFoy} className="flex items-center gap-1.5 text-sm font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60">
                  {generatingFoy ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />} Ölçü Föyü PDF (Ajans)
                </button>
                <button onClick={exportConfig} className="flex items-center gap-1.5 text-sm font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-lg transition-colors">
                  <FileDown size={15} /> Dışa Aktar
                </button>
                <button onClick={() => importInputRef.current?.click()} className="flex items-center gap-1.5 text-sm font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-lg transition-colors">
                  <FileUp size={15} /> İçe Aktar
                </button>
                <input ref={importInputRef} type="file" accept="application/json,.json" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) importConfig(f); e.target.value = ''; }} />
                <button onClick={resetDefault} className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100 px-3 py-1.5 rounded-lg transition-colors">
                  <RotateCcw size={15} /> Sıfırla
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Yükleme alanı */}
        <div
          className={`relative bg-white rounded-2xl border-2 border-dashed shadow-sm flex flex-col items-center justify-center text-center p-8 transition-all ${isDragging ? 'border-primary bg-primary/5' : 'border-slate-300 hover:border-primary/50'}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
          onDrop={onDrop}
        >
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3"><UploadIcon size={24} className="text-primary" /></div>
          <span className="font-semibold text-slate-700">İçerikleri sürükle veya seç</span>
          <span className="text-xs text-slate-500 mt-1">Ajanstan gelen videoları/görselleri buraya bırak (çoklu seçim)</span>
          <input type="file" multiple title="Dosya seç" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            accept=".mp4,.mov,.avi,.mkv,.jpg,.jpeg,.png,.webp,.gif"
            onChange={(e) => { if (e.target.files?.length) handleFiles(Array.from(e.target.files)); e.target.value = ''; }} />
        </div>

        {/* Özet sayaçlar */}
        {entries.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard icon={CheckCircle} color="emerald" label="Eşleşen İçerik" value={result.assignments.length} />
            <SummaryCard icon={AlertTriangle} color="rose" label="Uymayan İçerik" value={result.unmatchedContents.length} />
            <SummaryCard icon={Inbox} color="amber" label="Boş Playlist" value={result.emptyPlaylists.length} />
            <SummaryCard icon={Layers} color="slate" label="Toplam Playlist" value={editablePlaylists.length} />
          </div>
        )}

        {hasResults && (
          <div className="flex justify-end">
            <button onClick={handleDownloadPdf} disabled={generatingPdf || analyzing}
              className="flex items-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow-sm shadow-primary/20 transition-all">
              {generatingPdf ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              {generatingPdf ? 'Hazırlanıyor...' : 'Ajans PDF Raporu İndir'}
            </button>
          </div>
        )}

        {analyzing && (
          <div className="flex items-center gap-2 text-sm text-primary bg-primary/5 border border-primary/20 rounded-lg px-4 py-2 w-fit">
            <Loader2 size={16} className="animate-spin" /> İçerikler analiz ediliyor...
          </div>
        )}

        {/* Atama Planı */}
        {result.assignments.length > 0 && (
          <Section title="Atama Planı" subtitle="Her içerik için önerilen playlist" icon={ArrowRight}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-[11px] text-slate-500">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-400"></span> Tam uyum (oran birebir)</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400"></span> %{tolerance}'e kadar fark · birebir değil ama kullanılabilir</span>
              <span className="text-slate-400">· Çözünürlük, oran, codec, FPS ve bitrate kontrolleri dahildir</span>
            </div>
            <div className="divide-y divide-slate-100">
              {result.assignments.map((a) => {
                const cleanExact = a.resolutionExact;            // birebir ölçü
                const sameRatio = a.klass === 'EXACT';           // oran birebir ama ölçü farklı olabilir
                const badgeText = cleanExact ? '✓ TAM UYUM' : sameRatio ? 'RİSKLİ · ÖLÇEK FARKLI' : `%${a.deviation.toFixed(1)} FARK · KULLANILABİLİR`;
                const file = fileById(a.content.id);
                const open = expanded.has(a.content.id);
                const row = result.evalMatrix.get(a.content.id)!;
                return (
                  <div key={a.content.id}>
                    <div className="flex items-center gap-3 py-3 px-1 cursor-pointer hover:bg-slate-50 rounded-lg" onClick={() => toggle(a.content.id)}>
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${file?.type.startsWith('image/') ? 'bg-emerald-50 text-emerald-500' : 'bg-indigo-50 text-indigo-500'}`}>
                        {file?.type.startsWith('image/') ? <ImageIcon size={18} /> : <FileVideo size={18} />}
                      </div>
                      <RatioBox w={a.content.width} h={a.content.height} />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-800 text-sm truncate" title={a.content.filename}>{a.content.filename}</div>
                        <div className="text-xs text-slate-400">{a.content.width}×{a.content.height} · {ratioLabel(a.content.width, a.content.height)} · {a.content.codec_name || '-'}</div>
                      </div>
                      <ArrowRight size={18} className="text-slate-300 flex-shrink-0" />
                      <RatioBox w={a.playlist.targetWidth} h={a.playlist.targetHeight} tone="emerald" />
                      <div className="min-w-0 flex-1 text-right md:text-left">
                        <div className="font-semibold text-slate-800 text-sm truncate" title={a.playlist.name}>{a.playlist.name}</div>
                        <div className="text-xs text-slate-400">{playlistMeta(a.playlist)}</div>
                      </div>
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-md border whitespace-nowrap ${cleanExact ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                        {badgeText}
                      </span>
                      {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                    </div>
                    {a.riskNote && (
                      <div className="ml-12 mb-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-2.5 py-1.5 flex items-start gap-1.5">
                        <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" /> <span>{a.riskNote}</span>
                      </div>
                    )}
                    {open && (
                      <div className="pb-4 pl-12 pr-2">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Tüm playlistlere karşı sıralama</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {[...playlists]
                            .map((p) => ({ p, ev: row.get(p.id)! }))
                            .sort((x, y) => (x.ev.deviation ?? 999) - (y.ev.deviation ?? 999))
                            .map(({ p, ev }) => (
                              <div key={p.id} className={`flex items-center justify-between text-xs rounded-lg px-3 py-2 border ${
                                ev.klass === 'EXACT' ? 'bg-emerald-50 border-emerald-200' :
                                ev.klass === 'TOLERANT' ? 'bg-amber-50 border-amber-200' :
                                ev.klass === 'BLOCKED' ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
                                <span className="truncate text-slate-700 font-medium" title={p.name}>{p.name}</span>
                                <span className="flex-shrink-0 ml-2">
                                  {ev.klass === 'BLOCKED' ? <span className="text-rose-600 font-semibold">Cihaz engeli</span>
                                    : ev.deviation !== null ? <span className="text-slate-600">%{ev.deviation.toFixed(1)}</span> : '-'}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* Uymayan içerikler */}
        {result.unmatchedContents.length > 0 && (
          <Section title="Atanamayan İçerikler" subtitle="Hiçbir playliste uymuyor" icon={AlertTriangle} tone="rose">
            <div className="space-y-2">
              {result.unmatchedContents.map((u) => (
                <div key={u.content.id} className="flex items-start gap-3 bg-rose-50/50 border border-rose-100 rounded-lg p-3">
                  <AlertTriangle size={18} className="text-rose-500 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-800 text-sm">{u.content.filename}</div>
                    <div className="text-xs text-slate-500 mb-1">{u.content.width}×{u.content.height} · {ratioLabel(u.content.width, u.content.height)} · {u.content.codec_name || '-'}</div>
                    <div className="text-xs text-rose-700">{u.reason}</div>
                  </div>
                  <button onClick={() => removeEntry(u.content.id)} className="text-slate-300 hover:text-rose-500"><X size={16} /></button>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Boş playlistler */}
        {entries.length > 0 && result.emptyPlaylists.length > 0 && (
          <Section title="İçerik Bekleyen Playlistler" subtitle="Bu playlistlere uygun içerik gelmedi" icon={Inbox} tone="amber">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {result.emptyPlaylists.map((p) => (
                <div key={p.id} className="bg-amber-50/50 border border-amber-100 rounded-lg p-3">
                  <div className="font-semibold text-slate-800 text-sm truncate" title={p.name}>{p.name}</div>
                  <div className="text-xs text-slate-500 flex items-center gap-2 mt-1">
                    <span>{p.targetWidth}×{p.targetHeight} · {ratioLabel(p.targetWidth, p.targetHeight)}</span>
                    <span className="flex items-center gap-1"><Server size={11} /> {p.screenCount} ekran</span>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Playlist envanteri */}
        <Section title="Terminal Kadıköy Playlistleri" subtitle={`${editablePlaylists.length} playlist · ${totalScreens} ekran`} icon={Layers}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {playlists.map((p) => {
              const asg = playlistAssignment.get(p.id);
              return (
                <div key={p.id} className={`rounded-lg p-3 border ${asg ? 'bg-emerald-50/40 border-emerald-200' : 'bg-white border-slate-200'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-slate-800 text-sm truncate" title={p.name}>{p.name}</div>
                    {asg && <CheckCircle size={15} className="text-emerald-500 flex-shrink-0" />}
                  </div>
                  <div className="text-xs text-slate-500 flex items-center gap-2 mt-1">
                    <span>{p.targetWidth}×{p.targetHeight} · {ratioLabel(p.targetWidth, p.targetHeight)}</span>
                    <span className="flex items-center gap-1"><Monitor size={11} /> {p.screenCount} ekran</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1 truncate" title={p.controllers.map((c) => c.name).join(', ')}>
                    {p.controllers.map((c) => c.name).join(', ') || 'cihaz tanımsız'}
                  </div>
                  {asg && (
                    <div className="text-[11px] text-emerald-700 mt-2 truncate border-t border-emerald-100 pt-1.5">→ {asg.content.filename}</div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        {/* Dosya Adı Üretici (en altta) */}
        {renameRows.length > 0 && (
          <Section title="Dosya Adı Üretici" subtitle="Yüklemeden, kopyala-yapıştır için hazır adlar" icon={Tag}>
            <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-4">
              <div className="flex-1">
                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Marka / Kampanya</label>
                <input
                  value={renameLabel}
                  onChange={(e) => setRenameLabel(e.target.value)}
                  placeholder="Örn: TURKCELL KAMPANYA"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none uppercase"
                />
                <p className="text-[11px] text-slate-400 mt-1">Her dosyanın başına bu gelir, sonuna otomatik <b>_GENİŞLİKxYÜKSEKLİK</b> eklenir.</p>
              </div>
              <button
                onClick={() => copyText(renameRows.map((r) => r.name).join('\n'), '__all')}
                className="flex items-center justify-center gap-1.5 text-sm font-semibold bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg transition-colors"
              >
                {copiedKey === '__all' ? <Check size={15} /> : <Copy size={15} />}
                {copiedKey === '__all' ? 'Kopyalandı' : 'Tümünü Kopyala'}
              </button>
            </div>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {renameRows.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-sm font-semibold text-slate-800 truncate" title={r.name}>{r.name}</div>
                    <div className="text-[11px] text-slate-400 truncate" title={r.original}>
                      {r.original}{r.screen ? <span className="text-slate-500"> · {r.screen}</span> : <span className="text-rose-500"> · eşleşmedi</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => copyText(r.name, r.id)}
                    className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors flex-shrink-0 ${copiedKey === r.id ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                  >
                    {copiedKey === r.id ? <Check size={13} /> : <Copy size={13} />}
                    {copiedKey === r.id ? 'Kopyalandı' : 'Kopyala'}
                  </button>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, color, label, value }: { icon: any; color: string; label: string; value: number }) {
  const map: Record<string, string> = {
    emerald: 'bg-emerald-500/10 text-emerald-500', rose: 'bg-rose-500/10 text-rose-500',
    amber: 'bg-amber-500/10 text-amber-500', slate: 'bg-slate-500/10 text-slate-500',
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${map[color]}`}><Icon size={20} /></div>
      <div>
        <div className="text-xs text-slate-500 font-medium leading-none mb-1">{label}</div>
        <div className="text-2xl font-bold text-slate-800 leading-none">{value}</div>
      </div>
    </div>
  );
}

function Section({ title, subtitle, icon: Icon, tone = 'primary', children }: { title: string; subtitle?: string; icon: any; tone?: string; children: React.ReactNode }) {
  const toneMap: Record<string, string> = { primary: 'text-primary', rose: 'text-rose-500', amber: 'text-amber-500' };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
        <Icon size={18} className={toneMap[tone] || 'text-primary'} />
        <h2 className="font-bold text-slate-800">{title}</h2>
        {subtitle && <span className="text-xs text-slate-400 ml-1">· {subtitle}</span>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}
