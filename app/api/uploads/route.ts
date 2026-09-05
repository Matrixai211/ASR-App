import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { auth } from '../../../lib/auth';
import { mediaBucket, mediaStorage } from '../../../lib/media-storage';
import { prisma } from '../../../lib/prisma';

const allowed = new Set(['audio/mpeg','audio/wav','audio/x-wav','audio/flac','audio/mp4','image/jpeg','image/png','image/webp']);

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const body = await request.json();
  const { trackId, fileName, contentType, kind = 'audio' } = body as { trackId?: string; fileName?: string; contentType?: string; kind?: 'audio'|'artwork' };
  if (!trackId || !fileName || !contentType || !allowed.has(contentType)) return NextResponse.json({ error: 'Valid track, file name and supported media type required' }, { status: 400 });

  const track = await prisma.track.findUnique({ where: { id: trackId }, include: { release: { include: { artist: true } } } });
  if (!track) return NextResponse.json({ error: 'Track not found' }, { status: 404 });
  const role = (session.user as { role?: string }).role;
  if (track.release.artist.userId !== session.user.id && !['ADMIN','MODERATOR'].includes(role || '')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '-');
  const key = `artists/${track.release.artistId}/releases/${track.releaseId}/${kind}/${track.id}-${Date.now()}-${safe}`;
  try {
    const url = await getSignedUrl(mediaStorage(), new PutObjectCommand({ Bucket: mediaBucket, Key: key, ContentType: contentType }), { expiresIn: 900 });
    return NextResponse.json({ uploadUrl: url, objectKey: key, expiresIn: 900 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Storage unavailable' }, { status: 503 });
  }
}
