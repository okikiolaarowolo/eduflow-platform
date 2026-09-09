# EduFlow Production Runbook

## Release flow

1. GitHub `main` is the source of truth.
2. Every push or pull request to `main` runs the CI build and lint workflow.
3. Vercel deploys the production application from `main`.
4. Supabase migrations are committed under `supabase/migrations/` and applied to the production project in a controlled order.
5. Verify authentication, onboarding, a school dashboard, results, finance, attendance and EduFlow AI after a production release.

## Tenant and security checklist

- Every school-owned table is protected by Row Level Security.
- School access is derived from the authenticated profile rather than a client-supplied tenant selector.
- Platform administration is restricted to `super_admin`.
- Parent and student portal navigation is intentionally not part of the product.
- AI provider credentials are server-side only.
- AI quota reservation/finalization functions are server-only.
- Never put a Supabase service-role key in a `VITE_*` environment variable.

## SaaS operations

- `saas_plans` stores configurable plan limits and pricing.
- `school_subscriptions` stores the school lifecycle and billing cycle.
- `billing_customers`, `billing_invoices` and `billing_events` provide a provider-neutral billing architecture.
- `school_usage_events` stores metering events.
- `school_usage_monthly` stores refreshable usage snapshots.
- Student and teacher creation is protected by server-side plan limits.
- A newly created school receives the configured Starter trial automatically.

## Recovery readiness

- Keep Supabase database backups enabled in the Supabase project settings and verify the retention policy appropriate for the production plan.
- Before destructive migrations, take/verify a current database backup and record the migration version.
- Keep migration files immutable after they have been applied; add corrective migrations instead of rewriting history.
- For an incident, stop further releases, identify the last known-good Git commit and migration version, restore database data only through the approved backup/recovery procedure, then redeploy the matching application commit.
- Recovery drills should be performed periodically against a non-production environment.

## Monitoring

Use the Platform Admin dashboard for school/subscription/usage signals. Use Supabase advisors for database security/performance findings and Vercel deployment status for application releases.

## Billing provider integration

The schema is provider-neutral. A server-side payment integration may write customer IDs, subscription IDs, invoices and signed webhook events. Webhook handlers must verify provider signatures, enforce idempotency with `billing_events.external_event_id`, and never accept a school ID from an untrusted webhook payload without resolving it through the stored provider/customer relationship.

## Rollback principle

Application rollback and database rollback are separate operations. Prefer a forward migration for schema fixes. Never delete production tenant data as part of an application rollback.
