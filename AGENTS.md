# AGENTS.md

> AI agent context file. Start here, follow links for detail.

## What This Is

Thai Bank Ledger — React 18 + Vite SPA backed by Supabase. Displays Kasikorn Bank CSV transaction data with role-based access. No custom backend; all server logic in PostgreSQL RPC functions (SECURITY DEFINER).

## Directory Map

```
src/
├── main.jsx                    # Entry point
├── App.jsx                     # Auth state, session restore, root routing
├── index.css                   # All styles (design tokens + components)
├── components/                 # 13 UI components
│   ├── AppShell.jsx            # Main layout (instantiates useTransactions)
│   ├── TransactionTable.jsx    # Data table with sortable headers
│   ├── TransactionRow.jsx      # Single row (edit buttons, highlight)
│   ├── ImportModal.jsx            # CSV upload + preview + import
│   ├── Toolbar.jsx             # Search, filters, import/export buttons
│   └── StatsBar.jsx            # Aggregate stats (role-aware)
├── hooks/
│   ├── useTransactions.js      # Core data hook (fetch, filter, paginate, optimistic updates)
│   ├── useToast.jsx            # Toast notification context
│   └── useDebounce.js          # Debounce utility hook
└── lib/
    ├── supabase.js             # Supabase client init
    ├── constants.js            # PAGE_SIZE=75, ROLES, THAI_MONTHS
    └── utils.js                # CSV parsing (TIS-620), date/currency formatting

supabase/
├── migrations/                 # SQL schema + RPC functions
└── seed.sql                    # Dev seed data
```

## Key Patterns (non-obvious)

- **No direct table access** — All queries go through RPC functions (`get_transactions_v2`, `get_transaction_stats_v2`, etc.). Never query `transactions` table directly from client.
- **Dual authorization** — Table-level RLS policies AND function-level role checks. Both enforce same rules independently.
- **Optimistic updates** — Memo, remark, and highlight edits update UI immediately; revert on RPC failure.
- **TIS-620 CSV parsing** — Client-side. Tries `windows-874` encoding first, falls back to UTF-8. Looks for `วันที่ทำรายการ` header.
- **Dedup on import** — Timestamp-existence check: if `tx_datetime` already exists in DB, those rows are skipped. No unique index. First upload wins.
- **Page size 75** — Infinite scroll pagination. Secondary sort by `id` to ensure stable ordering.
- **Role lock** — Accountant roles (`withdrawal`/`income`) have type filter locked and cannot change it.

## Roles

| Role | Sees | Edits | Extra |
|------|------|-------|-------|
| `withdrawal` | withdrawal rows only | memo (รายการ) on own type | — |
| `income` | income rows only | memo (รายการ) on own type | — |
| `admin` | all rows + balance + remark | remark (หมายเหตุ), highlight | Import/Export CSV, view stats |

## RPC Functions (Supabase)

| Function | Access | Purpose |
|----------|--------|---------|
| `get_transactions_v2` | Authenticated (role-filtered) | Paginated query with filters |
| `get_transaction_stats_v2` | Authenticated | Aggregate totals |
| `get_latest_balance` | Admin | Latest balance value |
| `import_transactions` | Admin | Bulk insert from CSV |
| `update_memo` | withdrawal/income | Edit memo field (type-restricted) |
| `update_remark` | Admin | Edit remark field |
| `toggle_highlight` | Admin | Toggle row highlight |

## Detailed Documentation

Full docs in [`.agents/summary/`](.agents/summary/index.md):

| File | Content |
|------|---------|
| [index.md](.agents/summary/index.md) | Documentation entry point + navigation guide |
| [architecture.md](.agents/summary/architecture.md) | System design, auth flow, key decisions |
| [components.md](.agents/summary/components.md) | Component tree + responsibilities |
| [interfaces.md](.agents/summary/interfaces.md) | RPC signatures, hook API, toast API |
| [data_models.md](.agents/summary/data_models.md) | DB schema, indexes, RLS policies, client data shapes |
| [workflows.md](.agents/summary/workflows.md) | Step-by-step flows (auth, import, pagination, edit, export) |
| [dependencies.md](.agents/summary/dependencies.md) | Packages, services, notable choices |

## Custom Instructions
<!-- This section is for human and agent-maintained operational knowledge.
     Add repo-specific conventions, gotchas, and workflow rules here.
     This section is preserved exactly as-is when re-running codebase-summary. -->
