# Dependency Graph — Statement Format v2

Parent spec: [#20](https://github.com/tedyeates/transaction-ledger/issues/20)

```mermaid
graph LR
  subgraph B1["Batch 1 — start immediately"]
    T23["#23 Prefactor: extract CSV parsing"]
    T24["#24 Minute-granularity dedup + ADR 0002"]
    T25["#25 Schema migration: new fields + date"]
  end
  subgraph B2["Batch 2"]
    T26["#26 Format registry + v2 parsing"]
  end
  subgraph B3["Batch 3"]
    T27["#27 Format select box + first v2 import"]
    T28["#28 csv-to-migration.js --format"]
  end
  subgraph B4["Batch 4"]
    T29["#29 Persist new fields + show counterparty"]
  end
  subgraph B5["Batch 5"]
    T30["#30 Search, filters, admin columns"]
    T31["#31 CSV export new fields"]
    T32["#32 Wiring test: parser → Supabase"]
  end

  T23 --> T26
  T26 --> T27
  T26 --> T28
  T25 --> T28
  T27 --> T29
  T24 --> T29
  T25 --> T29
  T29 --> T30
  T29 --> T31
  T29 --> T32
```

## Batches

| Batch | Issues | Notes |
|-------|--------|-------|
| 1 | #23, #24, #25 | No blockers — three agents can run in parallel. Concurrency limit in `project-config.md` is 3. |
| 2 | #26 | Needs the extracted parsing module from #23 |
| 3 | #27, #28 | #27 is the first user-demoable slice |
| 4 | #29 | The payoff slice — new fields actually stored and visible |
| 5 | #30, #31, #32 | Parallel; all three only need #29 |

## Critical path

`#23 → #26 → #27 → #29 → {#30, #31, #32}` — five batches deep. #24 and #25 are off the critical path and can land any time before #29.

## External sequencing note

[#21](https://github.com/tedyeates/transaction-ledger/issues/21) (security: unauthorized RPC reads) proposes replacing `SELECT *` in `get_transactions_v2` with an explicit masked column list. #25 adds twelve columns to `transactions`. Whichever lands second must reconcile that column list, so #21 before #29 is cheaper. Not a hard blocker — no dependency edge recorded.
