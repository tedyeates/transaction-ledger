-- pgTAP tests for statement-schema migration (#25)
-- Run: npx supabase test db

BEGIN;

SELECT plan(24);

-- New statement fields preserve bank-supplied values verbatim.
SELECT has_column('public', 'transactions', 'branch', 'transactions has branch');
SELECT has_column('public', 'transactions', 'location', 'transactions has location');
SELECT has_column('public', 'transactions', 'terminal_id', 'transactions has terminal_id');
SELECT has_column('public', 'transactions', 'narrative', 'transactions has narrative');
SELECT has_column('public', 'transactions', 'counterparty_name', 'transactions has counterparty_name');
SELECT has_column('public', 'transactions', 'counterparty_account', 'transactions has counterparty_account');
SELECT has_column('public', 'transactions', 'currency', 'transactions has currency');
SELECT has_column('public', 'transactions', 'fx_rate', 'transactions has fx_rate');
SELECT has_column('public', 'transactions', 'statement_format', 'transactions has statement_format');
SELECT has_column('public', 'transactions', 'statement_exported_at', 'transactions has statement_exported_at');
SELECT has_column('public', 'transactions', 'channel_code', 'transactions has channel_code');
SELECT has_column('public', 'transactions', 'cheque_number_normalized', 'transactions has cheque_number_normalized');

SELECT col_type_is('public', 'transactions', 'effective_date', 'date', 'effective_date uses date type');
SELECT col_type_is('public', 'transactions', 'terminal_id', 'text', 'terminal_id preserves leading zeroes and letters');
SELECT col_type_is('public', 'transactions', 'fx_rate', 'numeric', 'fx_rate uses numeric type');
SELECT col_type_is('public', 'transactions', 'statement_exported_at', 'timestamp with time zone', 'statement export timestamp uses timestamptz');

-- Legacy rows remain identifiable and derive machine-searchable values.
SELECT is(
  (SELECT count(*) FROM public.transactions WHERE statement_format = 'thai_legacy'),
  (SELECT count(*) FROM public.transactions),
  'all existing rows are marked thai_legacy'
);

SELECT is(
  (SELECT effective_date FROM public.transactions WHERE id = 1),
  DATE '2026-05-01',
  'Buddhist slash date converts to Gregorian date'
);

SELECT is(
  (SELECT effective_date FROM public.transactions WHERE tx_datetime = '2026-07-08 10:30:00+07'::timestamptz),
  DATE '2026-07-08',
  'Buddhist Thai-month date converts to Gregorian date'
);

SELECT is(
  (SELECT channel_code FROM public.transactions WHERE id = 1),
  'K_PLUS',
  'legacy K PLUS channel gets normalised code'
);

SELECT is(
  (SELECT cheque_number_normalized FROM public.transactions WHERE cheque_number = '005892'),
  '5892',
  'cheque normalised value strips leading zeroes'
);

SELECT ok(
  (SELECT id = 3
          AND memo = 'ค่าวัสดุก่อสร้าง'
          AND remark = 'PO-2026-0451'
          AND is_highlighted
          AND imported_at IS NOT NULL
   FROM public.transactions
   WHERE id = 3),
  'existing annotations, ids, and import timestamps remain intact'
);

SELECT ok(
  to_regclass('public.idx_transactions_counterparty_name') IS NOT NULL,
  'counterparty_name has search index'
);

-- New format values store losslessly, including terminal leading zeroes/letters.
INSERT INTO public.transactions (
  tx_datetime, effective_date, description, cheque_number, withdraw, deposit,
  balance, channel, type, branch, location, terminal_id, narrative,
  counterparty_name, counterparty_account, currency, fx_rate,
  statement_format, statement_exported_at, channel_code, cheque_number_normalized
) VALUES (
  '2099-03-01 10:00:00+07', DATE '2099-03-01', 'New statement row', '0002933140',
  1, NULL, 1, 'Mobile Phone Banking', 'withdrawal', 'BANG KHRU',
  'Phra Pradaeng', '0098C0', 'Bank narrative', 'Example Counterparty',
  '0942XXX148', 'THB', 0.00, 'english_v2', '2099-03-01 10:49:45+07',
  'MOBILE_PHONE_BANKING', '2933140'
);

SELECT results_eq(
  $$SELECT terminal_id, counterparty_name, currency, statement_format,
           statement_exported_at, cheque_number_normalized
      FROM public.transactions WHERE description = 'New statement row'$$,
  $$VALUES ('0098C0'::text, 'Example Counterparty'::text, 'THB'::text,
            'english_v2'::text, '2099-03-01 10:49:45+07'::timestamptz,
            '2933140'::text)$$,
  'new statement values store losslessly'
);

SELECT * FROM finish();

ROLLBACK;
