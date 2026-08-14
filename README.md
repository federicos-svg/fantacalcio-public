# Fantacalcio Auction Copilot — public core

Deterministic auction copilot core: append-only event log, hard-safe budget
engine, listone UI, data contracts and synthetic-fixture test suites.

This is the public, sanitized core of a personal project. Data acquisition,
private connectors and personal strategy live in a separate private
repository and are not part of this tree. All fixtures here are synthetic:
no real player data, no proprietary datasets, no credentials.

## Commands
- `npm run typecheck` / `npm test` / `npm run build`
- `npm run test:e2e` — Playwright (Chromium) against the built preview
- `npm run verify` — full local gate
