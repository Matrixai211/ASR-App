# ASR Infrastructure

This repository is the source of truth for ASR application and infrastructure configuration.

## Environments

### Development
- Next.js application
- PostgreSQL-compatible database
- Better Auth
- Local or provider-backed object storage

### Production / Preview
- Vercel-compatible Next.js deployment
- Neon PostgreSQL database
- Better Auth using the application database
- Object storage/CDN provider to be selected separately
- Payment provider to be selected separately

## Required environment variables

Copy `.env.example` to a local `.env` file. Never commit real credentials.

Required for database-backed builds/runtime:
- `DATABASE_URL`

Required for authentication:
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`

Provider-specific storage and payment credentials will be added only when those integrations are implemented.

## Database lifecycle

Prisma schema: `prisma/schema.prisma`

Generate the client:

```bash
npm run db:generate
```

Synchronize a development/preview database:

```bash
npm run db:push
```

The production database must be backed up/branched and schema changes verified before they are applied.

## Deployment lifecycle

1. GitHub `main` is the source branch.
2. CI must pass `npm run build`.
3. The deployment platform imports this repository rather than maintaining a separate copy of the code.
4. Environment variables are configured in the deployment platform, never committed to Git.
5. Deployment health is verified from the public application URL and `/api/health`.

## Recovery

A lost deployment integration must not require rebuilding ASR. Reconnect/import `Matrixai211/ASR-App`, restore the required environment variables, connect the existing database, and deploy `main`.

A lost database integration must not require changing application code. Connect a PostgreSQL database through `DATABASE_URL`, verify the target database, then synchronize the checked-in Prisma schema using the controlled database workflow.

## Boundaries

ASR infrastructure is independent. Do not import or reuse another application's database, secrets, deployment configuration, or storage namespace.
