import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import type { ReleaseStatus } from '@prisma/client';
import { auth } from '../../../lib/auth';
import { prisma } from '../../../lib/prisma';

const allowedRoles = new Set(['ARTIST', 'ADMIN', 'MODERATOR']);
const staffRoles = new Set(['ADMIN', 'MODERATOR']);
const releaseTypes = new Set(['SINGLE', 'EP', 'ALBUM']);
const releaseStatuses = new Set(['DRAFT', 'SUBMITTED', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'PUBLISHED', 'REJECTED']);

function clean(value: unknown, max = 240): string | null {
  if (typeof value !== 'string') return null;
  const result = value.trim();
  return result ? result.slice(0, max) : null;
}

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const role = (session.user as { role?: string }).role || '';
  if (!allowedRoles.has(role)) return NextResponse.json({ error: 'Artist or staff access required' }, { status: 403 });

  const statusParam = request.nextUrl.searchParams.get('status');
  const status = statusParam && releaseStatuses.has(statusParam) ? statusParam as ReleaseStatus : undefined;
  const where = {
    ...(staffRoles.has(role) ? {} : { artist: { userId: session.user.id } }),
    ...(status ? { status } : {}),
  };

  const releases = await prisma.release.findMany({
    where,
    include: { artist: true, tracks: { orderBy: { trackNumber: 'asc' } } },
    orderBy: { updatedAt: 'desc' },
  });
  return NextResponse.json({ releases });
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const role = (session.user as { role?: string }).role || '';
  if (!allowedRoles.has(role)) return NextResponse.json({ error: 'Artist or staff access required' }, { status: 403 });

  try {
    const body = await request.json();
    const title = clean(body.title, 120);
    const type = typeof body.type === 'string' ? body.type : '';
    if (!title || !releaseTypes.has(type)) {
      return NextResponse.json({ error: 'A release title and valid release type are required' }, { status: 400 });
    }

    const trackTitles = Array.isArray(body.tracks)
      ? body.tracks.map((item: unknown) => typeof item === 'string' ? item.trim().slice(0, 200) : '').filter(Boolean).slice(0, 100)
      : [];
    if (trackTitles.length === 0) {
      return NextResponse.json({ error: 'Add at least one track title before saving the draft' }, { status: 400 });
    }

    let releaseDate: Date | null = null;
    if (body.releaseDate) {
      const parsed = new Date(body.releaseDate);
      if (!Number.isFinite(parsed.getTime())) return NextResponse.json({ error: 'Release date is invalid' }, { status: 400 });
      releaseDate = parsed;
    }

    let artist = await prisma.artistProfile.findUnique({ where: { userId: session.user.id } });
    if (!artist) {
      const stageName = clean(body.artistName, 100) || clean(session.user.name, 100) || clean(session.user.email?.split('@')[0], 100) || 'Independent Artist';
      artist = await prisma.artistProfile.create({ data: { userId: session.user.id, stageName } });
    }

    const copyrightYear = body.copyrightYear === '' || body.copyrightYear == null ? null : Number(body.copyrightYear);
    if (copyrightYear !== null && (!Number.isInteger(copyrightYear) || copyrightYear < 1900 || copyrightYear > 2200)) {
      return NextResponse.json({ error: 'Copyright year must be between 1900 and 2200' }, { status: 400 });
    }

    const release = await prisma.release.create({
      data: {
        artistId: artist.id,
        title,
        type: type as 'SINGLE' | 'EP' | 'ALBUM',
        genre: clean(body.genre, 80),
        language: clean(body.language, 60),
        releaseDate,
        copyrightOwner: clean(body.copyrightOwner, 180),
        masterRightsOwner: clean(body.masterRightsOwner, 180),
        publishingRightsOwner: clean(body.publishingRightsOwner, 180),
        copyrightYear,
        upc: clean(body.upc, 20),
        exclusive: body.exclusive === true,
        downloadable: body.downloadable === true,
        status: 'DRAFT',
        tracks: { create: trackTitles.map((trackTitle: string, index: number) => ({ title: trackTitle, trackNumber: index + 1 })) },
      },
      include: { artist: true, tracks: { orderBy: { trackNumber: 'asc' } } },
    });

    return NextResponse.json({ release }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unable to create release. Check the details and make sure the UPC is not already in use.' }, { status: 400 });
  }
}
