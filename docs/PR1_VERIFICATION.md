# PR #1 Verification Checklist

Use this list on an **isolated staging environment** before merging `feature/artist-distribution-studio` into `main`.

## Environment

- [ ] Dedicated Neon (or other PostgreSQL) staging database — never production
- [ ] `DATABASE_URL` points only at staging
- [ ] `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` set to the staging public URL
- [ ] Supabase project variables configured (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`)
- [ ] Pesapal sandbox credentials set (`PESAPAL_ENV=sandbox`)

## Core checks

- [ ] `GET /api/health` returns HTTP 200 with `status: "ok"`
- [ ] Artist can create a draft release with at least one track title
- [ ] Artist can request signed upload URLs for artwork and audio masters
- [ ] Artist can complete uploads and see object keys stored on the release/track
- [ ] Submit requires rights attestation and all required fields; lands in `SUBMITTED`
- [ ] Admin/Moderator can move a release through moderation statuses (auth required)
- [ ] Unauthenticated or non-staff callers receive 401/403 on the admin status endpoint
- [ ] Published exclusive track is blocked for free users and plays for active Premium
- [ ] Download endpoint requires Premium + `downloadable === true`
- [ ] Pesapal sandbox payment + IPN/callback does not double-extend the same 30-day period
- [ ] Premium library shows the empty state cleanly when no exclusive/downloadable published releases exist

## Do not merge until

1. The checks above pass on staging.
2. Latest GitHub Actions build on this branch is green.
3. Owner explicitly approves the merge.

Production database schema changes must still follow a backup + review process. `prisma db push` is staging-only until that process exists.
