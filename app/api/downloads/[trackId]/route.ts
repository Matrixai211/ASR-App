import { NextResponse } from 'next/server';
import { auth } from '../../../../lib/auth';
import { getPremiumEntitlement } from '../../../../lib/premium';
import { prisma } from '../../../../lib/prisma';
import { supabaseAdmin, supabaseBucket } from '../../../../lib/supabase';

export async function GET(request: Request, { params }: { params: Promise<{ trackId: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  if (!session?.user) {
    return NextResponse.json({ error: 'Sign in to download ASR releases', code: 'AUTH_REQUIRED' }, { status: 401 });
  }

  const entitlement = await getPremiumEntitlement(session.user.id).catch(() => null);
  if (!entitlement?.active) {
    return NextResponse.json({ error: 'ASR Premium is required for member downloads', code: 'PREMIUM_REQUIRED', upgradeUrl: '/premium' }, { status: 403 });
  }

  const { trackId } = await params;
  const track = await prisma.track.findUnique({
    where: { id: trackId },
    include: { release: true },
  });
  if (!track || track.release.status !== 'PUBLISHED' || !track.audioUrl) {
    return NextResponse.json({ error: 'Track is not available for download' }, { status: 404 });
  }
  if (!track.release.downloadable) {
    return NextResponse.json({ error: 'The rights holder has not enabled downloads for this release' }, { status: 403 });
  }

  const rawExtension = track.audioUrl.split('/').pop()?.split('.').pop()?.toLowerCase() || '';
  const extension = ['mp3', 'wav', 'flac', 'm4a', 'mp4'].includes(rawExtension) ? '.' + rawExtension : '';
  const safeTitle = track.title.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'asr-track';
  try {
    const { data, error } = await supabaseAdmin()
      .storage.from(supabaseBucket)
      .createSignedUrl(track.audioUrl, 60, { download: safeTitle + extension });
    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: error?.message || 'Download storage is unavailable' }, { status: 503 });
    }
    const response = NextResponse.redirect(data.signedUrl, 307);
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    return response;
  } catch {
    return NextResponse.json({ error: 'Download storage is not configured' }, { status: 503 });
  }
}
