import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Wrench, Loader2, Download, RotateCcw, ShieldCheck, ShieldAlert } from 'lucide-react';
import type { Playlist } from '../data/terminalKadikoy';
import { parseFps, type Content } from '../utils/matching';
import { planFix } from '../utils/fixPlan';
import { applyFix, isFFmpegLoaded, verifyOutput, type Verification } from '../utils/videoFix';

type Props = {
  file: File;
  content: Content;
  target: Playlist;
  downloadName?: string;
  // true: indirmek yerine düzeltilmiş dosyayı üst bileşene verir (ajans portalı dosyayı değiştirir)
  onFixed?: (file: File, v: Verification) => void;
  compact?: boolean;
};

type Phase = 'idle' | 'loading' | 'encoding' | 'verifying' | 'done' | 'error';

export function verificationSummary(m: Content): string {
  const fps = parseFps(m.avg_frame_rate);
  return [
    m.width && m.height ? `${m.width}×${m.height}` : '',
    m.codec_name || '',
    fps ? `${Math.round(fps * 100) / 100} fps` : '',
    m.bit_rate ? `${(m.bit_rate / 1e6).toFixed(1)} Mbps` : '',
    m.chroma ? `${m.bit_depth || 8}-bit ${m.chroma}` : '',
  ].filter(Boolean).join(' · ');
}

// Tek içerik için: planı göster → düzelt → doğrula → indir (veya onFixed ile geri ver).
const FixButton: React.FC<Props> = ({ file, content, target, downloadName, onFixed, compact }) => {
  const plan = useMemo(() => planFix(content, target, { scaleToTarget: true }), [content, target]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState('');
  const [ver, setVer] = useState<Verification | null>(null);
  const urlRef = useRef<string | null>(null);
  const name = downloadName || `${content.filename.replace(/\.[a-z0-9]+$/i, '') || 'icerik'}_duzeltildi${plan.outExt}`;

  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  if (plan.action === 'copy') return null;

  const save = (url: string) => {
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const run = async () => {
    setErr(''); setProgress(0); setVer(null);
    setPhase(plan.kind === 'video' && !isFFmpegLoaded() ? 'loading' : 'encoding');
    try {
      const blob = await applyFix(file, plan, (r) => { setPhase('encoding'); setProgress(r); });
      setPhase('verifying');
      const v = await verifyOutput(blob, name, plan);
      setVer(v);
      if (onFixed) {
        onFixed(new File([blob], name, { type: blob.type }), v);
      } else {
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = URL.createObjectURL(blob);
        save(urlRef.current);
      }
      setPhase('done');
    } catch (e) {
      console.error('Düzeltme hatası:', e);
      setErr(e instanceof Error ? e.message : 'Bilinmeyen hata');
      setPhase('error');
    }
  };

  const stepsText = plan.steps.join(' · ');

  if (phase === 'loading' || phase === 'encoding' || phase === 'verifying') {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
        <Loader2 size={13} className="animate-spin text-primary" />
        {phase === 'loading' && 'Motor hazırlanıyor (ilk seferde ~30 MB iner)…'}
        {phase === 'encoding' && (plan.kind === 'video' ? `Yeniden kodlanıyor… %${Math.round(progress * 100)}` : 'Görsel işleniyor…')}
        {phase === 'verifying' && 'Çıktı doğrulanıyor…'}
        {phase === 'encoding' && plan.kind === 'video' && (
          <span className="inline-block w-28 h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <span className="block h-full bg-primary transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
          </span>
        )}
      </div>
    );
  }

  if (phase === 'done' && ver) {
    return (
      <div className="mt-2 text-[11px] space-y-1">
        <div className={`flex flex-wrap items-center gap-1.5 font-semibold ${ver.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
          {ver.ok ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
          {ver.ok ? `Doğrulandı — ${target.name} için oynatılabilir` : 'Düzeltildi ama hâlâ engel var'}
          <span className="font-normal text-slate-500">· {verificationSummary(ver.meta)}</span>
        </div>
        {!ver.ok && ver.problems.map((p, i) => <div key={i} className="text-rose-700">• {p}</div>)}
        <div className="flex items-center gap-3">
          {!onFixed && urlRef.current && (
            <button onClick={() => save(urlRef.current!)} className="flex items-center gap-1 text-primary hover:underline"><Download size={12} /> {name}</button>
          )}
          <button onClick={run} className="flex items-center gap-1 text-slate-500 hover:text-primary"><RotateCcw size={12} /> Tekrar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2">
      {phase === 'error' && (
        <div className="text-[11px] text-rose-600 mb-1">Düzeltilemedi: {err}</div>
      )}
      <button
        onClick={run}
        title={stepsText}
        className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white bg-primary hover:bg-primary/90 px-2.5 py-1.5 rounded-md transition-colors"
      >
        {phase === 'error' ? <RotateCcw size={13} /> : <Wrench size={13} />}
        {onFixed ? 'Otomatik Düzelt' : 'Otomatik Düzelt & İndir'}
      </button>
      {!compact && <div className="text-[10.5px] text-slate-500 mt-1">Yapılacak: {stepsText}</div>}
      {!compact && plan.unfixable.length > 0 && (
        <div className="text-[10.5px] text-amber-700 mt-0.5">Otomatik düzeltilemez (ajans yapmalı): {plan.unfixable.length} sorun</div>
      )}
    </div>
  );
};

export default FixButton;
