'use client';

import { useEffect, useState } from 'react';

type Membership = {
  tier: 'FREE' | 'PREMIUM';
  status: 'FREE' | 'ACTIVE' | 'EXPIRED';
  active: boolean;
  renewsAt: string | null;
};

export default function PremiumPage() {
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState('');
  const [membership, setMembership] = useState<Membership | null>(null);
  const [priceUgx, setPriceUgx] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const payment = new URLSearchParams(window.location.search).get('payment');
    const paymentMessages: Record<string, string> = {
      success: 'Payment verified. Your Premium membership is active.',
      pending: 'Payment is still being verified. Your membership activates only after confirmation.',
      failed: 'The payment was not completed. You can try checkout again.',
      cancelled: 'Checkout was cancelled. No Premium access was added.',
      invalid: 'The payment return was incomplete. If you paid, allow a moment for Pesapal verification.',
    };
    if (payment && paymentMessages[payment]) setMessage(paymentMessages[payment]);

    fetch('/api/subscriptions', { cache: 'no-store' })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not load Premium status');
        if (cancelled) return;
        setMembership(payload.subscription || null);
        setPriceUgx(typeof payload.priceUgx === 'number' ? payload.priceUgx : null);
      })
      .catch(error => {
        if (!cancelled) setMessage(current => current || (error instanceof Error ? error.message : 'Could not load Premium status'));
      })
      .finally(() => { if (!cancelled) setChecking(false); });

    return () => { cancelled = true; };
  }, []);

  async function startCheckout() {
    if (membership?.active) {
      setMessage('Your ASR Premium membership is already active.');
      return;
    }
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
        window.location.href = '/auth?next=%2Fpremium';
        return;
      }
      if (response.status === 409 && data.renewsAt) {
        setMessage('Your Premium membership is already active.');
        setMembership(current => current ? { ...current, tier: 'PREMIUM', status: 'ACTIVE', active: true, renewsAt: data.renewsAt } : current);
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

  const priceLabel = priceUgx !== null
    ? new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', maximumFractionDigits: 0 }).format(priceUgx)
    : 'UGX price shown at checkout';

  return (
    <main>
      <nav className="nav">
        <a className="brand" href="/">ASR<span>.</span></a>
        <div><a href="/listen">Listen</a> · <a href="/library">Library</a> · <a href="/premium/library">Backstage Pass</a></div>
      </nav>

      <section className="hero" style={{ paddingBottom: 32 }}>
        <div className="eyebrow">ASR PREMIUM · BACKSTAGE PASS</div>
        <h1>Your front-row pass to African music.</h1>
        <p>Unlock member-only releases and downloads that participating artists and ASR make available. Your membership is activated only after payment is verified.</p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginTop: 26 }}>
          <div style={{ border: '1px solid #30251e', background: '#120d09', borderRadius: 18, padding: '15px 19px' }}>
            <div style={{ color: '#ff7a1a', fontSize: 10, fontWeight: 900, letterSpacing: '.16em' }}>30-DAY MEMBERSHIP</div>
            <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{priceLabel}</div>
            <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>Card or supported Uganda Mobile Money via Pesapal</div>
          </div>
          <div style={{ display: 'grid', gap: 9 }}>
            <button className="auth-submit" onClick={startCheckout} disabled={loading || checking} style={{ width: 'auto', minWidth: 210 }}>
              {loading ? 'Opening secure checkout…' : membership?.active ? 'Premium is active' : checking ? 'Checking membership…' : 'Unlock ASR Premium'}
            </button>
            <a href="/premium/library" className="play" style={{ textDecoration: 'none', textAlign: 'center' }}>Explore the Backstage shelf</a>
          </div>
        </div>

        {membership?.active && (
          <p style={{ color: '#9ed9a6', fontSize: 14, marginTop: 18 }}>
            <strong>MEMBERSHIP ACTIVE</strong>
            {membership.renewsAt ? ' · Access through ' + new Date(membership.renewsAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : ''}
          </p>
        )}
        {membership?.status === 'EXPIRED' && <p style={{ color: '#ffbd87', fontSize: 14 }}>Your previous Premium period has expired. Renew to unlock member-only content again.</p>}
        {message && <p className="auth-message" role="status">{message}</p>}
      </section>

      <section className="grid">
        {[
          ['01 · BACKSTAGE PASS', 'Member-only drops', 'Play releases that artists or ASR designate as Premium exclusive. Every full-master stream checks your current membership.'],
          ['02 · MEMBER DOWNLOADS', 'Take eligible releases with you', 'Download tracks only when the rights holder has enabled downloads. Each link is signed, short-lived and checked against your membership.'],
          ['03 · REAL ACCESS STATUS', 'Know where you stand', 'See whether your membership is active and when the current 30-day period ends. A payment return alone never grants access.'],
          ['04 · ARTIST-FIRST CATALOG', 'Support the next sound', 'ASR keeps the public catalog open while member drops give independent artists a direct way to reward their most engaged listeners.'],
        ].map(([tag, title, copy]) => (
          <article className="card" key={tag}>
            <div className="tag">{tag}</div>
            <h3 style={{ marginTop: 34 }}>{title}</h3>
            <p>{copy}</p>
          </article>
        ))}
      </section>

      <section className="hero" style={{ paddingTop: 0 }}>
        <div className="eyebrow">ON THE ROADMAP</div>
        <h2 style={{ fontSize: 'clamp(32px,5vw,56px)', letterSpacing: '-.05em', margin: '12px 0 16px' }}>More reasons to stay Premium.</h2>
        <p>We are building toward ad-free playback, a proper offline player, and ASR Radar personalized mixes. These are not being advertised as live benefits yet because the ad system, secure offline cache, and recommendation engine still need implementation.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 20 }}>
          <a className="play" href="/premium/library" style={{ textDecoration: 'none' }}>Open Backstage Pass</a>
          <a className="play secondary-play" href="/artist" style={{ textDecoration: 'none' }}>Are you an artist?</a>
        </div>
      </section>
    </main>
  );
}
