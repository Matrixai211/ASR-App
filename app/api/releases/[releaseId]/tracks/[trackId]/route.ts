import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { auth } from '../../../../../../lib/auth';
import { prisma } from '../../../../../../lib/prisma';

const allowedRoles = new Set(['ARTIST', 'ADMIN', 'MODERATOR']);
const staffRoles = new Set(['ADMIN', 'MODERATOR']);
const editableStatuses = new Set(['DRAFT', 'CHANGES_REQUESTED']);

async function checkAccess(releaseId: string, trackId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { status: 401 as const, session: null, release: null, track: null };
  const role = (session.user as { role?: string }).role || '';
  if (!allowedRoles.has(role)) return { status: 403 as const, session, release: null, track: null };
  const release = await prisma.release.findUnique({ where: { id: releaseId }, include: { artist: true } });
  if (!release) return { status: 404 as const, session, release: null, track: null };
  if (release.artist.userId !== session.user.id && !staffRoles.has(role)) return { status: 403 as const, session, release: null, track: null };
  const track = await prisma.track.findFirst({ where: { id: trackId, releaseId } });
  if (!track) return { status: 404 as const, session, release, track: null };
  if (!editableStatuses.has(release.status)) return { status: 409 as const, session, release, track };
  return { status: 200 as const, session, release, track };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ releaseId: string; trackId: string }> }) {
  const { releaseId, trackId } = await params;
  const access = await checkAccess(releaseId, trackId);
  if (access.status !== 200) {
    const messages: Record<number, string> = { 401: 'Sign in required', 403: 'Not allowed', 404: 'Track or release not found', 409: 'This release is locked while it is in review or published' };
    return NextResponse.json({ error: messages[access.status] || 'Not allowed' }, { status: access.status });
  }

  try {
    const body = await request.json();
    const data: Prisma.TrackUpdateInput = {};
    if (body.title !== undefined) {
      const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : '';
      if (!title) return NextResponse.json({ error: 'Track title is required' }, { status: 400 });
      data.title = title;
    }
    if (typeof body.explicit === 'boolean') data.explicit = body.explicit;
    if (body.isrc !== undefined) {
      const isrc = typeof body.isrc === 'string' ? body.isrc.trim().toUpperCase() : '';
      if (isrc && !/^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/.test(isrc)) return NextResponse.json({ error: 'ISRC must be 12 characters, for example USABC2400001' }, { status: 400 });
      data.isrc = isrc || null;
    }
    if (body.featuredArtists !== undefined) data.featuredArtists = typeof body.featuredArtists === 'string' ? body.featuredArtists.trim().slice(0, 500) || null : null;
    if (body.producerCredits !== undefined) data.producerCredits = typeof body.producerCredits === 'string' ? body.producerCredits.trim().slice(0, 500) || null : null;
    if (body.songwriterCredits !== undefined) data.songwriterCredits = typeof body.songwriterCredits === 'string' ? body.songwriterCredits.trim().slice(0, 500) || null : null;
    if (body.composerCredits !== undefined) data.composerCredits = typeof body.composerCredits === 'string' ? body.composerCredits.trim().slice(0, 500) || null : null;

    const track = await prisma.track.update({ where: { id: trackId }, data });
    return NextResponse.json({ track });
  } catch {
    return NextResponse.json({ error: 'Could not save track. The ISRC may already belong to another track.' }, { status: 400 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ releaseId: string; trackId: string }> }) {
  const { releaseId, trackId } = await params;
  const access = await checkAccess(releaseId, trackId);
  if (access.status !== 200 || !access.release) {
    const messages: Record<number, string> = { 401: 'Sign in required', 403: 'Not allowed', 404: 'Track or release not found', 409: 'This release is locked while it is in review or published' };
    return NextResponse.json({ error: messages[access.status] || 'Not allowed' }, { status: access.status });
  }

  const tracks = await prisma.track.findMany({ where: { releaseId }, orderBy: { trackNumber: 'asc' } });
  if (tracks.length <= 1) return NextResponse.json({ error: 'A release must keep at least one track. Add another track before removing this one.' }, { status: 400 });

  await prisma.track.delete({ where: { id: trackId } });
  const remaining = tracks.filter(track => track.id !== trackId);
  await prisma.$transaction(remaining.map((track, index) => prisma.track.update({ where: { id: track.id }, data: { trackNumber: index + 1 } })));
  return NextResponse.json({ ok: true });
}
