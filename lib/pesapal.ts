import { prisma } from './prisma';

const sandboxBase = 'https://cybqa.pesapal.com/pesapalv3';
const liveBase = 'https://pay.pesapal.com/v3';

function baseUrl() {
  return process.env.PESAPAL_ENV === 'live' ? liveBase : sandboxBase;
}

function credentials() {
  const consumerKey = process.env.PESAPAL_CONSUMER_KEY;
  const consumerSecret = process.env.PESAPAL_CONSUMER_SECRET;
  if (!consumerKey || !consumerSecret) throw new Error('Pesapal credentials are not configured');
  return { consumerKey, consumerSecret };
}

async function pesapalFetch<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null) as T & { error?: { message?: string }; message?: string };
  if (!response.ok) throw new Error(payload?.error?.message || payload?.message || `Pesapal request failed (${response.status})`);
  return payload;
}

export async function getPesapalToken() {
  const { consumerKey, consumerSecret } = credentials();
  const payload = await pesapalFetch<{ token?: string; error?: { message?: string } }>('/api/Auth/RequestToken', {
    method: 'POST',
    body: JSON.stringify({ consumer_key: consumerKey, consumer_secret: consumerSecret }),
  });
  if (!payload.token) throw new Error(payload.error?.message || 'Pesapal did not return an access token');
  return payload.token;
}

export async function getPesapalIpnId(token: string, publicBaseUrl: string) {
  if (process.env.PESAPAL_IPN_ID) return process.env.PESAPAL_IPN_ID;
  const payload = await pesapalFetch<{ ipn_id?: string; error?: { message?: string } }>('/api/URLSetup/RegisterIPN', {
    method: 'POST',
    body: JSON.stringify({
      url: `${publicBaseUrl}/api/payments/pesapal/ipn`,
      ipn_notification_type: 'POST',
    }),
  }, token);
  if (!payload.ipn_id) throw new Error(payload.error?.message || 'Pesapal did not return an IPN ID');
  return payload.ipn_id;
}

export async function submitPesapalOrder(input: {
  token: string;
  ipnId: string;
  merchantReference: string;
  amount: number;
  currency: string;
  callbackUrl: string;
  cancellationUrl: string;
  email: string;
  name: string;
}) {
  const [firstName, ...rest] = input.name.trim().split(/\s+/);
  const lastName = rest.join(' ');
  return pesapalFetch<{ order_tracking_id?: string; redirect_url?: string; error?: { message?: string } }>('/api/Transactions/SubmitOrderRequest', {
    method: 'POST',
    body: JSON.stringify({
      id: input.merchantReference,
      currency: input.currency,
      amount: input.amount,
      description: 'ASR Premium - 30 days',
      callback_url: input.callbackUrl,
      cancellation_url: input.cancellationUrl,
      notification_id: input.ipnId,
      billing_address: {
        email_address: input.email,
        first_name: firstName || 'ASR',
        last_name: lastName || 'Listener',
        country_code: 'UG',
      },
    }),
  }, input.token);
}

export async function getPesapalTransactionStatus(orderTrackingId: string) {
  const token = await getPesapalToken();
  return pesapalFetch<{
    payment_method?: string;
    amount?: number;
    payment_status_description?: string;
    confirmation_code?: string;
    merchant_reference?: string;
    currency?: string;
    status_code?: number;
    error?: { message?: string };
  }>(`/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(orderTrackingId)}`, {}, token);
}

export async function reconcilePesapalPayment(orderTrackingId: string, merchantReference: string) {
  const payment = await prisma.paymentTransaction.findUnique({ where: { txRef: merchantReference } });
  if (!payment || payment.provider !== 'pesapal') return { state: 'missing' as const };

  const status = await getPesapalTransactionStatus(orderTrackingId);
  const description = status.payment_status_description?.toUpperCase();
  const amountMatches = Number(status.amount) === payment.amountMinor;
  const currencyMatches = status.currency === payment.currency;
  const referenceMatches = status.merchant_reference === payment.txRef;

  if (description === 'COMPLETED' && amountMatches && currencyMatches && referenceMatches) {
    const existing = await prisma.subscription.findUnique({ where: { userId: payment.userId } });
    const base = existing?.active && existing.renewsAt && existing.renewsAt > new Date() ? existing.renewsAt.getTime() : Date.now();
    const renewsAt = new Date(base + 30 * 24 * 60 * 60 * 1000);

    await prisma.$transaction([
      prisma.paymentTransaction.update({
        where: { id: payment.id },
        data: {
          status: 'SUCCESSFUL',
          providerTransactionId: orderTrackingId,
          paidAt: payment.paidAt ?? new Date(),
        },
      }),
      prisma.subscription.upsert({
        where: { userId: payment.userId },
        create: {
          userId: payment.userId,
          tier: 'PREMIUM',
          provider: 'pesapal',
          providerSubscriptionId: payment.txRef,
          active: true,
          renewsAt,
        },
        update: {
          tier: 'PREMIUM',
          provider: 'pesapal',
          providerSubscriptionId: payment.txRef,
          active: true,
          renewsAt,
        },
      }),
    ]);
    return { state: 'completed' as const, status };
  }

  if (description === 'FAILED' || description === 'INVALID' || description === 'REVERSED') {
    await prisma.paymentTransaction.update({
      where: { id: payment.id },
      data: { status: 'FAILED', providerTransactionId: orderTrackingId },
    });
    return { state: 'failed' as const, status };
  }

  await prisma.paymentTransaction.update({
    where: { id: payment.id },
    data: { providerTransactionId: orderTrackingId },
  }).catch(() => null);
  return { state: 'pending' as const, status };
}
