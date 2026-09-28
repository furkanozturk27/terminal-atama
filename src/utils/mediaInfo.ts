import MediaInfoFactory from 'mediainfo.js';
import { detectImageBars, detectVideoBars } from './blackBars';

const formatAspectRatio = (ratioVal: string | number | undefined) => {
  if (ratioVal === undefined || ratioVal === null) return undefined;
  const strVal = String(ratioVal);
  if (strVal.includes(':')) return strVal;
  const val = parseFloat(strVal);
  if (isNaN(val)) return strVal;

  if (Math.abs(val - 1.778) < 0.05) return '16:9';
  if (Math.abs(val - 1.333) < 0.05) return '4:3';
  if (Math.abs(val - 2.333) < 0.05) return '21:9';
  if (Math.abs(val - 0.562) < 0.05) return '9:16';
  if (Math.abs(val - 1.0) < 0.05) return '1:1';
  return val.toFixed(3);
};

// JPEG başlığını okuyup renk bileşeni sayısını (4 = CMYK) ve progressive olup olmadığını bulur.
async function inspectJpeg(file: File): Promise<{ cmyk: boolean; progressive: boolean } | null> {
  const buf = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    const len = (buf[i + 2] << 8) | buf[i + 3];
    const isSOF = m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
    if (isSOF) {
      return { cmyk: buf[i + 9] === 4, progressive: m === 0xc2 || m === 0xc6 || m === 0xca || m === 0xce };
    }
    i += 2 + len;
  }
  return null;
}

const isJpeg = (file: File) => file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name);

export const analyzeMediaLocally = async (file: File): Promise<any> => {
  if (file.type.startsWith('image/')) {
    // Basic image processing using browser DOM
    const base = await new Promise<any>((resolve) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(img.src);
        resolve({
          filename: file.name,
          file_type: file.type,
          size_bytes: file.size,
          width: img.width,
          height: img.height,
          codec_name: file.name.split('.').pop()?.toUpperCase(),
          display_aspect_ratio: formatAspectRatio(img.width / img.height)
        });
      };
      img.onerror = () => { URL.revokeObjectURL(img.src); resolve({ filename: file.name, file_type: file.type, size_bytes: file.size }); };
      img.src = URL.createObjectURL(file);
    });
    if (isJpeg(file)) {
      const j = await inspectJpeg(file).catch(() => null);
      if (j) { base.jpeg_cmyk = j.cmyk; base.jpeg_progressive = j.progressive; }
    }
    if (base.width) base.bars = await detectImageBars(file);
    return base;
  }

  // Video processing using MediaInfo
  const getSize = () => file.size;
  const readChunk = (chunkSize: number, offset: number) =>
    new Promise<Uint8Array>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event: any) => {
        if (event.target.error) reject(event.target.error);
        resolve(new Uint8Array(event.target.result));
      };
      reader.readAsArrayBuffer(file.slice(offset, offset + chunkSize));
    });

  const mediainfo = await MediaInfoFactory({
    format: 'object',
    locateFile: (path: string, prefix: string) => {
      if (path === 'MediaInfoModule.wasm') {
        return '/MediaInfoModule.wasm';
      }
      return prefix + path;
    }
  });

  const meta = await new Promise<any>((resolve, reject) => {
    mediainfo.analyzeData(getSize, readChunk)
      .then((result: any) => {
        const tracks: any[] = result?.media?.track ?? [];
        const videoTrack = tracks.find((t: any) => t['@type'] === 'Video');
        const general = tracks.find((t: any) => t['@type'] === 'General');
        const audio = tracks.filter((t: any) => t['@type'] === 'Audio');
        if (!videoTrack) {
          resolve({
            filename: file.name,
            file_type: file.type,
            size_bytes: file.size,
          });
          return;
        }

        const safeString = (val: any) => {
          if (Array.isArray(val)) return String(val[0]);
          if (val) return String(val);
          return undefined;
        };

        resolve({
          filename: file.name,
          file_type: file.type || 'application/octet-stream',
          size_bytes: file.size,
          codec_name: safeString(videoTrack.Format),
          width: parseInt(safeString(videoTrack.Width) || '0', 10) || undefined,
          height: parseInt(safeString(videoTrack.Height) || '0', 10) || undefined,
          duration: parseFloat(safeString(videoTrack.Duration) || safeString(general?.Duration) || '0') || 0,
          display_aspect_ratio: formatAspectRatio(safeString(videoTrack.DisplayAspectRatio)),
          avg_frame_rate: safeString(videoTrack.FrameRate),
          bit_rate: parseInt(safeString(videoTrack.BitRate) || safeString(videoTrack.BitRate_Nominal) || safeString(general?.OverallBitRate) || '0', 10) || 0,
          // Gizli risk alanları (siyah ekran / takılma nedenleri)
          bit_depth: parseInt(safeString(videoTrack.BitDepth) || '0', 10) || undefined,
          chroma: safeString(videoTrack.ChromaSubsampling),
          profile: safeString(videoTrack.Format_Profile),
          level: safeString(videoTrack.Format_Level),
          fps_mode: safeString(videoTrack.FrameRate_Mode),
          scan_type: safeString(videoTrack.ScanType),
          hdr: safeString(videoTrack.HDR_Format),
          transfer: safeString(videoTrack.transfer_characteristics),
          primaries: safeString(videoTrack.colour_primaries),
          container: safeString(general?.Format),
          has_audio: audio.length > 0,
          audio_codec: audio.length ? safeString(audio[0].Format) : undefined,
        });
      })
      .catch(reject)
      .finally(() => mediainfo.close());
  });

  if (meta.width && meta.height) meta.bars = await detectVideoBars(file, meta.width, meta.height);
  return meta;
};
