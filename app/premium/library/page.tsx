import { headers } from 'next/headers';
import { auth } from '../../../lib/auth';
import { getPremiumEntitlement } from '../../../lib/premium';
import { prisma } from '../../../lib/prisma';

export const dynamic = 'force-dynamic';

export default async function PremiumLibraryPage() {
  const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);
  let hasPremium = false;
  let renewsAt: Date | null = null;
  if (session?.user) {
    const entitlement = await getPremiumEntitlement(session.user.id).catch(() => null);
    hasPremium = Boolean(entitlement?.active);
    renewsAt = entitlement?.renewsAt ?? null;
  }

  const releases = await prisma.release.findMany({
    where: { status: 'PUBLISHED', OR: [{ exclusive: true }, { downloadable: true }] },
    include: { artist: true, tracks: { orderBy: { trackNumber: 'asc' } } },
    orderBy: [{ releaseDate: 'desc' }, { createdAt: 'desc' }],
  });

  return (
    <main>
      <nav className="nav">
        <a className="brand" href="/">ASR<span>.</span></a>
        <div><a href="/listen">Listen</a> · <a href="/premium">Premium</a> · <a href="/library">My library</a></div>
      </nav>
      <section className="hero" style={{ paddingBottom: 32 }}>
        <div className="eyebrow">ASR BACKSTAGE PASS</div>
        <h1>Member-only music.</h1>
        <p>Exclusive releases and downloads that artists or ASR have explicitly made available to members. Rights-holder settings determine what can be downloaded.</p>
        {hasPremium ? (
          <p style={{ color: '#9ed9a6', fontSize: 14 }}>
            PREMIUM ACTIVE{renewsAt ? ' · ACCESS THROUGH ' + renewsAt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) : ''}
          </p>
        ) : (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 22 }}>
            <a className="btn" href="/premium" style={{ margin: 0, textDecoration: 'none' }}>Unlock Premium</a>
            {!session?.user && <a className="play" href="/auth" style={{ textDecoration: 'none' }}>Sign in</a>}
          </div>
        )}
      </section>

      {releases.length === 0 ? (
        <section className="grid">
          <article className="card" style={{ gridColumn: '1 / -1', padding: 28 }}>
            <div className="tag">FIRST MEMBER DROP COMING WHEN PUBLISHED</div>
            <h2 style={{ marginTop: 12 }}>The backstage shelf is ready.</h2>
            <p>There are no published Premium-exclusive or downloadable releases yet. ASR artists can mark a release as exclusive or downloadable in the Artist Distribution Studio. It will appear here only after ASR publishes it.</p>
            <a className="play" href="/listen" style={{ display: 'inline-block', textDecoration: 'none' }}>Explore public releases</a>
          </article>
        </section>
      ) : (
        <section className="grid">
          {releases.map(release => (
            <article className="card" key={release.id} style={{ gridColumn: 'span 1' }}>
              <div className="cover" aria-hidden="true">{release.title.slice(0, 2).toUpperCase()}</div>
              <div className="tag">{release.exclusive ? 'ASR PREMIUM EXCLUSIVE' : 'MEMBER DOWNLOAD'}</div>
              <h2 style={{ margin: '10px 0 4px' }}>{release.title}</h2>
              <p>{release.artist.stageName} · {release.type}{release.releaseDate ? ' · ' + release.releaseDate.getUTCFullYear() : ''}</p>
              {hasPremium ? (
                <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
                  {release.tracks.map(track => (
                    <div key={track.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, borderTop: '1px solid #292929', paddingTop: 10 }}>
                      <span style={{ fontSize: 13, color: '#ddd' }}>{String(track.trackNumber).padStart(2, '0')} · {track.title}</span>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        {track.audioUrl && <a className="play" href={'/api/stream/' + track.id} style={{ textDecoration: 'none', fontSize: 11, padding: '8px 10px' }}>Play</a>}
                        {release.downloadable && track.audioUrl && <a className="play secondary-play" href={'/api/downloads/' + track.id} style={{ textDecoration: 'none', fontSize: 11, padding: '8px 10px' }}>Download</a>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ marginTop: 16 }}>Sign in with an active Premium membership to play exclusive masters or download eligible tracks.</p>
              )}
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
