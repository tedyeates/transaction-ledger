# Corrections Log

<!-- Entries added automatically when mistakes are made. Read before starting work. -->



- ❌ WSL has Windows Node paths (`/mnt/c/Program Files/nodejs/`) in $PATH that shadow WSL corepack/npm → ✅ Must filter `/mnt/c` paths or run commands in user's interactive terminal where nvm is sourced (tool shell doesn't persist nvm across calls reliably)
- ❌ Seeded auth.users with NULL in string columns (email_change, phone, etc.) → ✅ Must set all varchar/text columns to '' not NULL — GoTrue Go code scans into non-pointer strings and panics on NULL
- ❌ Used `tests.` schema in pgTAP without `CREATE SCHEMA IF NOT EXISTS tests` → ✅ Must create schema first; supabase test db doesn't auto-create it
- ❌ Created functions in `tests` schema but `authenticated` role couldn't access them after `SET ROLE` → ✅ Must `GRANT USAGE ON SCHEMA tests TO authenticated` + `GRANT EXECUTE` on helper functions
- ❌ Called `get_transactions_v2()` with no args when multiple overloads exist (9-param and 13-param) → ✅ Must pass all params with explicit type casts to disambiguate: `get_transactions_v2(NULL::text, NULL::text, ...)`
- ❌ Planned 27 tests but pgTAP counted 30 (extra `lives_ok` from the authenticate/clear helper calls being counted) → ✅ Run once to get actual count, then fix plan number
- ❌ Judged `get_transactions_v2` as having no server-side role check after reading only the first `CREATE OR REPLACE FUNCTION` match in the schema dump → ✅ Postgres functions are overloaded; grep for every definition of the name and check which overload the client's parameter set actually resolves to (the 13-param version does enforce roles, the 9-param one does not)
- ❌ Used `CREATE OR REPLACE FUNCTION` to change a function's `RETURNS TABLE(...)` shape (added a column) → ✅ Postgres rejects return-type changes via `CREATE OR REPLACE`; must `DROP FUNCTION` first, then `CREATE`, then re-`GRANT` (DROP wipes existing grants)
- ❌ Assumed `REVOKE ALL ON FUNCTION ... FROM anon` removes EXECUTE for anon → ✅ Postgres functions are executable by `PUBLIC` by default (empty ACL = implicit PUBLIC grant); a role-specific REVOKE does nothing if the privilege was never an explicit per-role grant. Must `REVOKE ALL ... FROM PUBLIC` (and default privileges `... REVOKE ALL ON FUNCTIONS FROM PUBLIC`), then explicitly re-GRANT to `authenticated`/`service_role`
- ❌ `pnpm test` fails with "Cannot use 'in' operator to search for 'integrity' in undefined" in this WSL env → ✅ Run `node_modules/.bin/vitest --run` directly instead
