-- Reconcile get_transactions_v2 with the statement-format-v2 columns (#30)
--
-- get_transactions_v2's explicit column list (added by the #21 authorization
-- hardening migration, which landed before the statement-schema migration)
-- has never been extended to return any statement-format-v2 field. The
-- columns are stored correctly by import_transactions, but the RPC that
-- feeds the UI never returns them, so e.g. counterparty_name renders empty
-- in production regardless of any front-end work.
--
-- This migration:
--   1. Extends get_transactions_v2's RETURNS TABLE / column list with
--      counterparty_name, branch, location, terminal_id, narrative (all
--      roles) and counterparty_account, fx_rate, statement_format,
--      statement_exported_at (admin-only, masked to NULL otherwise),
--      following the existing balance/remark masking pattern.
--   2. Adds counterparty_name and narrative to the free-text search branch.
--   3. Switches the channel column filter (p_col_channel) to match against
--      channel_code instead of the raw channel text, so one selection spans
--      both statement formats. The raw channel text is still what the table
--      displays (t.channel, unchanged).
--   4. Adds column filter params for the new bank-descriptive columns
--      (counterparty_name, branch, location, terminal_id, narrative),
--      following the existing colX / p_x convention (e.g. p_desc/colDesc).

BEGIN;

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
  "p_balance" numeric DEFAULT NULL::numeric,
  "p_counterparty" "text" DEFAULT NULL::"text",
  "p_branch" "text" DEFAULT NULL::"text",
  "p_location" "text" DEFAULT NULL::"text",
  "p_terminal" "text" DEFAULT NULL::"text",
  "p_narrative" "text" DEFAULT NULL::"text"
) RETURNS TABLE(
    "id" bigint,
    "tx_datetime" timestamp with time zone,
    "effective_date" "date",
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
    "is_highlighted" boolean,
    "counterparty_name" "text",
    "branch" "text",
    "location" "text",
    "terminal_id" "text",
    "narrative" "text",
    "counterparty_account" "text",
    "fx_rate" numeric,
    "statement_format" "text",
    "statement_exported_at" timestamp with time zone
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
    t.is_highlighted,
    t.counterparty_name,
    t.branch,
    t.location,
    t.terminal_id,
    t.narrative,
    CASE WHEN EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
    ) THEN t.counterparty_account ELSE NULL END AS counterparty_account,
    CASE WHEN EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
    ) THEN t.fx_rate ELSE NULL END AS fx_rate,
    CASE WHEN EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
    ) THEN t.statement_format ELSE NULL END AS statement_format,
    CASE WHEN EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
    ) THEN t.statement_exported_at ELSE NULL END AS statement_exported_at
  FROM transactions t
  WHERE
    (p_type        IS NULL OR type        = p_type)
    AND (p_channel     IS NULL OR channel = p_channel)
    AND (p_date_from   IS NULL OR tx_datetime >= p_date_from::timestamptz)
    AND (p_date_to     IS NULL OR tx_datetime <= p_date_to::timestamptz)
    AND (p_search IS NULL OR (
          description       ILIKE '%' || p_search || '%' OR
          memo              ILIKE '%' || p_search || '%' OR
          cheque_number     ILIKE '%' || p_search || '%' OR
          channel           ILIKE '%' || p_search || '%' OR
          counterparty_name ILIKE '%' || p_search || '%' OR
          narrative         ILIKE '%' || p_search || '%'
        ))
    AND (p_desc        IS NULL OR description   ILIKE '%' || p_desc        || '%')
    AND (p_cheque      IS NULL OR cheque_number ILIKE '%' || p_cheque      || '%')
    AND (p_memo        IS NULL OR memo          ILIKE '%' || p_memo        || '%')
    AND (p_remark      IS NULL OR remark        ILIKE '%' || p_remark      || '%')
    AND (p_col_channel IS NULL OR channel_code  ILIKE '%' || p_col_channel || '%')
    AND (p_withdraw    IS NULL OR withdraw      = p_withdraw)
    AND (p_deposit     IS NULL OR deposit       = p_deposit)
    AND (p_balance     IS NULL OR balance       = p_balance)
    AND (p_counterparty IS NULL OR counterparty_name ILIKE '%' || p_counterparty || '%')
    AND (p_branch      IS NULL OR branch        ILIKE '%' || p_branch      || '%')
    AND (p_location    IS NULL OR location      ILIKE '%' || p_location    || '%')
    AND (p_terminal    IS NULL OR terminal_id    ILIKE '%' || p_terminal    || '%')
    AND (p_narrative   IS NULL OR narrative      ILIKE '%' || p_narrative   || '%')
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

ALTER FUNCTION "public"."get_transactions_v2"("p_type" "text", "p_channel" "text", "p_date_from" "text", "p_date_to" "text", "p_search" "text", "p_desc" "text", "p_cheque" "text", "p_memo" "text", "p_remark" "text", "p_col_channel" "text", "p_withdraw" numeric, "p_deposit" numeric, "p_balance" numeric, "p_counterparty" "text", "p_branch" "text", "p_location" "text", "p_terminal" "text", "p_narrative" "text") OWNER TO "postgres";

-- CREATE FUNCTION picked up an inherited default ACL that still grants PUBLIC
-- (and therefore anon) EXECUTE — the local stack's effective default ACL for
-- functions in public is not exclusively the postgres-role default the #21
-- migration set (a second default ACL owned by supabase_admin also applies
-- and still includes anon). Explicitly revoke PUBLIC/anon here rather than
-- relying on inherited defaults, exactly as #21 did for every function it
-- touched.
REVOKE ALL ON FUNCTION "public"."get_transactions_v2"("p_type" "text", "p_channel" "text", "p_date_from" "text", "p_date_to" "text", "p_search" "text", "p_desc" "text", "p_cheque" "text", "p_memo" "text", "p_remark" "text", "p_col_channel" "text", "p_withdraw" numeric, "p_deposit" numeric, "p_balance" numeric, "p_counterparty" "text", "p_branch" "text", "p_location" "text", "p_terminal" "text", "p_narrative" "text") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_transactions_v2"("p_type" "text", "p_channel" "text", "p_date_from" "text", "p_date_to" "text", "p_search" "text", "p_desc" "text", "p_cheque" "text", "p_memo" "text", "p_remark" "text", "p_col_channel" "text", "p_withdraw" numeric, "p_deposit" numeric, "p_balance" numeric, "p_counterparty" "text", "p_branch" "text", "p_location" "text", "p_terminal" "text", "p_narrative" "text") FROM "anon";

GRANT ALL ON FUNCTION "public"."get_transactions_v2"("p_type" "text", "p_channel" "text", "p_date_from" "text", "p_date_to" "text", "p_search" "text", "p_desc" "text", "p_cheque" "text", "p_memo" "text", "p_remark" "text", "p_col_channel" "text", "p_withdraw" numeric, "p_deposit" numeric, "p_balance" numeric, "p_counterparty" "text", "p_branch" "text", "p_location" "text", "p_terminal" "text", "p_narrative" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_transactions_v2"("p_type" "text", "p_channel" "text", "p_date_from" "text", "p_date_to" "text", "p_search" "text", "p_desc" "text", "p_cheque" "text", "p_memo" "text", "p_remark" "text", "p_col_channel" "text", "p_withdraw" numeric, "p_deposit" numeric, "p_balance" numeric, "p_counterparty" "text", "p_branch" "text", "p_location" "text", "p_terminal" "text", "p_narrative" "text") TO "service_role";

COMMIT;
