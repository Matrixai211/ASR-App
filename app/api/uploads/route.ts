import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { auth } from '../../../lib/auth';
import { prisma } from '../../../lib/prisma';
import { supabaseAdmin, supabaseBucket } from '../../../lib/supabase';

const allowed = new Set(['audio/mpeg','audio/wav','audio/x-wav','audio/flac','audio/mp4','image/jpeg','image/png','image/webp']);

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const { trackId, fileName, contentType, kind = 'audio' } = await request.json() as { trackId?: string; fileName?: string; contentType?: string; kind?: 'audio'|'artwork' };
  if (!trackId || !fileName || !contentType || !allowed.has(contentType)) return NextResponse.json({ error: 'Valid track, file name and supported media type required' }, { status: 400 });
  const track = await prisma.track.findUnique({ where: { id: trackId }, include: { release: { include: { artist: true } } } });
  if (!track) return NextResponse.json({ error: 'Track not found' }, { status: 404 });
  const role = (session.user as { role?: string }).role;
  if (track.release.artist.userId !== session.user.id && !['ADMIN','MODERATOR'].includes(role || '')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '-');
  const objectKey = `artists/${track.release.artistId}/releases/${track.releaseId}/${kind}/${track.id}-${Date.now()}-${safe}`;
  const { data, error } = await supabaseAdmin().storage.from(supabaseBucket).createSignedUploadUrl(objectKey);
  if (error || !data) return NextResponse.json({ error: error?.message || 'Storage unavailable' }, { status: 503 });
  return NextResponse.json({ uploadUrl: data.signedUrl, token: data.token, objectKey });
}
