import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '../../../../lib/auth';

export default async function NewReleasePage() {
  let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;

  try {
    session = await auth.api.getSession({ headers: await headers() });
  } catch {
    redirect('/auth');
  }

  if (!session) redirect('/auth');

  const role = (session.user as { role?: string }).role;
  if (!['ARTIST', 'ADMIN', 'MODERATOR'].includes(role ?? '')) redirect('/');

  return (
    <main>
      <nav className="nav">
        <a className="brand" href="/">ASR<span>.</span></a>
        <div><a href="/artist">Workspace</a> · <a href="/listen">Listen</a></div>
      </nav>
      <section className="hero" style={{ paddingBottom: 30 }}>
        <div className="eyebrow">RELEASE SUBMISSION</div>
        <h1>Build your release.</h1>
        <p>Start with the core metadata. Audio upload, artwork storage and final submission will connect to production storage once the backend environment is sealed.</p>
      </section>
      <section style={{ maxWidth: 760, margin: '0 auto', padding: '0 clamp(20px,5vw,48px) 90px' }}>
        <form className="card" action="#" method="post" style={{ display: 'grid', gap: 16, padding: 24 }}>
          <label>Release title<input className="input" name="title" placeholder="Release title" required /></label>
          <label>Release type<select className="input" name="type" defaultValue="SINGLE"><option value="SINGLE">Single</option><option value="EP">EP</option><option value="ALBUM">Album</option></select></label>
          <label>Primary genre<input className="input" name="genre" placeholder="Afrobeats, Dancehall, Amapiano…" required /></label>
          <label>Release date<input className="input" type="date" name="releaseDate" /></label>
          <label>Copyright / rights owner<input className="input" name="rightsOwner" placeholder="Artist or rights holder" required /></label>
          <button className="btn" type="submit" style={{ margin: 0, justifySelf: 'start' }}>Save draft</button>
        </form>
      </section>
    </main>
  );
}
