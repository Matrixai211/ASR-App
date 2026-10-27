import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { auth } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';
import { supabaseAdmin, supabaseBucket } from '../../../../lib/supabase';

const editableStatuses = new Set(['DRAFT', 'CHANGES_REQUESTED']);
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const MAX_ARTWORK_BYTES = 15 * 1024 * 1024;

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  try {
    const body = await request.json() as { trackId?: string; objectKey?: string; kind?: 'audio' | 'artwork' };
    const { trackId, objectKey } = body;
    const kind = body.kind || 'audio';
    if (!trackId || !objectKey || !['audio', 'artwork'].includes(kind)) {
      return NextResponse.json({ error: 'Track, object key and media kind are required' }, { status: 400 });
    }

    const track = await prisma.track.findUnique({
      where: { id: trackId },
      include: { release: { include: { artist: true } } },
    });
    if (!track) return NextResponse.json({ error: 'Track not found' }, { status: 404 });

    const role = (session.user as { role?: string }).role || '';
    if (track.release.artist.userId !== session.user.id && !['ADMIN', 'MODERATOR'].includes(role)) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    }
    if (!editableStatuses.has(track.release.status)) {
      return NextResponse.json({ error: 'Uploads are locked while this release is in review or published' }, { status: 409 });
    }

    const expected = 'artists/' + track.release.artistId + '/releases/' + track.releaseId + '/' + kind + '/' + track.id + '-';
    if (!objectKey.startsWith(expected) || objectKey.includes('..') || objectKey.includes('\\')) {
      return NextResponse.json({ error: 'Invalid media object path' }, { status: 400 });
    }

    const folder = objectKey.slice(0, objectKey.lastIndexOf('/'));
    const file = objectKey.slice(objectKey.lastIndexOf('/') + 1);
    const client = supabaseAdmin();
    const { data, error } = await client.storage.from(supabaseBucket).list(folder, { search: file, limit: 1 });
    const storedFile = data?.find(item => item.name === file);
    if (error || !storedFile) return NextResponse.json({ error: 'Uploaded file could not be verified in ASR storage' }, { status: 400 });

    const size = typeof storedFile.metadata?.size === 'number' ? storedFile.metadata.size : null;
    const maxBytes = kind === 'artwork' ? MAX_ARTWORK_BYTES : MAX_AUDIO_BYTES;
    if (size !== null && size > maxBytes) {
      await client.storage.from(supabaseBucket).remove([objectKey]);
      return NextResponse.json({ error: kind === 'artwork' ? 'Artwork must be smaller than 15 MB' : 'Audio masters must be smaller than 100 MB' }, { status: 413 });
    }

    if (kind === 'artwork') {
      await prisma.release.update({ where: { id: track.releaseId }, data: { artworkUrl: objectKey } });
    } else {
      await prisma.track.update({ where: { id: trackId }, data: { audioUrl: objectKey } });
    }
    return NextResponse.json({ ok: true, trackId, kind, objectKey, size });
  } catch {
    return NextResponse.json({ error: 'Could not verify the upload. Check that ASR media storage is configured.' }, { status: 503 });
  }
}
