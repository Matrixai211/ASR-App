import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../lib/auth';
import { prisma } from '../../../../../../lib/prisma';

const staffRoles = new Set(['ADMIN', 'MODERATOR']);
const allowedStatuses = new Set([
  'IN_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'PUBLISHED',
  'REJECTED',
]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);
  if (!session?.user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const role = (session.user as { role?: string }).role || '';
  if (!staffRoles.has(role)) {
    return NextResponse.json({ error: 'Moderator or administrator access required' }, { status: 403 });
  }

  const { id } = await params;
  let body: { status?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const status = typeof body.status === 'string' ? body.status : '';
  if (!allowedStatuses.has(status)) {
    return NextResponse.json(
      { error: 'Invalid moderation status', allowed: [...allowedStatuses] },
      { status: 400 },
    );
  }

  const existing = await prisma.release.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Release not found' }, { status: 404 });
  }

  const updated = await prisma.release.update({
    where: { id },
    data: { status: status as typeof existing.status },
    include: { artist: true, tracks: { orderBy: { trackNumber: 'asc' } } },
  });

  return NextResponse.json({ ok: true, release: updated });
}
