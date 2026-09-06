import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { auth } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';
import { asapShimmy } from '../../../../lib/catalog';

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  if (!['ARTIST','ADMIN','MODERATOR'].includes(role || '')) return NextResponse.json({ error: 'Artist or staff access required' }, { status: 403 });

  let artist = await prisma.artistProfile.findUnique({ where: { userId: session.user.id } });
  if (!artist) {
    artist = await prisma.artistProfile.create({
      data: { userId: session.user.id, stageName: asapShimmy.name, country: 'Uganda', bio: asapShimmy.bio },
    });
  }

  let release = await prisma.release.findFirst({ where: { artistId: artist.id, title: 'Cactus' }, include: { tracks: true } });
  if (!release) {
    release = await prisma.release.create({
      data: {
        artistId: artist.id,
        title: 'Cactus',
        type: 'ALBUM',
        genre: 'Afrosounds',
        language: 'English',
        releaseDate: new Date('2023-10-06T00:00:00.000Z'),
        status: 'DRAFT',
        tracks: {
          create: asapShimmy.release.tracks.map((title, i) => ({ title, trackNumber: i + 1 })),
        },
      },
      include: { tracks: true },
    });
  }

  return NextResponse.json({
    artist: { id: artist.id, stageName: artist.stageName },
    release: {
      id: release.id,
      title: release.title,
      status: release.status,
      tracks: release.tracks.sort((a,b) => a.trackNumber - b.trackNumber).map(t => ({ id: t.id, title: t.title, trackNumber: t.trackNumber, ready: Boolean(t.audioUrl) })),
    },
  });
}
