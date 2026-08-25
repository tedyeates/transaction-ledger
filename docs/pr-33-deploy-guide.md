# PR #33 deploy guide — statement-format-v2 / new export feature

Branch: `feature/new-export-feature` → `main`
PR: https://github.com/tedyeates/transaction-ledger/pull/33

## Data impact summary

One migration alters existing rows: `20260822083000_statement_schema.sql`.

1. **`effective_date` column type change** (`text` → `date`) via
   `ALTER COLUMN ... USING parse_legacy_effective_date(effective_date)`.
   Every existing row's `effective_date` is rewritten by parsing Thai
   Buddhist-era text into a real `date`. If any existing row has a format
   the parser doesn't recognize, the function raises and the whole migration
   transaction aborts — fails safe, does not partially apply.
2. **Backfill `UPDATE`** on all rows to populate new `channel_code` /
   `cheque_number_normalized` derived columns.
3. Adds 11 new nullable/defaulted columns — additive, no risk to existing
   values.
4. New trigger `trg_derive_transaction_normalised_fields` fires on future
   insert/update of `channel`/`cheque_number` — only touches derived
   columns, not bank-sourced fields.

`20260822090000_import_transactions_minute_dedup.sql` changes dedup
matching logic (timestamp-exact → minute-granularity). This changes future
import *behavior*, not existing stored data. See "Why dedup logic changed"
below.

The RPC hardening migration (`20260822080000`) and the column-reconciliation
migration (`20260823120000`) only touch function definitions/grants — no
table data changes.

**Verdict:** the `effective_date` retype is well-guarded — transactional,
aborts whole-migration on bad input, and asserted by pgTAP
(`supabase/tests/schema_migration_test.sql`, plan 24) to leave existing
memo/remark/highlight/imported_at/id untouched. Not executed against actual
production data as part of this review — recommend the local-with-prod-data
dry run below before the real cutover.

## Why dedup logic changed (ADR 0002)

Root cause: the two statement formats report timestamp precision
differently.

- **Old (`thai_legacy`) exports**: minute precision, e.g. `10:35:00`.
- **New (`english_v2`) exports**: second precision. The same real
  transaction can appear as `10:35:57`.

ADR 0001's original dedup was exact-timestamp match. With second-precision
new exports overlapping minute-precision history, exact match fails to
recognize `10:35:00` (in DB) and `10:35:57` (incoming, same transaction) as
duplicates — the same bank movement would import twice.

Fix (ADR 0002): truncate both sides to minute before comparing
(`date_trunc('minute', ...)`). If any transaction already exists in a given
minute, every incoming row in that minute is skipped.

Tradeoff accepted: coarser granularity means a genuinely new/different
transaction landing in a minute that already has a recorded row is also
skipped — false negative on legit new data, not just true duplicates. No
unique constraint, no per-row resolution; first-upload-wins remains the
policy, just at looser granularity. See
[docs/adr/0002-minute-granularity-dedup.md](adr/0002-minute-granularity-dedup.md).

## 1. Pre-deploy safety — backup

```bash
supabase link --project-ref <prod-project-ref>
supabase db dump --linked --data-only -f backup_pre_pr33_$(date +%Y%m%d).sql
# schema dump is the default mode (no --data-only flag) — there is no --schema-only flag
supabase db dump --linked -f schema_pre_pr33_$(date +%Y%m%d).sql
```

Store both off-repo (not in git). If on Supabase Pro+, also confirm a recent
automatic daily backup exists in Dashboard → Database → Backups, and note
the point-in-time-recovery timestamp before starting.

## 2. Dry run locally against prod-shaped data

Seed.sql alone won't exercise every real `effective_date` shape prod
actually has, so load a real data snapshot before replaying the new
migrations.

```bash
# Dump prod DATA only (schema comes from migrations, not prod's current schema)
supabase link --project-ref <prod-project-ref>
supabase db dump --linked --data-only -f prod_data_snapshot.sql

# Clean local stack — WARNING: `npx supabase start` replays every migration
# file present in supabase/migrations/, including PR33's 4 new ones. If
# those files are already on disk (e.g. PR33 branch checked out), the local
# schema comes up POST-PR33 and effective_date is already `date`-typed
# before the snapshot ever loads. Loading Buddhist-era text into that
# column then fails: `invalid input syntax for type date: "29 ก.พ. 2567"`.
# You must stop the PR33 migrations from running on this first `start`.
npx supabase stop --no-backup

# Temporarily move the PR33 migration files out of the folder so `start`
# only replays pre-PR33 schema:
mkdir -p /tmp/pr33_migrations_holding
mv supabase/migrations/20260822080000_rpc_authz_hardening.sql \
   supabase/migrations/20260822083000_statement_schema.sql \
   supabase/migrations/20260822090000_import_transactions_minute_dedup.sql \
   supabase/migrations/20260823120000_transactions_v2_new_columns.sql \
   /tmp/pr33_migrations_holding/

npx supabase start

# Load prod data BEFORE the new migrations run, on the pre-PR33 schema,
# so the ALTER COLUMN on effective_date processes real historical values
psql "$(npx supabase status -o json | jq -r '.DB_URL')" -f prod_data_snapshot.sql

# Restore the PR33 migration files, then apply them on top of the loaded data
mv /tmp/pr33_migrations_holding/*.sql supabase/migrations/
npx supabase migration up
# or: npx supabase db push --local

# Run test suite against this state
npx supabase test db
pnpm test
```

Notes:
- **Order matters** — load prod data on the pre-PR33 schema, then apply the
  new migrations locally. Loading after would skip testing the
  `effective_date` conversion against real values. `npx supabase start`
  alone does not guarantee pre-PR33 schema if the new migration files are
  already checked out — move them aside first, as shown above.
- **Sensitive data** — `prod_data_snapshot.sql` contains real financial data
  (per repo convention: `chore: stop tracking texport.csv — contains real
  financial data`). Don't commit it, delete it after testing, don't paste
  its contents anywhere.
- Nothing in this step writes to prod — it's read-only against prod (via
  dump) and local-only for the write/migration path.

### Recovery: local already came up post-PR33 and the snapshot load failed

If you hit `invalid input syntax for type date: "29 ก.พ. 2567"` (or similar)
loading `prod_data_snapshot.sql`, the local stack already has PR33's schema
applied — `effective_date` is `date`-typed and the dump's literal Thai text
doesn't cast. `supabase db reset` below drops and recreates the **local**
database from scratch (all local containers/volumes for this project only —
never touches the linked prod project). Confirm you're not relying on any
unsaved local-only data before running it.

```bash
# 1. Reset the local DB (destructive, LOCAL ONLY — replays whatever
#    migrations are currently on disk). --no-seed skips seed.sql so it
#    doesn't insert dev rows that would sit alongside/confuse the real
#    prod snapshot loaded in step 4.
npx supabase db reset --no-seed

# 2. Move PR33 migrations aside so the reset schema stays pre-PR33
mkdir -p /tmp/pr33_migrations_holding
mv supabase/migrations/20260822080000_rpc_authz_hardening.sql \
   supabase/migrations/20260822083000_statement_schema.sql \
   supabase/migrations/20260822090000_import_transactions_minute_dedup.sql \
   supabase/migrations/20260823120000_transactions_v2_new_columns.sql \
   /tmp/pr33_migrations_holding/

# 3. Reset again now that the folder only has pre-PR33 migrations
npx supabase db reset --no-seed

# 4. Load the snapshot onto this pre-PR33 schema
psql "$(npx supabase status -o json | jq -r '.DB_URL')" -f prod_data_snapshot.sql

# 5. Restore PR33 migrations and apply them on top of the loaded data
mv /tmp/pr33_migrations_holding/*.sql supabase/migrations/
npx supabase migration up

# 6. Verify
npx supabase test db
pnpm test
```

If you'd rather not shuffle files, an equivalent is checking out the repo at
the commit before PR33's migrations were added, running `npx supabase
db reset` + snapshot load there, then switching back to the PR33 branch and
running `npx supabase migration up`.

## 3. Merge PR

```bash
gh pr merge 33 --merge   # or squash, per your convention
```

## 4. Apply migrations to prod Supabase

```bash
supabase link --project-ref <prod-project-ref>
supabase db push --dry-run   # review SQL that will run, confirm only the 4 expected files
supabase db push             # applies 20260822080000 → 20260823120000 in order
```

Watch for the `parse_legacy_effective_date` exception on the `ALTER COLUMN`
step — if it raises, the migration transaction rolls back cleanly (nothing
partially applied), but import/export is blocked until the unrecognized
date format is fixed or the parser extended.

## 5. Verify prod DB post-migration

```sql
-- via Supabase SQL editor or psql
select count(*) from transactions where statement_format = 'thai_legacy';  -- should equal total row count pre-migration
select id, memo, remark, is_highlighted from transactions where remark is not null limit 5; -- spot check annotations intact
```

## 6. Deploy frontend to Vercel

```bash
vercel --prod   # or push to main if Vercel is on git-integration auto-deploy
```

Confirm `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` env vars in Vercel
project settings point at the same prod project just migrated.

## 7. Post-deploy smoke test

- Log in as each role (admin/withdrawal/income), confirm row counts match
  pre-migration.
- Import a small English-format CSV as admin, confirm new columns
  (`counterparty_name` etc.) populate and render.
- Export CSV, confirm narrative field appears (commit `0cae245`).

## Rollback plan

Migrations are wrapped in `BEGIN`/`COMMIT` per file, so a failure rolls back
that file's changes automatically. If a later file needs reverting after a
successful push, restore from the `schema_pre_pr33` + `backup_pre_pr33`
dumps taken in step 1 — there is no auto-generated `down` migration in this
repo, so rollback is dump-restore, not `supabase migration down`.

**High risk:** restoring a full dump onto a live prod project is destructive
to any writes made after the dump was taken. Confirm explicitly before doing
this in a real incident.
