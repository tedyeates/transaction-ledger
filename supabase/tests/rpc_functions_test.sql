-- pgTAP tests for RPC functions with role-based authorization
-- Run: npx supabase test db

BEGIN;

SELECT plan(30);

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
    NULL::text, NULL::numeric, NULL::numeric, NULL::numeric
  )) > 0,
  'get_transactions_v2: admin sees rows'
);

SELECT ok(
  (SELECT count(DISTINCT type) FROM public.get_transactions_v2(
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::numeric, NULL::numeric, NULL::numeric
  )) = 2,
  'get_transactions_v2: admin sees both types'
);

-- Withdrawal user only sees withdrawal rows
SELECT tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000002'::uuid);

SELECT ok(
  (SELECT count(*) FROM public.get_transactions_v2(
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::numeric, NULL::numeric, NULL::numeric
  )) > 0,
  'get_transactions_v2: withdrawal user sees rows'
);

SELECT ok(
  (SELECT count(*) FROM public.get_transactions_v2(
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::numeric, NULL::numeric, NULL::numeric
  ) WHERE type != 'withdrawal') = 0,
  'get_transactions_v2: withdrawal user sees only withdrawal rows'
);

-- Income user only sees income rows
SELECT tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

SELECT ok(
  (SELECT count(*) FROM public.get_transactions_v2(
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::numeric, NULL::numeric, NULL::numeric
  )) > 0,
  'get_transactions_v2: income user sees rows'
);

SELECT ok(
  (SELECT count(*) FROM public.get_transactions_v2(
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::numeric, NULL::numeric, NULL::numeric
  ) WHERE type != 'income') = 0,
  'get_transactions_v2: income user sees only income rows'
);

-- Filter by type works
SELECT tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

SELECT ok(
  (SELECT count(*) FROM public.get_transactions_v2(
    'withdrawal'::text, NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::numeric, NULL::numeric, NULL::numeric
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
-- TEST: import_transactions (dedup logic)
-- =============================================================================

-- Admin can import
SELECT tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

SELECT ok(
  (SELECT (public.import_transactions(
    '[{"tx_datetime":"2099-01-01T00:00:00","effective_date":"01/01/2642","description":"test import","withdraw":100,"deposit":null,"balance":900,"channel":"TEST","type":"withdrawal"}]'::jsonb
  ))->>'inserted' = '1'),
  'import_transactions: admin can import new row'
);

-- Duplicate tx_datetime gets skipped
SELECT ok(
  (SELECT (public.import_transactions(
    '[{"tx_datetime":"2099-01-01T00:00:00","effective_date":"01/01/2642","description":"duplicate","withdraw":200,"deposit":null,"balance":700,"channel":"TEST","type":"withdrawal"}]'::jsonb
  ))->>'skipped' = '1'),
  'import_transactions: duplicate tx_datetime skipped'
);

-- Non-admin denied
SELECT tests.authenticate_as('aaaaaaaa-0000-0000-0000-000000000002'::uuid);

SELECT throws_ok(
  $$SELECT public.import_transactions('[{"tx_datetime":"2099-02-01T00:00:00","effective_date":"01/02/2642","description":"hack","withdraw":1,"deposit":null,"balance":1,"channel":"X","type":"withdrawal"}]'::jsonb)$$,
  'Permission denied',
  'import_transactions: non-admin denied'
);

-- =============================================================================
-- CLEANUP
-- =============================================================================

SELECT tests.clear_auth();
DELETE FROM public.transactions WHERE description = 'test import';

SELECT * FROM finish();

ROLLBACK;
