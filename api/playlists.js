// Merkezi ekran/playlist deposu (Vercel Serverless Function + Upstash/Vercel KV).
// GET  -> kayıtlı listeyi döner ({ playlists: [...] } | { playlists: null })
// POST -> admin şifresiyle listeyi günceller (header: x-admin-password)
//
// Gerekli ortam değişkenleri (Vercel proje ayarları):
//   - KV_REST_API_URL / KV_REST_API_TOKEN  (Vercel KV)  veya
//     UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN  (Upstash entegrasyonu)
//   - ADMIN_PASSWORD  (buluta kaydetmek için gereken şifre)
import { Redis } from '@upstash/redis';

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;
const KEY = 'terminal-kadikoy:playlists';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-password');
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!redis) {
    return res.status(503).json({ error: 'KV deposu yapılandırılmamış (env değişkenleri eksik).' });
  }

  try {
    if (req.method === 'GET') {
      const data = await redis.get(KEY); // dizi (otomatik parse)
      return res.status(200).json({ playlists: Array.isArray(data) ? data : null });
    }

    if (req.method === 'POST') {
      if (!process.env.ADMIN_PASSWORD) {
        return res.status(503).json({ error: 'ADMIN_PASSWORD tanımlı değil.' });
      }
      const pw = req.headers['x-admin-password'];
      if (pw !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Şifre hatalı.' });
      }
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const list = Array.isArray(body.playlists) ? body.playlists : (Array.isArray(body) ? body : null);
      if (!list || !list.length) return res.status(400).json({ error: 'Geçersiz veya boş liste.' });
      await redis.set(KEY, list);
      return res.status(200).json({ ok: true, count: list.length });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
