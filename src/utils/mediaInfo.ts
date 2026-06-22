import MediaInfoFactory from 'mediainfo.js';

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

export const analyzeMediaLocally = async (file: File): Promise<any> => {
  if (file.type.startsWith('image/')) {
    // Basic image processing using browser DOM
    return new Promise((resolve) => {
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
      img.src = URL.createObjectURL(file);
    });
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
  
  return new Promise((resolve, reject) => {
    mediainfo.analyzeData(getSize, readChunk)
      .then((result: any) => {
        const videoTrack = result?.media?.track?.find((t: any) => t['@type'] === 'Video');
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
          duration: parseFloat(safeString(videoTrack.Duration) || '0') || 0,
          display_aspect_ratio: formatAspectRatio(safeString(videoTrack.DisplayAspectRatio)),
          avg_frame_rate: safeString(videoTrack.FrameRate),
          bit_rate: parseInt(safeString(videoTrack.BitRate) || '0', 10) || 0
        });
      })
      .catch(reject)
      .finally(() => mediainfo.close());
  });
};
