<!-- GitHub: #10 https://github.com/tedyeates/transaction-ledger/issues/10 -->

# Import Dedup Redesign & Balance Discrepancy

## Problem Statement

The current import dedup strategy (unique index on field combinations) fails for legitimate duplicate transactions — same amount, type, channel, and timestamp represent genuinely different bank movements. The bank's ordering of same-timestamp transactions is unreliable across exports, making field-based dedup keys unworkable. Additionally, users have no way to verify that stored balance values are consistent with the transaction sequence.

## Solution

Replace field-based dedup with timestamp-existence checking: if a `tx_datetime` already exists in the database, skip all incoming rows with that timestamp. Only new timestamps get inserted. This aligns with the client's workflow of appending new days of data. Additionally, calculate expected balance from sequential transactions and flag rows where the calculated value diverges from the uploaded balance.

## User Stories

1. As an admin, I want to import a CSV and have only genuinely new transactions inserted, so that I don't create duplicates of legitimate same-value transactions.
2. As an admin, I want to see how many transactions were imported vs skipped, so that I know the import worked correctly.
3. As an admin, I want a clear message when no new transactions are found, so that I know I've already imported this data.
4. As an admin, I want the import to complete in a single operation without chunking, so that same-timestamp rows aren't split across batches.
5. As an admin, I want to run a script that converts a bank CSV into a SQL migration, so that I can fix malformed data without exposing transaction data to third parties.
6. As an admin, I want to identify duplicate rows in the database, so that I can manually remove them before running a data correction migration.
7. As an admin, I want to see a warning icon on balance cells where the calculated balance doesn't match the uploaded balance, so that I can investigate potential data issues.
8. As an admin, I want to hover over the warning icon and see expected vs actual balance with the delta, so that I can assess the severity of the discrepancy.
9. As an admin, I want balance validation to work correctly across page boundaries, so that the first row on each page is also validated.
10. As a system, the oldest transaction should be treated as the balance origin with no validation applied, so that there's no false positive on the anchor row.
11. As an admin, I want the July 2026 malformed data to be corrected in-place (preserving my annotations), so that I don't lose memo/remark/highlight work.

## Implementation Decisions

### Phase 1: Import Dedup Redesign

**Module: Schema Migration (`..._timestamp_dedup.sql`)**
- Drop `idx_tx_unique` index — no unique constraint on transactions table
- Replace `import_transactions` function in same migration (atomic)

**Module: `import_transactions` RPC**
- Signature: `import_transactions(rows jsonb) RETURNS jsonb`
- Logic: extract distinct `tx_datetime` from input → check which exist in DB → insert only rows with new timestamps
- Returns: `{"inserted": N, "skipped": N}`
- Access: admin-only (unchanged)
- No ON CONFLICT clause — dedup is logic-based, not constraint-based

**Module: ImportModal component**
- Remove chunking loop — single `supabase.rpc('import_transactions', { rows: parsedRows })` call
- Parse return value `{inserted, skipped}` from response
- Toast: "นำเข้า {inserted} รายการใหม่ ({skipped} รายการซ้ำ — ข้าม)" 
- Special case: if inserted === 0, toast warning "ไม่พบรายการใหม่ — ทุกรายการมีอยู่ในระบบแล้ว"

**Module: `csv-to-migration.js` script**
- Node.js CLI: `node scripts/csv-to-migration.js path/to/bank.csv`
- Reuses TIS-620 parsing logic from `src/lib/utils.js`
- Outputs SQL migration file with UPDATE statements
- Match key: `(tx_datetime, COALESCE(withdraw,0), COALESCE(deposit,0), type)`
- Updates bank-sourced fields only: balance, description, channel, effective_date, cheque_number
- Preserves: id, memo, remark, is_highlighted, imported_at

**Script: `find-duplicates.sql`** (already created)
- Flags rows sharing `(tx_datetime, COALESCE(withdraw,0), COALESCE(deposit,0), type)` for manual review

### Phase 2: Balance Discrepancy (after Phase 1 tested)

**Module: Balance calculation (useTransactions hook)**
- Fetch `PAGE_SIZE + 1` rows — extra trailing row used only for calculation, not rendered
- For each visible row (except the oldest row in entire dataset): `expected = prev_row.balance + current.deposit - current.withdraw`
- "Previous" = next row in display order (older in time), based on `(tx_datetime ASC, id ASC)` ordering
- Flag row if `expected !== uploaded_balance`
- Oldest row in dataset = balance origin, never flagged

**Module: Balance discrepancy UI (TransactionRow)**
- Warning icon on balance cell for discrepant rows
- Tooltip on hover: "Expected: X, Actual: Y (Δ: Z)"
- Admin-only visibility (only admin sees balance column)

## Testing Decisions

- **RPC function**: Test via `supabase test db` — PL/pgSQL tests verifying timestamp-existence logic, return counts, admin-only access
- **ImportModal**: Test updated flow — mock RPC response with `{inserted, skipped}`, verify toast messages for normal/all-skipped cases
- **csv-to-migration.js**: Test with a sample CSV — verify SQL output matches expected UPDATE statements
- **Balance discrepancy**: Test calculation logic in isolation — feed known transaction sequences, verify correct rows are flagged
- **Edge case tests**: same-timestamp rows imported together (should all insert), re-import of existing timestamps (should all skip), mixed new/existing timestamps (correct split)

## Out of Scope

- Corrections/reversals posted to past timestamps — accepted risk, manual intervention required
- Import logging/audit table — removed from this design (was in previous PRD)
- Conflict resolution (updating existing rows on re-import) — first upload wins, no updates
- Multi-user concurrent import protection — single admin, non-issue
- Balance recalculation across entire dataset — only per-page with one extra row

## Further Notes

- The initial full import (4799 rows) is already done. Ongoing imports are ~50 rows (new days only).
- Migration order: run `find-duplicates.sql` → manually remove dupes → apply `_timestamp_dedup.sql` → apply generated `_overwrite_july_data.sql`
- The `idx_tx_balance` index (non-unique, on balance column) remains — used for queries, not dedup.
- Phase 2 checkpoint: verify Phase 1 in production before implementing balance discrepancy.
