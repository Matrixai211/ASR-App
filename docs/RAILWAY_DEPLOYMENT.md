# Deploy ASR App on Railway

This runbook moves ASR's application server from Vercel to Railway while keeping Neon PostgreSQL and Supabase Storage. The first Railway deployment is a **staging deployment**, not a production cutover.

## 1. Prepare staging safely

1. Create a dedicated Neon branch or separate database for staging.
2. Do not use the production `DATABASE_URL` for the first deployment.
3. Connect Railway to the GitHub repository `Matrixai211/ASR-App`.
4. Use branch `feature/artist-distribution-studio` while this pull request is being tested.

The repository contains `.railway/railway.ts` for Railway Infrastructure as Code. From a local checkout of this branch, the Railway CLI workflow is:

```powershell
npm install -g @railway/cli
railway login
railway config plan
railway config apply
```

Review the plan before applying it. The configuration defines the ASR app service, the staging source branch, the `/api/health` health check, and the pre-deploy schema-sync command.

## 2. Configure service variables

Add the variables in Railway's service **Variables** tab before triggering the first successful deployment:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Connection string for the isolated Neon staging branch, with TLS enabled where required |
| `BETTER_AUTH_SECRET` | Strong, unique authentication secret |
| `BETTER_AUTH_URL` | Full public Railway URL, including `https://` |
| `NEXT_PUBLIC_APP_URL` | Same full public Railway URL, including `https://` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase key |
| `SUPABASE_STORAGE_BUCKET` | Usually `asr-media` |
| `PESAPAL_ENV` | Set to `sandbox` for staging |
| `PESAPAL_CONSUMER_KEY` | Pesapal sandbox consumer key |
| `PESAPAL_CONSUMER_SECRET` | Pesapal sandbox consumer secret |
| `PESAPAL_IPN_ID` | Optional; ASR can attempt to register its IPN endpoint |
| `ASR_PREMIUM_PRICE_UGX` | Configured monthly Premium price in UGX |

Generate a Railway public domain in the service's Networking settings, then use that full HTTPS URL for both `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL`. If the domain is created only after the first deployment, set both values immediately afterward and redeploy before testing authentication or payments.

Do not copy a production Vercel URL into the new service. The authentication configuration no longer relies on Vercel-specific environment variables.

## 3. Build and database behavior

Railway detects the repository's Dockerfile. The image build runs `npm run build`, which generates Prisma Client and builds Next.js. The database schema sync is intentionally separated from the build and runs as the Railway pre-deploy command:

```bash
npm run db:deploy
```

At present, `db:deploy` uses `prisma db push`. That is why staging must use an isolated Neon branch until the schema and application have been checked. The Docker build requires `DATABASE_URL` to be set in Railway variables because Prisma reads the connection configuration during client generation; the schema-sync command runs later, before the app starts.

## 4. Verify staging

After deployment:

1. Open `/api/health` and confirm it returns HTTP 200 with `status: "ok"`.
2. Test account registration, login, and session persistence.
3. Create an artist release draft and submit it with the rights attestation.
4. Verify artwork/audio upload and playback against the actual Supabase bucket.
5. Verify Premium gating and eligible downloads with a test account.
6. Test Pesapal sandbox checkout, callback, and IPN reconciliation.
7. Inspect Railway build, pre-deploy, and runtime logs for errors.

A successful health check alone does not prove the database, storage, authentication, and payment integrations are all working.

## 5. Production cutover

Only after staging passes:

1. Merge the pull request after GitHub CI succeeds.
2. Switch the Railway service source branch to `main`.
3. Configure the production Neon URL and production secrets in the production environment.
4. Back up and verify the production database before applying schema changes.
5. Run the production deployment and test the critical flows again.
6. Attach a custom domain you control only after the Railway URL is stable, then update that domain's DNS.

Keep the existing Vercel deployment available until Railway has passed the production smoke tests. Do not delete the Vercel project or change domain DNS as part of the initial staging setup.
