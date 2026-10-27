import { prisma } from './prisma';

export async function getPremiumEntitlement(userId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
    select: { tier: true, active: true, renewsAt: true, provider: true },
  });

  const now = new Date();
  const active = Boolean(
    subscription &&
    subscription.tier === 'PREMIUM' &&
    subscription.active &&
    subscription.renewsAt &&
    subscription.renewsAt > now
  );

  return {
    active,
    subscription,
    renewsAt: active ? subscription?.renewsAt ?? null : null,
  };
}
