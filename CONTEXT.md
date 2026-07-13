# Transaction Ledger

Kasikorn Bank statement viewer with role-based access. Imports CSV exports, deduplicates across uploads, and preserves user annotations.

## Language

**Transaction**: A single bank account movement — one withdrawal or one deposit at a specific datetime.
_Avoid_: Entry, record, row (when referring to the domain concept)

**Import Session**: A single user-initiated CSV upload, which may be split into multiple chunks. Identified by a UUID session_id.
_Avoid_: Upload batch, chunk

**Timestamp-existence Dedup**: Import strategy that skips any row whose `tx_datetime` already exists in the database. First upload wins; bank reordering across exports is irrelevant because our ordering is stable via `(tx_datetime, id)`.
_Avoid_: Dedup key, unique constraint, conflict resolution

**Amount**: The non-null value of either withdraw or deposit for a transaction. Every transaction has exactly one.
_Avoid_: Value, sum

**Uploaded Balance**: The balance value from the bank CSV stored per-row. Reflects the bank's running total at time of export.
_Avoid_: Balance (ambiguous without qualifier)

**Calculated Balance**: A running balance derived from sequential withdraw/deposit values in display order. Compared against uploaded balance to flag discrepancies.
_Avoid_: Computed balance, derived balance

**Balance Discrepancy**: When calculated balance diverges from uploaded balance for a row. Signals potential data integrity issue — flagged to user for review.
_Avoid_: Balance mismatch, balance error

**Memo**: Accountant-editable note (รายการ) on a transaction. Owned by withdrawal/income role users.
_Avoid_: Note, comment (use Remark for admin comments)

**Remark**: Admin-only comment (หมายเหตุ) on a transaction.
_Avoid_: Note, comment (use Memo for accountant notes)

**Import Log**: Audit record of an import session — counts of rows inserted and rows skipped (timestamp already existed).
