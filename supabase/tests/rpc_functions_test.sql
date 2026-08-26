-- pgTAP tests for RPC functions with role-based authorization
-- Run: npx supabase test db

BEGIN;

SELECT plan(73);

-- =============================================================================
-- HELPERS: Simulate authenticated users via JWT claims
-- =============================================================================

-- User IDs from seed.sql
-- admin:      aaaaaaaa-0000-0000-0000-000000000001
-- withdrawal: aaaaaaaa-0000-0000-0000-000000000002
-- income:     aaaaaaaa-0000-0000-0000-000000000003

CREATE SCHEMA IF NOT EXISTS tests;
GRANT USAGE ON SCHEMA tests TO authenticated;

CREATE OR REPLACE FUNCTION tests.authenticate_as(user_id uuid)
RETURNS void AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', user_id::text,
    'role', 'authenticated',
    'aud', 'authenticated'
  )::text, true);
  PERFORM set_config('role', 'authenticated', true);
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION tests.authenticate_as(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION tests.clear_auth()
RETURNS void AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('role', 'postgres', true);
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION tests.clear_auth() TO authenticated;

-- =============================================================================
-- SETUP: Ensure test data exists (seed.sql provides this)
-- =============================================================================

-- Verify we have seed data to work with
SELECT ok(
  (SELECT count(*) FROM public.transactions) > 0,
  'Seed data: transactions exist'
);

SELECT ok(
  (SELECT count(*) FROM public.user_roles) = 3,
  'Seed data: 3 user roles exist'
);

-- =============================================================================
-- TEST: get_transactions_v2
-- =============================================================================

-- Use the 13-param overload (the one with role-based WHERE clause)
-- Must pass all params explicitly to disambiguate from 9-param overload

-- Admin sees all rows
SELECT tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

SELECT ok(
  (SELECT count(*) FROM public.get_transactions_v2(
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::numeric, NULL::numeric, NULL::numeric,
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text
  )) > 0,
  'get_transactions_v2: admin sees rows'
);

SELECT ok(
  (SELECT count(DISTINCT type) FROM public.get_transactions_v2(
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::numeric, NULL::numeric, NULL::numeric,
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text
  )) = 2,
  'get_transactions_v2: admin sees both types'
);

-- Withdrawal user only sees withdrawal rows
SELECT tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000002'::uuid);

SELECT ok(
  (SELECT count(*) FROM public.get_transactions_v2(
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::numeric, NULL::numeric, NULL::numeric,
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text
  )) > 0,
  'get_transactions_v2: withdrawal user sees rows'
);

SELECT ok(
  (SELECT count(*) FROM public.get_transactions_v2(
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::numeric, NULL::numeric, NULL::numeric,
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text
  ) WHERE type != 'withdrawal') = 0,
  'get_transactions_v2: withdrawal user sees only withdrawal rows'
);

-- Income user only sees income rows
SELECT tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

SELECT ok(
  (SELECT count(*) FROM public.get_transactions_v2(
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::numeric, NULL::numeric, NULL::numeric,
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text
  )) > 0,
  'get_transactions_v2: income user sees rows'
);

SELECT ok(
  (SELECT count(*) FROM public.get_transactions_v2(
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::numeric, NULL::numeric, NULL::numeric,
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text
  ) WHERE type != 'income') = 0,
  'get_transactions_v2: income user sees only income rows'
);

-- Filter by type works
SELECT tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

SELECT ok(
  (SELECT count(*) FROM public.get_transactions_v2(
    'withdrawal'::text, NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::numeric, NULL::numeric, NULL::numeric,
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text
  ) WHERE type != 'withdrawal') = 0,
  'get_transactions_v2: p_type filter works'
);

-- =============================================================================
-- TEST: get_transaction_stats_v2
-- =============================================================================

SELECT tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

SELECT ok(
  (SELECT total_count FROM public.get_transaction_stats_v2(
    NULL::text, NULL::text, NULL::timestamptz, NULL::timestamptz, NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::numeric, NULL::numeric, NULL::numeric
  )) > 0,
  'get_transaction_stats_v2: returns count'
);

SELECT ok(
  (SELECT total_withdraws FROM public.get_transaction_stats_v2(
    NULL::text, NULL::text, NULL::timestamptz, NULL::timestamptz, NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::numeric, NULL::numeric, NULL::numeric
  )) > 0,
  'get_transaction_stats_v2: returns withdrawal sum'
);

SELECT ok(
  (SELECT total_deposits FROM public.get_transaction_stats_v2(
    NULL::text, NULL::text, NULL::timestamptz, NULL::timestamptz, NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::numeric, NULL::numeric, NULL::numeric
  )) > 0,
  'get_transaction_stats_v2: returns deposit sum'
);

-- Filtered stats
SELECT ok(
  (SELECT total_deposits FROM public.get_transaction_stats_v2(
    'withdrawal'::text, NULL::text, NULL::timestamptz, NULL::timestamptz, NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::numeric, NULL::numeric, NULL::numeric
  )) = 0,
  'get_transaction_stats_v2: p_type withdrawal shows zero deposits'
);

-- =============================================================================
-- TEST: get_transaction_stats_v2 authorization (issue #21)
-- =============================================================================

-- Unauthenticated caller gets Permission denied, never real totals
SELECT tests.clear_auth();

SELECT throws_ok(
  $$SELECT * FROM public.get_transaction_stats_v2(
    NULL::text, NULL::text, NULL::timestamptz, NULL::timestamptz, NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::numeric, NULL::numeric, NULL::numeric
  )$$,
  'Permission denied',
  'get_transaction_stats_v2: unauthenticated caller denied'
);

SELECT throws_ok(
  $$SELECT * FROM public.get_transaction_stats(
    NULL::text, NULL::text, NULL::timestamptz, NULL::timestamptz, NULL::text
  )$$,
  'Permission denied',
  'get_transaction_stats: unauthenticated caller denied'
);

-- Withdrawal accountant: totals cover withdrawal rows only, total_deposits is 0
SELECT tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000002'::uuid);

SELECT ok(
  (SELECT total_deposits FROM public.get_transaction_stats_v2(
    NULL::text, NULL::text, NULL::timestamptz, NULL::timestamptz, NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::numeric, NULL::numeric, NULL::numeric
  )) = 0,
  'get_transaction_stats_v2: withdrawal accountant sees zero deposits'
);

SELECT ok(
  (SELECT total_withdraws FROM public.get_transaction_stats_v2(
    NULL::text, NULL::text, NULL::timestamptz, NULL::timestamptz, NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::numeric, NULL::numeric, NULL::numeric
  )) > 0,
  'get_transaction_stats_v2: withdrawal accountant sees own totals'
);

-- Withdrawal accountant cannot widen scope by passing p_type = 'income'
SELECT ok(
  (SELECT total_deposits FROM public.get_transaction_stats_v2(
    'income'::text, NULL::text, NULL::timestamptz, NULL::timestamptz, NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::numeric, NULL::numeric, NULL::numeric
  )) = 0,
  'get_transaction_stats_v2: withdrawal accountant cannot widen scope via p_type'
);

-- Income accountant: mirror case
SELECT tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

SELECT ok(
  (SELECT total_withdraws FROM public.get_transaction_stats_v2(
    NULL::text, NULL::text, NULL::timestamptz, NULL::timestamptz, NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::numeric, NULL::numeric, NULL::numeric
  )) = 0,
  'get_transaction_stats_v2: income accountant sees zero withdraws'
);

SELECT ok(
  (SELECT total_deposits FROM public.get_transaction_stats_v2(
    NULL::text, NULL::text, NULL::timestamptz, NULL::timestamptz, NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::numeric, NULL::numeric, NULL::numeric
  )) > 0,
  'get_transaction_stats_v2: income accountant sees own totals'
);

-- Admin: totals cover all rows (both non-zero)
SELECT tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

SELECT ok(
  (SELECT total_withdraws FROM public.get_transaction_stats_v2(
    NULL::text, NULL::text, NULL::timestamptz, NULL::timestamptz, NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::numeric, NULL::numeric, NULL::numeric
  )) > 0
  AND
  (SELECT total_deposits FROM public.get_transaction_stats_v2(
    NULL::text, NULL::text, NULL::timestamptz, NULL::timestamptz, NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::numeric, NULL::numeric, NULL::numeric
  )) > 0,
  'get_transaction_stats_v2: admin sees totals across all rows'
);

-- =============================================================================
-- TEST: get_transactions_v2 column masking (issue #21)
-- =============================================================================

-- Accountant: balance and remark are NULL for every returned row
SELECT tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000002'::uuid);

SELECT ok(
  (SELECT count(*) FROM public.get_transactions_v2(
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::numeric, NULL::numeric, NULL::numeric,
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text
  ) WHERE balance IS NOT NULL OR remark IS NOT NULL) = 0,
  'get_transactions_v2: accountant gets NULL balance and remark on every row'
);

-- Admin: balance and remark are populated (seed data has non-null values)
SELECT tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

SELECT ok(
  (SELECT count(*) FROM public.get_transactions_v2(
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::numeric, NULL::numeric, NULL::numeric,
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text
  ) WHERE balance IS NOT NULL) > 0,
  'get_transactions_v2: admin gets populated balance'
);

-- =============================================================================
-- TEST: get_transactions_v2 new statement-format-v2 columns (issue #30)
-- =============================================================================

-- Descriptive fields (counterparty_name, branch, location, terminal_id,
-- narrative) are bank-sourced data at the same sensitivity as description,
-- so accountants see the same (unmasked) values as admin for the same rows
-- — no CASE WHEN masking on these four, unlike balance/remark/the
-- operational metadata below.
SELECT tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000002'::uuid);

SELECT ok(
  (SELECT array_agg(counterparty_name ORDER BY id) FROM public.get_transactions_v2(
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::numeric, NULL::numeric, NULL::numeric,
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text
  ) WHERE type = 'withdrawal')
  IS DISTINCT FROM NULL,
  'get_transactions_v2: descriptive columns are queryable for accountant without error'
);

-- Capture admin's unmasked counterparty_name values first (admin is the
-- known-good reference — the balance/remark masking tests above already
-- prove admin gets real, unmasked data).
SELECT tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

SELECT set_config(
  'tests.admin_counterparty_names',
  (SELECT array_agg(counterparty_name ORDER BY id)::text FROM public.get_transactions_v2(
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::numeric, NULL::numeric, NULL::numeric,
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text
  ) WHERE type = 'withdrawal'),
  false
);

SELECT tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000002'::uuid);

SELECT is(
  (SELECT array_agg(counterparty_name ORDER BY id)::text FROM public.get_transactions_v2(
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::numeric, NULL::numeric, NULL::numeric,
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text
  ) WHERE type = 'withdrawal'),
  current_setting('tests.admin_counterparty_names'),
  'get_transactions_v2: accountant sees the same unmasked counterparty_name values as admin (not nulled)'
);

-- Operational metadata (counterparty_account, fx_rate, statement_format,
-- statement_exported_at) is NULL for every row when queried as an accountant.
SELECT ok(
  (SELECT count(*) FROM public.get_transactions_v2(
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::numeric, NULL::numeric, NULL::numeric,
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text
  ) WHERE counterparty_account IS NOT NULL
       OR fx_rate IS NOT NULL
       OR statement_format IS NOT NULL
       OR statement_exported_at IS NOT NULL) = 0,
  'get_transactions_v2: accountant gets NULL counterparty_account, fx_rate, statement_format, statement_exported_at on every row'
);

-- Admin sees the operational metadata populated (seed/import data has
-- non-null statement_format at minimum, since import_transactions always
-- sets it).
SELECT tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

SELECT ok(
  (SELECT count(*) FROM public.get_transactions_v2(
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::numeric, NULL::numeric, NULL::numeric,
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text
  ) WHERE statement_format IS NOT NULL) > 0,
  'get_transactions_v2: admin gets populated statement_format'
);

-- =============================================================================
-- TEST: dropped 9-parameter overloads and anon privilege revocation (issue #21)
-- =============================================================================

SELECT tests.clear_auth();

SELECT is_empty(
  $$SELECT p.oid FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_transactions_v2'
    AND pg_get_function_identity_arguments(p.oid) NOT LIKE '%p_col_channel%'$$,
  'get_transactions_v2: 9-parameter overload no longer exists'
);

-- The pre-#30 13-parameter overload (no p_counterparty/p_branch/p_location/
-- p_terminal/p_narrative) was dropped and replaced by the 18-parameter
-- version below (issue #30) — assert only the 18-parameter version exists.
SELECT is_empty(
  $$SELECT p.oid FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_transactions_v2'
    AND pg_get_function_identity_arguments(p.oid) NOT LIKE '%p_narrative%'$$,
  'get_transactions_v2: pre-#30 13-parameter overload no longer exists'
);

SELECT is_empty(
  $$SELECT p.oid FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_transaction_stats_v2'
    AND pg_get_function_identity_arguments(p.oid) NOT LIKE '%p_col_channel%'$$,
  'get_transaction_stats_v2: 9-parameter overload no longer exists'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.get_transaction_stats_v2(text,text,timestamptz,timestamptz,text,text,text,text,text,text,numeric,numeric,numeric)', 'EXECUTE'),
  'anon has no EXECUTE on get_transaction_stats_v2'
);

-- Issue #30 widened get_transactions_v2 to 18 parameters (added
-- p_counterparty, p_branch, p_location, p_terminal, p_narrative). The new
-- function, like the one it replaced, must not inherit anon/PUBLIC EXECUTE —
-- the #21 ALTER DEFAULT PRIVILEGES change (scoped to role postgres, which
-- migrations run as) stops that inheritance for every function created
-- since, and this migration only explicitly grants authenticated/service_role.
SELECT ok(
  NOT has_function_privilege('anon', 'public.get_transactions_v2(text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,text,text,text,text,text)', 'EXECUTE'),
  'anon has no EXECUTE on get_transactions_v2 (18-parameter, post-#30)'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.get_latest_balance()', 'EXECUTE'),
  'anon has no EXECUTE on get_latest_balance'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.update_memo(bigint,text)', 'EXECUTE'),
  'anon has no EXECUTE on update_memo'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.update_remark(bigint,text)', 'EXECUTE'),
  'anon has no EXECUTE on update_remark'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.delete_transaction(bigint)', 'EXECUTE'),
  'anon has no EXECUTE on delete_transaction'
);

-- =============================================================================
-- TEST: get_latest_balance
-- =============================================================================

-- Admin can get balance
SELECT tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

SELECT ok(
  (SELECT public.get_latest_balance()) IS NOT NULL,
  'get_latest_balance: admin gets value'
);

-- Withdrawal user denied
SELECT tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000002'::uuid);

SELECT throws_ok(
  'SELECT public.get_latest_balance()',
  'Access denied',
  'get_latest_balance: withdrawal user denied'
);

-- Income user denied
SELECT tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

SELECT throws_ok(
  'SELECT public.get_latest_balance()',
  'Access denied',
  'get_latest_balance: income user denied'
);

-- =============================================================================
-- TEST: update_memo
-- =============================================================================

-- Get a withdrawal transaction ID and an income transaction ID
SELECT tests.clear_auth();

DO $$
BEGIN
  PERFORM set_config('tests.withdrawal_tx_id',
    (SELECT id::text FROM public.transactions WHERE type = 'withdrawal' LIMIT 1), false);
  PERFORM set_config('tests.income_tx_id',
    (SELECT id::text FROM public.transactions WHERE type = 'income' LIMIT 1), false);
END $$;

-- Withdrawal user can update memo on withdrawal row
SELECT tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000002'::uuid);

SELECT lives_ok(
  format('SELECT public.update_memo(%s, %L)', current_setting('tests.withdrawal_tx_id'), 'test memo withdrawal'),
  'update_memo: withdrawal user can edit withdrawal memo'
);

-- Withdrawal user cannot update memo on income row (silently no-ops due to WHERE clause)
SELECT lives_ok(
  format('SELECT public.update_memo(%s, %L)', current_setting('tests.income_tx_id'), 'should not work'),
  'update_memo: withdrawal user call on income row does not error'
);

-- Verify income memo was NOT changed
SELECT tests.clear_auth();
SELECT ok(
  (SELECT memo FROM public.transactions WHERE id = current_setting('tests.income_tx_id')::bigint) IS DISTINCT FROM 'should not work',
  'update_memo: withdrawal user did not modify income row memo'
);

-- Income user can update memo on income row
SELECT tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

SELECT lives_ok(
  format('SELECT public.update_memo(%s, %L)', current_setting('tests.income_tx_id'), 'test memo income'),
  'update_memo: income user can edit income memo'
);

-- Admin cannot use update_memo (not in allowed roles)
SELECT tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

SELECT throws_ok(
  format('SELECT public.update_memo(%s, %L)', current_setting('tests.withdrawal_tx_id'), 'admin memo'),
  'Permission denied',
  'update_memo: admin denied'
);

-- =============================================================================
-- TEST: update_remark
-- =============================================================================

-- Admin can update remark
SELECT tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

SELECT lives_ok(
  format('SELECT public.update_remark(%s, %L)', current_setting('tests.withdrawal_tx_id'), 'admin remark'),
  'update_remark: admin can edit remark'
);

-- Withdrawal user denied
SELECT tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000002'::uuid);

SELECT throws_ok(
  format('SELECT public.update_remark(%s, %L)', current_setting('tests.withdrawal_tx_id'), 'bad remark'),
  'Permission denied',
  'update_remark: withdrawal user denied'
);

-- Income user denied
SELECT tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

SELECT throws_ok(
  format('SELECT public.update_remark(%s, %L)', current_setting('tests.income_tx_id'), 'bad remark'),
  'Permission denied',
  'update_remark: income user denied'
);

-- =============================================================================
-- TEST: toggle_highlight
-- =============================================================================

-- Admin can toggle highlight
SELECT tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

SELECT lives_ok(
  format('SELECT public.toggle_highlight(ARRAY[%s]::bigint[], true)', current_setting('tests.withdrawal_tx_id')),
  'toggle_highlight: admin can highlight'
);

-- Verify it was set
SELECT tests.clear_auth();
SELECT ok(
  (SELECT is_highlighted FROM public.transactions WHERE id = current_setting('tests.withdrawal_tx_id')::bigint) = true,
  'toggle_highlight: row is now highlighted'
);

-- Withdrawal user denied
SELECT tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000002'::uuid);

SELECT throws_ok(
  format('SELECT public.toggle_highlight(ARRAY[%s]::bigint[], false)', current_setting('tests.withdrawal_tx_id')),
  'Permission denied',
  'toggle_highlight: withdrawal user denied'
);

-- =============================================================================
-- TEST: delete_transaction (admin-only destructive action)
-- =============================================================================

-- Insert a disposable row (not seed data) so this block doesn't remove rows
-- other tests in this file depend on.
SELECT tests.clear_auth();

DO $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO public.transactions
    (tx_datetime, effective_date, description, withdraw, deposit, balance, channel, type)
  VALUES
    ('2099-06-01T00:00:00Z', '2099-06-01', 'delete_transaction test row', 1, NULL, 999, 'TEST', 'withdrawal')
  RETURNING id INTO v_id;

  PERFORM set_config('tests.deletable_tx_id', v_id::text, false);
END;
$$;

-- Non-admin denied, row still present
SELECT tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000002'::uuid);

SELECT throws_ok(
  format('SELECT public.delete_transaction(%s)', current_setting('tests.deletable_tx_id')),
  'Permission denied',
  'delete_transaction: withdrawal user denied'
);

SELECT tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

SELECT throws_ok(
  format('SELECT public.delete_transaction(%s)', current_setting('tests.deletable_tx_id')),
  'Permission denied',
  'delete_transaction: income user denied'
);

SELECT tests.clear_auth();

SELECT ok(
  (SELECT count(*) FROM public.transactions WHERE id = current_setting('tests.deletable_tx_id')::bigint) = 1,
  'delete_transaction: row survives denied attempts'
);

-- Admin can delete
SELECT tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

SELECT lives_ok(
  format('SELECT public.delete_transaction(%s)', current_setting('tests.deletable_tx_id')),
  'delete_transaction: admin can delete'
);

SELECT tests.clear_auth();

SELECT ok(
  (SELECT count(*) FROM public.transactions WHERE id = current_setting('tests.deletable_tx_id')::bigint) = 0,
  'delete_transaction: row is gone after admin delete'
);

-- =============================================================================
-- TEST: import_transactions (dedup logic)
-- =============================================================================

-- Admin can import
SELECT tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

SELECT ok(
  (SELECT (public.import_transactions(
    '[{"tx_datetime":"2099-01-01T00:00:00","effective_date":"2099-01-01","description":"test import","withdraw":100,"deposit":null,"balance":900,"channel":"TEST","type":"withdrawal"}]'::jsonb
  ))->>'inserted' = '1'),
  'import_transactions: admin can import new row'
);

-- Duplicate tx_datetime gets skipped
SELECT ok(
  (SELECT (public.import_transactions(
    '[{"tx_datetime":"2099-01-01T00:00:00","effective_date":"2099-01-01","description":"duplicate","withdraw":200,"deposit":null,"balance":700,"channel":"TEST","type":"withdrawal"}]'::jsonb
  ))->>'skipped' = '1'),
  'import_transactions: duplicate tx_datetime skipped'
);

-- New minutes import every row, even when timestamps include seconds.
SELECT ok(
  (SELECT (result->>'inserted' = '2' AND result->>'skipped' = '0')
   FROM (
     SELECT public.import_transactions(
       '[
         {"tx_datetime":"2099-03-01T09:00:05Z","effective_date":"2099-03-01","description":"minute-dedup new minute one","withdraw":10,"deposit":null,"balance":990,"channel":"TEST","type":"withdrawal"},
         {"tx_datetime":"2099-03-01T09:01:47Z","effective_date":"2099-03-01","description":"minute-dedup new minute two","withdraw":20,"deposit":null,"balance":970,"channel":"TEST","type":"withdrawal"}
       ]'::jsonb
     ) AS result
   ) import_result),
  'import_transactions: all-new minutes insert every row'
);

-- Bank may post many rows in one second; a fresh minute must retain all of them.
SELECT ok(
  (SELECT result->>'inserted' = '7' AND result->>'skipped' = '0'
   FROM (
     SELECT public.import_transactions(
       (SELECT jsonb_agg(jsonb_build_object(
         'tx_datetime', '2099-04-01T21:07:00Z',
         'effective_date', '2099-04-01',
         'description', 'minute-dedup same-second ' || n,
         'withdraw', n,
         'deposit', NULL,
         'balance', 1000 - n,
         'channel', 'TEST',
         'type', 'withdrawal'
       )) FROM generate_series(1, 7) AS n)
     ) AS result
   ) import_result),
  'import_transactions: seven rows at same second all insert'
);


-- Old-format minute precision blocks all second-precision rows in its minute.
SELECT ok(
  (SELECT (public.import_transactions(
    '[{"tx_datetime":"2099-05-01T10:35:00Z","effective_date":"2099-05-01","description":"minute-dedup existing minute","withdraw":10,"deposit":null,"balance":990,"channel":"TEST","type":"withdrawal"}]'::jsonb
  ))->>'inserted' = '1'),
  'import_transactions: minute-precision historical row imports'
);

SELECT ok(
  (SELECT (result->>'inserted' = '0' AND result->>'skipped' = '1')
   FROM (
     SELECT public.import_transactions(
       '[{"tx_datetime":"2099-05-01T10:35:57Z","effective_date":"2099-05-01","description":"minute-dedup blocked second","withdraw":20,"deposit":null,"balance":970,"channel":"TEST","type":"withdrawal"}]'::jsonb
     ) AS result
   ) import_result),
  'import_transactions: existing minute skips second-precision row'
);

-- Existing and new minutes in one payload produce matching split counts.
SELECT ok(
  (SELECT (result->>'inserted' = '2' AND result->>'skipped' = '1')
   FROM (
     SELECT public.import_transactions(
       '[
         {"tx_datetime":"2099-05-01T10:35:12Z","effective_date":"2099-05-01","description":"minute-dedup mixed existing","withdraw":30,"deposit":null,"balance":940,"channel":"TEST","type":"withdrawal"},
         {"tx_datetime":"2099-05-01T10:36:00Z","effective_date":"2099-05-01","description":"minute-dedup mixed new one","withdraw":40,"deposit":null,"balance":900,"channel":"TEST","type":"withdrawal"},
         {"tx_datetime":"2099-05-01T10:36:00Z","effective_date":"2099-05-01","description":"minute-dedup mixed new two","withdraw":50,"deposit":null,"balance":850,"channel":"TEST","type":"withdrawal"}
       ]'::jsonb
     ) AS result
   ) import_result),
  'import_transactions: mixed existing and new minutes report split counts'
);

-- Regression (#26): a v2-format row's Gregorian-year effective_date must
-- import as that same calendar year, not raise "must use a Buddhist-era
-- year" (the historical parse_legacy_effective_date guard no longer runs
-- against incoming rows) and not silently become year-1483.
SELECT ok(
  (SELECT (public.import_transactions(
    '[{"tx_datetime":"2026-08-20T21:07:00Z","effective_date":"2026-08-20","description":"v2 gregorian effective_date","withdraw":4121.64,"deposit":null,"balance":2589588.86,"channel":"Automatic","type":"withdrawal","branch":"BANG KHRU","location":"Phra Pradaeng","terminal_id":"020200","narrative":null,"counterparty_name":null,"counterparty_account":null,"currency":"THB","fx_rate":null,"statement_format":"english_v2"}]'::jsonb
  ))->>'inserted' = '1'),
  'import_transactions: v2 Gregorian effective_date imports without raising'
);

SELECT tests.clear_auth();

SELECT is(
  (SELECT effective_date FROM public.transactions WHERE description = 'v2 gregorian effective_date'),
  DATE '2026-08-20',
  'import_transactions: v2 effective_date stores the correct calendar year, not 1483'
);

SELECT is(
  (SELECT statement_format FROM public.transactions WHERE description = 'v2 gregorian effective_date'),
  'english_v2',
  'import_transactions: v2 row is tagged with statement_format english_v2'
);

SELECT is(
  (SELECT withdraw FROM public.transactions WHERE description = 'v2 gregorian effective_date'),
  4121.64,
  'import_transactions: v2 signed debit stores as a positive withdraw amount'
);

-- Non-admin denied
SELECT tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000002'::uuid);

SELECT throws_ok(
  $$SELECT public.import_transactions('[{"tx_datetime":"2099-02-01T00:00:00","effective_date":"2099-02-01","description":"hack","withdraw":1,"deposit":null,"balance":1,"channel":"X","type":"withdrawal"}]'::jsonb)$$,
  'Permission denied',
  'import_transactions: non-admin denied'
);

-- =============================================================================
-- TEST: import_transactions round-trips every new statement-v2 field (#29)
-- =============================================================================
--
-- Regression target: a field the parser emits but the RPC's jsonb extraction
-- does not read inserts silently as NULL, and every test that mocks the
-- database boundary still passes. This asserts against the real RPC and a
-- real row read back, not a mocked payload or a hand-written INSERT.
--
-- channel_code and cheque_number_normalized are deliberately not in the
-- jsonb payload below: the RPC does not accept them from the client at all
-- (see the migration) — they are derived server-side by
-- trg_derive_transaction_normalised_fields from the raw channel/
-- cheque_number columns on every insert. Asserted separately below.

SELECT tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

SELECT ok(
  (SELECT (public.import_transactions(
    '[{"tx_datetime":"2026-08-19T17:09:49Z","effective_date":"2026-08-19","description":"new fields round trip","cheque_number":"0002933140","withdraw":null,"deposit":59171.00,"balance":2670300.77,"channel":"Mobile Phone Banking","type":"income","branch":"HEAD OFFICE","location":"Sathorn","terminal_id":"004286","narrative":"Bank narrative text","counterparty_name":"บจก. ชิโนซาวา (ประเทศไทย)","counterparty_account":"0942XXX148","currency":"THB","fx_rate":33.50,"statement_format":"english_v2","statement_exported_at":"2026-08-21T10:49:45Z"}]'::jsonb
  ))->>'inserted' = '1'),
  'import_transactions: new-fields round-trip row imports'
);

SELECT tests.clear_auth();

SELECT results_eq(
  $$SELECT branch, location, terminal_id, narrative, counterparty_name,
           counterparty_account, currency, fx_rate, channel_code,
           cheque_number_normalized, statement_exported_at
      FROM public.transactions WHERE description = 'new fields round trip'$$,
  $$VALUES ('HEAD OFFICE'::text, 'Sathorn'::text, '004286'::text,
            'Bank narrative text'::text, 'บจก. ชิโนซาวา (ประเทศไทย)'::text,
            '0942XXX148'::text, 'THB'::text, 33.50::numeric,
            'MOBILE_PHONE_BANKING'::text, '2933140'::text,
            '2026-08-21T10:49:45Z'::timestamptz)$$,
  'import_transactions: every new bank field round-trips through the real RPC, not a mock'
);

-- =============================================================================
-- TEST: get_transactions_v2 search and channel filter reach the new
-- statement-format-v2 fields (issue #30)
-- =============================================================================

-- p_search matches counterparty_name, not just description/memo/cheque/channel.
SELECT tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

SELECT ok(
  (SELECT count(*) FROM public.get_transactions_v2(
    NULL::text, NULL::text, NULL::text, NULL::text, 'ชิโนซาวา'::text,
    NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::numeric, NULL::numeric, NULL::numeric,
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text
  ) WHERE description = 'new fields round trip') = 1,
  'get_transactions_v2: p_search matches counterparty_name'
);

-- p_search matches narrative too.
SELECT ok(
  (SELECT count(*) FROM public.get_transactions_v2(
    NULL::text, NULL::text, NULL::text, NULL::text, 'Bank narrative text'::text,
    NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::numeric, NULL::numeric, NULL::numeric,
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text
  ) WHERE description = 'new fields round trip') = 1,
  'get_transactions_v2: p_search matches narrative'
);

-- p_col_channel filters on channel_code (normalised), not raw channel text —
-- a filter of 'MOB' must match this row whose raw channel is the English
-- prose 'Mobile Phone Banking', so one selection spans both statement
-- formats instead of splitting the ledger at the switchover date.
SELECT ok(
  (SELECT count(*) FROM public.get_transactions_v2(
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text,
    'MOBILE_PHONE_BANKING'::text, NULL::numeric, NULL::numeric, NULL::numeric,
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text
  ) WHERE description = 'new fields round trip') = 1,
  'get_transactions_v2: p_col_channel matches on normalised channel_code'
);

-- The row's raw channel text is still what the table would display —
-- filtering does not rewrite the displayed value.
SELECT ok(
  (SELECT channel FROM public.get_transactions_v2(
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text,
    'MOBILE_PHONE_BANKING'::text, NULL::numeric, NULL::numeric, NULL::numeric,
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text
  ) WHERE description = 'new fields round trip') = 'Mobile Phone Banking',
  'get_transactions_v2: raw channel text is unchanged by the channel_code filter'
);

-- =============================================================================
-- CLEANUP
-- =============================================================================

SELECT tests.clear_auth();
DELETE FROM public.transactions WHERE description = 'test import';
DELETE FROM public.transactions WHERE description = 'v2 gregorian effective_date';
DELETE FROM public.transactions WHERE description = 'new fields round trip';

SELECT * FROM finish();

ROLLBACK;
