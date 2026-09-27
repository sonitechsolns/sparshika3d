// mockApi.js — an in-browser stand-in for the Sparshika API, used only by
// preview builds (VITE_MOCK_API=1) so the site can be clicked through end to
// end without a backend. It mirrors the real API's rules (roles, seats,
// one-time codes, statuses) closely enough to review the flows. Data stays in
// this browser (localStorage). Nothing here is used in production builds.

const KEY = 'sparshika-preview-v1';
const DAY = 86400000;

export const PREVIEW_ACCOUNTS = [
  { email: 'owner@acme.demo', password: 'preview-owner', note: 'Owner of an active datacenter' },
  { email: 'sts@sonitech.demo', password: 'preview-admin', note: 'STS admin console' },
];

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
const tok = () => uid().replace(/-/g, '') + uid().replace(/-/g, '').slice(0, 10);
const nowIso = () => new Date().toISOString();

function seed() {
  const t = nowIso();
  const owner = { id: uid(), email: 'owner@acme.demo', name: 'Asha Mehta', password: 'preview-owner', verified: true, sts: false, created_at: t };
  const sts = { id: uid(), email: 'sts@sonitech.demo', name: 'Bhavya (STS)', password: 'preview-admin', verified: true, sts: true, created_at: t };
  const viewer = { id: uid(), email: 'ravi@acme.demo', name: 'Ravi Kulkarni', password: 'preview-viewer', verified: true, sts: false, created_at: t };
  const pendingOwner = { id: uid(), email: 'ops@northwind.demo', name: 'Neha Rao', password: 'preview-pending', verified: true, sts: false, created_at: t };
  const acme = { id: uid(), name: 'Acme Data Centers', status: 'active', plan: 'starter', seat_limit: 4, city: 'Mumbai', country: 'India', phone: '+91 22 5555 0100', activation_requested_at: t, decision_note: null, created_at: t };
  const north = { id: uid(), name: 'Northwind Colo', status: 'pending', plan: 'starter', seat_limit: 4, city: 'Pune', country: 'India', phone: '+91 20 5555 0199', activation_requested_at: t, decision_note: null, created_at: t };
  return {
    users: [owner, sts, viewer, pendingOwner],
    orgs: [acme, north],
    sites: [
      { id: 'acme-mumbai-dc1-7f3a', org_id: acme.id, name: 'Mumbai DC1', city: 'Mumbai' },
      { id: 'northwind-pune-a-19c2', org_id: north.id, name: 'Pune Hall A', city: 'Pune' },
    ],
    members: [
      { user_id: owner.id, org_id: acme.id, role: 'owner', created_at: t },
      { user_id: viewer.id, org_id: acme.id, role: 'viewer', created_at: t },
      { user_id: pendingOwner.id, org_id: north.id, role: 'owner', created_at: t },
    ],
    invites: [], codes: [], agents: [], tokens: [], outbox: [], session: null,
  };
}

let _db = null;
function db() {
  if (_db) return _db;
  try { _db = JSON.parse(localStorage.getItem(KEY)); } catch { _db = null; }
  if (!_db) _db = seed();
  return _db;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(_db)); } catch { /* private mode: memory only */ }
}
export function resetPreview() {
  _db = seed();
  save();
}

class Err extends Error {
  constructor(status, detail) { super(detail); this.status = status; }
}
const need = (cond, status, detail) => { if (!cond) throw new Err(status, detail); };

function mail(to, subject, text) {
  db().outbox.unshift({ to, subject, text, at: nowIso() });
  db().outbox = db().outbox.slice(0, 50);
}
// Preview builds use hash routing (they're hosted at a fixed page URL).
const link = (path) => `${location.href.split('#')[0]}#${path}`;

function me() {
  const d = db();
  return d.users.find((u) => u.id === d.session) || null;
}
function requireUser() {
  const u = me();
  need(u, 401, 'sign in required');
  return u;
}
function membership(u, orgId, roles) {
  const d = db();
  const org = d.orgs.find((o) => o.id === orgId);
  need(org, 404, 'organisation not found');
  const m = d.members.find((x) => x.user_id === u.id && x.org_id === orgId);
  need(m || u.sts, 404, 'organisation not found');
  const role = m ? m.role : 'sts';
  need(!roles || roles.includes(role) || u.sts, 403, "your role can't do that");
  return { org, role };
}
const seatsUsed = (orgId) => {
  const d = db();
  return d.members.filter((m) => m.org_id === orgId).length +
    d.invites.filter((i) => i.org_id === orgId && !i.accepted_at && Date.parse(i.expires_at) > Date.now()).length;
};
function orgView(org, role) {
  const d = db();
  return {
    id: org.id, name: org.name, status: org.status, role, plan: org.plan, seat_limit: org.seat_limit,
    seats_used: seatsUsed(org.id), activation_requested_at: org.activation_requested_at,
    decision_note: org.decision_note, city: org.city, country: org.country,
    sites: d.sites.filter((s) => s.org_id === org.id).map(({ id, name, city }) => ({ id, name, city })),
  };
}
const userView = (u) => ({ id: u.id, email: u.email, name: u.name, email_verified: u.verified, is_sts_admin: u.sts });
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28) || 'site';
function sendVerify(u) {
  const t = tok();
  db().tokens.push({ t, user_id: u.id, purpose: 'verify', exp: Date.now() + 2 * DAY });
  mail(u.email, 'Confirm your email for Sparshika', `Hi ${u.name},\n\nConfirm your email address:\n\n${link('/verify?token=' + t)}\n\n— Soni Tech Solutions`);
}
function consume(t, purpose) {
  const x = db().tokens.find((k) => k.t === t && k.purpose === purpose && !k.used && k.exp > Date.now());
  need(x, 400, 'this link has expired or was already used — request a new one');
  x.used = true;
  return db().users.find((u) => u.id === x.user_id);
}

// Fake agent telemetry for enrolled preview sites, shaped like the real agent's.
function fakeWorldstate(siteId) {
  const parts = [
    ['GPU-PILOT-01', 'gpu', 38, 2], ['R760-A17', 'server', 40, 2], ['TOR-SW-03', 'switch', 42, 1],
    ...[1, 2, 3, 4, 5, 6].map((i) => [`FAN-R760-0${i}`, 'fan', 40, 2]),
  ];
  const t = Date.now() / 1000;
  const records = {};
  for (const [pid, kind, u, h] of parts) {
    const w = Math.sin(t / 30 + pid.length) * 0.5 + 0.5;
    const fan = kind === 'fan';
    const temp = fan ? 24 + w * 6 : kind === 'gpu' ? 50 + w * 20 : 38 + w * 14;
    const rpm = fan ? Math.round(7000 + w * 3000) : null;
    records[pid] = {
      site_id: siteId, agent_id: 'preview-agent', node_id: pid.toLowerCase(), part_id: pid,
      timestamp: new Date().toISOString(), source: 'ipmi', age_days: pid === 'TOR-SW-03' ? 980 : 410,
      kind, position: { rack_id: 'RACK-03', start_u: u, height_u: h },
      metrics: {
        temp_c: Math.round(temp * 10) / 10, load_pct: Math.round(fan ? rpm / 180 : 30 + w * 40),
        fan_rpm: fan ? [rpm] : kind === 'server' ? [8200, 8350, 8100, 8290, 8400, 8220] : kind === 'gpu' ? [2100, 2140] : [9000, 9100],
        power_w: fan ? 6 : kind === 'gpu' ? 180 + w * 120 : 420 + w * 200, voltage_v: 12.1, status: 'OK',
      },
      health: { condition: pid === 'TOR-SW-03' ? 'Maintenance Recommended' : 'Optimal', anomaly_score: Math.round(w * 20) / 100, forecast: 'stable' },
    };
  }
  return { schema_version: '1.1.0', site_id: siteId, generated_at: new Date().toISOString(), records };
}

// ----------------------------------------------------------------- routes
function route(method, path, q, body) {
  const d = db();
  let m;
  const B = body || {};

  if (method === 'GET' && path === '/api/v1/auth/me') {
    const u = requireUser();
    const orgs = d.members.filter((x) => x.user_id === u.id)
      .map((x) => orgView(d.orgs.find((o) => o.id === x.org_id), x.role));
    return { user: userView(u), orgs };
  }
  if (method === 'POST' && path === '/api/v1/auth/signup') {
    need(B.name && B.email && B.org_name && B.site_name, 422, 'fill in every required field');
    need(String(B.password || '').length >= 10, 422, 'password needs at least 10 characters');
    need(!d.users.some((u) => u.email === B.email.toLowerCase()), 409, 'an account with this email already exists — sign in instead');
    const u = { id: uid(), email: B.email.toLowerCase(), name: B.name, password: B.password, verified: false, sts: false, created_at: nowIso() };
    const org = { id: uid(), name: B.org_name, status: 'pending', plan: 'starter', seat_limit: 4, city: B.city, country: B.country, phone: B.phone, activation_requested_at: null, decision_note: null, created_at: nowIso() };
    d.users.push(u); d.orgs.push(org);
    d.sites.push({ id: `${slug(B.org_name + '-' + B.site_name)}-${uid().slice(0, 4)}`, org_id: org.id, name: B.site_name, city: B.city });
    d.members.push({ user_id: u.id, org_id: org.id, role: 'owner', created_at: nowIso() });
    sendVerify(u);
    d.session = u.id;
    return { ok: true };
  }
  if (method === 'POST' && path === '/api/v1/auth/login') {
    const u = d.users.find((x) => x.email === String(B.email || '').toLowerCase());
    need(u && u.password === B.password, 401, 'email or password is incorrect');
    d.session = u.id;
    return { ok: true };
  }
  if (method === 'POST' && path === '/api/v1/auth/logout') { d.session = null; return { ok: true }; }
  if (method === 'POST' && path === '/api/v1/auth/verify') { consume(B.token, 'verify').verified = true; return { ok: true }; }
  if (method === 'POST' && path === '/api/v1/auth/resend-verification') { const u = requireUser(); if (!u.verified) sendVerify(u); return { ok: true }; }
  if (method === 'POST' && path === '/api/v1/auth/forgot') {
    const u = d.users.find((x) => x.email === String(B.email || '').toLowerCase());
    if (u) {
      const t = tok();
      d.tokens.push({ t, user_id: u.id, purpose: 'reset', exp: Date.now() + 3600000 });
      mail(u.email, 'Reset your Sparshika password', `Hi ${u.name},\n\nReset your password:\n\n${link('/reset?token=' + t)}\n\nThis link expires in 1 hour.`);
    }
    return { ok: true };
  }
  if (method === 'POST' && path === '/api/v1/auth/reset') {
    need(String(B.password || '').length >= 10, 422, 'password needs at least 10 characters');
    const u = consume(B.token, 'reset');
    u.password = B.password; u.verified = true; d.session = null;
    return { ok: true };
  }
  if ((m = path.match(/^\/api\/v1\/orgs\/([^/]+)\/request-activation$/)) && method === 'POST') {
    const u = requireUser();
    const { org } = membership(u, m[1], ['owner']);
    need(u.verified, 409, 'confirm your email address first');
    need(['pending', 'rejected'].includes(org.status), 409, `organisation is already ${org.status}`);
    Object.assign(org, { status: 'pending', activation_requested_at: nowIso(), decision_note: null });
    return { ok: true };
  }
  if ((m = path.match(/^\/api\/v1\/orgs\/([^/]+)\/members$/)) && method === 'GET') {
    const u = requireUser();
    const { org, role } = membership(u, m[1]);
    const manage = ['owner', 'admin'].includes(role) || u.sts;
    return {
      members: d.members.filter((x) => x.org_id === org.id).map((x) => {
        const mu = d.users.find((y) => y.id === x.user_id);
        return { id: mu.id, email: mu.email, name: mu.name, role: x.role, email_verified: mu.verified, joined_at: x.created_at };
      }),
      invites: manage ? d.invites.filter((i) => i.org_id === org.id && !i.accepted_at).map(({ id, email, role: r, expires_at }) => ({ id, email, role: r, expires_at })) : [],
      seat_limit: org.seat_limit, seats_used: seatsUsed(org.id),
    };
  }
  if ((m = path.match(/^\/api\/v1\/orgs\/([^/]+)\/invites$/)) && method === 'POST') {
    const u = requireUser();
    const { org, role } = membership(u, m[1], ['owner', 'admin']);
    const email = String(B.email || '').toLowerCase();
    need(/.+@.+\..+/.test(email), 422, 'email must be a valid email address');
    const existing = d.users.find((x) => x.email === email);
    need(!(existing && d.members.some((x) => x.user_id === existing.id && x.org_id === org.id)), 409, 'that person is already a member');
    const pending = d.invites.find((i) => i.org_id === org.id && i.email === email && !i.accepted_at);
    need(pending || seatsUsed(org.id) < org.seat_limit, 409, `all ${org.seat_limit} seats are in use — remove someone or ask STS for more seats`);
    need(B.role !== 'admin' || role === 'owner' || u.sts, 403, 'only the owner can invite admins');
    d.invites = d.invites.filter((i) => i !== pending);
    const t = tok();
    const inv = { id: uid(), org_id: org.id, email, role: B.role, token: t, expires_at: new Date(Date.now() + 7 * DAY).toISOString(), accepted_at: null };
    d.invites.push(inv);
    mail(email, `${u.name} invited you to ${org.name} on Sparshika`, `${u.name} invited you to ${org.name} as ${B.role}.\n\nAccept:\n\n${link('/invite?token=' + t)}`);
    return { id: inv.id, email, role: inv.role, expires_at: inv.expires_at };
  }
  if ((m = path.match(/^\/api\/v1\/orgs\/([^/]+)\/invites\/([^/]+)$/)) && method === 'DELETE') {
    const u = requireUser();
    membership(u, m[1], ['owner', 'admin']);
    d.invites = d.invites.filter((i) => i.id !== m[2]);
    return { ok: true };
  }
  if ((m = path.match(/^\/api\/v1\/orgs\/([^/]+)\/members\/([^/]+)$/))) {
    const u = requireUser();
    const leaving = m[2] === u.id;
    const { role } = membership(u, m[1], leaving && method === 'DELETE' ? null : ['owner', 'admin']);
    const target = d.members.find((x) => x.user_id === m[2] && x.org_id === m[1]);
    need(target, 404, 'member not found');
    need(target.role !== 'owner', 403, method === 'DELETE' ? "the owner can't be removed" : "the owner's role can't be changed");
    if (method === 'PATCH') {
      need(!((B.role === 'admin' || target.role === 'admin') && role !== 'owner' && !u.sts), 403, 'only the owner can grant or remove admin');
      target.role = B.role;
    } else {
      need(!(target.role === 'admin' && !leaving && role !== 'owner' && !u.sts), 403, 'only the owner can remove an admin');
      d.members = d.members.filter((x) => x !== target);
    }
    return { ok: true };
  }
  if ((m = path.match(/^\/api\/v1\/invites\/([^/]+)$/)) && method === 'GET' && m[1] !== 'accept') {
    const inv = d.invites.find((i) => i.token === m[1] && !i.accepted_at);
    need(inv, 404, 'this invitation has expired or was already used');
    const org = d.orgs.find((o) => o.id === inv.org_id);
    return { org_name: org.name, email: inv.email, role: inv.role, has_account: d.users.some((u) => u.email === inv.email) };
  }
  if (method === 'POST' && path === '/api/v1/invites/accept') {
    const inv = d.invites.find((i) => i.token === B.token && !i.accepted_at);
    need(inv, 404, 'this invitation has expired or was already used');
    let u = d.users.find((x) => x.email === inv.email);
    if (u) {
      need((me() && me().id === u.id) || u.password === B.password, 401, `sign in as ${inv.email} to accept this invitation`);
    } else {
      need(B.name && String(B.password || '').length >= 10, 422, 'enter your name and a password of at least 10 characters');
      u = { id: uid(), email: inv.email, name: B.name, password: B.password, verified: true, sts: false, created_at: nowIso() };
      d.users.push(u);
    }
    inv.accepted_at = nowIso();
    if (!d.members.some((x) => x.user_id === u.id && x.org_id === inv.org_id)) {
      d.members.push({ user_id: u.id, org_id: inv.org_id, role: inv.role, created_at: nowIso() });
    }
    d.session = u.id;
    return { ok: true, org_id: inv.org_id };
  }
  if ((m = path.match(/^\/api\/v1\/orgs\/([^/]+)\/sites$/)) && method === 'POST') {
    const u = requireUser();
    const { org } = membership(u, m[1], ['owner', 'admin']);
    need(org.status === 'active', 409, `organisation is ${org.status}, not active`);
    const s = { id: `${slug(org.name + '-' + B.name)}-${uid().slice(0, 4)}`, org_id: org.id, name: B.name, city: B.city || '' };
    d.sites.push(s);
    return s;
  }
  if ((m = path.match(/^\/api\/v1\/orgs\/([^/]+)\/sites\/([^/]+)\/agents$/)) && method === 'GET') {
    const u = requireUser();
    membership(u, m[1], ['owner', 'admin', 'operator']);
    const agents = d.agents.filter((a) => a.site_id === m[2]);
    return { agents, last_reading: agents.some((a) => !a.revoked_at) ? nowIso() : null };
  }
  if ((m = path.match(/^\/api\/v1\/orgs\/([^/]+)\/sites\/([^/]+)\/enrollment-codes$/)) && method === 'POST') {
    const u = requireUser();
    const { org } = membership(u, m[1], ['owner', 'admin']);
    need(org.status === 'active', 409, `organisation is ${org.status}, not active`);
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let raw = '';
    for (let i = 0; i < 8; i++) raw += A[Math.floor(Math.random() * A.length)];
    const code = `${raw.slice(0, 4)}-${raw.slice(4)}`;
    const expires_at = new Date(Date.now() + 30 * 60000).toISOString();
    d.codes.push({ code, site_id: m[2], expires_at, used: false });
    return { code, expires_at, site_id: m[2], command: `./setup.sh --enroll ${code} --api ${location.origin}` };
  }
  if ((m = path.match(/^\/api\/v1\/orgs\/([^/]+)\/sites\/([^/]+)\/agents\/([^/]+)$/)) && method === 'DELETE') {
    const u = requireUser();
    membership(u, m[1], ['owner', 'admin']);
    const a = d.agents.find((x) => x.id === m[3] && x.site_id === m[2] && !x.revoked_at);
    need(a, 404, 'agent not found');
    a.revoked_at = nowIso();
    return { ok: true };
  }
  if (method === 'POST' && path === '/api/v1/enroll') {
    const c = d.codes.find((x) => x.code === B.code && !x.used && Date.parse(x.expires_at) > Date.now());
    need(c, 400, 'this code is invalid, expired or already used — generate a new one');
    c.used = true;
    d.agents.push({ id: uid().replace(/-/g, '').slice(0, 12), site_id: c.site_id, label: B.agent_name || 'agent', added_by: 'enrolled', created_at: nowIso(), revoked_at: null });
    return { site_id: c.site_id, api_key: 'sk_preview' };
  }
  if (method === 'GET' && path === '/api/v1/worldstate') {
    const u = requireUser();
    const site = d.sites.find((s) => s.id === q.get('site_id'));
    need(site, 404, 'site not found');
    const { org } = membership(u, site.org_id);
    need(org.status === 'active' || u.sts, 403, `organisation is ${org.status}`);
    const live = d.agents.some((a) => a.site_id === site.id && !a.revoked_at);
    return live ? fakeWorldstate(site.id) : { schema_version: '1.1.0', site_id: site.id, generated_at: nowIso(), records: {} };
  }
  if (method === 'GET' && path === '/api/v1/admin/orgs') {
    const u = requireUser();
    need(u.sts, 403, 'STS staff only');
    const st = q.get('status');
    return {
      orgs: d.orgs.filter((o) => !st || o.status === st).map((o) => {
        const ownerM = d.members.find((x) => x.org_id === o.id && x.role === 'owner');
        const owner = ownerM && d.users.find((x) => x.id === ownerM.user_id);
        return { ...orgView(o, 'sts'), created_at: o.created_at, phone: o.phone, decided_at: o.decided_at || null,
          owner: owner ? { name: owner.name, email: owner.email } : null };
      }),
    };
  }
  if ((m = path.match(/^\/api\/v1\/admin\/orgs\/([^/]+)\/decision$/)) && method === 'POST') {
    const u = requireUser();
    need(u.sts, 403, 'STS staff only');
    const org = d.orgs.find((o) => o.id === m[1]);
    need(org, 404, 'organisation not found');
    const next = { approve: 'active', reject: 'rejected', suspend: 'suspended', reactivate: 'active' }[B.action];
    const allowed = { approve: ['pending', 'rejected'], reject: ['pending'], suspend: ['active'], reactivate: ['suspended'] }[B.action];
    need(allowed?.includes(org.status), 409, `can't ${B.action} an organisation that is ${org.status}`);
    Object.assign(org, { status: next, decision_note: B.note || null, decided_at: nowIso() });
    if (B.seat_limit) org.seat_limit = B.seat_limit;
    return { ok: true, status: next };
  }
  if ((m = path.match(/^\/api\/v1\/admin\/orgs\/([^/]+)$/)) && method === 'PATCH') {
    const u = requireUser();
    need(u.sts, 403, 'STS staff only');
    const org = d.orgs.find((o) => o.id === m[1]);
    need(org, 404, 'organisation not found');
    if (B.seat_limit) org.seat_limit = B.seat_limit;
    if (B.plan) org.plan = B.plan;
    return { ok: true };
  }
  if (method === 'GET' && path === '/api/v1/dev/outbox') return { emails: d.outbox };
  throw new Err(404, 'not found');
}

export async function mockFetch(url, opts = {}) {
  const u = new URL(url, location.origin);
  const method = (opts.method || 'GET').toUpperCase();
  let body = null;
  try { body = opts.body ? JSON.parse(opts.body) : null; } catch { body = null; }
  await new Promise((r) => setTimeout(r, 120));   // feel like a network call
  try {
    const data = route(method, u.pathname, u.searchParams, body);
    save();
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    save();
    const status = e instanceof Err ? e.status : 500;
    return new Response(JSON.stringify({ detail: e.message }), { status, headers: { 'Content-Type': 'application/json' } });
  }
}
