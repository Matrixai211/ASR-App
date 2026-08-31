import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../lib/auth';
import { prisma } from '../../../lib/prisma';

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers }).catch(() => null);
  if (!session) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const { tier } = await req.json().catch(() => ({ tier: null }));
  if (tier !== 'PREMIUM') return NextResponse.json({ error: 'Unsupported tier' }, { status: 400 });

  const secretKey = process.env.FLW_SECRET_KEY;
  const premiumPrice = Number(process.env.ASR_PREMIUM_PRICE_UGX);
  if (!secretKey || !Number.isFinite(premiumPrice) || premiumPrice <= 0) {
    return NextResponse.json({
      error: 'Premium payments are not configured yet',
      required: ['FLW_SECRET_KEY', 'ASR_PREMIUM_PRICE_UGX'],
    }, { status: 503 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || req.nextUrl.origin;
  const txRef = `ASR-PREMIUM-${session.user.id}-${Date.now()}`;

  await prisma.paymentTransaction.create({
    data: {
      userId: session.user.id,
      txRef,
      tier: 'PREMIUM',
      amountMinor: Math.round(premiumPrice),
      currency: 'UGX',
    },
  });

  const response = await fetch('https://api.flutterwave.com/v3/payments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tx_ref: txRef,
      amount: Math.round(premiumPrice),
      currency: 'UGX',
      redirect_url: `${baseUrl}/premium?payment=return`,
      payment_options: 'card,mobilemoneyuganda',
      customer: {
        email: session.user.email,
        name: session.user.name,
      },
      customizations: {
        title: 'ASR Premium',
        description: '30 days of ASR Premium access',
      },
      meta: {
        userId: session.user.id,
        tier: 'PREMIUM',
      },
    }),
  });

  const payload = await response.json().catch(() => null) as { data?: { link?: string }; message?: string } | null;
  if (!response.ok || !payload?.data?.link) {
    await prisma.paymentTransaction.update({ where: { txRef }, data: { status: 'FAILED' } }).catch(() => null);
    return NextResponse.json({ error: payload?.message || 'Unable to start payment' }, { status: 502 });
  }

  return NextResponse.json({ checkoutUrl: payload.data.link, txRef });
}
