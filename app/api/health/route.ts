import { prisma } from '../../../lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  let database: 'ok' | 'error' | 'skipped' = 'skipped';

  // Optional reachability check. Health probes must still return 200 even if the
  // database is temporarily unavailable so platform health checks do not flap.
  if (process.env.DATABASE_URL) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = 'ok';
    } catch {
      database = 'error';
    }
  }

  return Response.json(
    {
      status: 'ok',
      service: 'asr-app',
      database,
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
