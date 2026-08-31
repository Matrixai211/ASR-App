'use client';

import { FormEvent, useState } from 'react';
import { signIn, signUp } from '../../lib/auth-client';

type Mode = 'signin' | 'signup';

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const result = mode === 'signup'
        ? await signUp.email({ name, email, password })
        : await signIn.email({ email, password });

      if (result.error) {
        setMessage(result.error.message || 'Unable to continue. Please check your details.');
        return;
      }

      window.location.href = mode === 'signup' ? '/library' : '/library';
    } catch {
      setMessage('ASR account services are still being connected. Please try again shortly.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <nav className="nav">
        <a className="brand" href="/">ASR<span>.</span></a>
        <a href="/listen">Back to music</a>
      </nav>

      <section className="auth-wrap">
        <div className="auth-copy">
          <div className="eyebrow">YOUR ASR</div>
          <h1>{mode === 'signin' ? 'Welcome back.' : 'Join the sound.'}</h1>
          <p>Save music, build your library, follow releases and unlock artist tools through one ASR account.</p>
        </div>

        <form className="auth-card" onSubmit={submit}>
          <div className="auth-tabs">
            <button type="button" className={mode === 'signin' ? 'auth-tab active' : 'auth-tab'} onClick={() => { setMode('signin'); setMessage(''); }}>Sign in</button>
            <button type="button" className={mode === 'signup' ? 'auth-tab active' : 'auth-tab'} onClick={() => { setMode('signup'); setMessage(''); }}>Create account</button>
          </div>

          {mode === 'signup' && (
            <label>
              Name
              <input className="input auth-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
            </label>
          )}

          <label>
            Email
            <input className="input auth-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </label>

          <label>
            Password
            <input className="input auth-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={8} required />
          </label>

          {message && <p className="auth-message">{message}</p>}
          <button className="auth-submit" disabled={loading}>{loading ? 'Connecting…' : mode === 'signin' ? 'Sign in to ASR' : 'Create ASR account'}</button>
          <p className="auth-legal">By continuing, you agree to ASR's <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.</p>
        </form>
      </section>
    </main>
  );
}
