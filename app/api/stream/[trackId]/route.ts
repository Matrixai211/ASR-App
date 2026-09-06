import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { supabaseAdmin, supabaseBucket } from '../../../../lib/supabase';

export async function GET(_: Request, { params }: { params: Promise<{ trackId: string }> }) {
  const { trackId } = await params;
  const track = await prisma.track.findUnique({ where: { id: trackId }, include: { release: true } });
  if (!track || track.release.status !== 'PUBLISHED' || !track.audioUrl) return NextResponse.json({ error: 'Track is not available for playback' }, { status: 404 });
  const { data, error } = await supabaseAdmin().storage.from(supabaseBucket).createSignedUrl(track.audioUrl, 300);
  if (error || !data?.signedUrl) return NextResponse.json({ error: error?.message || 'Media storage unavailable' }, { status: 503 });
  return NextResponse.redirect(data.signedUrl, 307);
}
