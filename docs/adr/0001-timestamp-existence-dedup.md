# Replace field-based dedup with timestamp-existence check

## Status

Accepted (supersedes previous unimplemented design)

## Context

Bank CSV exports from Kasikorn Bank can contain duplicate rows (same amount, type, channel at the same minute) that represent genuinely different transactions. The bank's ordering of same-timestamp transactions is unreliable and can change between exports, but the balance column is updated on-the-fly so balances remain consistent within a single export.

The client's workflow is to append new day(s) of data — they never re-upload existing days.

Previous designs attempted field-based dedup keys (`(tx_datetime, balance)` then `(tx_datetime, amount, channel, type)`) which either collided on legitimate duplicates or required complex conflict resolution.

## Decision

Use timestamp-existence dedup: during import, if a `tx_datetime` value from the incoming CSV already exists in the database (one or more rows), skip ALL incoming rows with that timestamp. Only insert rows whose timestamps are entirely new to the system.

- No unique constraint on the table
- Dedup logic lives in the `import_transactions` RPC function
- No chunking — single RPC call per import
- Returns `{inserted, skipped}` counts for user feedback
- Ordering is stable once imported via `(tx_datetime, id)` — bank reordering across exports is irrelevant

## Consequences

- First upload wins — if a partial day is imported, later rows from the same day with the same timestamps cannot be added. This aligns with client workflow (append new days only).
- Corrections/reversals posted to past timestamps cannot be imported. Accepted risk — manual intervention required for these rare cases.
- No unique index means the DB cannot independently prevent accidental double-inserts if the RPC logic is bypassed. Acceptable since only admin can import and access is via RPC only.
- Calculated balance (from sequential withdraw/deposit) is displayed alongside uploaded balance to flag discrepancies caused by same-timestamp ordering differences.
