import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../lib/auth';
import { getPremiumEntitlement } from '../../../lib/premium';

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers }).catch(() => null);
  const configuredPrice = Number(process.env.ASR_PREMIUM_PRICE_UGX);
  const priceUgx = Number.isSafeInteger(configuredPrice) && configuredPrice > 0 ? configuredPrice : null;
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

/**
 * New paid checkout is intentionally disabled while ASR's direct MTN Mobile
 * Money implementation is being built and verified. Existing payment records
 * and legacy reconciliation code are retained for historical integrity.
 *
 * This endpoint must not initiate Pesapal, Flutterwave, PayPal, or another
 * aggregator checkout. Re-enable only after the MTN flow passes sandbox,
 * concurrency, recovery, and fulfilment verification and receives approval.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: 'ASR Premium checkout is temporarily unavailable.',
      code: 'PAYMENTS_NOT_READY',
    },
    { status: 503 },
  );
}
