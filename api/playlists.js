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
const MIG_KEY = 'terminal-kadikoy:migrations';

// Tek seferlik veri düzeltmeleri. Yalnızca HÂLÂ eski değerde olan alanlara dokunur
// (elle yapılmış değişiklikleri ezmez), önce eski listeyi yedekler, bir kez çalışır.
const MIGRATIONS = [
  {
    id: 'ajans-olcu-tablosu-2026-10', // GUNCEL-TERM. KADIKÖY DİJİTAL EKRAN DATA TEKNİK BİLGİ.xlsx
    apply(p) {
      const q = { ...p };
      const size = (w, h) => q.targetWidth === w && q.targetHeight === h;
      if (q.id === 'rossman' && size(504, 840)) { q.targetWidth = 864; q.targetHeight = 1440; }
      if (q.id === 'paribu-duvar' && size(336, 672)) { q.targetWidth = 576; q.targetHeight = 1152; }
      if (q.id === 'cezayir' && size(700, 1225) && !q.altSizes) q.altSizes = [{ w: 700, h: 1224 }];
      if (q.id === 'raketler' && Array.isArray(q.controllerNames) && q.controllerNames.join() === 'TB1-4G') q.controllerNames = ['T1-4G'];
      return q;
    },
  },
];

async function runMigrations(list) {
  let cur = list;
  for (const m of MIGRATIONS) {
    if (await redis.sismember(MIG_KEY, m.id)) continue;
    const next = cur.map((p) => m.apply(p));
    if (JSON.stringify(next) !== JSON.stringify(cur)) {
      await redis.set(`${KEY}:yedek:${m.id}`, cur);
      await redis.set(KEY, next);
      cur = next;
    }
    await redis.sadd(MIG_KEY, m.id);
  }
  return cur;
}

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
      const list = Array.isArray(data) ? await runMigrations(data) : null;
      return res.status(200).json({ playlists: list });
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
