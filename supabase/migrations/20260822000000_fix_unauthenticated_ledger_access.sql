-- ============================================================
-- Fix: Unauthenticated read of ledger totals via SECURITY DEFINER RPCs
-- ============================================================
--
-- Problem (Issue #21):
-- 1. get_transaction_stats (5-param) — no auth check, granted to anon
-- 2. get_transaction_stats_v2 (9-param) — no auth check, granted to anon
-- 3. get_transaction_stats_v2 (13-param) — no auth check, granted to anon
-- 4. get_transactions_v2 (9-param) — no auth check, no role filtering,
--    no column masking (balance/remark exposed), granted to anon
--
-- Fix: Add auth.uid() + user_roles checks to all four functions,
-- REVOKE anon from all sensitive functions, and fix default privileges.
--
-- The 13-param get_transactions_v2 already has role filtering (lines 290-300)
-- but still lacks column masking — we add that here too.
-- ============================================================

-- ─── 1. get_transaction_stats (5-param): add auth + role check ───
CREATE OR REPLACE FUNCTION get_transaction_stats(
    p_type text DEFAULT NULL,
    p_channel text DEFAULT NULL,
    p_date_from timestamptz DEFAULT NULL,
    p_date_to timestamptz DEFAULT NULL,
    p_search text DEFAULT NULL
) RETURNS TABLE(total_count bigint, total_withdraws numeric, total_deposits numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = public
    AS $$
  SELECT
    COUNT(*)::bigint,
    COALESCE(SUM(withdraw) FILTER (WHERE type = 'withdrawal'), 0),
    COALESCE(SUM(deposit)  FILTER (WHERE type = 'income'), 0)
  FROM transactions t
  WHERE
    (p_type      IS NULL OR type      = p_type)
    AND (p_channel   IS NULL OR channel   = p_channel)
    AND (p_date_from IS NULL OR tx_datetime >= p_date_from)
    AND (p_date_to   IS NULL OR tx_datetime <= p_date_to)
    AND (p_search IS NULL OR (
      description   ILIKE '%' || p_search || '%' OR
      memo          ILIKE '%' || p_search || '%' OR
      cheque_number ILIKE '%' || p_search || '%' OR
      channel       ILIKE '%' || p_search || '%'
    ))
    AND EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND (
        role = 'admin'
        OR (role = 'withdrawal' AND t.type = 'withdrawal')
        OR (role = 'income'     AND t.type = 'income')
      )
    );
$$;

-- ─── 2. get_transaction_stats_v2 (9-param): add auth + role check ───
CREATE OR REPLACE FUNCTION get_transaction_stats_v2(
    p_type text DEFAULT NULL,
    p_channel text DEFAULT NULL,
    p_date_from timestamptz DEFAULT NULL,
    p_date_to timestamptz DEFAULT NULL,
    p_search text DEFAULT NULL,
    p_desc text DEFAULT NULL,
    p_cheque text DEFAULT NULL,
    p_memo text DEFAULT NULL,
    p_remark text DEFAULT NULL
) RETURNS TABLE(total_count bigint, total_withdraws numeric, total_deposits numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = public
    AS $$
  SELECT
    COUNT(*)::bigint,
    COALESCE(SUM(withdraw) FILTER (WHERE type = 'withdrawal'), 0),
    COALESCE(SUM(deposit)  FILTER (WHERE type = 'income'), 0)
  FROM transactions t
  WHERE
    (p_type      IS NULL OR type        = p_type)
    AND (p_channel   IS NULL OR channel = p_channel)
    AND (p_date_from IS NULL OR tx_datetime >= p_date_from::timestamptz)
    AND (p_date_to   IS NULL OR tx_datetime <= p_date_to::timestamptz)
    AND (p_search IS NULL OR (
          description   ILIKE '%' || p_search || '%' OR
          memo          ILIKE '%' || p_search || '%' OR
          cheque_number ILIKE '%' || p_search || '%' OR
          channel       ILIKE '%' || p_search || '%'
        ))
    AND (p_desc   IS NULL OR description   ILIKE '%' || p_desc   || '%')
    AND (p_cheque IS NULL OR cheque_number ILIKE '%' || p_cheque || '%')
    AND (p_memo   IS NULL OR memo          ILIKE '%' || p_memo   || '%')
    AND (p_remark IS NULL OR remark        ILIKE '%' || p_remark || '%')
    AND EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND (
        role = 'admin'
        OR (role = 'withdrawal' AND t.type = 'withdrawal')
        OR (role = 'income'     AND t.type = 'income')
      )
    );
$$;

-- ─── 3. get_transactions_v2 (9-param): add auth, role check, column masking ───
CREATE OR REPLACE FUNCTION get_transactions_v2(
    p_type text DEFAULT NULL,
    p_channel text DEFAULT NULL,
    p_date_from text DEFAULT NULL,
    p_date_to text DEFAULT NULL,
    p_search text DEFAULT NULL,
    p_desc text DEFAULT NULL,
    p_cheque text DEFAULT NULL,
    p_memo text DEFAULT NULL,
    p_remark text DEFAULT NULL
) RETURNS SETOF transactions
    LANGUAGE sql SECURITY DEFINER
    SET search_path = public
    AS $$
  SELECT
    t.id,
    t.tx_datetime,
    t.effective_date,
    t.description,
    t.cheque_number,
    t.withdraw,
    t.deposit,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
      ) THEN t.balance
      ELSE NULL
    END AS balance,
    t.channel,
    t.memo,
    t.type,
    t.imported_at,
    t.updated_at,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
      ) THEN t.remark
      ELSE NULL
    END AS remark
  FROM transactions t
  WHERE
    (p_type      IS NULL OR type        = p_type)
    AND (p_channel   IS NULL OR channel = p_channel)
    AND (p_date_from IS NULL OR tx_datetime >= p_date_from::timestamptz)
    AND (p_date_to   IS NULL OR tx_datetime <= p_date_to::timestamptz)
    AND (p_search IS NULL OR (
          description   ILIKE '%' || p_search || '%' OR
          memo          ILIKE '%' || p_search || '%' OR
          cheque_number ILIKE '%' || p_search || '%' OR
          channel       ILIKE '%' || p_search || '%'
        ))
    AND (p_desc   IS NULL OR description   ILIKE '%' || p_desc   || '%')
    AND (p_cheque IS NULL OR cheque_number ILIKE '%' || p_cheque || '%')
    AND (p_memo   IS NULL OR memo          ILIKE '%' || p_memo   || '%')
    AND (p_remark IS NULL OR remark        ILIKE '%' || p_remark || '%')
    AND EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND (
        role = 'admin'
        OR (role = 'withdrawal' AND t.type = 'withdrawal')
        OR (role = 'income'     AND t.type = 'income')
      )
    );
$$;

-- ─── 4. get_transactions_v2 (13-param): add column masking ───
CREATE OR REPLACE FUNCTION get_transactions_v2(
    p_type text DEFAULT NULL,
    p_channel text DEFAULT NULL,
    p_date_from text DEFAULT NULL,
    p_date_to text DEFAULT NULL,
    p_search text DEFAULT NULL,
    p_desc text DEFAULT NULL,
    p_cheque text DEFAULT NULL,
    p_memo text DEFAULT NULL,
    p_remark text DEFAULT NULL,
    p_col_channel text DEFAULT NULL,
    p_withdraw numeric DEFAULT NULL,
    p_deposit numeric DEFAULT NULL,
    p_balance numeric DEFAULT NULL
) RETURNS SETOF transactions
    LANGUAGE sql SECURITY DEFINER
    SET search_path = public
    AS $$
  SELECT
    t.id,
    t.tx_datetime,
    t.effective_date,
    t.description,
    t.cheque_number,
    t.withdraw,
    t.deposit,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
      ) THEN t.balance
      ELSE NULL
    END AS balance,
    t.channel,
    t.memo,
    t.type,
    t.imported_at,
    t.updated_at,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
      ) THEN t.remark
      ELSE NULL
    END AS remark
  FROM transactions t
  WHERE
    (p_type        IS NULL OR type        = p_type)
    AND (p_channel     IS NULL OR channel = p_channel)
    AND (p_date_from   IS NULL OR tx_datetime >= p_date_from::timestamptz)
    AND (p_date_to     IS NULL OR tx_datetime <= p_date_to::timestamptz)
    AND (p_search IS NULL OR (
          description   ILIKE '%' || p_search || '%' OR
          memo          ILIKE '%' || p_search || '%' OR
          cheque_number ILIKE '%' || p_search || '%' OR
          channel       ILIKE '%' || p_search || '%'
        ))
    AND (p_desc        IS NULL OR description   ILIKE '%' || p_desc        || '%')
    AND (p_cheque      IS NULL OR cheque_number ILIKE '%' || p_cheque      || '%')
    AND (p_memo        IS NULL OR memo          ILIKE '%' || p_memo        || '%')
    AND (p_remark      IS NULL OR remark        ILIKE '%' || p_remark      || '%')
    AND (p_col_channel IS NULL OR channel       ILIKE '%' || p_col_channel || '%')
    AND (p_withdraw    IS NULL OR withdraw      = p_withdraw)
    AND (p_deposit     IS NULL OR deposit       = p_deposit)
    AND (p_balance     IS NULL OR t.balance     = p_balance)
    AND EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND (
        role = 'admin'
        OR (role = 'withdrawal' AND t.type = 'withdrawal')
        OR (role = 'income'     AND t.type = 'income')
      )
    );
$$;

-- ─── 5. Revoke anon from all sensitive functions ───
REVOKE ALL ON FUNCTION get_transaction_stats(text, text, timestamptz, timestamptz, text) FROM anon;
REVOKE ALL ON FUNCTION get_transaction_stats_v2(text, text, timestamptz, timestamptz, text, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION get_transaction_stats_v2(text, text, timestamptz, timestamptz, text, text, text, text, text, text, numeric, numeric, numeric) FROM anon;
REVOKE ALL ON FUNCTION get_transactions() FROM anon;
REVOKE ALL ON FUNCTION get_transactions_v2(text, text, text, text, text, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION get_transactions_v2(text, text, text, text, text, text, text, text, text, text, numeric, numeric, numeric) FROM anon;
REVOKE ALL ON FUNCTION get_latest_balance() FROM anon;
REVOKE ALL ON FUNCTION import_transactions(jsonb) FROM anon;
REVOKE ALL ON FUNCTION update_memo(bigint, text) FROM anon;
REVOKE ALL ON FUNCTION update_remark(bigint, text) FROM anon;

-- ─── 6. Fix overly permissive default privileges ───
-- Remove blanket anon access to future functions and tables
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE ALL ON TABLES FROM anon;
