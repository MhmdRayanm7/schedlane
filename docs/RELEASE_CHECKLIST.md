# Release checklist

Use a clean checkout with Node 24, the pinned pnpm version, and a running Docker daemon.
Local verification and production maintenance are separate operations.

## Local quality gate

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm exec turbo typecheck --force
pnpm test
pnpm build
git diff --check
```

Tests use disposable PostgreSQL and RabbitMQ Testcontainers. If local development
fixtures are needed, create local `.env` files from the examples, generate fresh
development secrets, then run `pnpm dev:reset` and `pnpm dev:info` against local
infrastructure only. Never run reset, seed, or fixture commands in production.

## Production checks

1. Confirm API and Worker use production configuration, Resend, their required
   URLs, and identical guest-token encryption keys. Keep credentials out of logs,
   screenshots, documentation, and commits.
2. Verify API migration completion, `/health/live`, `/health/ready`, Worker
   PostgreSQL/RabbitMQ connections, outbox dispatch, and reminder scheduling.
3. Confirm the permanent Platform Admin is email verified and has a grant with
   `revoked_at IS NULL`. Revoke temporary grants by timestamp, preserving history.
4. Retire QA-only public content without deleting audit-linked users or bookings.
   Verify the clean published [demo](https://schedlane.pages.dev/book/demo-barbers)
   has services, prices, resources, working hours, and suitable booking policies.
5. Smoke-test authentication, public booking, guest management, admin bookings,
   nested-route refreshes, Light/Dark/System, API connectivity, and mobile layout.
   Use the verified demo inbox for real email delivery; the test sender cannot
   deliver to arbitrary recipients.
6. Confirm protected operations still enforce roles and tenant isolation, unknown
   API routes return safe JSON, and public limits return `RATE_LIMITED`.
7. Review the complete diff and screenshot contents. Commit only intended source,
   documentation, and portfolio images; exclude `.env`, `.local-assets`, dumps,
   tokens, logs, coverage, builds, dependencies, and temporary browser data.
8. Push the reviewed commit to `main`, verify its GitHub Actions quality gate is
   green, and verify Cloudflare Pages and both Northflank services deploy that SHA.
9. Only after CI and production smoke tests pass, create `v1.0.0` and the release
   titled **Schedlane v1.0.0**. Verify the tag's commit SHA, release page, README,
   screenshots, architecture diagram, and live demo.
