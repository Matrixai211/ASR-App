# ASR Infrastructure

This repository is the source of truth for ASR application and infrastructure configuration.

## Environments

### Development
- Next.js application
- PostgreSQL-compatible database
- Better Auth
- Supabase object storage
- Pesapal sandbox for payment testing

### Railway staging
- Railway service sourced from `feature/artist-distribution-studio` while the current work is validated
- A dedicated Neon staging branch or separate staging database
- Better Auth using the staging database
- Supabase storage with the ASR media bucket
- Pesapal sandbox credentials

### Railway production
- Railway service sourced from `main` after the pull request passes CI and staging checks
- Production Neon database
- Better Auth using the production public URL
- Supabase storage with the ASR media bucket
- Pesapal live credentials only after sandbox payment flows have been verified

## Required environment variables

Configure secrets in Railway's service Variables settings. Never commit real credentials.

Required:
- `DATABASE_URL`: PostgreSQL connection string with TLS enabled where required. It is read during the Docker build for Prisma configuration and again at runtime.
- `BETTER_AUTH_SECRET`: a strong, unique authentication secret.
- `BETTER_AUTH_URL`: the public URL of the deployed ASR app.
- `NEXT_PUBLIC_APP_URL`: the same public app URL, used for payment callbacks and redirects.
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`: server-only secret; never expose it through a `NEXT_PUBLIC_` variable.
- `SUPABASE_STORAGE_BUCKET`, normally `asr-media`
- `PESAPAL_ENV`: use `sandbox` for staging.
- `PESAPAL_CONSUMER_KEY`
- `PESAPAL_CONSUMER_SECRET`
- `ASR_PREMIUM_PRICE_UGX`

Optional:
- `PESAPAL_IPN_ID`: if unset, ASR attempts to register the IPN endpoint when starting checkout.

## Database lifecycle

Prisma schema: `prisma/schema.prisma`

Generate the client:
```bash
npm run db:generate
```

Synchronize a development or isolated staging database:
```bash
npm run db:push
```

Railway runs `npm run db:deploy` as a pre-deploy command. That script currently uses `prisma db push`, so keep the staging service pointed at a dedicated staging database until the release and schema have been reviewed. Back up and verify the production database before pointing production at any schema-sync operation.

## Deployment lifecycle

1. GitHub Actions must pass for the pull request.
2. The Railway configuration in `.railway/railway.ts` targets the feature branch for staging.
3. Set the staging `DATABASE_URL` and other required variables before deploying.
4. Verify `/api/health`, registration/login, artist release submission, audio/artwork storage, Premium entitlements, downloads, and Pesapal sandbox callbacks.
5. After staging succeeds and the pull request is merged, switch the Railway source branch to `main`, configure the production environment variables, and verify the live service before changing any custom-domain DNS.

## Recovery

A lost deployment integration must not require rebuilding ASR. Reconnect the Railway service to `Matrixai211/ASR-App`, restore the required environment variables, connect the correct database, and deploy the intended branch.

A lost database integration must not require changing application code. Connect the correct PostgreSQL database through `DATABASE_URL`, verify the target database, and run the controlled schema workflow.

## Boundaries

ASR infrastructure is independent. Do not import or reuse another application's database, secrets, deployment configuration, or storage namespace.
