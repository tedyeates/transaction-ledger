# Documentation Index

> **For AI Assistants:** This file is your primary entry point. Read this first to understand what documentation exists and where to find detailed answers. Each section below summarizes a document's content — consult the linked file only when you need deeper detail.

## Quick Context

**Thai Bank Ledger** — React 18 + Vite SPA connecting to Supabase. Displays Kasikorn Bank CSV transaction data with role-based access (withdrawal accountant, income accountant, admin/boss). No custom backend. All business logic in PostgreSQL RPC functions.

---

## Document Map

| File | What's Inside | Consult When… |
|------|--------------|---------------|
| [codebase_info.md](./codebase_info.md) | Project metadata, directory layout, tech stack, env vars | You need project name, versions, directory structure, or config |
| [architecture.md](./architecture.md) | System design, auth flow, data access pattern, key decisions | You need to understand how pieces connect, why decisions were made |
| [components.md](./components.md) | Component tree, each component's responsibility and props | You need to find/modify a UI component or understand rendering |
| [interfaces.md](./interfaces.md) | RPC function signatures, hook return values, toast API | You need parameter names, return shapes, or API contracts |
| [data_models.md](./data_models.md) | DB schema, client data structures, filter/stats shapes | You need column types, data shapes, or entity relationships |
| [workflows.md](./workflows.md) | Step-by-step flows (auth, import, pagination, edit, export) | You need to understand a user journey or sequence of operations |
| [dependencies.md](./dependencies.md) | Package list, external services, notable choices | You need to check what libraries exist or add a new dependency |

---

## Key Facts for Quick Reference

- **Entry point:** `src/main.jsx` → `src/App.jsx`
- **All components:** `src/components/` (13 files)
- **All hooks:** `src/hooks/` (useTransactions, useToast, useDebounce)
- **Utilities:** `src/lib/utils.js` (CSV parsing, date formatting, currency formatting)
- **Constants:** `src/lib/constants.js` (PAGE_SIZE=75, ROLES, THAI_MONTHS)
- **Supabase client:** `src/lib/supabase.js`
- **DB migrations:** `supabase/migrations/`
- **Tests:** `src/hooks/*.test.js`, `src/components/*.test.jsx`
- **Styles:** `src/index.css` (design tokens + all component styles)
- **Build:** `pnpm dev` / `pnpm build` / `pnpm test`

---

## How to Use This Documentation

1. **Start here** — This index gives enough context for most questions
2. **Go deeper** — Follow document links when you need specifics
3. **Cross-reference** — Architecture explains *why*, Components explains *what*, Interfaces explains *how*, Workflows explains *when*

### Example Queries

| Question | Where to look |
|----------|--------------|
| "How does CSV import work?" | workflows.md §2, interfaces.md (import_transactions) |
| "What columns does the transactions table have?" | data_models.md |
| "How is auth enforced?" | architecture.md, workflows.md §1 |
| "What does the admin role see differently?" | components.md (TransactionTable, StatsBar) |
| "How to add a new filter?" | interfaces.md (useTransactions), data_models.md (filter state) |
| "What RPC functions exist?" | interfaces.md |
