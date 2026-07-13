# Codebase Information

## Project

- **Name:** thai-bank-ledger
- **Version:** 1.0.0
- **Type:** Single-page application (SPA)
- **Domain:** Financial — Bank statement viewer for Kasikorn Bank CSV exports
- **Language:** JavaScript (ES modules)
- **Framework:** React 18.3 + Vite 6.4
- **Backend:** Supabase (PostgreSQL + Auth + RPC)
- **Package Manager:** pnpm 11.12.0

## Directory Layout

```
├── src/
│   ├── main.jsx              # React entry point
│   ├── App.jsx               # Root component (auth state, routing)
│   ├── App.css               # Additional styles
│   ├── index.css             # Design tokens + all component styles
│   ├── components/           # UI components
│   ├── hooks/                # Custom React hooks
│   ├── lib/                  # Utilities, constants, Supabase client
│   └── assets/               # Static assets (SVGs)
├── supabase/
│   ├── config.toml           # Supabase local dev config
│   ├── migrations/           # SQL migrations (schema + RPC functions)
│   └── seed.sql              # Dev seed data
├── public/                   # Static public assets
├── package.json
├── vite.config.js
├── eslint.config.js
└── index.html
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI | React 18.3 (functional components, hooks) |
| Build | Vite 6.4 |
| State | Local component state + custom hooks |
| Backend | Supabase (hosted PostgreSQL) |
| Auth | Supabase Auth (email/password) |
| Data Access | Supabase RPC functions (SECURITY DEFINER) |
| Row Security | PostgreSQL RLS + role-based access via `user_roles` table |
| Testing | Vitest 4.1 + Testing Library + fast-check (property tests) |
| Linting | ESLint (flat config) |

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous public key |
