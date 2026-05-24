# Design Document

## Overview

Add row highlighting to transaction ledger. Admin toggles highlight via Supabase SECURITY DEFINER function. All roles see highlight state. Frontend uses optimistic updates with rollback on error.

## Architecture

### Database Layer

- Add `is_highlighted BOOLEAN DEFAULT false` column to `transactions` table
- Create `toggle_highlight(tx_ids BIGINT[], highlighted BOOLEAN)` SECURITY DEFINER function
- Function checks caller has admin role, raises exception otherwise
- Update `get_transactions_v2` return type to include `is_highlighted`

### Backend (Supabase)

```
toggle_highlight(tx_ids bigint[], highlighted boolean)
├── Check auth.uid() has admin role in user_roles
├── If not admin → RAISE EXCEPTION 'Permission denied'
└── UPDATE transactions SET is_highlighted = highlighted WHERE id = ANY(tx_ids)
```

No edge function needed — this is a database RPC function (same as `update_remark`).

### Frontend Layer

```
TransactionRow
├── Show highlight toggle icon (admin only)
├── Apply .row-highlighted class when is_highlighted = true
└── On click → optimistic update → call supabase.rpc('toggle_highlight')

useTransactions hook
├── Add updateHighlightLocally(ids, value) callback
└── Handle rollback on RPC error
```

### Data Flow

```
Admin clicks toggle → optimistic UI update → RPC call → success/rollback
                                                ↓
                              Supabase: verify admin → UPDATE row
```

## Components Affected

| Component | Change |
|-----------|--------|
| `TransactionRow.jsx` | Add highlight toggle button (admin), highlight CSS class |
| `TransactionTable.jsx` | Pass highlight handler prop |
| `useTransactions.js` | Add `toggleHighlight` function, `updateHighlightLocally` |
| `App.jsx` | Wire highlight handler |
| `index.css` | Add `.row-highlighted` style |
| Migration SQL | Add column + create function |

## Database Migration

```sql
-- Add highlight column
ALTER TABLE transactions ADD COLUMN is_highlighted BOOLEAN DEFAULT false;

-- Create toggle function
CREATE OR REPLACE FUNCTION toggle_highlight(tx_ids BIGINT[], highlighted BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  UPDATE transactions
  SET is_highlighted = highlighted
  WHERE id = ANY(tx_ids);
END;
$$;
```

## Local Development Workflow

1. `supabase start` — spin up local Postgres + Auth
2. Create migration: `supabase migration new add_highlight_column`
3. Write SQL in generated file
4. `supabase db reset` — apply all migrations fresh
5. Test RPC via local Supabase Studio or frontend pointed at localhost
6. When ready: `supabase db push` — deploy to remote project

## Correctness Properties

### Property 1: Admin Toggle Updates State (Req 2.2, 3.2)

FOR ALL valid arrays of transaction IDs and boolean values, WHEN admin calls `toggle_highlight`, THEN all specified rows have `is_highlighted` equal to the provided boolean value.

### Property 2: Non-Admin Rejection (Req 2.3)

FOR ALL non-admin roles (withdrawal, income), WHEN user calls `toggle_highlight`, THEN function raises 'Permission denied' exception regardless of parameters provided.

### Property 3: Highlight State Visible to All Roles (Req 1.2, 4.2)

FOR ALL transactions with `is_highlighted = true`, WHEN any authenticated user calls `get_transactions_v2`, THEN returned rows include `is_highlighted` field with correct value.

### Property 4: Default State on Import (Req 1.3)

FOR ALL newly imported transactions, the `is_highlighted` field equals `false`.

### Property 5: Idempotent Toggle (Idempotence)

FOR ALL transaction IDs and boolean value `v`, calling `toggle_highlight([id], v)` twice produces same result as calling once — `is_highlighted` equals `v`.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Non-admin calls toggle | Exception raised, no state change |
| Invalid transaction ID | Silently skipped (UPDATE WHERE id = ANY filters naturally) |
| Network error on RPC | Frontend reverts optimistic update, shows error toast |
| Concurrent toggle | Last write wins (acceptable for boolean toggle) |

## Security Considerations

- SECURITY DEFINER bypasses RLS — function body validates role explicitly
- Same pattern as existing `update_remark`, `import_transactions`
- No direct UPDATE grant needed for non-admin users (they already lack it)
- RLS policies on `transactions` table remain unchanged
