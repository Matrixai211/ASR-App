import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '../../../lib/auth';
import { prisma } from '../../../lib/prisma';

const statuses = ['DRAFT', 'SUBMITTED', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'PUBLISHED', 'REJECTED'] as const;

export default async function ArtistReleasesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
  try {
    session = await auth.api.getSession({ headers: await headers() });
  } catch {
    redirect('/auth');
  }
  if (!session) redirect('/auth');
  const role = (session.user as { role?: string }).role || '';
  if (!['ARTIST', 'ADMIN', 'MODERATOR'].includes(role)) redirect('/');

  const params = await searchParams;
  const requestedStatus = params.status && statuses.includes(params.status as typeof statuses[number]) ? params.status as typeof statuses[number] : undefined;
  const staff = role === 'ADMIN' || role === 'MODERATOR';
  const releases = await prisma.release.findMany({
    where: {
      ...(staff ? {} : { artist: { userId: session.user.id } }),
      ...(requestedStatus ? { status: requestedStatus } : {}),
    },
    include: { artist: true, tracks: true },
    orderBy: { updatedAt: 'desc' },
  });

  return (
    <main>
      <nav className="nav"><a className="brand" href="/">ASR<span>.</span></a><div><a href="/artist">Workspace</a> · <a href="/listen">Listen</a></div></nav>
      <section className="hero" style={{ paddingBottom: 28 }}>
        <div className="eyebrow">ASR ARTIST DISTRIBUTION</div>
        <h1>My releases.</h1>
        <p>Manage drafts, track submissions and keep your approved catalog organized. A release stays private until ASR approves and publishes it.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 22 }}>
          <a className="btn" href="/artist/releases/new" style={{ margin: 0, textDecoration: 'none' }}>+ Create release</a>
          <a className="play" href="/artist/releases" style={{ textDecoration: 'none' }}>All</a>
          {statuses.map(status => <a key={status} className="play" href={'/artist/releases?status=' + status} style={{ textDecoration: 'none', background: requestedStatus === status ? '#ff7a1a' : '#fff' }}>{status.replaceAll('_', ' ')}</a>)}
        </div>
      </section>
      <section className="grid">
        {releases.map(release => (
          <a className="card" href={'/artist/releases/' + release.id} key={release.id} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="tag">{release.status.replaceAll('_', ' ')}</div>
            <h3>{release.title}</h3>
            <p>{release.artist.stageName} · {release.type} · {release.tracks.length} track{release.tracks.length === 1 ? '' : 's'}</p>
            <p style={{ fontSize: 12 }}>Updated {release.updatedAt.toLocaleDateString('en-US')}</p>
            <span className="play" style={{ display: 'inline-block' }}>Open release</span>
          </a>
        ))}
        {releases.length === 0 && <article className="card" style={{ gridColumn: '1 / -1' }}><h3>No releases here yet.</h3><p>Create a draft to start preparing your next single, EP or album.</p><a className="btn" href="/artist/releases/new" style={{ display: 'inline-block', margin: 0, textDecoration: 'none' }}>Create your first release</a></article>}
      </section>
    </main>
  );
}
