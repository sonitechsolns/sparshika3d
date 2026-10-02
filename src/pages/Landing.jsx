import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import SiteShell from '../components/SiteShell';
import TouchRack from '../components/TouchRack';
import { asset } from '../data/telemetry';
import { useAuth } from '../lib/session';

const SHOWCASE = [
  {
    img: 'home-alerts.jpg',
    alt: 'The Hall health drawer listing failed parts and parts at risk, beside the 3D hall',
    t: 'The faulty part, not just the rack',
    d: 'Failed parts and the parts likely to fail next, each with the reason and the fix. Anything that could take a server down is flagged as a downtime risk, and one click flies you to it.',
  },
  {
    img: 'home-walk.jpg',
    alt: 'Walk mode: an eye-level view down a cold aisle with markers on failing units and a floor map',
    t: 'Walk the floor from anywhere',
    d: 'Step into the hall at eye level, like street view. Every failing unit carries a marker, and a floor map shows where you are standing.',
  },
  {
    img: 'home-cabling.jpg',
    alt: 'The hot aisle with black power cords, blue copper and yellow fibre running to every rack',
    t: 'Every cable, traced',
    d: 'Power, copper and fibre drawn rack by rack, kept apart the way your hall is built, so you know what a unit is plugged into before anyone touches it.',
  },
];

const STEPS = [
  { t: 'Register your datacenter', d: 'Create an owner account with your company and first site.' },
  { t: 'STS verifies you', d: 'Confirm your email and request activation. Soni Tech Solutions reviews every organisation.' },
  { t: 'Connect your hall', d: 'Run one install command with a 30-minute code. The agent reads your servers’ management controllers (IPMI) and network gear.' },
  { t: 'Invite your team', d: 'Admins, operators and read-only viewers, wherever they sit, up to your plan’s seats.' },
];

const ROLES = [
  ['Owner', 'Your organisation’s account holder. Manages everything.'],
  ['Admin', 'Invites the team, connects agents, adds sites.'],
  ['Operator', 'Watches the hall and the agents day to day.'],
  ['Viewer', 'Read-only access, for managers and auditors.'],
];

const TRUST = [
  ['Outbound only', 'The agent calls out over HTTPS. You open no inbound ports.'],
  ['One-time codes', 'Enrolment codes expire in 30 minutes and work once.'],
  ['Keys locked to a site', 'An agent’s key can only write its own site, and you can revoke it in one click.'],
  ['Your hall only', 'Every request is checked against your organisation.'],
];

/**
 * A soft amber light that follows the pointer, as on SnapNexus. Fine pointers
 * only; with reduced motion (or on touch screens) it rests behind the hero.
 */
function CursorGlow() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      || !window.matchMedia('(pointer: fine)').matches;
    if (still) { el.classList.add('glow--rest'); return undefined; }
    let tx = window.innerWidth * 0.7, ty = window.innerHeight * 0.3, x = tx, y = ty, raf = 0;
    const loop = () => {
      x += (tx - x) * 0.08; y += (ty - y) * 0.08;
      el.style.transform = `translate3d(${x - 300}px, ${y - 300}px, 0)`;
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.5 ? requestAnimationFrame(loop) : 0;
    };
    const move = (e) => { tx = e.clientX; ty = e.clientY; if (!raf) raf = requestAnimationFrame(loop); };
    window.addEventListener('pointermove', move, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => { window.removeEventListener('pointermove', move); cancelAnimationFrame(raf); };
  }, []);
  return <div className="glow" aria-hidden="true"><div ref={ref} className="glow__orb" /></div>;
}

/** Sections drift up a few pixels as they come into view (skipped with reduced motion). */
function useReveal() {
  useEffect(() => {
    const els = [...document.querySelectorAll('[data-reveal]')];
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return undefined;
    document.documentElement.classList.add('reveal-ready');
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    els.forEach((el) => io.observe(el));
    return () => { io.disconnect(); document.documentElement.classList.remove('reveal-ready'); };
  }, []);
}

export default function Landing() {
  const { me } = useAuth();
  useReveal();
  const primary = me ? { to: '/app', label: 'Open my datacenter' } : { to: '/signup', label: 'Register your datacenter' };
  return (
    <SiteShell>
      <CursorGlow />
      <main className="home">
        <section className="home-hero">
          <div className="wrap home-hero__grid">
            <div className="home-hero__text">
              <h1 lang="hi" className="home-hero__hi">हर मशीन, बस एक स्पर्श दूर।</h1>
              <p className="home-hero__en">Every machine in your datacenter, one touch away.</p>
              <p className="home-hero__lead">
                Sparshika builds a live 3D copy of your server hall from the hardware itself. When a fan slows
                down or a power supply dies, you see which one, in which rack, and fly straight to it.
              </p>
              <div className="home-hero__cta">
                <Link to={primary.to} className="btn btn--primary btn--lg">{primary.label}</Link>
                <Link to="/demo" className="btn btn--ghost btn--lg">Walk the demo hall</Link>
              </div>
              <p className="home-hero__name"><span lang="sa">स्पर्श</span> Sparsha means touch.</p>
            </div>
            <TouchRack />
          </div>
          <figure className="home-shot" data-reveal>
            <img src={asset('home-hero.jpg')} width="1600" height="1000"
              alt="The Sparshika twin with a server pulled out of its rack, its stopped fan glowing red, and the fan’s live readings in a side panel" />
            <figcaption>
              <span className="dot dot--crit" aria-hidden="true" />
              Demo hall: fan 5 in RACK-18-U23 has stopped. Sparshika opened the server and lit the fan red.
            </figcaption>
          </figure>
        </section>

        <section className="home-sec" aria-labelledby="sees">
          <div className="wrap">
            <h2 id="sees" data-reveal>What your team sees</h2>
            <div className="showcase">
              {SHOWCASE.map((s) => (
                <article className="showcase__row" key={s.t} data-reveal>
                  <img src={asset(s.img)} alt={s.alt} loading="lazy" width="1600" height="1000" />
                  <div>
                    <h3>{s.t}</h3>
                    <p>{s.d}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="home-sec" aria-labelledby="how">
          <div className="wrap">
            <h2 id="how" data-reveal>From sign-up to a live hall</h2>
            <ol className="timeline" data-reveal>
              {STEPS.map((s, i) => (
                <li key={s.t}>
                  <span className="timeline__n" aria-hidden="true">{i + 1}</span>
                  <h3>{s.t}</h3>
                  <p>{s.d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="home-sec" aria-label="Access and security">
          <div className="wrap home-cols">
            <div data-reveal>
              <h2>The right access for every seat</h2>
              <dl className="defs">
                {ROLES.map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}
              </dl>
            </div>
            <div data-reveal>
              <h2>Secure by design</h2>
              <dl className="defs">
                {TRUST.map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}
              </dl>
            </div>
          </div>
        </section>

        <section className="home-end" data-reveal>
          <div className="wrap">
            <p lang="hi" className="home-end__hi">स्पर्श से शुरू करें।</p>
            <h2>See your own hall in 3D.</h2>
            <p>Register now. You can walk the demo hall while STS reviews your organisation.</p>
            <div className="home-hero__cta">
              <Link to={primary.to} className="btn btn--primary btn--lg">{primary.label}</Link>
              <Link to="/demo" className="btn btn--ghost btn--lg">Walk the demo hall</Link>
            </div>
          </div>
        </section>
      </main>
    </SiteShell>
  );
}
