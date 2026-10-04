# V1 free deployment

Live app: <https://schedlane.pages.dev>. Public portfolio demo:
<https://schedlane.pages.dev/book/demo-barbers>.

Use Node.js 24 and the pnpm version in `packageManager`. Never upload local
`.env` files, development data, or seed fixtures.

## Northflank

Both combined services build `main` with repository-root context, `/Dockerfile`,
one instance, and the free compute plan. Select target `api` for `schedlane-api`
and `worker` for `schedlane-worker`. Runtime images contain compiled code and
production dependencies and run as the unprivileged `node` user.

Only API port 3000 is public, through Northflank HTTPS. Use `/health/live` for
liveness and `/health/ready` for readiness. Allow startup time for migrations.
The worker has no public port. Both processes handle SIGTERM.

The API command runs `node dist/migrate.js` before `exec node dist/index.js`.
Kysely uses its migration lock and records completed migrations. Any failure
prevents the API from starting. Deploy the API and verify migration logs before
starting the worker. Never run seed/reset commands against production.

Link the existing private PostgreSQL addon URI to `DATABASE_URL` in a secret
group shared by API and worker. Keep TLS and certificate verification enabled.
Set these shared runtime values:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Private PostgreSQL TLS URI from the existing addon |
| `EMAIL_PROVIDER` | `resend` |
| `RESEND_API_KEY` | Protected sending credential |
| `EMAIL_FROM` | `Schedlane <onboarding@resend.dev>` |
| `GUEST_MANAGEMENT_TOKEN_ENCRYPTION_KEY` | Fresh random 32 bytes, base64 encoded; identical in API and worker |

API-specific values:

| Variable | Value |
| --- | --- |
| `HOST` | `0.0.0.0` |
| `PORT` | `3000` |
| `BETTER_AUTH_SECRET` | Fresh random secret, at least 32 characters |
| `BETTER_AUTH_URL` | `https://schedlane.pages.dev` (auth is proxied to Northflank) |
| `WEB_ORIGIN` | `https://schedlane.pages.dev` |

Worker-specific values:

| Variable | Value |
| --- | --- |
| `RABBITMQ_URL` | Existing CloudAMQP `amqps://` URI |
| `PLATFORM_NOTIFICATION_EMAIL` | `schedlane.app@gmail.com` |
| `SUPPORT_EMAIL` | `schedlane.app@gmail.com` |
| `APP_BASE_URL` | `https://schedlane.pages.dev` |
| `GUEST_BOOKING_MANAGEMENT_URL` | `https://schedlane.pages.dev/booking/manage` |

Polling, retry, and batch settings retain their code defaults. Resend's test
sender only delivers to the verified account recipient; a custom sender domain
is intentionally deferred.

## Cloudflare Pages

Connect the same GitHub repository and `main`, using repository root as the build
root. Set `NODE_VERSION=24.15.0`, `PNPM_VERSION=11.24.0` and
`SKIP_DEPENDENCY_INSTALL=true`. Build with:

```sh
pnpm install --frozen-lockfile && pnpm --filter @schedlane/web build
```

Output directory: `apps/web/dist`. Set `VITE_API_URL=https://schedlane.pages.dev`
and `VITE_SUPPORT_EMAIL=schedlane.app@gmail.com` for the production build.
Set Pages runtime variable `API_ORIGIN` to the Northflank API HTTPS origin.
Rebuild after changing build variables; redeploy after changing runtime bindings.

Pages proxies `/api/*` to the configured API without caching or following
redirects. This keeps secure, HttpOnly, SameSite=Lax auth cookies first-party
across the providers' unrelated hostnames. Better Auth uses the Pages origin so
verification links also pass through the proxy. API authorization, trusted-origin
checks, and tenant scoping remain unchanged. `_routes.json` restricts function
invocations to API paths; `_redirects` supports SPA navigation and refreshes.

Verify API health, all migration logs, worker PostgreSQL and RabbitMQ startup,
HTTPS pages and nested refreshes, then signup and session requests through Pages.
Free Pages Functions request quotas apply to proxied API traffic.

## Release operations

The pinned quality gate is `.github/workflows/ci.yml`. Pushes to `main` build the
Pages application and both Northflank services through their provider integrations.
Check the deployed commit and health in each provider; a green GitHub Actions run
alone does not confirm deployment health.

Keep PostgreSQL private, Worker ports closed, and credentials in provider secret
bindings. Admin credentials are not public demo credentials. Retire QA organizations
with archive/unpublish/suspension, retain audit-linked users and bookings, and revoke
temporary Platform Admin grants using `platform_admin.revoked_at`.
