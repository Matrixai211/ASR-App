import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { auth } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/prisma';

const allowedRoles = new Set(['ARTIST', 'ADMIN', 'MODERATOR']);
const staffRoles = new Set(['ADMIN', 'MODERATOR']);
const editableStatuses = new Set(['DRAFT', 'CHANGES_REQUESTED']);

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const role = (session.user as { role?: string }).role || '';
  if (!allowedRoles.has(role)) return NextResponse.json({ error: 'Artist or staff access required' }, { status: 403 });

  const release = await prisma.release.findUnique({
    where: { id },
    include: { artist: true, tracks: { orderBy: { trackNumber: 'asc' } } },
  });
  if (!release) return NextResponse.json({ error: 'Release not found' }, { status: 404 });
  if (release.artist.userId !== session.user.id && !staffRoles.has(role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  if (!editableStatuses.has(release.status)) return NextResponse.json({ error: 'This release has already been submitted or published' }, { status: 409 });

  const missing: string[] = [];
  if (!release.genre?.trim()) missing.push('primary genre');
  if (!release.language?.trim()) missing.push('release language');
  if (!release.releaseDate) missing.push('release date');
  if (!release.copyrightOwner?.trim()) missing.push('copyright owner');
  if (!release.masterRightsOwner?.trim()) missing.push('master rights owner');
  if (!release.artworkUrl) missing.push('cover artwork');
  if (release.tracks.length === 0) missing.push('at least one track');
  if (release.tracks.some(track => !track.audioUrl)) missing.push('audio master for every track');
  if (release.tracks.some(track => !track.title.trim())) missing.push('complete track titles');

  if (missing.length) {
    return NextResponse.json({
      error: 'Complete the required release details before submitting.',
      missing: [...new Set(missing)],
    }, { status: 422 });
  }

  const updated = await prisma.release.update({
    where: { id },
    data: { status: 'SUBMITTED' },
    include: { artist: true, tracks: { orderBy: { trackNumber: 'asc' } } },
  });
  return NextResponse.json({ ok: true, release: updated });
}
