# Corrections Log

<!-- Entries added automatically when mistakes are made. Read before starting work. -->



- ❌ WSL has Windows Node paths (`/mnt/c/Program Files/nodejs/`) in $PATH that shadow WSL corepack/npm → ✅ Must filter `/mnt/c` paths or run commands in user's interactive terminal where nvm is sourced (tool shell doesn't persist nvm across calls reliably)
- ❌ Seeded auth.users with NULL in string columns (email_change, phone, etc.) → ✅ Must set all varchar/text columns to '' not NULL — GoTrue Go code scans into non-pointer strings and panics on NULL
- ❌ Used `tests.` schema in pgTAP without `CREATE SCHEMA IF NOT EXISTS tests` → ✅ Must create schema first; supabase test db doesn't auto-create it
- ❌ Created functions in `tests` schema but `authenticated` role couldn't access them after `SET ROLE` → ✅ Must `GRANT USAGE ON SCHEMA tests TO authenticated` + `GRANT EXECUTE` on helper functions
- ❌ Called `get_transactions_v2()` with no args when multiple overloads exist (9-param and 13-param) → ✅ Must pass all params with explicit type casts to disambiguate: `get_transactions_v2(NULL::text, NULL::text, ...)`
- ❌ Planned 27 tests but pgTAP counted 30 (extra `lives_ok` from the authenticate/clear helper calls being counted) → ✅ Run once to get actual count, then fix plan number