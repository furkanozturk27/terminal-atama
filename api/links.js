// Ajans yükleme linkleri.
// GET  ?token=X          -> (herkese açık) link bilgisi: kampanya, ajans, aktif mi, gönderim açık mı
// GET                    -> (admin) tüm linkler + gönderimleri
// POST {campaign,agency} -> (admin) yeni link oluştur
// PATCH {token,active}   -> (admin) linki aç/kapat
// DELETE ?token=X        -> (admin) linki, gönderimlerini ve yüklenen dosyaları sil
import crypto from 'node:crypto';
import { del } from '@vercel/blob';
import { redis, LINKS_KEY, subsKey, cors, isAdmin, body, getLink, validToken, blobConfigured } from './_shared.js';

const clean = (s, n = 80) => String(s ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);

export default async function handler(req, res) {
  cors(res, 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!redis) return res.status(503).json({ error: 'KV deposu yapılandırılmamış.' });

  try {
    const t = req.query?.token;

    if (req.method === 'GET' && t) {
      const link = await getLink(t);
      if (!link) return res.status(404).json({ error: 'Link bulunamadı veya silinmiş.' });
      return res.status(200).json({
        token: link.token, campaign: link.campaign, agency: link.agency,
        active: link.active !== false, uploadsEnabled: blobConfigured(),
      });
    }

    if (!isAdmin(req)) return res.status(401).json({ error: 'Şifre hatalı.' });

    if (req.method === 'GET') {
      const all = (await redis.hgetall(LINKS_KEY)) || {};
      const links = await Promise.all(Object.values(all).map(async (v) => {
        const link = typeof v === 'string' ? JSON.parse(v) : v;
        const subs = ((await redis.lrange(subsKey(link.token), 0, -1)) || []).map((s) => (typeof s === 'string' ? JSON.parse(s) : s));
        return { ...link, submissions: subs };
      }));
      links.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      return res.status(200).json({ links, uploadsEnabled: blobConfigured() });
    }

    if (req.method === 'POST') {
      const b = body(req);
      const campaign = clean(b.campaign);
      if (!campaign) return res.status(400).json({ error: 'Kampanya adı gerekli.' });
      const token = crypto.randomBytes(9).toString('hex').slice(0, 14);
      const link = { token, campaign, agency: clean(b.agency), createdAt: Date.now(), active: true };
      await redis.hset(LINKS_KEY, { [token]: JSON.stringify(link) });
      return res.status(200).json({ link: { ...link, submissions: [] } });
    }

    if (req.method === 'PATCH') {
      const b = body(req);
      const link = await getLink(b.token);
      if (!link) return res.status(404).json({ error: 'Link bulunamadı.' });
      link.active = !!b.active;
      await redis.hset(LINKS_KEY, { [link.token]: JSON.stringify(link) });
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      if (!validToken(t)) return res.status(400).json({ error: 'Geçersiz token.' });
      const subs = ((await redis.lrange(subsKey(t), 0, -1)) || []).map((s) => (typeof s === 'string' ? JSON.parse(s) : s));
      const urls = subs.flatMap((s) => (s.files || []).map((f) => f.url)).filter(Boolean);
      if (urls.length && blobConfigured()) {
        try { await del(urls); } catch { /* dosyalar zaten silinmiş olabilir */ }
      }
      await redis.hdel(LINKS_KEY, t);
      await redis.del(subsKey(t));
      return res.status(200).json({ ok: true, deletedFiles: urls.length });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
