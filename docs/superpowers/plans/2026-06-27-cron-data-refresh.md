# Cron Data Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep all production Supabase market cache tables current through a shared refresh workflow and one-time backfill.

**Architecture:** Move the cron body into a testable service under `src/lib/tushare/refresh.ts`. Keep the route handler thin for auth and JSON response. Add Tushare fetch helpers for latest daily, weekly, monthly, MACD, CYQ, and finance snapshots, then reuse the same service from a backfill script.

**Tech Stack:** Next.js 16 App Router route handlers, Bun test runner, Tushare HTTP API, Supabase service-role writes.

---

### Task 1: Shared Refresh Service

**Files:**
- Create: `src/lib/tushare/refresh.ts`
- Modify: `src/app/api/cron/daily-refresh/route.ts`
- Test: `src/lib/tushare/refresh.test.ts`

- [ ] Write a failing Bun test that injects fake fetch/upsert/recompute functions and expects the refresh service to call daily, daily_basic, weekly, monthly, MACD, CYQ, and finance updates.
- [ ] Run `bun test src/lib/tushare/refresh.test.ts` and confirm the import fails because the service does not exist yet.
- [ ] Implement `runDailyRefresh` with dependency injection and structured step results.
- [ ] Change the route handler to call `runDailyRefresh` and return `500` when any required step fails.
- [ ] Run `bun test src/lib/tushare/refresh.test.ts` and confirm it passes.

### Task 2: Tushare Incremental Fetch Helpers

**Files:**
- Modify: `src/lib/tushare/bulk-fetch.ts`
- Test: `src/lib/tushare/bulk-fetch.test.ts`

- [ ] Write a failing test for row mapping from Tushare `ts_code` to local `code` for weekly, monthly, MACD, CYQ, and finance helpers.
- [ ] Run `bun test src/lib/tushare/bulk-fetch.test.ts` and confirm helper exports are missing.
- [ ] Implement the helpers using existing `tushareCall`.
- [ ] Run `bun test src/lib/tushare/bulk-fetch.test.ts`.

### Task 3: Backfill Script

**Files:**
- Create: `scripts/backfill-refresh.ts`

- [ ] Add a script that loads `.env.local`, calls `runDailyRefresh`, and prints structured step results.
- [ ] Run it against production Supabase to backfill latest snapshots.
- [ ] Query Supabase latest dates for every affected table and record the results.

### Task 4: Verification

**Files:**
- Modify: `package.json`

- [ ] Add a `test` script using `bun test`.
- [ ] Run `bun test`.
- [ ] Run `bun run lint`.
- [ ] Run `bun run build`.
- [ ] Inspect production deployment cron config and environment variables.
