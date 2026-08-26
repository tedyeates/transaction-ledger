-- Migration: Preserve incoming JSON array order through import_transactions'
-- insert (#31).
--
-- jsonb_array_elements' emission order is not guaranteed to survive through a
-- chain of CTEs into a final INSERT ... SELECT without an explicit ORDER BY.
-- When a CSV import contains multiple rows sharing an identical tx_datetime
-- (e.g. several 'CHEQUE AUTOPOST (Sys.Gen)' postings batched at the same
-- second), the bigserial id each row receives -- and therefore their
-- relative order in the UI, which sorts tx_datetime DESC, id ASC as a
-- tiebreak (see src/hooks/useTransactions.js) -- was planner-dependent and
-- could differ between environments (e.g. local vs prod Postgres).
--
-- This migration adds `WITH ORDINALITY` to the jsonb_array_elements call in
-- the `incoming` CTE, carries the resulting `ord` column through `incoming`
-- and `to_insert`, and appends `ORDER BY ord` to the final
-- INSERT ... SELECT, so rows are always inserted in the exact order they
-- appeared in the incoming JSON array (i.e. CSV row order, since the client
-- parses CSV rows into that array in file order).
--
-- ADR 0001's first-upload-wins timestamp-existence posture is unchanged, as
-- is the minute-granularity dedup logic from #24: rows within one payload
-- are still NOT deduplicated against each other, only against rows already
-- in the database.
CREATE OR REPLACE FUNCTION "public"."import_transactions"("rows" "jsonb")
RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
  v_inserted int;
  v_skipped int;
  v_total int;
BEGIN
  -- Only allow admin
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- Count total incoming rows
  SELECT count(*) INTO v_total FROM jsonb_array_elements(rows);

  -- Compare only against rows already in the database. This deliberately does
  -- not deduplicate rows within one payload, so bank postings sharing a second
  -- (or minute) are all retained on their first import.
  WITH incoming AS (
    SELECT
      r.ord,
      (r.value->>'tx_datetime')::timestamptz AS tx_datetime,
      (r.value->>'effective_date')::date AS effective_date,
      r.value->>'description' AS description,
      r.value->>'cheque_number' AS cheque_number,
      (r.value->>'withdraw')::numeric AS withdraw,
      (r.value->>'deposit')::numeric AS deposit,
      (r.value->>'balance')::numeric AS balance,
      r.value->>'channel' AS channel,
      r.value->>'type' AS type,
      r.value->>'branch' AS branch,
      r.value->>'location' AS location,
      r.value->>'terminal_id' AS terminal_id,
      r.value->>'narrative' AS narrative,
      r.value->>'counterparty_name' AS counterparty_name,
      r.value->>'counterparty_account' AS counterparty_account,
      COALESCE(r.value->>'currency', 'THB') AS currency,
      (r.value->>'fx_rate')::numeric AS fx_rate,
      COALESCE(r.value->>'statement_format', 'thai_legacy') AS statement_format,
      (r.value->>'statement_exported_at')::timestamptz AS statement_exported_at
    FROM jsonb_array_elements(rows) WITH ORDINALITY AS r(value, ord)
  ),
  existing_minutes AS (
    SELECT DISTINCT date_trunc('minute', t.tx_datetime) AS tx_minute
    FROM transactions t
    WHERE date_trunc('minute', t.tx_datetime) IN (
      SELECT DISTINCT date_trunc('minute', i.tx_datetime)
      FROM incoming i
    )
  ),
  to_insert AS (
    SELECT i.*
    FROM incoming i
    WHERE NOT EXISTS (
      SELECT 1
      FROM existing_minutes em
      WHERE em.tx_minute = date_trunc('minute', i.tx_datetime)
    )
  ),
  inserted AS (
    INSERT INTO transactions (
      tx_datetime, effective_date, description, cheque_number,
      withdraw, deposit, balance, channel, type,
      branch, location, terminal_id, narrative,
      counterparty_name, counterparty_account, currency, fx_rate,
      statement_format, statement_exported_at
    )
    SELECT
      tx_datetime, effective_date, description, cheque_number,
      withdraw, deposit, balance, channel, type,
      branch, location, terminal_id, narrative,
      counterparty_name, counterparty_account, currency, fx_rate,
      statement_format, statement_exported_at
    FROM to_insert
    ORDER BY ord
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM inserted;

  v_skipped := v_total - v_inserted;

  RETURN jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped);
END;
$$;
