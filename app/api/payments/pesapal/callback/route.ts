import { NextRequest, NextResponse } from 'next/server';
import { reconcilePesapalPayment } from '../../../../../lib/pesapal';

export async function GET(req: NextRequest) {
  const orderTrackingId = req.nextUrl.searchParams.get('OrderTrackingId');
  const merchantReference = req.nextUrl.searchParams.get('OrderMerchantReference');
  const publicBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || req.nextUrl.origin).replace(/\/$/, '');

  if (!orderTrackingId || !merchantReference) {
    return NextResponse.redirect(`${publicBaseUrl}/premium?payment=invalid`);
  }

  try {
    const result = await reconcilePesapalPayment(orderTrackingId, merchantReference);
    const payment = result.state === 'completed' ? 'success' : result.state === 'failed' ? 'failed' : 'pending';
    return NextResponse.redirect(`${publicBaseUrl}/premium?payment=${payment}`);
  } catch {
    return NextResponse.redirect(`${publicBaseUrl}/premium?payment=pending`);
  }
}
