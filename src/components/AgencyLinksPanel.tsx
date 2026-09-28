import React, { useState } from 'react';
import {
  Link2, ChevronDown, ChevronUp, Plus, Copy, Check, Trash2, Loader2, RefreshCw, Inbox,
  Download, FolderInput, AlertTriangle, CheckCircle2, Wrench, Power,
} from 'lucide-react';
import { apiJson, agencyUrl } from '../utils/api';

type SubFile = { url: string; name: string; size: number; status: 'ok' | 'risky' | 'fixed'; target: string; summary: string; issues: string[] };
type Submission = { id: string; at: number; sender: string; note: string; files: SubFile[] };
type Link = { token: string; campaign: string; agency: string; createdAt: number; active?: boolean; submissions: Submission[] };

type Props = { adminPw: string; setAdminPw: (s: string) => void; onImport: (files: File[]) => void };

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
const when = (t: number) => new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const dl = (url: string) => url + (url.includes('?') ? '&' : '?') + 'download=1';

export default function AgencyLinksPanel({ adminPw, setAdminPw, onImport }: Props) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<Link[] | null>(null);
  const [uploadsEnabled, setUploadsEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [campaign, setCampaign] = useState('');
  const [agency, setAgency] = useState('');
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [openSub, setOpenSub] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);

  const load = async () => {
    if (!adminPw) { setMsg('Admin şifresini gir.'); return; }
    setLoading(true); setMsg('');
    try {
      const d = await apiJson<{ links: Link[]; uploadsEnabled: boolean }>('/api/links', { adminPw });
      setLinks(d.links); setUploadsEnabled(d.uploadsEnabled);
    } catch (e: any) {
      setMsg(e.status === 401 ? 'Şifre hatalı.' : `Yüklenemedi: ${e.message}`);
    } finally { setLoading(false); }
  };

  const create = async () => {
    if (!campaign.trim()) { setMsg('Kampanya adı gir.'); return; }
    setCreating(true); setMsg('');
    try {
      const d = await apiJson<{ link: Link }>('/api/links', { method: 'POST', adminPw, body: JSON.stringify({ campaign, agency }) });
      setLinks((prev) => [d.link, ...(prev || [])]);
      setCampaign(''); setAgency('');
      copy(agencyUrl(d.link.token), d.link.token);
    } catch (e: any) {
      setMsg(e.status === 401 ? 'Şifre hatalı.' : `Oluşturulamadı: ${e.message}`);
    } finally { setCreating(false); }
  };

  const toggleActive = async (l: Link) => {
    try {
      await apiJson('/api/links', { method: 'PATCH', adminPw, body: JSON.stringify({ token: l.token, active: l.active === false }) });
      setLinks((prev) => prev!.map((x) => (x.token === l.token ? { ...x, active: l.active === false } : x)));
    } catch (e: any) { setMsg(`Değiştirilemedi: ${e.message}`); }
  };

  const remove = async (l: Link) => {
    const n = l.submissions.reduce((a, s) => a + s.files.length, 0);
    if (!confirm(`"${l.campaign}" linki${n ? ` ve ajansın yüklediği ${n} dosya` : ''} kalıcı olarak silinsin mi?`)) return;
    try {
      await apiJson(`/api/links?token=${l.token}`, { method: 'DELETE', adminPw });
      setLinks((prev) => prev!.filter((x) => x.token !== l.token));
    } catch (e: any) { setMsg(`Silinemedi: ${e.message}`); }
  };

  const copy = async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text); } catch { /* yoksay */ }
    setCopied(key); setTimeout(() => setCopied((k) => (k === key ? null : k)), 1800);
  };

  const importSub = async (s: Submission) => {
    setImporting(s.id); setMsg('');
    try {
      const files = await Promise.all(s.files.map(async (f) => {
        const r = await fetch(f.url);
        if (!r.ok) throw new Error(`${f.name}: HTTP ${r.status}`);
        const b = await r.blob();
        return new File([b], f.name, { type: b.type });
      }));
      onImport(files);
      setMsg(`✓ ${files.length} dosya atamaya yüklendi — aşağıda analiz ediliyor.`);
    } catch (e: any) {
      setMsg(`İndirilemedi: ${e.message}`);
    } finally { setImporting(null); }
  };

  const totalSubs = links?.reduce((a, l) => a + l.submissions.length, 0) ?? 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <button onClick={() => { const n = !open; setOpen(n); if (n && links === null && adminPw) load(); }}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
        <span className="flex items-center gap-2 font-bold text-slate-800">
          <Link2 size={18} className="text-primary" /> Ajans Yükleme Linkleri
          <span className="text-xs font-normal text-slate-400 ml-1">· ajans dosyasını kendisi kontrol edip yüklesin</span>
          {links && totalSubs > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary text-white ml-1">{totalSubs} gönderim</span>}
        </span>
        {open ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
      </button>

      {open && (
        <div className="border-t border-slate-100 p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <input type="password" value={adminPw} onChange={(e) => setAdminPw(e.target.value)} placeholder="Admin şifresi"
              onKeyDown={(e) => { if (e.key === 'Enter') load(); }}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm w-44 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" />
            <button onClick={load} disabled={loading} className="flex items-center gap-1.5 text-sm font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-lg disabled:opacity-60">
              {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} {links ? 'Yenile' : 'Linkleri Getir'}
            </button>
            {msg && <span className={`text-xs font-medium ${msg.startsWith('✓') ? 'text-emerald-600' : 'text-rose-600'}`}>{msg}</span>}
          </div>

          {links && !uploadsEnabled && (
            <div className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <b>Dosya gönderimi henüz kapalı.</b> Vercel panelinde: <i>terminal-atama → Storage → Create Database → Blob</i> (erişim: <b>Public</b>) → projeye bağla → Redeploy.
              Kurulana kadar ajans linki açılır, ajans dosyalarını kontrol edip düzeltebilir ama sisteme yükleyemez.
            </div>
          )}

          {links && (
            <div className="flex flex-wrap items-end gap-2 bg-primary/5 border border-primary/20 rounded-lg p-3">
              <div className="flex-1 min-w-[180px]">
                <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Kampanya</label>
                <input value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="Örn: Turkcell Ekim"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" />
              </div>
              <div className="flex-1 min-w-[160px]">
                <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Ajans</label>
                <input value={agency} onChange={(e) => setAgency(e.target.value)} placeholder="Örn: XYZ Ajans"
                  onKeyDown={(e) => { if (e.key === 'Enter') create(); }}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" />
              </div>
              <button onClick={create} disabled={creating} className="flex items-center gap-1.5 text-sm font-semibold bg-primary text-white hover:bg-primary/90 px-3 py-1.5 rounded-lg disabled:opacity-60">
                {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Link Oluştur
              </button>
            </div>
          )}

          {links && links.length === 0 && <div className="text-sm text-slate-400">Henüz link yok. Kampanya adı girip ilk linki oluştur, ajansa gönder.</div>}

          {links && links.map((l) => {
            const url = agencyUrl(l.token);
            const active = l.active !== false;
            return (
              <div key={l.token} className={`border rounded-xl ${active ? 'border-slate-200' : 'border-slate-200 bg-slate-50 opacity-75'}`}>
                <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-800 text-sm truncate">{l.campaign}{l.agency && <span className="font-normal text-slate-500"> · {l.agency}</span>}</div>
                    <div className="text-[11px] text-slate-400 truncate font-mono">{url}</div>
                  </div>
                  <span className="text-[11px] text-slate-500">{when(l.createdAt)}</span>
                  <button onClick={() => copy(url, l.token)} className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border ${copied === l.token ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'text-slate-600 border-slate-200 hover:bg-slate-100'}`}>
                    {copied === l.token ? <Check size={13} /> : <Copy size={13} />} {copied === l.token ? 'Kopyalandı' : 'Linki Kopyala'}
                  </button>
                  <button onClick={() => toggleActive(l)} title={active ? 'Linki kapat (ajans yükleyemez)' : 'Linki aç'}
                    className={`p-1.5 rounded-lg border ${active ? 'text-emerald-600 border-emerald-200 hover:bg-emerald-50' : 'text-slate-400 border-slate-200 hover:bg-slate-100'}`}><Power size={14} /></button>
                  <button onClick={() => remove(l)} title="Sil" className="p-1.5 text-slate-300 hover:text-rose-500"><Trash2 size={15} /></button>
                </div>
                {l.submissions.length > 0 && (
                  <div className="border-t border-slate-100 px-3 py-2 space-y-2">
                    {[...l.submissions].reverse().map((s) => {
                      const isOpen = openSub === s.id;
                      return (
                        <div key={s.id} className="text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <button onClick={() => setOpenSub(isOpen ? null : s.id)} className="flex items-center gap-1.5 text-slate-700 hover:text-primary">
                              <Inbox size={14} className="text-primary" />
                              <b>{s.files.length} dosya</b> · {when(s.at)}{s.sender && ` · ${s.sender}`}
                              {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                            <span className="flex-1" />
                            <button onClick={() => importSub(s)} disabled={importing === s.id}
                              className="flex items-center gap-1.5 text-xs font-semibold bg-primary text-white hover:bg-primary/90 px-2.5 py-1.5 rounded-lg disabled:opacity-60">
                              {importing === s.id ? <Loader2 size={13} className="animate-spin" /> : <FolderInput size={13} />} Atamaya Yükle
                            </button>
                          </div>
                          {s.note && <div className="ml-5 mt-1 text-[12px] text-slate-600 italic">“{s.note}”</div>}
                          {isOpen && (
                            <div className="ml-5 mt-1.5 divide-y divide-slate-100 border border-slate-100 rounded-lg">
                              {s.files.map((f, i) => (
                                <div key={i} className="px-2.5 py-1.5 text-[12px]">
                                  <div className="flex items-center gap-2">
                                    {f.status === 'ok' ? <CheckCircle2 size={13} className="text-emerald-500" /> : f.status === 'fixed' ? <Wrench size={13} className="text-primary" /> : <AlertTriangle size={13} className="text-amber-500" />}
                                    <span className="font-medium text-slate-800 truncate">{f.name}</span>
                                    <span className="text-slate-400">{mb(f.size)}</span>
                                    {f.target && <span className="text-slate-500 truncate">→ {f.target}</span>}
                                    <span className="flex-1" />
                                    <a href={dl(f.url)} className="flex items-center gap-1 text-primary hover:underline"><Download size={12} /> İndir</a>
                                  </div>
                                  {f.summary && <div className="ml-5 text-slate-400">{f.summary}{f.status === 'fixed' && ' · ajans sistemde otomatik düzeltti'}</div>}
                                  {f.issues.map((x, j) => <div key={j} className="ml-5 text-amber-700">⚠ {x}</div>)}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
