import React, { useMemo, useRef, useState } from 'react';
import { PackageCheck, Loader2, CheckCircle2, AlertTriangle, XCircle, MinusCircle, ArrowRight, Square } from 'lucide-react';
import { zipSync, strToU8 } from 'fflate';
import type { Playlist } from '../data/terminalKadikoy';
import type { Content, MatchResult, SingleEval } from '../utils/matching';
import { planFix, type FixPlan } from '../utils/fixPlan';
import { applyFix, isFFmpegLoaded, verifyOutput } from '../utils/videoFix';
import { verificationSummary } from './FixButton';

type Entry = { id: string; file: File; metadata?: Content };

type Props = {
  entries: Entry[];
  result: MatchResult;
  singlePlaylist: Playlist | null;
  singleEvals: SingleEval[];
  tolerance: number;
  brand: string;
  onBrand: (s: string) => void;
};

type ItemStatus = 'pending' | 'running' | 'ok' | 'fail' | 'error';
type Item = { entry: Entry; content: Content; plan: FixPlan; note?: string };
type Skipped = { content: Content; reason: string };
type RunState = { status: ItemStatus; progress: number; detail?: string; outName?: string };

const folderName = (s: string) => s.replace(/[<>:"/\\|?*]+/g, '-').replace(/\s+/g, ' ').trim() || 'EKRAN';
const baseName = (fn: string) => fn.replace(/\.[a-z0-9]+$/i, '').replace(/[<>:"/\\|?*]+/g, '_').trim() || 'icerik';

export default function PackagePanel({ entries, result, singlePlaylist, singleEvals, tolerance, brand, onBrand }: Props) {
  const [scaleToTarget, setScaleToTarget] = useState(true);
  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string>('');
  const cancelRef = useRef(false);

  const fileOf = (id: string) => entries.find((e) => e.id === id);

  const { items, skipped } = useMemo(() => {
    const items: Item[] = [];
    const skipped: Skipped[] = [];
    const push = (c: Content, target: Playlist, note?: string) => {
      const entry = fileOf(c.id);
      if (!entry) return;
      items.push({ entry, content: c, plan: planFix(c, target, { scaleToTarget }), note });
    };
    if (singlePlaylist) {
      singleEvals.forEach((s) => {
        if (s.deviation !== null && s.deviation <= tolerance) push(s.content, singlePlaylist, s.feasible ? undefined : 'Cihaz engeli');
        else skipped.push({ content: s.content, reason: `Oran uymuyor (%${s.deviation?.toFixed(1) ?? '-'} sapma)` });
      });
    } else {
      result.assignments.forEach((a) => push(a.content, a.playlist));
      result.unmatchedContents.forEach((u) => {
        if (u.kind === 'DEVICE' && u.bestPlaylist) push(u.content, u.bestPlaylist, 'Cihaz engeli');
        else skipped.push({
          content: u.content,
          reason: u.kind === 'NO_FIT' ? 'Hiçbir ekrana oran uymuyor'
            : u.kind === 'CONTENTION' ? `Uygun ekran (${u.bestPlaylist?.name ?? '-'}) başka içeriğe atandı`
            : 'Dosya okunamadı',
        });
      });
    }
    return { items, skipped };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, result, singlePlaylist, singleEvals, tolerance, scaleToTarget]);

  const toFix = items.filter((i) => i.plan.action === 'transcode').length;
  const hasVideoFix = items.some((i) => i.plan.action === 'transcode' && i.plan.kind === 'video');

  const setRun = (id: string, patch: Partial<RunState>) =>
    setRuns((prev) => ({ ...prev, [id]: { ...(prev[id] || { status: 'pending', progress: 0 }), ...patch } }));

  const outFileName = (it: Item, used: Set<string>) => {
    const b = brand.trim().toLocaleUpperCase('tr-TR').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '');
    const stem = `${b || baseName(it.content.filename)}_${it.plan.outW}x${it.plan.outH}`;
    const folder = folderName(it.plan.target.name);
    let name = stem + it.plan.outExt;
    let k = 2;
    while (used.has(`${folder}/${name}`)) name = `${stem}_${k++}${it.plan.outExt}`;
    used.add(`${folder}/${name}`);
    return { folder, name };
  };

  const run = async () => {
    cancelRef.current = false;
    setBusy(true); setSummary('');
    setRuns(Object.fromEntries(items.map((i) => [i.content.id, { status: 'pending', progress: 0 } as RunState])));
    const files: Record<string, Uint8Array> = {};
    const used = new Set<string>();
    const report: string[] = [];
    let ok = 0, fail = 0;
    const now = new Date().toLocaleString('tr-TR');
    report.push(`YAYINA HAZIR PAKET — ${brand.trim() || 'Kampanya'}`, `Oluşturma: ${now}`, `Mod: ${singlePlaylist ? `Sadece ${singlePlaylist.name}` : 'Tüm ekranlar (otomatik atama)'} · Ölçüye getir: ${scaleToTarget ? 'evet' : 'hayır'}`, '');

    for (const it of items) {
      if (cancelRef.current) break;
      const id = it.content.id;
      const { folder, name } = outFileName(it, used);
      setRun(id, { status: 'running', progress: 0, outName: `${folder}/${name}` });
      try {
        let bytes: Uint8Array;
        let line = '';
        if (it.plan.action === 'copy') {
          bytes = new Uint8Array(await it.entry.file.arrayBuffer());
          line = 'olduğu gibi (değişiklik gerekmedi)';
          setRun(id, { status: 'ok', progress: 1, detail: 'Olduğu gibi eklendi' });
          ok++;
        } else {
          if (it.plan.kind === 'video' && !isFFmpegLoaded()) setRun(id, { detail: 'Motor hazırlanıyor…' });
          const blob = await applyFix(it.entry.file, it.plan, (r) => setRun(id, { progress: r, detail: undefined }));
          setRun(id, { detail: 'Doğrulanıyor…' });
          const v = await verifyOutput(blob, name, it.plan);
          bytes = new Uint8Array(await blob.arrayBuffer());
          const sum = verificationSummary(v.meta);
          line = `${it.plan.steps.join(' · ')}  =>  ${v.ok ? 'DOĞRULANDI' : 'HÂLÂ ENGEL: ' + v.problems.join(' | ')} (${sum})`;
          setRun(id, { status: v.ok ? 'ok' : 'fail', progress: 1, detail: v.ok ? `Doğrulandı · ${sum}` : v.problems.join(' · ') });
          if (v.ok) ok++; else fail++;
        }
        files[`${folder}/${name}`] = bytes;
        report.push(`[${folder}] ${name}  <=  ${it.content.filename}`, `    ${line}`);
        it.plan.unfixable.forEach((u) => report.push(`    ! Ajans düzeltmeli: ${u}`));
      } catch (e) {
        fail++;
        const msg = e instanceof Error ? e.message : String(e);
        setRun(id, { status: 'error', detail: msg });
        report.push(`[HATA] ${it.content.filename}: ${msg}`);
      }
    }

    if (skipped.length) {
      report.push('', 'PAKETE ALINMAYANLAR (ajansa geri gönder):');
      skipped.forEach((s) => report.push(`  - ${s.content.filename}: ${s.reason}`));
    }
    const cancelled = cancelRef.current;
    if (cancelled) report.push('', '(İşlem kullanıcı tarafından yarıda kesildi.)');

    if (Object.keys(files).length) {
      files['RAPOR.txt'] = strToU8(report.join('\r\n'));
      const zipped = zipSync(files, { level: 0 });
      const blob = new Blob([zipped.slice().buffer as ArrayBuffer], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const b = brand.trim().toLocaleUpperCase('tr-TR').replace(/[^\p{L}\p{N}_-]+/gu, '_') || 'paket';
      a.href = url; a.download = `${b}_yayina-hazir.zip`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
    setSummary(`${cancelled ? 'Yarıda kesildi. ' : ''}${ok} dosya hazır${fail ? `, ${fail} dosyada sorun var` : ''}${skipped.length ? `, ${skipped.length} dosya pakete alınmadı` : ''}.`);
    setBusy(false);
  };

  if (!items.length && !skipped.length) return null;

  const statusIcon = (s?: RunState) => {
    if (!s || s.status === 'pending') return <MinusCircle size={15} className="text-slate-300" />;
    if (s.status === 'running') return <Loader2 size={15} className="animate-spin text-primary" />;
    if (s.status === 'ok') return <CheckCircle2 size={15} className="text-emerald-500" />;
    if (s.status === 'fail') return <AlertTriangle size={15} className="text-amber-500" />;
    return <XCircle size={15} className="text-rose-500" />;
  };

  return (
    <div className="bg-white rounded-2xl border-2 border-primary/30 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
        <PackageCheck size={18} className="text-primary" />
        <h2 className="font-bold text-slate-800">Yayına Hazır Paket</h2>
        <span className="text-xs text-slate-400">· {items.length} dosya pakete girecek · {toFix} tanesi düzeltilecek{skipped.length ? ` · ${skipped.length} dışarıda` : ''}</span>
        <div className="flex-1" />
        <input value={brand} onChange={(e) => onBrand(e.target.value)} disabled={busy} placeholder="Marka / kampanya (dosya adı)"
          className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs w-52 uppercase focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none" />
        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
          <input type="checkbox" checked={scaleToTarget} disabled={busy} onChange={(e) => setScaleToTarget(e.target.checked)} style={{ accentColor: '#6366f1' }} />
          Ölçüyü ekrana birebir getir
        </label>
        {busy ? (
          <button onClick={() => { cancelRef.current = true; }} className="flex items-center gap-1.5 text-sm font-semibold border border-slate-300 text-slate-600 hover:bg-slate-50 px-3 py-2 rounded-lg">
            <Square size={14} /> Durdur (sıradaki dosyada)
          </button>
        ) : (
          <button onClick={run} disabled={!items.length} className="flex items-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-sm shadow-primary/20">
            <PackageCheck size={16} /> Hepsini Hazırla (ZIP)
          </button>
        )}
      </div>
      <div className="p-5 space-y-2">
        <p className="text-[11px] text-slate-500">
          Her dosya atandığı ekranın klasörüne konur. Gereken dosyalar düzeltilir, çıktı yeniden analiz edilip ekrana karşı doğrulanır ve ZIP içine <b>RAPOR.txt</b> eklenir.
          {hasVideoFix && ' Video düzeltme bu bilgisayarda yapılır (dosya hiçbir yere yüklenmez); 15–30 sn\'lik bir video genelde 1 dakikanın altında biter.'}
        </p>
        <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
          {items.map((it) => {
            const r = runs[it.content.id];
            return (
              <div key={it.content.id} className="px-3 py-2.5 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  {statusIcon(r)}
                  <span className="font-medium text-slate-800 truncate" title={it.content.filename}>{it.content.filename}</span>
                  <ArrowRight size={13} className="text-slate-300 flex-shrink-0" />
                  <span className="text-slate-600 truncate" title={it.plan.target.name}>{it.plan.target.name}</span>
                  {it.note && <span className="text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded px-1.5 py-0.5 flex-shrink-0">{it.note}</span>}
                  <span className="flex-1" />
                  {r?.status === 'running' && it.plan.kind === 'video' && it.plan.action === 'transcode' && (
                    <span className="inline-block w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden flex-shrink-0">
                      <span className="block h-full bg-primary transition-all" style={{ width: `${Math.round((r.progress || 0) * 100)}%` }} />
                    </span>
                  )}
                </div>
                <div className="ml-6 mt-0.5 text-[11px] text-slate-500">
                  {it.plan.action === 'copy' ? 'Olduğu gibi — düzeltme gerekmiyor' : it.plan.steps.join(' · ')}
                </div>
                {it.plan.unfixable.map((u, i) => (
                  <div key={i} className="ml-6 text-[11px] text-amber-700">⚠ Ajans düzeltmeli: {u}</div>
                ))}
                {r?.detail && (
                  <div className={`ml-6 text-[11px] ${r.status === 'error' || r.status === 'fail' ? 'text-rose-600' : r.status === 'ok' ? 'text-emerald-700' : 'text-slate-500'}`}>
                    {r.detail}{r.outName && r.status !== 'running' ? ` → ${r.outName}` : ''}
                  </div>
                )}
              </div>
            );
          })}
          {skipped.map((s) => (
            <div key={s.content.id} className="px-3 py-2.5 text-sm bg-slate-50/60">
              <div className="flex items-center gap-2 min-w-0">
                <XCircle size={15} className="text-slate-300" />
                <span className="text-slate-500 truncate">{s.content.filename}</span>
                <span className="text-[11px] text-rose-600">— pakete alınmayacak: {s.reason}</span>
              </div>
            </div>
          ))}
        </div>
        {summary && <div className="text-sm font-semibold text-slate-700 pt-1">{summary}</div>}
      </div>
    </div>
  );
}
