// Ortak yardımcılar (alt çizgiyle başlayan dosyalar Vercel'de endpoint olmaz).
import { Redis } from '@upstash/redis';

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
export const redis = url && token ? new Redis({ url, token }) : null;

export const LINKS_KEY = 'agency:links';               // hash: token -> link JSON
export const subsKey = (t) => `agency:subs:${t}`;       // list: gönderimler (JSON)

export function cors(res, methods = 'GET, POST, DELETE, OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-password');
}

export function isAdmin(req) {
  return !!process.env.ADMIN_PASSWORD && req.headers['x-admin-password'] === process.env.ADMIN_PASSWORD;
}

export function body(req) {
  if (typeof req.body === 'string') { try { return JSON.parse(req.body || '{}'); } catch { return {}; } }
  return req.body || {};
}

export const validToken = (t) => typeof t === 'string' && /^[a-z0-9]{8,32}$/.test(t);

export async function getLink(t) {
  if (!redis || !validToken(t)) return null;
  const v = await redis.hget(LINKS_KEY, t);
  if (!v) return null;
  return typeof v === 'string' ? JSON.parse(v) : v;
}

export const blobConfigured = () => !!process.env.BLOB_READ_WRITE_TOKEN;
