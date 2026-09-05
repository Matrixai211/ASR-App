import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NextResponse } from 'next/server';
import { mediaBucket, mediaStorage } from '../../../../lib/media-storage';
import { prisma } from '../../../../lib/prisma';

export async function GET(_: Request, { params }: { params: Promise<{ trackId: string }> }) {
  const { trackId } = await params;
  const track = await prisma.track.findUnique({ where: { id: trackId }, include: { release: true } });
  if (!track || track.release.status !== 'PUBLISHED' || !track.audioUrl) return NextResponse.json({ error: 'Track is not available for playback' }, { status: 404 });
  try {
    const url = await getSignedUrl(mediaStorage(), new GetObjectCommand({ Bucket: mediaBucket, Key: track.audioUrl }), { expiresIn: 300 });
    return NextResponse.redirect(url, 307);
  } catch {
    return NextResponse.json({ error: 'Media storage unavailable' }, { status: 503 });
  }
}
