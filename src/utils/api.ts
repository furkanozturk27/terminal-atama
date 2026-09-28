// Web'de (Vercel) aynı origin; masaüstü (Electron 127.0.0.1) ve yerel geliştirmede canlı siteye gider.
export const PUBLIC_SITE = 'https://terminal-atama.vercel.app';

const isLocal = () => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname) || window.location.protocol === 'file:';

export const API_BASE = isLocal() ? PUBLIC_SITE : '';
export const SITE_BASE = isLocal() ? PUBLIC_SITE : window.location.origin;

export const agencyUrl = (token: string) => `${SITE_BASE}/?ajans=${token}`;

export async function apiJson<T = any>(path: string, init: RequestInit & { adminPw?: string } = {}): Promise<T> {
  const { adminPw, headers, ...rest } = init;
  const r = await fetch(API_BASE + path, {
    cache: 'no-store',
    ...rest,
    headers: {
      ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
      ...(adminPw ? { 'x-admin-password': adminPw } : {}),
      ...(headers || {}),
    },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error((data && data.error) || `HTTP ${r.status}`) as Error & { status?: number };
    err.status = r.status;
    throw err;
  }
  return data as T;
}
