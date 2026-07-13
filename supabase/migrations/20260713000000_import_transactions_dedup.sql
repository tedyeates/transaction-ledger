-- Migration: Replace import_transactions with timestamp-existence dedup logic
-- Also drops the old unique index that enforced (tx_datetime, balance) uniqueness

-- 1. Drop the unique index
DROP INDEX IF EXISTS "public"."idx_tx_unique";

-- 2. Replace import_transactions RPC with new logic
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

  -- Insert only rows whose tx_datetime does NOT already exist in DB
  WITH incoming AS (
    SELECT
      (r->>'tx_datetime')::timestamptz AS tx_datetime,
      r->>'effective_date' AS effective_date,
      r->>'description' AS description,
      r->>'cheque_number' AS cheque_number,
      (r->>'withdraw')::numeric AS withdraw,
      (r->>'deposit')::numeric AS deposit,
      (r->>'balance')::numeric AS balance,
      r->>'channel' AS channel,
      r->>'type' AS type
    FROM jsonb_array_elements(rows) AS r
  ),
  existing_timestamps AS (
    SELECT DISTINCT t.tx_datetime
    FROM transactions t
    WHERE t.tx_datetime IN (SELECT DISTINCT incoming.tx_datetime FROM incoming)
  ),
  to_insert AS (
    SELECT i.*
    FROM incoming i
    WHERE i.tx_datetime NOT IN (SELECT et.tx_datetime FROM existing_timestamps et)
  ),
  inserted AS (
    INSERT INTO transactions (
      tx_datetime, effective_date, description, cheque_number,
      withdraw, deposit, balance, channel, type
    )
    SELECT
      tx_datetime, effective_date, description, cheque_number,
      withdraw, deposit, balance, channel, type
    FROM to_insert
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM inserted;

  v_skipped := v_total - v_inserted;

  RETURN jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped);
END;
$$;
