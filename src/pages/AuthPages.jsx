import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import SiteShell from '../components/SiteShell';
import { Alert, Field } from '../components/Ui';
import { api, MOCK } from '../lib/api';
import { ROLE_LABEL, useAuth } from '../lib/session';

function AuthCard({ title, sub, wide, children, foot }) {
  return (
    <SiteShell>
      <main className="auth wrap">
        <div className={`card${wide ? ' card--wide' : ''}`}>
          <h1>{title}</h1>
          {sub && <p className="sub">{sub}</p>}
          {children}
          {foot && <div className="card__foot">{foot}</div>}
        </div>
      </main>
    </SiteShell>
  );
}

/** Tiny form state helper: values, onChange, submit with busy + error. */
function useForm(initial, onSubmit) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const bind = (name) => ({ id: name, value: values[name], onChange: (e) => setValues((v) => ({ ...v, [name]: e.target.value })) });
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try { await onSubmit(values); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return { values, bind, submit, error, busy, setError };
}

// Only follow same-site paths after sign-in (never an absolute URL).
const safeNext = (n) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/app');

export function Login() {
  const { refresh } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const f = useForm({ email: '', password: '' }, async (v) => {
    await api('/api/v1/auth/login', { method: 'POST', body: v });
    await refresh();
    nav(safeNext(params.get('next')));
  });
  return (
    <AuthCard title="Sign in" sub="Open your datacenter’s live twin."
      foot={<>New to Sparshika? <Link to="/signup">Register your datacenter</Link></>}>
      {MOCK && <PreviewLogins onPick={(a) => f.bind('email').onChange({ target: { value: a.email } }) || f.bind('password').onChange({ target: { value: a.password } })} />}
      <form className="form" onSubmit={f.submit} noValidate>
        <Alert>{f.error}</Alert>
        <Field label="Work email" type="email" autoComplete="email" required {...f.bind('email')} />
        <Field label="Password" type="password" autoComplete="current-password" required {...f.bind('password')} />
        <button className="btn btn--primary btn--block" disabled={f.busy}>{f.busy ? 'Signing in…' : 'Sign in'}</button>
        <div style={{ textAlign: 'right', fontSize: '0.85rem' }}><Link className="muted-link" to="/forgot">Forgot your password?</Link></div>
      </form>
    </AuthCard>
  );
}

function PreviewLogins({ onPick }) {
  const [accounts, setAccounts] = useState([]);
  useEffect(() => { import('../lib/mockApi').then((m) => setAccounts(m.PREVIEW_ACCOUNTS)); }, []);
  return (
    <div className="alert alert--info" style={{ marginTop: 16 }}>
      Preview accounts:{' '}
      {accounts.map((a, i) => (
        <span key={a.email}>{i > 0 && ' · '}
          <button type="button" className="linkish" onClick={() => onPick(a)}>{a.email}</button> ({a.note})
        </span>
      ))}
    </div>
  );
}

export function Signup() {
  const { refresh } = useAuth();
  const nav = useNavigate();
  const f = useForm({ name: '', email: '', password: '', org_name: '', site_name: '', city: '', country: 'India', phone: '' },
    async (v) => {
      await api('/api/v1/auth/signup', { method: 'POST', body: v });
      await refresh();
      nav('/app');
    });
  return (
    <AuthCard wide title="Register your datacenter"
      sub="Create the owner account for your organisation. After you confirm your email, STS reviews and activates it. You can explore the demo hall meanwhile."
      foot={<>Already registered? <Link to="/login">Sign in</Link></>}>
      <form className="form" onSubmit={f.submit} noValidate>
        <Alert>{f.error}</Alert>
        <div className="form__legend">You (the owner)</div>
        <div className="form__row">
          <Field label="Full name" autoComplete="name" required {...f.bind('name')} />
          <Field label="Work email" type="email" autoComplete="email" required {...f.bind('email')} />
        </div>
        <div className="form__row">
          <Field label="Password" type="password" autoComplete="new-password" required minLength={10}
            hint="At least 10 characters. A short phrase works well." {...f.bind('password')} />
          <Field label="Phone" type="tel" autoComplete="tel" placeholder="+91 …" hint="So STS can reach you during verification." {...f.bind('phone')} />
        </div>
        <div className="form__legend">Your datacenter</div>
        <div className="form__row">
          <Field label="Company name" autoComplete="organization" required {...f.bind('org_name')} />
          <Field label="First site name" placeholder="e.g. Mumbai DC1" required {...f.bind('site_name')} />
        </div>
        <div className="form__row">
          <Field label="City" autoComplete="address-level2" {...f.bind('city')} />
          <Field label="Country" autoComplete="country-name" {...f.bind('country')} />
        </div>
        <button className="btn btn--primary btn--block" disabled={f.busy}>{f.busy ? 'Creating your account…' : 'Create account'}</button>
      </form>
    </AuthCard>
  );
}

export function Forgot() {
  const [sent, setSent] = useState(false);
  const f = useForm({ email: '' }, async (v) => {
    await api('/api/v1/auth/forgot', { method: 'POST', body: v });
    setSent(true);
  });
  return (
    <AuthCard title="Reset your password" sub="We’ll email you a link to choose a new one."
      foot={<Link to="/login">Back to sign in</Link>}>
      {sent ? (
        <div className="form"><Alert kind="ok">If an account exists for {f.values.email}, a reset link is on its way. It expires in 1 hour.</Alert></div>
      ) : (
        <form className="form" onSubmit={f.submit} noValidate>
          <Alert>{f.error}</Alert>
          <Field label="Work email" type="email" autoComplete="email" required {...f.bind('email')} />
          <button className="btn btn--primary btn--block" disabled={f.busy}>Send reset link</button>
        </form>
      )}
    </AuthCard>
  );
}

export function Reset() {
  const [params] = useSearchParams();
  const [done, setDone] = useState(false);
  const f = useForm({ password: '', confirm: '' }, async (v) => {
    if (v.password !== v.confirm) throw new Error('The two passwords don’t match.');
    await api('/api/v1/auth/reset', { method: 'POST', body: { token: params.get('token') || '', password: v.password } });
    setDone(true);
  });
  return (
    <AuthCard title="Choose a new password" sub="Resetting signs you out on every device.">
      {done ? (
        <div className="form"><Alert kind="ok">Password changed. <Link to="/login">Sign in with your new password</Link>.</Alert></div>
      ) : (
        <form className="form" onSubmit={f.submit} noValidate>
          <Alert>{f.error}</Alert>
          <Field label="New password" type="password" autoComplete="new-password" minLength={10} hint="At least 10 characters." {...f.bind('password')} />
          <Field label="Repeat it" type="password" autoComplete="new-password" {...f.bind('confirm')} />
          <button className="btn btn--primary btn--block" disabled={f.busy}>Save new password</button>
        </form>
      )}
    </AuthCard>
  );
}

export function Verify() {
  const [params] = useSearchParams();
  const { refresh } = useAuth();
  const [state, setState] = useState({ busy: true, error: '' });
  useEffect(() => {
    let off = false;
    api('/api/v1/auth/verify', { method: 'POST', body: { token: params.get('token') || '' } })
      .then(() => refresh())
      .then(() => { if (!off) setState({ busy: false, error: '' }); })
      .catch((e) => { if (!off) setState({ busy: false, error: e.message }); });
    return () => { off = true; };
  }, [params, refresh]);
  return (
    <AuthCard title="Confirm your email">
      <div className="form">
        {state.busy ? <p className="sub">Checking your link…</p>
          : state.error ? <Alert>{state.error} <Link to="/app">Go to your account</Link> to send a new link.</Alert>
            : <Alert kind="ok">Email confirmed. <Link to="/app">Continue setting up your datacenter</Link>.</Alert>}
      </div>
    </AuthCard>
  );
}

export function AcceptInvite() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const { me, refresh } = useAuth();
  const nav = useNavigate();
  const [info, setInfo] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  useEffect(() => {
    api(`/api/v1/invites/${encodeURIComponent(token)}`).then(setInfo).catch((e) => setLoadErr(e.message));
  }, [token]);
  const f = useForm({ name: '', password: '' }, async (v) => {
    await api('/api/v1/invites/accept', { method: 'POST', body: { token, ...v } });
    await refresh();
    nav('/app');
  });
  if (loadErr) return <AuthCard title="Invitation"><div className="form"><Alert>{loadErr}</Alert></div></AuthCard>;
  if (!info) return <AuthCard title="Invitation"><p className="sub">Loading…</p></AuthCard>;
  const signedInAsInvitee = me?.user?.email === info.email;
  return (
    <AuthCard title={`Join ${info.org_name}`}
      sub={`You’ve been invited as ${ROLE_LABEL[info.role] || info.role} (${info.email}).`}>
      <form className="form" onSubmit={f.submit} noValidate>
        <Alert>{f.error}</Alert>
        {signedInAsInvitee ? (
          <p className="sub">You’re signed in as {info.email}.</p>
        ) : info.has_account ? (
          <Field label={`Password for ${info.email}`} type="password" autoComplete="current-password" {...f.bind('password')} />
        ) : (
          <>
            <Field label="Your name" autoComplete="name" {...f.bind('name')} />
            <Field label="Choose a password" type="password" autoComplete="new-password" minLength={10} hint="At least 10 characters." {...f.bind('password')} />
          </>
        )}
        <button className="btn btn--primary btn--block" disabled={f.busy}>Accept invitation</button>
      </form>
    </AuthCard>
  );
}
