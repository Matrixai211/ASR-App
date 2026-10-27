import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { auth } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';
import { asapShimmy } from '../../../../lib/catalog';

export async function GET() {
  const release = await prisma.release.findFirst({
    where: {
      title: 'Cactus',
      status: 'PUBLISHED',
      artist: { stageName: asapShimmy.name },
    },
    include: { tracks: true },
  });

  if (!release) {
    return NextResponse.json({ release: null, tracks: [] });
  }

  return NextResponse.json({
    release: { id: release.id, title: release.title, status: release.status },
    tracks: release.tracks
      .sort((a, b) => a.trackNumber - b.trackNumber)
      .map((track) => ({
        id: track.id,
        title: track.title,
        trackNumber: track.trackNumber,
        playable: Boolean(track.audioUrl),
        streamUrl: track.audioUrl ? `/api/stream/${track.id}` : null,
      })),
  });
}

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  if (!['ARTIST', 'ADMIN', 'MODERATOR'].includes(role || '')) {
    return NextResponse.json({ error: 'Artist or staff access required' }, { status: 403 });
  }

  let artist = await prisma.artistProfile.findUnique({ where: { userId: session.user.id } });
  if (role === 'ARTIST') {
    if (!artist || artist.stageName.trim().toLowerCase() !== asapShimmy.name.toLowerCase() || !artist.verified) {
      return NextResponse.json({ error: 'Only the verified ASAP Shimmy artist profile can manage Cactus masters. Contact ASR staff if this is your profile.' }, { status: 403 });
    }
  } else if (['ADMIN', 'MODERATOR'].includes(role || '')) {
    if (!artist) {
      artist = await prisma.artistProfile.create({
        data: { userId: session.user.id, stageName: asapShimmy.name, country: 'Uganda', bio: asapShimmy.bio },
      });
    } else if (artist.stageName.trim().toLowerCase() !== asapShimmy.name.toLowerCase()) {
      return NextResponse.json({ error: 'Use a dedicated verified ASAP Shimmy account to manage Cactus masters.' }, { status: 409 });
    }
  } else {
    return NextResponse.json({ error: 'Artist or staff access required' }, { status: 403 });
  }

  let release = await prisma.release.findFirst({
    where: { artistId: artist.id, title: 'Cactus' },
    include: { tracks: true },
  });
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
      tracks: release.tracks
        .sort((a, b) => a.trackNumber - b.trackNumber)
        .map((track) => ({
          id: track.id,
          title: track.title,
          trackNumber: track.trackNumber,
          ready: Boolean(track.audioUrl),
        })),
    },
  });
}
