# Implementation Plan: Row Highlighting

## Overview

Add row highlighting to transaction ledger. Database migration adds `is_highlighted` column and `toggle_highlight` RPC function. Frontend gets optimistic toggle for admin, visual highlight for all roles. Sequential implementation: database first, then hook logic, then UI components, then wiring.

## Tasks

- [x] 1. Database migration — add column and toggle function
  - [x] 1.1 Create migration file with `is_highlighted` column and `toggle_highlight` function
    - Create new migration file in `supabase/migrations/`
    - Add `ALTER TABLE transactions ADD COLUMN is_highlighted BOOLEAN NOT NULL DEFAULT false;`
    - Add `toggle_highlight(tx_ids BIGINT[], highlighted BOOLEAN)` SECURITY DEFINER function
    - Function checks `auth.uid()` has admin role in `user_roles`, raises 'Permission denied' if not
    - Function executes `UPDATE transactions SET is_highlighted = highlighted WHERE id = ANY(tx_ids)`
    - Grant EXECUTE on function to authenticated role
    - _Requirements: 1.1, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 1.2 Verify migration applies and `is_highlighted` returned by `get_transactions_v2`
    - Run `supabase db reset` to apply migration locally
    - Confirm `get_transactions_v2` includes `is_highlighted` in response (auto-included since RETURNS SETOF transactions)
    - _Requirements: 1.2, 6.1, 6.2, 6.3_

- [x] 2. Checkpoint — database layer verified
  - Ensure migration applies cleanly, ask the user if questions arise.

- [x] 3. Frontend — useTransactions hook highlight logic
  - [x] 3.1 Add `toggleHighlight` function to `useTransactions` hook
    - Add async `toggleHighlight(ids, highlighted)` that calls `supabase.rpc('toggle_highlight', { tx_ids: ids, highlighted })`
    - Add `updateHighlightLocally(ids, value)` to optimistically update transaction state in local data
    - On RPC error, revert local state and show error toast via `addToast`
    - Export `toggleHighlight` from hook
    - _Requirements: 5.3, 5.4, 5.5_

  - [x]* 3.2 Write property test for admin toggle state update
    - **Property 1: Admin Toggle Updates State**
    - **Validates: Requirements 2.2, 3.2**

  - [x]* 3.3 Write property test for non-admin rejection
    - **Property 2: Non-Admin Rejection**
    - **Validates: Requirements 2.3, 3.4**

- [ ] 4. Frontend — TransactionRow highlight display and controls
  - [ ] 4.1 Add highlight CSS class and styles
    - Add `.row-highlighted` class to `src/index.css` with background color and left border accent
    - In `TransactionRow.jsx`, apply `row-highlighted` class to `<tr>` when `tx.is_highlighted === true`
    - Ensure both `row-highlighted` and `row-memo-missing` can coexist on same row
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ] 4.2 Add admin-only highlight toggle control to TransactionRow
    - Show highlight toggle button/icon only when `role === ROLES.admin`
    - Hide toggle for withdrawal and income users
    - Button calls `onToggleHighlight(tx.id, !tx.is_highlighted)` on click
    - Disable button while RPC call in-flight for that row
    - _Requirements: 5.1, 5.2, 5.3, 5.5_

  - [ ]* 4.3 Write unit tests for TransactionRow highlight behavior
    - Test highlight class applied when `is_highlighted` true
    - Test highlight class absent when `is_highlighted` false/null/undefined
    - Test toggle button visible for admin, hidden for other roles
    - _Requirements: 4.1, 4.2, 5.1, 5.2_

- [ ] 5. Frontend — wire highlight handler through component tree
  - [ ] 5.1 Pass highlight handler from App through TransactionTable to TransactionRow
    - In `App.jsx`, create handler that calls `updateHighlightLocally` then `toggleHighlight`
    - Add `onToggleHighlight` prop to `TransactionTable.jsx`
    - Pass `onToggleHighlight` down to each `TransactionRow`
    - _Requirements: 5.3_

  - [ ]* 5.2 Write integration tests for highlight toggle flow
    - Test optimistic update applies immediately
    - Test rollback on RPC error
    - Test error toast shown on failure
    - _Requirements: 5.3, 5.4_

- [ ] 6. Final checkpoint — all highlight functionality complete
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from design document
- Unit tests validate specific examples and edge cases
- Design uses SECURITY DEFINER pattern matching existing `update_remark` function
- `get_transactions_v2` auto-includes new column since it returns full row type
- Task 6 from old file (Deploy to Production) removed — deployment tasks forbidden in coding task lists

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["3.1", "4.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "4.2"] },
    { "id": 4, "tasks": ["4.3", "5.1"] },
    { "id": 5, "tasks": ["5.2"] }
  ]
}
```
