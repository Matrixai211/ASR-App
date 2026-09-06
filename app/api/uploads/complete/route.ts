import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { auth } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';
import { supabaseAdmin, supabaseBucket } from '../../../../lib/supabase';

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const { trackId, objectKey } = await request.json() as { trackId?: string; objectKey?: string };
  if (!trackId || !objectKey) return NextResponse.json({ error: 'trackId and objectKey required' }, { status: 400 });
  const track = await prisma.track.findUnique({ where: { id: trackId }, include: { release: { include: { artist: true } } } });
  if (!track) return NextResponse.json({ error: 'Track not found' }, { status: 404 });
  const role = (session.user as { role?: string }).role;
  if (track.release.artist.userId !== session.user.id && !['ADMIN','MODERATOR'].includes(role || '')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const expected = `artists/${track.release.artistId}/releases/${track.releaseId}/audio/${track.id}-`;
  if (!objectKey.startsWith(expected)) return NextResponse.json({ error: 'Invalid media object' }, { status: 400 });
  const folder = objectKey.slice(0, objectKey.lastIndexOf('/'));
  const file = objectKey.slice(objectKey.lastIndexOf('/') + 1);
  const { data, error } = await supabaseAdmin().storage.from(supabaseBucket).list(folder, { search: file, limit: 1 });
  if (error || !data?.some(x => x.name === file)) return NextResponse.json({ error: 'Uploaded master could not be verified' }, { status: 400 });
  await prisma.track.update({ where: { id: trackId }, data: { audioUrl: objectKey } });
  return NextResponse.json({ ok: true, trackId });
}
