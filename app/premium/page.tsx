'use client';

import { useState } from 'react';

export default function PremiumPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function startCheckout() {
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: 'PREMIUM' }),
      });
      const data = await response.json();
      if (response.status === 401) {
        window.location.href = '/auth';
        return;
      }
      if (!response.ok || !data.checkoutUrl) {
        setMessage(data.error || 'Premium checkout is not available yet.');
        return;
      }
      window.location.href = data.checkoutUrl;
    } catch {
      setMessage('Unable to open payment checkout. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <nav className="nav">
        <a className="brand" href="/">ASR<span>.</span></a>
        <div><a href="/listen">Listen</a> · <a href="/library">Library</a></div>
      </nav>
      <section className="hero">
        <div className="eyebrow">ASR PREMIUM</div>
        <h1>More music. Fewer limits.</h1>
        <p>Upgrade with card or Uganda Mobile Money. Premium activates after ASR receives and verifies the payment confirmation.</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 28 }}>
          <button className="auth-submit" onClick={startCheckout} disabled={loading} style={{ width: 'auto' }}>
            {loading ? 'Opening checkout…' : 'Upgrade to Premium'}
          </button>
          <a href="/listen" className="play" style={{ textDecoration: 'none', display: 'inline-block' }}>Keep listening</a>
        </div>
        {message && <p className="auth-message">{message}</p>}
      </section>
      <section className="grid">
        {[
          ['AD-FREE', 'A cleaner listening experience without platform ads.'],
          ['PREMIUM ACCESS', 'Unlock Premium-only releases and listening features.'],
          ['MOBILE MONEY', 'Pay in UGX using supported Uganda mobile money or card.'],
          ['30-DAY ACCESS', 'Each verified payment activates 30 days of Premium access.'],
        ].map(([title, copy]) => (
          <article className="card" key={title}>
            <div className="tag">{title}</div>
            <p style={{ marginTop: 56 }}>{copy}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
