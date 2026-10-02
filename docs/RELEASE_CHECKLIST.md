# Release checklist

Use this checklist from a clean checkout or detached worktree.

1. Install with `pnpm install --frozen-lockfile` using Node 24 and the pinned pnpm version.
2. Create API, Web, and Worker `.env` files from their examples; generate fresh auth and encryption secrets.
3. Confirm production uses Resend and provides the required sender, key, encryption key, and customer-facing URLs.
4. Start an empty PostgreSQL and RabbitMQ stack, then run `pnpm dev:reset` so every migration and the deterministic fixture reset execute.
5. Run `pnpm dev:info` and verify the printed role/state matrix and current generated guest-management URLs.
6. Run `pnpm check:fix`, `pnpm check`, `pnpm exec turbo typecheck --force`, `pnpm test`, `pnpm build`, and `git diff --check`.
7. Start API and Worker. Verify `/health/live`, `/health/ready`, the reminder scheduler, outbox dispatcher, and RabbitMQ consumers.
8. Smoke-test authentication, onboarding, publication, public/scoped booking, guest management, admin booking lifecycle, role restrictions, and branded error states.
9. Confirm unknown API routes and unexpected errors return safe JSON with a request ID, public limits return `RATE_LIMITED`, and request logs redact booking share tokens.
10. Confirm the working tree is clean and no `.env`, credentials, generated tokens, or fixture-only output was committed.
