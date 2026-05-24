# Requirements Document

## Introduction

Row highlighting feature for transaction ledger. Admin users toggle highlight state on transaction rows. Withdrawal and income users see highlighted rows but cannot change highlight state. Backed by boolean column in `transactions` table, protected by SECURITY DEFINER function (same pattern as `update_remark`). Includes local Supabase development workflow for testing before deployment.

## Glossary

- **Ledger_App**: React/Vite frontend application displaying transaction data
- **Supabase_Backend**: PostgreSQL database with RLS policies and SECURITY DEFINER functions
- **Admin**: User with role = 'admin' in `user_roles` table
- **Withdrawal_User**: User with role = 'withdrawal' in `user_roles` table
- **Income_User**: User with role = 'income' in `user_roles` table
- **Highlight_State**: Boolean field on transaction row indicating visual emphasis
- **Toggle_Highlight_Function**: SECURITY DEFINER RPC function that sets highlight state
- **Supabase_CLI**: Command-line tool for local development, migrations, and deployment

## Requirements

### Requirement 1: Database Column for Highlight State

**User Story:** As an admin, I want highlight state stored persistently per transaction, so that highlights survive page reloads and are visible to all users.

#### Acceptance Criteria

1. THE Supabase_Backend SHALL store Highlight_State as a boolean NOT NULL column named `is_highlighted` on the `transactions` table with a default value of `false`
2. THE Supabase_Backend SHALL include `is_highlighted` in results returned by `get_transactions_v2` for all authenticated users
3. WHEN a new transaction is imported via `import_transactions`, THE Supabase_Backend SHALL set `is_highlighted` to `false`
4. WHEN the `is_highlighted` column is added, THE Supabase_Backend SHALL set all existing rows to `false`

### Requirement 2: Admin Toggle Highlight via Secure Function

**User Story:** As an admin, I want to toggle highlight on transaction rows through a secure function, so that only authorized users can modify highlight state.

#### Acceptance Criteria

1. THE Toggle_Highlight_Function SHALL accept a transaction ID (bigint) and a highlight state (boolean) as parameters
2. WHEN an Admin calls Toggle_Highlight_Function with a valid transaction ID, THE Supabase_Backend SHALL set `is_highlighted` to the provided boolean value on the specified transaction row
3. IF a non-admin user calls Toggle_Highlight_Function, THEN THE Supabase_Backend SHALL raise a permission denied exception
4. THE Toggle_Highlight_Function SHALL use SECURITY DEFINER execution context to bypass RLS policies
5. IF the provided transaction ID does not match any existing transaction row, THEN THE Toggle_Highlight_Function SHALL complete without error and affect zero rows

### Requirement 3: Bulk Highlight Toggle

**User Story:** As an admin, I want to highlight multiple rows at once, so that I can efficiently mark groups of transactions.

#### Acceptance Criteria

1. THE Toggle_Highlight_Function SHALL accept an array of 1 to 1000 transaction IDs and a boolean value as parameters
2. WHEN an Admin provides multiple transaction IDs, THE Supabase_Backend SHALL update `is_highlighted` on all specified rows in a single atomic operation
3. IF any transaction ID in the array does not exist, THEN THE Supabase_Backend SHALL skip non-existent IDs, update all valid ones, and return the count of rows actually updated
4. IF a non-admin user calls Toggle_Highlight_Function with an array of transaction IDs, THEN THE Supabase_Backend SHALL raise a 'Permission denied' exception without modifying any rows
5. IF the provided array is empty, THEN THE Supabase_Backend SHALL return a count of 0 without performing any update

### Requirement 4: Frontend Highlight Display

**User Story:** As a withdrawal or income user, I want to see which rows are highlighted, so that I can identify transactions marked by admin.

#### Acceptance Criteria

1. WHEN a transaction has `is_highlighted` set to true, THE Ledger_App SHALL render that row's `<tr>` element with the CSS class `row-highlighted`, which applies a background color and a left border accent visually distinguishable from non-highlighted rows
2. IF a transaction has `is_highlighted` set to false, null, or undefined, THEN THE Ledger_App SHALL render that row without the `row-highlighted` class
3. THE Ledger_App SHALL apply the same `row-highlighted` class and styling for Admin, Withdrawal_User, and Income_User roles without any role-specific variation
4. IF a transaction has both `is_highlighted` set to true and qualifies for the `row-memo-missing` style, THEN THE Ledger_App SHALL apply both classes simultaneously so that both visual indicators remain visible
5. WHILE additional transaction pages are loading via infinite scroll, THE Ledger_App SHALL retain the `row-highlighted` class on all previously rendered rows without removing or flickering the highlight styling

### Requirement 5: Admin Highlight Controls in UI

**User Story:** As an admin, I want clickable controls on each row to toggle highlight, so that I can mark transactions without leaving the table view.

#### Acceptance Criteria

1. WHILE user role is Admin, THE Ledger_App SHALL display a highlight toggle control on each transaction row that visually indicates the current highlight state of that row (highlighted or not highlighted)
2. WHILE user role is Withdrawal_User or Income_User, THE Ledger_App SHALL hide highlight toggle controls
3. WHEN Admin clicks highlight toggle, THE Ledger_App SHALL immediately apply a distinct background color to the row (if toggling on) or remove it (if toggling off), then call Toggle_Highlight_Function
4. IF Toggle_Highlight_Function returns an error, THEN THE Ledger_App SHALL revert the row to its previous highlight state and display an error-variant toast indicating the operation failed
5. WHILE a Toggle_Highlight_Function call is in-flight for a row, THE Ledger_App SHALL disable the highlight toggle control for that row to prevent duplicate requests

### Requirement 6: Local Supabase Development and Deployment Workflow

**User Story:** As a developer, I want to develop and test the highlight function locally before deploying to production, so that I can verify behavior safely.

#### Acceptance Criteria

1. WHEN developer runs `supabase start`, THE Supabase_CLI SHALL spin up a local PostgreSQL database and apply all migration files in the `supabase/migrations/` directory in timestamp order
2. WHEN developer creates a new migration file in `supabase/migrations/`, THE Supabase_CLI SHALL apply it to the local database when the developer runs `supabase db reset`, resetting the local database and replaying all migrations from scratch
3. WHEN developer runs `supabase db reset` successfully, THE Supabase_CLI SHALL make locally-defined RPC functions (including Toggle_Highlight_Function) callable via the local API at `http://127.0.0.1:54321`
4. WHEN developer runs `supabase db push` against a linked remote project, THE Supabase_CLI SHALL apply pending migrations to the remote database
5. WHEN developer runs `supabase gen types typescript`, THE Supabase_CLI SHALL regenerate TypeScript type definitions reflecting the current local database schema
