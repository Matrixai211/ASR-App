import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { auth } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/prisma';
import { supabaseAdmin, supabaseBucket } from '../../../../../lib/supabase';

export async function GET(_: Request, { params }: { params: Promise<{ releaseId: string }> }) {
  const { releaseId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const role = (session.user as { role?: string }).role || '';
  if (!['ARTIST', 'ADMIN', 'MODERATOR'].includes(role)) return NextResponse.json({ error: 'Artist or staff access required' }, { status: 403 });

  const release = await prisma.release.findUnique({ where: { id: releaseId }, include: { artist: true } });
  if (!release) return NextResponse.json({ error: 'Release not found' }, { status: 404 });
  if (release.artist.userId !== session.user.id && !['ADMIN', 'MODERATOR'].includes(role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  if (!release.artworkUrl) return NextResponse.json({ artworkUrl: null });

  try {
    const { data, error } = await supabaseAdmin().storage.from(supabaseBucket).createSignedUrl(release.artworkUrl, 300);
    if (error || !data?.signedUrl) return NextResponse.json({ error: 'Artwork storage is unavailable' }, { status: 503 });
    return NextResponse.json({ artworkUrl: data.signedUrl });
  } catch {
    return NextResponse.json({ error: 'Artwork storage is not configured' }, { status: 503 });
  }
}
