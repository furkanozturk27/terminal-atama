// Ajans gönderimini kaydeder: { token, sender, note, files: [{ url, name, size, status, target, summary, issues }] }
import { redis, subsKey, cors, body, getLink } from './_shared.js';

const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, n);

export default async function handler(req, res) {
  cors(res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!redis) return res.status(503).json({ error: 'KV deposu yapılandırılmamış.' });

  try {
    const b = body(req);
    const link = await getLink(b.token);
    if (!link || link.active === false) return res.status(404).json({ error: 'Link geçersiz veya kapatılmış.' });
    const files = (Array.isArray(b.files) ? b.files : []).slice(0, 50)
      .filter((f) => typeof f?.url === 'string' && /^https:\/\/[a-z0-9.-]+\.blob\.vercel-storage\.com\//i.test(f.url) && f.url.includes(`/ajans/${link.token}/`))
      .map((f) => ({
        url: f.url,
        name: clean(f.name, 200),
        size: Number(f.size) || 0,
        status: ['ok', 'risky', 'fixed'].includes(f.status) ? f.status : 'ok',
        target: clean(f.target, 120),
        summary: clean(f.summary, 300),
        issues: (Array.isArray(f.issues) ? f.issues : []).slice(0, 10).map((i) => clean(i, 300)),
      }));
    if (!files.length) return res.status(400).json({ error: 'Gönderilecek dosya yok.' });
    const sub = { id: Date.now().toString(36), at: Date.now(), sender: clean(b.sender, 80), note: clean(b.note, 1000), files };
    await redis.rpush(subsKey(link.token), JSON.stringify(sub));
    return res.status(200).json({ ok: true, id: sub.id, count: files.length });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
