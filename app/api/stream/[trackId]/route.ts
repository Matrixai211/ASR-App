import { NextResponse } from 'next/server';
import { auth } from '../../../../lib/auth';
import { getPremiumEntitlement } from '../../../../lib/premium';
import { prisma } from '../../../../lib/prisma';
import { supabaseAdmin, supabaseBucket } from '../../../../lib/supabase';

export async function GET(request: Request, { params }: { params: Promise<{ trackId: string }> }) {
  const { trackId } = await params;
  const track = await prisma.track.findUnique({ where: { id: trackId }, include: { release: true } });
  if (!track || track.release.status !== 'PUBLISHED' || !track.audioUrl) return NextResponse.json({ error: 'Track is not available for playback' }, { status: 404 });

  if (track.release.exclusive) {
    const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
    if (!session?.user) {
      return NextResponse.json({ error: 'Sign in to listen to this ASR Premium exclusive', code: 'AUTH_REQUIRED' }, { status: 401 });
    }
    const entitlement = await getPremiumEntitlement(session.user.id).catch(() => null);
    if (!entitlement?.active) {
      return NextResponse.json({ error: 'ASR Premium is required to play this exclusive release', code: 'PREMIUM_REQUIRED', upgradeUrl: '/premium' }, { status: 403 });
    }
  }
  const { data, error } = await supabaseAdmin().storage.from(supabaseBucket).createSignedUrl(track.audioUrl, 300);
  if (error || !data?.signedUrl) return NextResponse.json({ error: error?.message || 'Media storage unavailable' }, { status: 503 });
  return NextResponse.redirect(data.signedUrl, 307);
}
