// Ajans portalından Vercel Blob'a doğrudan (istemci) yükleme için kısa ömürlü token üretir.
// Dosya bu fonksiyondan geçmez → 90 MB+ videolar fonksiyon gövde limitine takılmaz.
// Gerekli: Vercel projesine bağlı bir Blob deposu (BLOB_READ_WRITE_TOKEN otomatik gelir).
import { handleUpload } from '@vercel/blob/client';
import { cors, body, getLink, blobConfigured } from './_shared.js';

const MAX_BYTES = 400 * 1024 * 1024;

export default async function handler(req, res) {
  cors(res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!blobConfigured()) return res.status(503).json({ error: 'BLOB_NOT_CONFIGURED' });

  try {
    const json = await handleUpload({
      request: req,
      body: body(req),
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let token = '';
        try { token = JSON.parse(clientPayload || '{}').token; } catch { /* yoksay */ }
        const link = await getLink(token);
        if (!link || link.active === false) throw new Error('Link geçersiz veya kapatılmış.');
        if (!pathname.startsWith(`ajans/${token}/`)) throw new Error('Geçersiz dosya yolu.');
        return {
          allowedContentTypes: ['video/*', 'image/*', 'application/octet-stream'],
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ token }),
        };
      },
      onUploadCompleted: async () => { /* kayıt /api/submissions ile yapılıyor */ },
    });
    return res.status(200).json(json);
  } catch (e) {
    return res.status(400).json({ error: String((e && e.message) || e) });
  }
}
