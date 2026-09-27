import React from 'react';
import { Link } from 'react-router-dom';
import { Activity, Cpu, ShieldCheck, Users } from 'lucide-react';
import SiteShell from '../components/SiteShell';
import { asset } from '../data/telemetry';
import { useAuth } from '../lib/session';

const STEPS = [
  { t: 'Register your datacenter', d: 'Create an owner account with your company and first site. It takes two minutes.' },
  { t: 'STS verifies you', d: 'Confirm your email and request activation. Soni Tech Solutions reviews and approves your organisation.' },
  { t: 'Connect with a one-time code', d: 'Generate a 30-minute code and run one install command on a server in your hall. The agent does the rest.' },
  { t: 'Invite your team', d: 'Add admins, operators and read-only viewers, wherever they sit, up to your plan’s seats.' },
];

const FEATURES = [
  { icon: Cpu, t: 'Read from the hardware itself', d: 'The on-prem agent polls server management controllers (IPMI) and network gear, so temperatures, fan speeds, power and faults come from the source, not from someone’s spreadsheet.' },
  { icon: Activity, t: 'Catch trouble before it trips', d: 'An on-site model scores every part for anomalies and flags slowing fans, rising temperatures and ageing hardware, so problems show amber long before they turn red.' },
  { icon: Users, t: 'One view for everyone', d: 'Engineers, managers and auditors open the same live 3D hall from any browser, each with the access their role allows.' },
];

const ROLES = [
  { r: 'Owner', d: 'Your organisation’s account holder. Manages everything, can’t be removed.' },
  { r: 'Admin', d: 'Invites the team, connects agents, adds sites.' },
  { r: 'Operator', d: 'Watches the twin and agent health day to day.' },
  { r: 'Viewer', d: 'Read-only access to the live twin, for managers and stakeholders.' },
];

const TRUST = [
  { t: 'Outbound only', d: 'The agent calls out over HTTPS. You open no inbound ports.' },
  { t: 'One-time codes', d: 'Enrolment codes expire in 30 minutes and work once. No keys travel by email.' },
  { t: 'Keys locked to a site', d: 'Each agent’s key can only write its own site, and you can revoke it in one click.' },
  { t: 'Your hall only', d: 'Every request is checked against your organisation. Nobody else can see your racks.' },
];

export default function Landing() {
  const { me } = useAuth();
  return (
    <SiteShell>
      <main>
        <div className="wrap hero">
          <div>
            <span className="eyebrow">Datacenter digital twin</span>
            <h1>See every rack, fan and fault in your datacenter, live in 3D.</h1>
            <p className="lead">
              Sparshika reads health straight from your servers, switches and power gear and streams it to a
              3D model of your hall that your whole team can open from anywhere.
            </p>
            <div className="hero__cta">
              {me ? (
                <Link to="/app" className="btn btn--primary">Open my datacenter</Link>
              ) : (
                <Link to="/signup" className="btn btn--primary">Register your datacenter</Link>
              )}
              <Link to="/demo" className="btn btn--ghost">Explore the demo hall</Link>
            </div>
          </div>
          <figure className="hero__shot">
            <img src={asset('hero-hall.jpg')} alt="The Sparshika 3D twin: rows of server racks in a cold aisle, with status lights on every unit" />
            <figcaption className="hero__chip">
              <span className="dot dot--ok" />
              <span>Demo hall: <b>22</b> racks, a status light on every unit</span>
            </figcaption>
          </figure>
        </div>

        <section className="section">
          <div className="wrap">
            <h2>From sign-up to a live hall in four steps</h2>
            <p className="sub">You stay in control at every step, and STS verifies every organisation before any data flows.</p>
            <ol className="steps">
              {STEPS.map((s, i) => (
                <li className="step" key={s.t}>
                  <span className="step__n">STEP {i + 1}</span>
                  <h3>{s.t}</h3>
                  <p>{s.d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="section">
          <div className="wrap">
            <h2>Built for the people who keep the lights green</h2>
            <div className="features">
              {FEATURES.map(({ icon: Icon, t, d }) => (
                <div className="feature" key={t}>
                  <h3><Icon size={18} aria-hidden="true" /> {t}</h3>
                  <p>{d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="wrap">
            <h2>The right access for every seat</h2>
            <p className="sub">Plans include a number of seats. Your admins invite people and choose their role, with no request to STS needed.</p>
            <div className="roles">
              {ROLES.map((r) => <div className="role" key={r.r}><b>{r.r}</b><span>{r.d}</span></div>)}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="wrap">
            <h2><ShieldCheck size={22} style={{ verticalAlign: '-3px', color: 'var(--teal)' }} aria-hidden="true" /> Secure by design</h2>
            <ul className="trust">
              {TRUST.map((t) => <li key={t.t}><b>{t.t}</b>{t.d}</li>)}
            </ul>
          </div>
        </section>

        <section className="section">
          <div className="wrap">
            <div className="cta-band">
              <div>
                <h2>Ready to see your hall?</h2>
                <p className="sub">Register now. You can explore the demo while STS reviews your organisation.</p>
              </div>
              <Link to={me ? '/app' : '/signup'} className="btn btn--primary">{me ? 'Open my datacenter' : 'Register your datacenter'}</Link>
            </div>
          </div>
        </section>
      </main>
    </SiteShell>
  );
}
