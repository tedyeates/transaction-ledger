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

Access is enforced by Supabase Row Level Security.

## Deployment

### Frontend (Static App)

Build and deploy to any static host (Vercel, Netlify, Cloudflare Pages, etc.):

```bash
npm run build
```

Upload the `dist/` folder. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in your host's environment variables, pointing to your production Supabase project.

### Database / RLS / Edge Functions (Supabase)

```bash
# Install Supabase CLI
npm i -g supabase

# Link to your remote project (ref found in Dashboard → Settings → General)
supabase link --project-ref <your-project-ref>

# Push local migrations to production
supabase db push

# Deploy edge functions (if any)
supabase functions deploy <function-name>
```

### Pull Remote Schema Changes

If you made changes directly in the Supabase dashboard and want to track them locally:

```bash
supabase db pull
```

> **Note:** Ensure production environment variables point to your production Supabase project, not a local/dev instance.
