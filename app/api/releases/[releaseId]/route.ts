import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { auth } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';

const allowedRoles = new Set(['ARTIST', 'ADMIN', 'MODERATOR']);
const staffRoles = new Set(['ADMIN', 'MODERATOR']);
const editableStatuses = new Set(['DRAFT', 'CHANGES_REQUESTED']);
const releaseTypes = new Set(['SINGLE', 'EP', 'ALBUM']);

function clean(value: unknown, max = 240): string | null {
  if (typeof value !== 'string') return null;
  const result = value.trim();
  return result ? result.slice(0, max) : null;
}

async function getAccess(releaseId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { session: null, release: null, status: 401 as const };
  const role = (session.user as { role?: string }).role || '';
  if (!allowedRoles.has(role)) return { session, release: null, status: 403 as const };
  const release = await prisma.release.findUnique({ where: { id: releaseId }, include: { artist: true, tracks: { orderBy: { trackNumber: 'asc' } } } });
  if (!release) return { session, release: null, status: 404 as const };
  if (release.artist.userId !== session.user.id && !staffRoles.has(role)) return { session, release: null, status: 403 as const };
  return { session, release, status: 200 as const };
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ releaseId: string }> }) {
  const { releaseId } = await params;
  const access = await getAccess(releaseId);
  if (access.status !== 200) return NextResponse.json({ error: access.status === 401 ? 'Sign in required' : access.status === 404 ? 'Release not found' : 'Not allowed' }, { status: access.status });
  return NextResponse.json({ release: access.release });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ releaseId: string }> }) {
  const { releaseId } = await params;
  const access = await getAccess(releaseId);
  if (access.status !== 200 || !access.session || !access.release) return NextResponse.json({ error: access.status === 401 ? 'Sign in required' : access.status === 404 ? 'Release not found' : 'Not allowed' }, { status: access.status });
  if (!editableStatuses.has(access.release.status)) return NextResponse.json({ error: 'This release is locked while it is in review or published' }, { status: 409 });

  try {
    const body = await request.json();
    const data: Prisma.ReleaseUpdateInput = {};
    if (body.title !== undefined) {
      const title = clean(body.title, 120);
      if (!title) return NextResponse.json({ error: 'Release title is required' }, { status: 400 });
      data.title = title;
    }
    if (body.type !== undefined) {
      if (typeof body.type !== 'string' || !releaseTypes.has(body.type)) return NextResponse.json({ error: 'Invalid release type' }, { status: 400 });
      data.type = body.type as 'SINGLE' | 'EP' | 'ALBUM';
    }
    if (body.genre !== undefined) data.genre = clean(body.genre, 80);
    if (body.language !== undefined) data.language = clean(body.language, 60);
    if (body.releaseDate !== undefined) {
      if (!body.releaseDate) data.releaseDate = null;
      else {
        const date = new Date(body.releaseDate);
        if (!Number.isFinite(date.getTime())) return NextResponse.json({ error: 'Release date is invalid' }, { status: 400 });
        data.releaseDate = date;
      }
    }
    if (body.copyrightOwner !== undefined) data.copyrightOwner = clean(body.copyrightOwner, 180);
    if (body.masterRightsOwner !== undefined) data.masterRightsOwner = clean(body.masterRightsOwner, 180);
    if (body.publishingRightsOwner !== undefined) data.publishingRightsOwner = clean(body.publishingRightsOwner, 180);
    if (body.copyrightYear !== undefined) {
      const year = body.copyrightYear === '' || body.copyrightYear == null ? null : Number(body.copyrightYear);
      if (year !== null && (!Number.isInteger(year) || year < 1900 || year > 2200)) return NextResponse.json({ error: 'Copyright year must be between 1900 and 2200' }, { status: 400 });
      data.copyrightYear = year;
    }
    if (body.upc !== undefined) data.upc = clean(body.upc, 20);
    if (typeof body.exclusive === 'boolean') data.exclusive = body.exclusive;
    if (typeof body.downloadable === 'boolean') data.downloadable = body.downloadable;

    const release = await prisma.release.update({
      where: { id: releaseId },
      data,
      include: { artist: true, tracks: { orderBy: { trackNumber: 'asc' } } },
    });
    return NextResponse.json({ release });
  } catch {
    return NextResponse.json({ error: 'Could not save release metadata. Check whether the UPC is already in use.' }, { status: 400 });
  }
}
