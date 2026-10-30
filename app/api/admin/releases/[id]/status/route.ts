import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../lib/auth';
import { prisma } from '../../../../../../lib/prisma';

const staffRoles = new Set(['ADMIN', 'MODERATOR']);
const allowedTransitions: Record<string, string[]> = {
  SUBMITTED: ['IN_REVIEW'],
  IN_REVIEW: ['CHANGES_REQUESTED', 'APPROVED', 'REJECTED'],
  CHANGES_REQUESTED: ['IN_REVIEW'],
  APPROVED: ['PUBLISHED', 'REJECTED'],
};

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
  if (!Object.values(allowedTransitions).some((statuses) => statuses.includes(status))) {
    return NextResponse.json(
      { error: 'Invalid moderation status', allowed: [...new Set(Object.values(allowedTransitions).flat())] },
      { status: 400 },
    );
  }

  const existing = await prisma.release.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Release not found' }, { status: 404 });
  }

  if (!allowedTransitions[existing.status]?.includes(status)) {
    return NextResponse.json(
      { error: `Cannot move a release from ${existing.status} to ${status}` },
      { status: 409 },
    );
  }

  // Compare-and-set prevents simultaneous moderation requests from overwriting
  // a newer status transition.
  const changed = await prisma.release.updateMany({
    where: { id, status: existing.status },
    data: { status: status as typeof existing.status },
  });
  if (changed.count !== 1) {
    return NextResponse.json({ error: 'Release status changed; refresh and try again' }, { status: 409 });
  }

  const updated = await prisma.release.findUnique({
    where: { id },
    include: { artist: true, tracks: { orderBy: { trackNumber: 'asc' } } },
  });

  return NextResponse.json({ ok: true, release: updated });
}
