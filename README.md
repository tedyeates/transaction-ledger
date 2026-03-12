# Thai Bank Ledger — React App

Role-separated bank statement viewer for Kasikorn Bank CSV exports.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and fill in your Supabase URL and anon key

# 3. Run dev server
npm run dev

# 4. Build for production
npm run build
```

## Project Structure

```
src/
├── main.jsx        # React entry point
├── index.css       # All styles (design tokens + components)
└── App.jsx         # Entire application — all components and logic
```

## App.jsx Component Map

```
RootApp             → default export, wraps tree with ToastProvider
└── App             → auth state, session restore
    ├── AuthScreen  → login form
    └── AppShell    → authenticated layout
        ├── Header
        ├── Toolbar         → search, filters, CSV import button
        ├── StatsBar        → totals (role-aware)
        ├── TransactionTable
        │   └── TransactionRow × N
        ├── ImportModal     → TIS-620 CSV parsing + upsert
        └── EditRayganModal → edit รายการ field only
```

## Key Hooks

- `useTransactions(role)` — data fetching, filtering, sorting, pagination, optimistic updates
- `useToast()` — consume the toast context from any component

## Environment Variables

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon public key |

## Role Behaviour

| Role | Can See | Can Edit | Can Import CSV |
|---|---|---|---|
| `withdrawal` | หักบัญชี rows only | รายการ field | ✓ |
| `income` | เข้าบัญชี rows only | รายการ field | ✓ |
| `boss` | All rows | Read only | ✓ |

Access is enforced by Supabase Row Level Security — not just the UI.
