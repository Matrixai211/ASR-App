import { NextRequest, NextResponse } from 'next/server';
import { asapShimmy, featured } from '../../../lib/catalog';
import { prisma } from '../../../lib/prisma';

type SearchResult = {
  id: string;
  type: 'artist' | 'release' | 'track' | 'featured';
  title: string;
  subtitle?: string;
  href?: string;
  genre?: string;
};

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') || '').trim().toLowerCase();
  if (!q) return NextResponse.json({ query: q, results: [] });

  const staticResults: SearchResult[] = [];

  if (`${asapShimmy.name} ${asapShimmy.bio}`.toLowerCase().includes(q)) {
    staticResults.push({
      id: 'artist-asap-shimmy',
      type: 'artist',
      title: asapShimmy.name,
      subtitle: 'Artist',
      href: '/artists/asap-shimmy',
    });
  }

  if (`${asapShimmy.release.title} ${asapShimmy.name} ${asapShimmy.release.year}`.toLowerCase().includes(q)) {
    staticResults.push({
      id: 'release-asap-shimmy-cactus',
      type: 'release',
      title: asapShimmy.release.title,
      subtitle: `${asapShimmy.name} · ${asapShimmy.release.year}`,
      href: '/artists/asap-shimmy',
      genre: 'Afrosounds',
    });
  }

  for (const [index, title] of asapShimmy.release.tracks.entries()) {
    if (`${title} ${asapShimmy.name} ${asapShimmy.release.title}`.toLowerCase().includes(q)) {
      staticResults.push({
        id: `track-asap-shimmy-${index + 1}`,
        type: 'track',
        title,
        subtitle: `${asapShimmy.name} · Cactus`,
        href: '/artists/asap-shimmy',
      });
    }
  }

  for (const item of featured) {
    if (`${item.title} ${item.artist} ${item.genre}`.toLowerCase().includes(q)) {
      staticResults.push({
        id: item.id,
        type: 'featured',
        title: item.title,
        subtitle: item.artist,
        href: 'href' in item ? item.href : '/listen',
        genre: item.genre,
      });
    }
  }

  let dbResults: SearchResult[] = [];
  try {
    const [artists, releases, tracks] = await Promise.all([
      prisma.artistProfile.findMany({
        where: { stageName: { contains: q, mode: 'insensitive' } },
        take: 10,
      }),
      prisma.release.findMany({
        where: { title: { contains: q, mode: 'insensitive' } },
        include: { artist: true },
        take: 10,
      }),
      prisma.track.findMany({
        where: { title: { contains: q, mode: 'insensitive' } },
        include: { release: { include: { artist: true } } },
        take: 20,
      }),
    ]);

    dbResults = [
      ...artists.map(a => ({
        id: `db-artist-${a.id}`,
        type: 'artist' as const,
        title: a.stageName,
        subtitle: 'Artist',
        href: a.stageName.toLowerCase() === 'asap shimmy' ? '/artists/asap-shimmy' : '/search',
      })),
      ...releases.map(r => ({
        id: `db-release-${r.id}`,
        type: 'release' as const,
        title: r.title,
        subtitle: r.artist.stageName,
        href: r.artist.stageName.toLowerCase() === 'asap shimmy' ? '/artists/asap-shimmy' : '/listen',
        genre: r.genre || undefined,
      })),
      ...tracks.map(t => ({
        id: `db-track-${t.id}`,
        type: 'track' as const,
        title: t.title,
        subtitle: `${t.release.artist.stageName} · ${t.release.title}`,
        href: t.release.artist.stageName.toLowerCase() === 'asap shimmy' ? '/artists/asap-shimmy' : '/listen',
      })),
    ];
  } catch {
    // Static catalog remains searchable even if the database is temporarily unavailable.
  }

  const deduped = [...staticResults, ...dbResults].filter(
    (item, index, all) =>
      index === all.findIndex(other =>
        other.type === item.type &&
        other.title.toLowerCase() === item.title.toLowerCase() &&
        (other.subtitle || '').toLowerCase() === (item.subtitle || '').toLowerCase()
      )
  );

  return NextResponse.json({ query: q, results: deduped.slice(0, 50) });
}
