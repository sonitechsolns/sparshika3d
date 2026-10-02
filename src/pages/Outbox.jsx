import React, { useEffect, useState } from 'react';
import SiteShell from '../components/SiteShell';
import { Alert, Spinner } from '../components/Ui';
import { api } from '../lib/api';

/** Local dev / preview only: the emails the API "sent", with working links. */
export default function Outbox() {
  const [emails, setEmails] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const load = () => api('/api/v1/dev/outbox').then((d) => setEmails(d.emails)).catch((e) => setError(e.message));
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, []);
  const linkify = (text) => text.split(/(https?:\/\/\S+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? <a key={i} href={part} className="muted-link">{part}</a> : part);
  return (
    <SiteShell>
      <main className="page wrap">
        <div className="page__head"><div><h1>Email outbox</h1><p>Development view: emails the API would send, newest first.</p></div></div>
        {error ? <Alert>{error === 'Not found.' ? 'The outbox only exists with DEV_MODE=1 on the API.' : error}</Alert>
          : !emails ? <Spinner /> : emails.length === 0 ? <div className="panel"><p className="empty">No emails yet.</p></div>
            : emails.map((m, i) => (
              <article className="mail" key={i}>
                <header><span>To {m.to}</span><span>{new Date(m.at).toLocaleString()}</span></header>
                <h3>{m.subject}</h3>
                <pre>{linkify(m.text)}</pre>
              </article>
            ))}
      </main>
    </SiteShell>
  );
}
