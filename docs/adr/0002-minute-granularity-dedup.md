# Compare import existence at minute granularity

## Status

Accepted

## Context

[ADR 0001](0001-timestamp-existence-dedup.md) established timestamp-existence deduplication and a first-upload-wins policy. Historical Kasikorn exports report transaction time to minutes. New exports report seconds. The same bank movement can therefore appear as `10:35:00` in existing history and `10:35:57` in a later overlapping export. Exact timestamp comparison would import that movement twice.

A bank export can also contain several legitimate transactions at one exact second. Deduplication must not collapse those rows during their first import.

## Decision

`import_transactions` compares incoming timestamps with already stored transactions after truncating both to their minute. If any transaction already exists in a minute, every incoming row in that minute is skipped. Rows in minutes absent from the database are all inserted, including multiple rows with identical timestamps in one payload.

This preserves ADR 0001's timestamp-existence model, no unique constraint, single-RPC import, and first-upload-wins policy; only comparison granularity changes.

## Consequences

- A second-precision export overlapping minute-precision history will not duplicate transactions already imported for that minute.
- Several bank postings sharing one second in a new minute remain separate rows on first import.
- A genuinely new correction, reversal, or other transaction in a minute already recorded from an older import is also skipped. Manual handling is required. This is accepted under ADR 0001's first-upload-wins posture.
