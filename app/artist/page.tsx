import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '../../lib/auth';

const steps = [
  ['CACTUS MASTERS', 'Upload and attach ASAP Shimmy authorized Cactus masters.', '/artist/cactus'],
  ['NEW RELEASE', 'Create a single, EP or album submission.', '/artist/releases/new'],
  ['DRAFTS', 'Continue metadata, artwork and track preparation.', '/artist/releases?status=DRAFT'],
  ['SUBMITTED', 'Track moderation and rights review status.', '/artist/releases?status=SUBMITTED'],
  ['CATALOG', 'Manage approved and published ASR releases.', '/artist/releases?status=PUBLISHED'],
];

export default async function ArtistWorkspace() {
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
        <div><a href="/listen">Listen</a> · <a href="/library">Library</a> · <a href="/artist/releases">My releases</a></div>
      </nav>
      <section className="hero">
        <div className="eyebrow">ARTIST WORKSPACE</div>
        <h1>Release your sound.</h1>
        <p>Prepare your release metadata, attach cover art and masters, save drafts, and submit complete releases for ASR review.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 24 }}>
          <a className="btn" href="/artist/releases/new" style={{ margin: 0, textDecoration: 'none' }}>+ Start a release</a>
          <a className="play" href="/artist/releases" style={{ textDecoration: 'none' }}>View all releases</a>
        </div>
      </section>
      <section className="grid">
        {steps.map(([title, copy, href]) => (
          <a className="card" key={title} href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="tag">{title}</div>
            <h3>{title === 'NEW RELEASE' ? 'Start a release' : title}</h3>
            <p>{copy}</p>
          </a>
        ))}
      </section>
    </main>
  );
}
