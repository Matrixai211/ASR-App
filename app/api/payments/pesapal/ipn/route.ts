import { NextRequest, NextResponse } from 'next/server';
import { reconcilePesapalPayment } from '../../../../../lib/pesapal';

async function handle(orderTrackingId?: string | null, merchantReference?: string | null) {
  if (!orderTrackingId || !merchantReference) {
    return NextResponse.json({ status: 400, message: 'Missing Pesapal transaction identifiers' }, { status: 400 });
  }

  try {
    await reconcilePesapalPayment(orderTrackingId, merchantReference);
    return NextResponse.json({
      orderNotificationType: 'IPNCHANGE',
      orderTrackingId,
      orderMerchantReference: merchantReference,
      status: 200,
    });
  } catch {
    return NextResponse.json({
      orderNotificationType: 'IPNCHANGE',
      orderTrackingId,
      orderMerchantReference: merchantReference,
      status: 500,
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => ({})) as {
    OrderTrackingId?: string;
    OrderMerchantReference?: string;
  };
  return handle(payload.OrderTrackingId, payload.OrderMerchantReference);
}

export async function GET(req: NextRequest) {
  return handle(
    req.nextUrl.searchParams.get('OrderTrackingId'),
    req.nextUrl.searchParams.get('OrderMerchantReference'),
  );
}
