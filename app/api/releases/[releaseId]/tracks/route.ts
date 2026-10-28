import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/prisma';

const allowedRoles = new Set(['ARTIST', 'ADMIN', 'MODERATOR']);
const staffRoles = new Set(['ADMIN', 'MODERATOR']);
const editableStatuses = new Set(['DRAFT', 'CHANGES_REQUESTED']);

export async function POST(request: NextRequest, { params }: { params: Promise<{ releaseId: string }> }) {
  const { releaseId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const role = (session.user as { role?: string }).role || '';
  if (!allowedRoles.has(role)) return NextResponse.json({ error: 'Artist or staff access required' }, { status: 403 });

  const release = await prisma.release.findUnique({ where: { id: releaseId }, include: { artist: true, tracks: true } });
  if (!release) return NextResponse.json({ error: 'Release not found' }, { status: 404 });
  if (release.artist.userId !== session.user.id && !staffRoles.has(role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  if (!editableStatuses.has(release.status)) return NextResponse.json({ error: 'This release is locked while it is in review or published' }, { status: 409 });

  try {
    const body = await request.json();
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : '';
    if (!title) return NextResponse.json({ error: 'Track title is required' }, { status: 400 });
    if (release.tracks.length >= 100) return NextResponse.json({ error: 'A release can contain at most 100 tracks' }, { status: 400 });

    const track = await prisma.track.create({
      data: { releaseId, title, trackNumber: release.tracks.reduce((max, item) => Math.max(max, item.trackNumber), 0) + 1 },
    });
    return NextResponse.json({ track }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Could not add track' }, { status: 400 });
  }
}
