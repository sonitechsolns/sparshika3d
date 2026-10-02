// api.js — one place for talking to the Sparshika API.
//
// The site calls the API on its OWN origin (/api/...): Vercel rewrites /api to
// the Render service and Vite proxies it in dev, so the session cookie is
// first-party, httpOnly and SameSite=Lax. Every request carries the
// X-Sparshika-Client header, which the API requires on state-changing calls
// (a cross-site page can't add it without a CORS preflight — CSRF defence).
//
// Preview builds (VITE_MOCK_API=1) answer from an in-browser mock instead, so
// the whole site can be clicked through without a backend.

const BASE = import.meta.env?.VITE_API_BASE || '';
export const MOCK = import.meta.env?.VITE_MOCK_API === '1';

export const apiUrl = (path) => `${BASE}${path}`;

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

let _mock = null;
export async function apiFetch(url, opts = {}) {
  if (MOCK) {
    _mock ||= await import('./mockApi');
    return _mock.mockFetch(url, opts);
  }
  const headers = { 'X-Sparshika-Client': 'web', ...(opts.headers || {}) };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(url, { credentials: 'include', ...opts, headers });
}

const FIELD = {
  email: 'Email', password: 'Password', name: 'Name', org_name: 'Company name',
  site_name: 'Site name', token: 'Link', role: 'Role', code: 'Code',
};

/** FastAPI errors → one readable sentence. */
function detailText(detail) {
  if (!detail) return '';
  if (typeof detail === 'string') return detail.charAt(0).toUpperCase() + detail.slice(1) + (/[.!?]$/.test(detail) ? '' : '.');
  if (Array.isArray(detail) && detail.length) {
    const d = detail[0];
    const field = FIELD[d.loc?.[d.loc.length - 1]] || 'A field';
    const msg = String(d.msg || 'is invalid')
      .replace(/^String should have at least (\d+) characters?$/, 'needs at least $1 characters')
      .replace(/^value is not a valid email address.*$/, 'must be a valid email address')
      .replace(/^Field required$/, 'is required');
    return `${field} ${msg}.`;
  }
  return '';
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await apiFetch(apiUrl(path), { method, body: body !== undefined ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new ApiError(res.status, detailText(data?.detail) || `Something went wrong (error ${res.status}).`);
  return data;
}
