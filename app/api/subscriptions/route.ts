import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../lib/auth';
import { prisma } from '../../../lib/prisma';
import { getPesapalIpnId, getPesapalToken, submitPesapalOrder } from '../../../lib/pesapal';
import { getPremiumEntitlement } from '../../../lib/premium';

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers }).catch(() => null);
  const configuredPrice = Number(process.env.ASR_PREMIUM_PRICE_UGX);
  const priceUgx = Number.isFinite(configuredPrice) && configuredPrice > 0 ? Math.round(configuredPrice) : null;
  const publicPlan = {
    priceUgx,
    currency: 'UGX',
    durationDays: 30,
    entitlements: {
      exclusiveReleases: false,
      eligibleDownloads: false,
      adFreePlayback: false,
      offlinePlayer: false,
      smartMixes: false,
    },
  };
  if (!session?.user) {
    return NextResponse.json({
      ...publicPlan,
      subscription: { tier: 'FREE', status: 'FREE', active: false, renewsAt: null },
    });
  }

  try {
    const entitlement = await getPremiumEntitlement(session.user.id);
    const storedTier = entitlement.subscription?.tier;
    return NextResponse.json({
      ...publicPlan,
      subscription: {
        tier: entitlement.active ? 'PREMIUM' : 'FREE',
        status: entitlement.active ? 'ACTIVE' : storedTier === 'PREMIUM' ? 'EXPIRED' : 'FREE',
        active: entitlement.active,
        renewsAt: entitlement.renewsAt,
      },
      entitlements: {
        exclusiveReleases: entitlement.active,
        eligibleDownloads: entitlement.active,
        adFreePlayback: false,
        offlinePlayer: false,
        smartMixes: false,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Could not load subscription status' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers }).catch(() => null);
  if (!session) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const { tier } = await req.json().catch(() => ({ tier: null }));
  if (tier !== 'PREMIUM') return NextResponse.json({ error: 'Unsupported tier' }, { status: 400 });

  const entitlement = await getPremiumEntitlement(session.user.id).catch(() => null);
  if (!entitlement) return NextResponse.json({ error: 'Could not verify subscription status' }, { status: 503 });
  if (entitlement.active) {
    return NextResponse.json({
      error: 'Your ASR Premium membership is already active.',
      renewsAt: entitlement.renewsAt,
    }, { status: 409 });
  }

  const premiumPrice = Number(process.env.ASR_PREMIUM_PRICE_UGX);
  if (!process.env.PESAPAL_CONSUMER_KEY || !process.env.PESAPAL_CONSUMER_SECRET || !Number.isFinite(premiumPrice) || premiumPrice <= 0) {
    return NextResponse.json({
      error: 'Premium payments are not configured yet',
      required: ['PESAPAL_CONSUMER_KEY', 'PESAPAL_CONSUMER_SECRET', 'ASR_PREMIUM_PRICE_UGX'],
    }, { status: 503 });
  }

  const publicBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || req.nextUrl.origin).replace(/\/$/, '');
  const txRef = `ASR-PREMIUM-${session.user.id}-${Date.now()}`;
  const amount = Math.round(premiumPrice);

  await prisma.paymentTransaction.create({
    data: {
      userId: session.user.id,
      txRef,
      provider: 'pesapal',
      tier: 'PREMIUM',
      amountMinor: amount,
      currency: 'UGX',
    },
  });

  try {
    const token = await getPesapalToken();
    const ipnId = await getPesapalIpnId(token, publicBaseUrl);
    const order = await submitPesapalOrder({
      token,
      ipnId,
      merchantReference: txRef,
      amount,
      currency: 'UGX',
      callbackUrl: `${publicBaseUrl}/api/payments/pesapal/callback`,
      cancellationUrl: `${publicBaseUrl}/premium?payment=cancelled`,
      email: session.user.email,
      name: session.user.name,
    });

    if (!order.redirect_url || !order.order_tracking_id) throw new Error(order.error?.message || 'Pesapal did not return a checkout URL');

    await prisma.paymentTransaction.update({
      where: { txRef },
      data: { providerTransactionId: order.order_tracking_id },
    });

    return NextResponse.json({ checkoutUrl: order.redirect_url, txRef });
  } catch (error) {
    await prisma.paymentTransaction.update({ where: { txRef }, data: { status: 'FAILED' } }).catch(() => null);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to start Pesapal checkout' }, { status: 502 });
  }
}
