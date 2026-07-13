---
inclusion: always
repo: tedyeates/transaction-ledger
test_command: "pnpm test"
build_command: "pnpm build"
setup_command: "pnpm install"
host_setup_command: "npx supabase start"
host_test_command: "npx supabase test db"
concurrency: 3
---
# Project Configuration

## Issue Tracker

Type: github
Repo: tedyeates/transaction-ledger
CLI: gh
Write access: verified

## Triage Labels

| Role | Label |
|------|-------|
| ready-for-agent | ready-for-agent |
| ready-for-human | ready-for-human |

## Domain Docs

Layout: single-context
Glossary: CONTEXT.md
ADRs: docs/adr/
