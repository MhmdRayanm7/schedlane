# API integration tests

Run `pnpm test` from the repository root, or `pnpm --filter @schedlane/api test`.
Node 24 and a running Docker-compatible container runtime are required. The first
run may need to download the PostgreSQL 18 and Testcontainers reaper images.

Each test file gets a new PostgreSQL container with a random host port and runs
the real migrations from `src/migrations`. No existing database URL or Compose
container is used. The setup file supplies test configuration before importing
the API database singleton or any services; no `.env` file is needed.

Tests within a file run sequentially. Before each test, all application tables
are truncated, retaining migration bookkeeping. Do not use `it.concurrent` with
this shared database reset; individual tests can issue concurrent service calls.
Teardown closes both database pools and removes the container, including when
tests fail. Testcontainers' reaper remains enabled for unexpected process exits.

`pnpm typecheck` includes the tests and Vitest configuration. Production builds
still compile only `src`. Turbo caching is disabled for the API test task so
`pnpm test` always exercises PostgreSQL.
