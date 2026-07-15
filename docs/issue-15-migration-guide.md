# Issue #15: Migration Guide — Overwrite July 2026 Malformed Data

## Overview

Fix malformed July 2026 data by: finding duplicates → removing them → generating UPDATE migration from correct CSV → applying it. Test locally first against a replica of production data, then repeat on production.

---

## Phase 1: Local Prep (replicate production DB)

```bash
# 1. Make sure you're on the right branch
cd ~/projects/transaction-ledger
git fetch origin feature/prd-10
git checkout feature/prd-10

# 2. Reset local supabase to apply all migrations including the new dedup one
npx supabase db reset
```

This gives you a clean local DB with seed data. But you need **production data** to test realistically:

```bash
# 3. Dump production transactions table (from Supabase dashboard or CLI)
#    Option A: Supabase CLI (if project is linked)
npx supabase db dump --data-only -f prod_dump.sql --schema public

#    Option B: If not linked, use psql directly against production
#    (get connection string from Supabase Dashboard → Settings → Database)
pg_dump "postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres" \
  --data-only --table=public.transactions --table=public.user_roles \
  -f prod_dump.sql

# 4. Load production data into local DB (replaces seed data)
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "TRUNCATE public.transactions CASCADE;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f prod_dump.sql
```

---

## Phase 2: Find Duplicates

```bash
# 5. Run the find-duplicates script against local DB
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f scripts/find-duplicates.sql
```

Review output. For each duplicate group (same `tx_datetime` + `withdraw`/`deposit` + `type`):
- If one row has annotations (memo/remark/highlight) and the other doesn't → delete the empty one
- If both have same annotations → delete either
- If both have different annotations → consolidate manually (keep one, copy annotation to it)

```bash
# 6. Delete duplicate rows (replace IDs with actual values from step 5)
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "
  DELETE FROM public.transactions WHERE id IN (6547, 6586);
"
```

---

## Phase 3: Generate UPDATE Migration from Correct CSV

```bash
# 7. Generate the migration (point to the correct July 2026 CSV export)
node scripts/csv-to-migration.js path/to/july-2026-correct.csv
```

This outputs `supabase/migrations/<timestamp>_csv_update.sql` with UPDATE statements that refresh bank-sourced fields (`balance`, `description`, `channel`, `effective_date`, `cheque_number`) while preserving `memo`, `remark`, `is_highlighted`.

---

## Phase 4: Review & Apply

```bash
# 8. Review the generated SQL
cat supabase/migrations/*_csv_update.sql

# Verify:
# - Only UPDATEs (no INSERTs or DELETEs)
# - WHERE clauses match on tx_datetime + withdraw/deposit + type
# - SET clauses don't touch memo, remark, is_highlighted
# - Row count matches expectations

# 9. Apply migration to local DB
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/migrations/*_csv_update.sql
```

---

## Phase 5: Verify

```bash
# 10. Spot-check July rows — correct balance/description/channel, annotations preserved
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "
  SELECT id, tx_datetime, description, balance, channel, memo, remark, is_highlighted, withdraw, deposit
  FROM public.transactions
  WHERE tx_datetime >= '2026-07-01' AND tx_datetime < '2026-08-01'
  ORDER BY tx_datetime
  LIMIT 20;
"

# 11. Check no orphans — total July row count matches CSV row count
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "
  SELECT count(*) FROM public.transactions
  WHERE tx_datetime >= '2026-07-01' AND tx_datetime < '2026-08-01';
"

# 12. Check annotations survived — any rows that had memo/remark should still have them
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "
  SELECT id, tx_datetime, memo, remark, is_highlighted
  FROM public.transactions
  WHERE tx_datetime >= '2026-07-01' AND tx_datetime < '2026-08-01'
    AND (memo IS NOT NULL OR remark IS NOT NULL OR is_highlighted = true);
"

# 13. Run pgTap tests to make sure nothing else broke
npx supabase test db
```

---

## Phase 6: Production (repeat after local passes)

Same steps but targeting production DB:

```bash
# Use production connection string instead of local
PROD_DB="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres"

# Step 5 (find dupes)
psql "$PROD_DB" -f scripts/find-duplicates.sql

# Step 6 (delete dupes — after manual review)
psql "$PROD_DB" -c "DELETE FROM public.transactions WHERE id IN (...);"

# Step 9 (apply migration)
psql "$PROD_DB" -f supabase/migrations/*_csv_update.sql

# Steps 10-12 (verify)
psql "$PROD_DB" -c "SELECT ..."
```

---

## Phase 7: Fix Same-Timestamp Row Ordering

After applying the CSV update, some rows sharing the same `tx_datetime` may display in wrong order. This happens because secondary sort is `id ASC` — rows got IDs during import that don't reflect the bank's intended sequence.

**Identify misordered rows** by checking running balance:

```bash
# Find rows where balance sequence doesn't match withdraw/deposit logic
# For same-timestamp groups, the correct order is determined by running balance:
#   prev_balance - withdraw + deposit = current_balance
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "
  SELECT id, tx_datetime, withdraw, deposit, balance
  FROM public.transactions
  WHERE balance IN (2059995.98, 125939.00)
  ORDER BY tx_datetime DESC, id ASC;
"
```

**Fix by swapping IDs** so secondary sort produces correct order.

Sort is `tx_datetime DESC, id ASC` — within same timestamp, lower `id` appears first (more recent in display). Give the row that should appear first the lower `id`.

```bash
# Swap IDs of two misordered rows (replace A and B with actual IDs)
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "
  BEGIN;
  UPDATE public.transactions SET id = -1 WHERE id = 6587;
  UPDATE public.transactions SET id = 6587 WHERE id = 6550;
  UPDATE public.transactions SET id = 6550 WHERE id = -1;
  COMMIT;
"
```

Verify after swap:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "
  SELECT id, tx_datetime, withdraw, deposit, balance
  FROM public.transactions
  WHERE balance IN (2059995.98, 125939.00)
  ORDER BY tx_datetime DESC, id ASC;
"
```

Confirm running balance is now sequential. Repeat for production.

---

## Checklist

- [ ] Local DB has production data replica
- [ ] Duplicates identified and removed
- [ ] CSV migration generated and reviewed
- [ ] Migration applied locally, verified
- [ ] pgTap tests pass
- [ ] Repeat on production
- [ ] July rows have correct bank-sourced fields
- [ ] Annotations (memo, remark, highlight) preserved
- [ ] Same-timestamp rows display in correct balance order
