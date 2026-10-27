import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { auth } from '../../../lib/auth';
import { prisma } from '../../../lib/prisma';
import { supabaseAdmin, supabaseBucket } from '../../../lib/supabase';

const audioTypes = new Set(['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/flac', 'audio/mp4']);
const artworkTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const editableStatuses = new Set(['DRAFT', 'CHANGES_REQUESTED']);
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const MAX_ARTWORK_BYTES = 15 * 1024 * 1024;

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  try {
    const body = await request.json() as {
      trackId?: string;
      fileName?: string;
      contentType?: string;
      kind?: 'audio' | 'artwork';
      fileSizeBytes?: number;
    };
    const { trackId, fileName, contentType } = body;
    const kind = body.kind || 'audio';
    if (!trackId || !fileName || !contentType || !['audio', 'artwork'].includes(kind)) {
      return NextResponse.json({ error: 'Track, file name, file type and media kind are required' }, { status: 400 });
    }

    const allowedTypes = kind === 'artwork' ? artworkTypes : audioTypes;
    if (!allowedTypes.has(contentType)) return NextResponse.json({ error: 'Unsupported file type for this upload' }, { status: 400 });
    const maxBytes = kind === 'artwork' ? MAX_ARTWORK_BYTES : MAX_AUDIO_BYTES;
    if (typeof body.fileSizeBytes === 'number' && (!Number.isFinite(body.fileSizeBytes) || body.fileSizeBytes <= 0 || body.fileSizeBytes > maxBytes)) {
      return NextResponse.json({ error: kind === 'artwork' ? 'Artwork must be smaller than 15 MB' : 'Audio masters must be smaller than 100 MB' }, { status: 413 });
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

    const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 120);
    const objectKey = 'artists/' + track.release.artistId + '/releases/' + track.releaseId + '/' + kind + '/' + track.id + '-' + Date.now() + '-' + safe;
    const client = supabaseAdmin();
    const { data, error } = await client.storage.from(supabaseBucket).createSignedUploadUrl(objectKey);
    if (error || !data) return NextResponse.json({ error: error?.message || 'Storage unavailable' }, { status: 503 });
    return NextResponse.json({ uploadUrl: data.signedUrl, token: data.token, objectKey, kind, maxBytes });
  } catch {
    return NextResponse.json({ error: 'Media storage is not configured or the upload request is invalid' }, { status: 503 });
  }
}
