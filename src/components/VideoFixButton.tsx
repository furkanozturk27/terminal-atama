import React, { useState, useRef, useEffect } from 'react';
import { Wrench, Loader2, Download, RotateCcw } from 'lucide-react';
import { fixVideo, type FixParams } from '../utils/videoFix';

type Props = {
  file: File;
  params: FixParams;
  downloadName: string;
};

type Phase = 'idle' | 'loading' | 'encoding' | 'done' | 'error';

// Tek bir DEVICE-engelli video için: ffmpeg.wasm ile H.264 MP4'e yeniden kodla, indir.
// Tamamen izole & tembel yüklenir — bu bileşen dokunulmadıkça ffmpeg indirilmez.
const VideoFixButton: React.FC<Props> = ({ file, params, downloadName }) => {
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState('');
  const urlRef = useRef<string | null>(null);

  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const run = async () => {
    setErr('');
    setProgress(0);
    setPhase('loading');
    try {
      // loadFFmpeg fixVideo içinde çağrılıyor; ilk exec'e kadar "loading" göster,
      // ilerleme geldiğinde "encoding"e geç.
      const blob = await fixVideo(file, params, (r) => {
        setPhase('encoding');
        setProgress(r);
      });
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setPhase('done');
    } catch (e) {
      console.error('Video düzeltme hatası:', e);
      setErr(e instanceof Error ? e.message : 'Bilinmeyen hata');
      setPhase('error');
    }
  };

  const capText = `H.264 · ${params.maxFps} fps · ≤${params.maxBitrateMbps} Mbps`;

  if (phase === 'loading' || phase === 'encoding') {
    return (
      <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-600">
        <Loader2 size={13} className="animate-spin text-primary" />
        {phase === 'loading'
          ? 'Motor hazırlanıyor (ilk seferde ~30MB indirilir)…'
          : `Yeniden kodlanıyor… %${Math.round(progress * 100)}`}
        {phase === 'encoding' && (
          <span className="inline-block w-28 h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <span className="block h-full bg-primary transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
          </span>
        )}
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="mt-2 flex items-center gap-2 text-[11px]">
        <span className="text-emerald-700 font-semibold flex items-center gap-1">
          <Download size={13} /> İndirildi: {downloadName}
        </span>
        <button onClick={run} className="flex items-center gap-1 text-slate-500 hover:text-primary">
          <RotateCcw size={12} /> Tekrar
        </button>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="mt-2 flex items-center gap-2 text-[11px]">
        <span className="text-rose-600">Düzeltilemedi: {err}</span>
        <button onClick={run} className="flex items-center gap-1 text-slate-500 hover:text-primary">
          <RotateCcw size={12} /> Tekrar dene
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={run}
      title={`Videoyu ${capText} olacak şekilde yeniden kodlar (çözünürlük değişmez).`}
      className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-white bg-primary hover:bg-primary/90 px-2.5 py-1.5 rounded-md transition-colors"
    >
      <Wrench size={13} /> Otomatik Düzelt &amp; İndir (MP4)
      <span className="font-normal opacity-80">· {capText}</span>
    </button>
  );
};

export default VideoFixButton;
