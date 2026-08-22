-- Migration: RPC authorization hardening (issue #21)
--
-- 1. Add role guard to get_transaction_stats / get_transaction_stats_v2 (both
--    overloads): resolve caller's role server-side and constrain the
--    aggregate to the rows that role may see. Unauthenticated / roleless
--    callers get 'Permission denied'. p_type is ignored for accountants —
--    the type restriction is derived from their role, not trusted from input.
-- 2. Drop the unreachable-by-client, unchecked 9-parameter get_transactions_v2
--    and get_transaction_stats_v2 overloads.
-- 3. Replace SELECT * in the surviving 13-param get_transactions_v2 with an
--    explicit column list that nulls balance/remark for non-admin callers,
--    matching the masking already present in legacy get_transactions().
-- 4. Revoke anon EXECUTE on every public function and stop granting it to
--    new functions by default. authenticated and service_role keep access.

BEGIN;

-- =============================================================================
-- 1. Role guard on stats functions
-- =============================================================================

CREATE OR REPLACE FUNCTION "public"."get_transaction_stats"(
  "p_type" "text" DEFAULT NULL::"text",
  "p_channel" "text" DEFAULT NULL::"text",
  "p_date_from" timestamp with time zone DEFAULT NULL::timestamp with time zone,
  "p_date_to" timestamp with time zone DEFAULT NULL::timestamp with time zone,
  "p_search" "text" DEFAULT NULL::"text"
) RETURNS TABLE("total_count" bigint, "total_withdraws" numeric, "total_deposits" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM user_roles WHERE user_id = auth.uid();

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*)::bigint,
    COALESCE(SUM(withdraw) FILTER (WHERE type = 'withdrawal'), 0),
    COALESCE(SUM(deposit)  FILTER (WHERE type = 'income'), 0)
  FROM transactions
  WHERE
    (v_role = 'admin' OR type = v_role)
    AND (p_type      IS NULL OR type      = p_type)
    AND (p_channel   IS NULL OR channel   = p_channel)
    AND (p_date_from IS NULL OR tx_datetime >= p_date_from)
    AND (p_date_to   IS NULL OR tx_datetime <= p_date_to)
    AND (p_search IS NULL OR (
      description   ILIKE '%' || p_search || '%' OR
      memo          ILIKE '%' || p_search || '%' OR
      cheque_number ILIKE '%' || p_search || '%' OR
      channel       ILIKE '%' || p_search || '%'
    ));
END;
$$;

ALTER FUNCTION "public"."get_transaction_stats"("p_type" "text", "p_channel" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_search" "text") OWNER TO "postgres";

-- Drop the unchecked 9-parameter get_transaction_stats_v2 overload entirely.
DROP FUNCTION IF EXISTS "public"."get_transaction_stats_v2"(
  "text", "text", timestamp with time zone, timestamp with time zone, "text", "text", "text", "text", "text"
);

-- Surviving 13-parameter get_transaction_stats_v2: add role guard.
-- p_type is intentionally ignored for non-admin callers; the type
-- restriction always comes from the caller's own role.
CREATE OR REPLACE FUNCTION "public"."get_transaction_stats_v2"(
  "p_type" "text" DEFAULT NULL::"text",
  "p_channel" "text" DEFAULT NULL::"text",
  "p_date_from" timestamp with time zone DEFAULT NULL::timestamp with time zone,
  "p_date_to" timestamp with time zone DEFAULT NULL::timestamp with time zone,
  "p_search" "text" DEFAULT NULL::"text",
  "p_desc" "text" DEFAULT NULL::"text",
  "p_cheque" "text" DEFAULT NULL::"text",
  "p_memo" "text" DEFAULT NULL::"text",
  "p_remark" "text" DEFAULT NULL::"text",
  "p_col_channel" "text" DEFAULT NULL::"text",
  "p_withdraw" numeric DEFAULT NULL::numeric,
  "p_deposit" numeric DEFAULT NULL::numeric,
  "p_balance" numeric DEFAULT NULL::numeric
) RETURNS TABLE("total_count" bigint, "total_withdraws" numeric, "total_deposits" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM user_roles WHERE user_id = auth.uid();

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*)::bigint,
    COALESCE(SUM(withdraw) FILTER (WHERE type = 'withdrawal'), 0),
    COALESCE(SUM(deposit)  FILTER (WHERE type = 'income'), 0)
  FROM transactions
  WHERE
    (v_role = 'admin' OR type = v_role)
    AND (p_type        IS NULL OR type   = p_type)
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
    AND (p_balance     IS NULL OR balance       = p_balance);
END;
$$;

ALTER FUNCTION "public"."get_transaction_stats_v2"("p_type" "text", "p_channel" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_search" "text", "p_desc" "text", "p_cheque" "text", "p_memo" "text", "p_remark" "text", "p_col_channel" "text", "p_withdraw" numeric, "p_deposit" numeric, "p_balance" numeric) OWNER TO "postgres";

-- =============================================================================
-- 2. Drop the unchecked 9-parameter get_transactions_v2 overload
-- =============================================================================

DROP FUNCTION IF EXISTS "public"."get_transactions_v2"(
  "text", "text", "text", "text", "text", "text", "text", "text", "text"
);

-- =============================================================================
-- 3. Surviving get_transactions_v2: explicit column list, mask balance/remark
-- =============================================================================

-- Return type changes (SETOF transactions -> explicit TABLE with is_highlighted
-- appended) — CREATE OR REPLACE cannot change return type, must drop first.
DROP FUNCTION IF EXISTS "public"."get_transactions_v2"(
  "text", "text", "text", "text", "text", "text", "text", "text", "text",
  "text", numeric, numeric, numeric
);

CREATE FUNCTION "public"."get_transactions_v2"(
  "p_type" "text" DEFAULT NULL::"text",
  "p_channel" "text" DEFAULT NULL::"text",
  "p_date_from" "text" DEFAULT NULL::"text",
  "p_date_to" "text" DEFAULT NULL::"text",
  "p_search" "text" DEFAULT NULL::"text",
  "p_desc" "text" DEFAULT NULL::"text",
  "p_cheque" "text" DEFAULT NULL::"text",
  "p_memo" "text" DEFAULT NULL::"text",
  "p_remark" "text" DEFAULT NULL::"text",
  "p_col_channel" "text" DEFAULT NULL::"text",
  "p_withdraw" numeric DEFAULT NULL::numeric,
  "p_deposit" numeric DEFAULT NULL::numeric,
  "p_balance" numeric DEFAULT NULL::numeric
) RETURNS TABLE(
    "id" bigint,
    "tx_datetime" timestamp with time zone,
    "effective_date" "text",
    "description" "text",
    "cheque_number" "text",
    "withdraw" numeric,
    "deposit" numeric,
    "balance" numeric,
    "channel" "text",
    "memo" "text",
    "type" "text",
    "imported_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "remark" "text",
    "is_highlighted" boolean
)
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT
    t.id,
    t.tx_datetime,
    t.effective_date,
    t.description,
    t.cheque_number,
    t.withdraw,
    t.deposit,
    CASE WHEN EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
    ) THEN t.balance ELSE NULL END AS balance,
    t.channel,
    t.memo,
    t.type,
    t.imported_at,
    t.updated_at,
    CASE WHEN EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
    ) THEN t.remark ELSE NULL END AS remark,
    t.is_highlighted
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
    AND (p_balance     IS NULL OR balance       = p_balance)
    AND (
      EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = auth.uid()
        AND (
          role = 'admin'
          OR (role = 'withdrawal' AND t.type = 'withdrawal')
          OR (role = 'income'     AND t.type = 'income')
        )
      )
    );
$$;

ALTER FUNCTION "public"."get_transactions_v2"("p_type" "text", "p_channel" "text", "p_date_from" "text", "p_date_to" "text", "p_search" "text", "p_desc" "text", "p_cheque" "text", "p_memo" "text", "p_remark" "text", "p_col_channel" "text", "p_withdraw" numeric, "p_deposit" numeric, "p_balance" numeric) OWNER TO "postgres";

-- DROP FUNCTION above removed all grants; restore authenticated/service_role
-- (anon is intentionally NOT restored here, see step 4).
GRANT ALL ON FUNCTION "public"."get_transactions_v2"("p_type" "text", "p_channel" "text", "p_date_from" "text", "p_date_to" "text", "p_search" "text", "p_desc" "text", "p_cheque" "text", "p_memo" "text", "p_remark" "text", "p_col_channel" "text", "p_withdraw" numeric, "p_deposit" numeric, "p_balance" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_transactions_v2"("p_type" "text", "p_channel" "text", "p_date_from" "text", "p_date_to" "text", "p_search" "text", "p_desc" "text", "p_cheque" "text", "p_memo" "text", "p_remark" "text", "p_col_channel" "text", "p_withdraw" numeric, "p_deposit" numeric, "p_balance" numeric) TO "service_role";

-- =============================================================================
-- 4. Revoke anon EXECUTE on all public functions; stop granting it by default
-- =============================================================================

-- Empty ACLs on Postgres functions mean "PUBLIC has EXECUTE" (the built-in
-- default), which anon inherits regardless of any per-role REVOKE. Must
-- revoke from PUBLIC explicitly, then re-grant to authenticated/service_role
-- for functions whose only privilege was the implicit PUBLIC one.
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC', f.proname, f.args);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM anon', f.proname, f.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated', f.proname, f.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role', f.proname, f.args);
  END LOOP;
END;
$$;

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM PUBLIC;

COMMIT;
