import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '../../lib/auth';

const steps = [
  ['NEW RELEASE', 'Create a single, EP or album submission.', '/artist/releases/new'],
  ['DRAFTS', 'Continue metadata, artwork and track preparation.', '/artist'],
  ['SUBMITTED', 'Track moderation and rights review status.', '/artist'],
  ['CATALOG', 'Manage approved and published ASR releases.', '/artist'],
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
        <div><a href="/listen">Listen</a> · <a href="/library">Library</a></div>
      </nav>
      <section className="hero">
        <div className="eyebrow">ARTIST WORKSPACE</div>
        <h1>Release your sound.</h1>
        <p>Prepare releases, submit metadata and tracks, follow moderation, and manage your ASR catalog from one workspace.</p>
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
