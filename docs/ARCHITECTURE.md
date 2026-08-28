# ASR architecture

ASR is separated into listener, artist, operations and commerce surfaces.

## Listener
Discovery, search, library and playback. Playback URLs must ultimately be short-lived/signed and only published catalog items should be streamable.

## Artist
Profiles, release drafts, audio/artwork ingestion, rights metadata, submission and catalog management.

## Operations
Moderation states are explicit: submitted, in review, changes requested, approved, published or rejected. Admin authorization must be enforced before production.

## Commerce
Free/ad-supported, Premium, downloads, merchandise, tickets, artist exclusives, label services and advertising. Payment processing is deliberately provider-abstracted until credentials/webhooks are configured.

## Required production services
PostgreSQL, authentication provider/session system, S3-compatible object storage + CDN, payment provider, email, observability and analytics.
