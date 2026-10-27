# ASR App

ASR (Asap Shimmy Records) is a distribution-first music platform combining streaming, artist distribution and direct music commerce.

## Included in this starter
- Artist Studio
- Release creation workflow
- Streaming product foundation
- Free + Premium subscriptions
- Downloads/store
- Merch and tickets
- Advertising
- Label services
- Admin/moderation architecture
- `/api/health` endpoint

## Stack
Next.js App Router + TypeScript, PostgreSQL with Prisma, Better Auth, Supabase Storage, and Pesapal payment integration.

## Run
```bash
npm install
npm run dev
```
Open http://localhost:3000 and test GET /api/health.

## Deployment
Railway deployment setup, environment variables, staging safety, and production cutover are documented in [docs/RAILWAY_DEPLOYMENT.md](docs/RAILWAY_DEPLOYMENT.md). Use an isolated Neon branch for staging; do not point the first Railway deployment at the production database.

## Next milestones
1. Complete staging deployment and verify environment configuration
2. Verify artist release uploads against the real Supabase bucket
3. Verify Premium access and Pesapal sandbox checkout end to end
4. Merge the distribution and Premium work after checks pass
5. Promote Railway from staging branch to `main` after validation
