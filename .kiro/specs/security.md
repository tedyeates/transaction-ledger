# Security — Project-Wide

Accumulating record of security decisions and findings. Context for PR review agents. Append only.

## Auth & Session Model

- Supabase Auth (email/password) via `@supabase/supabase-js`. Session restored on load in `App.jsx`; no custom backend, no custom token handling.
- Anon key is a public client credential shipped in the bundle (`VITE_SUPABASE_ANON_KEY`). All real authorization must therefore be server-side, in Postgres.
- Roles live in `public.user_roles` (`admin`, `withdrawal`, `income`), one row per user.

## Permission Boundaries

- **No direct table access from the client.** All reads and writes go through RPC functions. This is the primary boundary.
- **Dual authorization intent:** table-level RLS policies plus function-level role checks, each enforcing the same rules independently.
- Enforced server-side today: `get_latest_balance` (admin check), `import_transactions` (admin check, raises `Permission denied`), `update_remark`, `toggle_highlight` (admin), `update_memo` (type-restricted to the caller's role), `get_transaction_stats` / `get_transaction_stats_v2` (role-derived row restriction, `Permission denied` for roleless callers), `get_transactions_v2` (role-derived row restriction plus column masking of `balance`/`remark` for non-admin).

## Known Findings

Fixed in migration `20260822080000_rpc_authz_hardening.sql` (issue #21, closed). Verified via pgTAP (`supabase/tests/rpc_functions_test.sql`, 47 assertions, all passing) against local Supabase.

- `get_transaction_stats_v2` (13-param) and `get_transaction_stats` now resolve the caller's role from `user_roles` and constrain the aggregate to rows that role may see; roleless/unauthenticated callers raise `Permission denied`. `p_type` is applied on top of the role restriction, not instead of it — an accountant cannot widen scope by passing the other type.
- The unchecked 9-parameter `get_transactions_v2` and `get_transaction_stats_v2` overloads are dropped (pgTAP asserts they no longer exist via `pg_proc`/`pg_get_function_identity_arguments`).
- `get_transactions_v2` (13-param, the one the client calls) now returns an explicit column list instead of `SELECT *` / `SETOF transactions`, nulling `balance` and `remark` for non-admin callers — matching the masking already present in legacy `get_transactions()`. New columns added to `transactions` (e.g. `is_highlighted`) must be added to this explicit list going forward; they are no longer disclosed automatically.
- `anon` and the implicit `PUBLIC` grant (Postgres grants EXECUTE to PUBLIC by default on new functions) are revoked from every function in `public`, and `ALTER DEFAULT PRIVILEGES` no longer grants `FUNCTIONS` to `anon` or `PUBLIC`. `authenticated` and `service_role` keep EXECUTE. New functions must be explicitly granted to `authenticated`/`service_role`; they no longer inherit `anon`/`PUBLIC` access by default.
- `FORCE ROW LEVEL SECURITY` on `transactions` was flagged as a decision, not a mandate, and was **not** applied in this migration — RLS still does not backstop `SECURITY DEFINER` functions owned by `postgres`. All authorization on `transactions` continues to rely on each function's own role check.
- No client changes were required: `useTransactions.buildFilterParams` already sends all 13 named parameters (resolves to the surviving overload) and the UI already treats `balance`/`remark` as optional for accountants.
- No unique constraint on `transactions`, by ADR 0001. Duplicate prevention lives entirely in RPC logic, so bypassing the RPC bypasses dedup. Accepted: import is admin-only and RPC-only.

## Sensitive Data Flows

- **CSV import is the only ingress for bank data.** Parsing is client-side by design — statement contents are never sent to a third party. `csv-to-migration.js` exists for the same reason: data corrections are generated locally as SQL rather than shared.
- **Counterparty PII (statement-format-v2).** `counterparty_name` holds real customer and company names; `counterparty_account` holds bank-masked account numbers (`0942XXX148`) — masking is the bank's, not ours, and must not be un-masked or reconstructed. Both are readable by accountant roles by design, and are additionally exposed to unintended callers by the `get_transactions_v2` 9-parameter overload and the missing column masking described above.
- **Test fixtures contain real statement data.** `texport.csv` is a real export (92 transactions, Thai company names, masked accounts). It is deliberately **not committed** — it is listed in `.gitignore` and must only ever exist as a local, uncommitted file at the repo root. Do not remove it from `.gitignore`, do not extend it with additional real statements, and do not add unmasked identifiers to it.
- `.env` holds the Supabase URL and anon key and is gitignored. `prod_data.dump` is a production dump present in the repo root — verify it is gitignored before any commit that touches root files.

## Constraints for New Work

- New columns on `transactions` are returned by `get_transactions_v2` automatically (`RETURNS SETOF transactions`). Adding a column is therefore an implicit disclosure decision — state the intended role visibility in the spec, and remember UI-level hiding is not enforcement. Once #21 replaces `SELECT *` with an explicit masked column list, adding a table column also means adding it to that list.
- Any new RPC must carry its own role check; do not rely on RLS in `SECURITY DEFINER` functions, and do not rely on a sibling overload's check.
- Grant new functions to `authenticated` and `service_role` only, not `anon`. Note that `ALTER DEFAULT PRIVILEGES` currently grants `ALL ON FUNCTIONS` to `anon` in `public`, so a new function needs an explicit `REVOKE` until that default is changed.

## File Index

| Path | Summary |
|------|---------|
