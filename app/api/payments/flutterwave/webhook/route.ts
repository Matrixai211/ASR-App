import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

function validSignature(rawBody: string, req: NextRequest, secretHash: string) {
  const legacy = req.headers.get('verif-hash');
  if (legacy && legacy === secretHash) return true;

  const signature = req.headers.get('flutterwave-signature');
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', secretHash).update(rawBody).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const secretHash = process.env.FLW_SECRET_HASH;
  if (!secretHash) return new NextResponse('Webhook not configured', { status: 503 });

  const rawBody = await req.text();
  if (!validSignature(rawBody, req, secretHash)) return new NextResponse('Invalid signature', { status: 401 });

  const payload = JSON.parse(rawBody) as {
    event?: string;
    data?: {
      id?: number | string;
      tx_ref?: string;
      status?: string;
      amount?: number;
      currency?: string;
    };
  };

  const data = payload.data;
  if (!data?.tx_ref) return NextResponse.json({ received: true });

  const payment = await prisma.paymentTransaction.findUnique({ where: { txRef: data.tx_ref } });
  if (!payment) return NextResponse.json({ received: true });

  const successful = data.status === 'successful';
  const amountMatches = Number(data.amount) === payment.amountMinor;
  const currencyMatches = data.currency === payment.currency;

  if (!successful || !amountMatches || !currencyMatches) {
    if (data.status === 'failed' || data.status === 'cancelled') {
      await prisma.paymentTransaction.update({
        where: { id: payment.id },
        data: { status: data.status === 'cancelled' ? 'CANCELLED' : 'FAILED' },
      });
    }
    return NextResponse.json({ received: true });
  }

  const renewsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.$transaction([
    prisma.paymentTransaction.update({
      where: { id: payment.id },
      data: {
        status: 'SUCCESSFUL',
        providerTransactionId: data.id ? String(data.id) : payment.providerTransactionId,
        paidAt: payment.paidAt ?? new Date(),
      },
    }),
    prisma.subscription.upsert({
      where: { userId: payment.userId },
      create: {
        userId: payment.userId,
        tier: 'PREMIUM',
        provider: 'flutterwave',
        providerSubscriptionId: payment.txRef,
        active: true,
        renewsAt,
      },
      update: {
        tier: 'PREMIUM',
        provider: 'flutterwave',
        providerSubscriptionId: payment.txRef,
        active: true,
        renewsAt,
      },
    }),
  ]);

  return NextResponse.json({ received: true });
}
