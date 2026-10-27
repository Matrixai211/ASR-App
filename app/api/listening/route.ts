import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../lib/auth';
import { prisma } from '../../../lib/prisma';
import { supabaseAdmin, supabaseBucket } from '../../../lib/supabase';

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers }).catch(() => null);
  const body = await req.json().catch(() => null);
  const trackId = body?.trackId as string | undefined;
  const listenedSeconds = Number(body?.listenedSeconds ?? 0);
  const completed = Boolean(body?.completed);
  const source = typeof body?.source === 'string' ? body.source.slice(0, 80) : null;

  if (!trackId || !Number.isFinite(listenedSeconds) || listenedSeconds < 0) {
    return NextResponse.json({ error: 'Invalid listening event' }, { status: 400 });
  }

  const track = await prisma.track.findUnique({ where: { id: trackId }, select: { id: true, release: { select: { status: true } } } });
  if (!track || track.release.status !== 'PUBLISHED') return NextResponse.json({ error: 'Track not found' }, { status: 404 });

  const event = await prisma.playEvent.create({
    data: {
      trackId,
      userId: session?.user.id ?? null,
      listenedSeconds: Math.min(Math.floor(listenedSeconds), 86400),
      completed,
      source,
    },
    select: { id: true, createdAt: true },
  });

  return NextResponse.json({ status: 'recorded', event });
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers }).catch(() => null);
  if (!session) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const history = await prisma.playEvent.findMany({
    where: { userId: session.user.id, track: { is: { release: { is: { status: 'PUBLISHED' } } } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      track: {
        select: {
          id: true,
          title: true,
          release: { select: { title: true, artworkUrl: true, artist: { select: { stageName: true } } } },
        },
      },
    },
  });

  const historyWithArtwork = await Promise.all(history.map(async (event) => {
    const artworkUrl = event.track.release.artworkUrl;
    if (!artworkUrl || /^https?:\\/\\//i.test(artworkUrl)) return event;
    try {
      const { data, error } = await supabaseAdmin().storage.from(supabaseBucket).createSignedUrl(artworkUrl, 300);
      return {
        ...event,
        track: {
          ...event.track,
          release: { ...event.track.release, artworkUrl: error ? null : data?.signedUrl || null },
        },
      };
    } catch {
      return { ...event, track: { ...event.track, release: { ...event.track.release, artworkUrl: null } } };
    }
  }));

  return NextResponse.json({ history: historyWithArtwork });
}
