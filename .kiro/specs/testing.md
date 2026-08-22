# Testing — Project-Wide

Accumulating record of test tooling, strategy, and conventions. Context for PR review agents. Append only.

## Tooling

| Layer | Tool | Command |
|-------|------|---------|
| JS unit / component / property | Vitest 4 | `pnpm test` (`vitest --run`) |
| React rendering | `@testing-library/react` + `@testing-library/jest-dom` | — |
| DOM environment | jsdom, opt-in per file via `@vitest-environment jsdom` docblock (global default is `node`, set in `vite.config.js`) | — |
| Property-based | `fast-check` | — |
| Database / RPC | pgTAP against local Supabase | `npx supabase test db` (host, needs `npx supabase start`) |

## Strategy

- Test through seams — module public interfaces and RPC boundaries — not internal functions. Value coercers, column maps and similar internals are covered transitively through the module that owns them.
- **Only the external service is mocked.** Supabase client calls are mocked in component tests (`vi.mock('../lib/supabase')`); database behaviour is tested for real against local Supabase via pgTAP. Never mock the DB, validation, or routing.
- Local only. No test may depend on cloud Supabase or any hosted service.
- Frontend-first: parser and UI are tested against fixture data before the corresponding migration or RPC exists.
- **Known gap: no browser e2e.** No Playwright or Cypress config and no CI e2e stage. Unit and component tests mock `supabase.rpc`, so parser-shape-versus-RPC-shape wiring bugs are invisible to them — a field added to the parser but not to the RPC's `jsonb` extraction inserts silent NULLs with all tests green. Mitigation where it matters: a Node-level wiring test that drives the real parser into the real local RPC and reads rows back, gated on local Supabase running and skipped otherwise. Introduced as an option by the statement-format-v2 spec.

## Conventions

- Location: tests sit next to the code (`src/components/Foo.test.jsx`, `scripts/foo.test.js`). No separate test tree.
- Naming: `*.test.jsx` / `*.test.js`, with intent in the middle segment — `*.property.test.js` for fast-check suites, `*.integration.test.jsx` for multi-module tests, `*.e2e.test.js` for the local-Supabase wiring test.
- pgTAP tests live in `supabase/tests/*_test.sql`.
- Component test setup pattern (see `ImportModal.test.jsx`): mock `../lib/supabase`, mock the module under exercise's collaborators, mock `useToast` to capture toast text, stub `FileReader` so `onload` fires synchronously, assert user-visible strings including Thai copy and `role="alert"` content.
- pgTAP pattern (see `supabase/tests/rpc_functions_test.sql`): `CREATE SCHEMA IF NOT EXISTS tests`, `tests.authenticate_as(uuid)` / `tests.clear_auth()` helpers with explicit `GRANT USAGE`/`GRANT EXECUTE` to `authenticated`, seeded users from `seed.sql`, wrapped in `BEGIN`/`ROLLBACK`.
- `plan(N)` counts are fragile — run the suite once and use the reported assertion count rather than counting by hand (helper `lives_ok` calls are counted too).
- Overloaded RPCs must be called with all parameters and explicit casts (`get_transactions_v2(NULL::text, ...)`) or Postgres cannot resolve the overload.

## Fixtures

- Real bank exports are used as fixtures deliberately, because format quirks are the thing under test and synthetic files do not reproduce them (BOM, whitespace-only trailer, double-spaced channel names, bank-truncated counterparty names).
- `texport.csv` — Kasikorn English/Gregorian export, 92 transactions, 15 columns, exported 21/08/2026. Reference facts: 82 distinct timestamps, seven rows sharing `18/08/2026 21:07:00`, 59 rows with zero debit, 12 rows with a counterparty, `Narrative` empty and `FX Rate` `0.00` throughout.
- **`texport.csv` is never committed.** It contains real financial data (customer names, masked account numbers) and is listed in `.gitignore`. It must exist locally, at the repo root, for the tests that use it to exercise their real-fixture path. Any test reading it must guard on its absence (see `it.runIf(fixtureBuffer)` in `src/lib/csv.test.js`) and skip cleanly rather than fail when the file is not present — this is the expected state in a fresh checkout or CI.
- Fixtures containing real statement data must never be committed, must not be extended with further real exports, and must keep the bank's own account masking.

## Per-Feature Notes

### statement-format-v2

- Tested through four existing seams — `parseBankCSV(ArrayBuffer, { format })`, `import_transactions(rows jsonb)`, `ImportModal` render, `TransactionRow` render — plus `csv-to-migration.js`'s exports, and one optional new wiring seam.
- Format selection is admin-chosen via a select box defaulting to the new format (`kbank_en_v2`), with header detection as a guard: an explicit selection that disagrees with the file is refused, not parsed. Tests cover the default, the manual override, the auto option, the mismatch refusal, and re-parse on selection change.
- Regression tests are prioritised by silent-failure risk rather than by module: Gregorian year not shifted by 543, negative debit stored positive, `0.00` treated as absent, seconds preserved, same-second batch imports whole, minute-granularity dedup against v1 history, v1 files still parse, and a v2 file selected as v1 is refused rather than parsed.
- Property invariants over generated v2 rows: `withdraw`/`deposit` never negative, exactly one of the two set per transaction, year and seconds round-trip from input text.

## File Index

| Path | Summary |
|------|---------|
