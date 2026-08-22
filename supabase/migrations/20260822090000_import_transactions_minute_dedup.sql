-- Migration: Compare transaction existence at minute granularity during imports (#24),
-- and accept the new statement-v2 fields on every import (#26).
--
-- ADR 0001's first-upload-wins timestamp-existence posture remains unchanged.
-- New exports include seconds while historical data contains minutes, so a
-- database minute now blocks every incoming timestamp within that minute.
--
-- effective_date fix (#26): the client-side parser (src/lib/csv.js) now
-- normalises effective_date to ISO YYYY-MM-DD for both statement formats
-- before calling this RPC — thai_legacy converts Buddhist-era text itself,
-- english_v2 is already Gregorian. This function therefore casts the
-- incoming text straight to date and no longer calls
-- parse_legacy_effective_date, which only ever understood Buddhist-era text
-- and would reject a Gregorian year (e.g. raise on 2026 as "not
-- Buddhist-era"). parse_legacy_effective_date remains in place solely for
-- the one-time ALTER COLUMN backfill performed in the statement-schema
-- migration; it is not invoked here.
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
      (r->>'tx_datetime')::timestamptz AS tx_datetime,
      (r->>'effective_date')::date AS effective_date,
      r->>'description' AS description,
      r->>'cheque_number' AS cheque_number,
      (r->>'withdraw')::numeric AS withdraw,
      (r->>'deposit')::numeric AS deposit,
      (r->>'balance')::numeric AS balance,
      r->>'channel' AS channel,
      r->>'type' AS type,
      r->>'branch' AS branch,
      r->>'location' AS location,
      r->>'terminal_id' AS terminal_id,
      r->>'narrative' AS narrative,
      r->>'counterparty_name' AS counterparty_name,
      r->>'counterparty_account' AS counterparty_account,
      COALESCE(r->>'currency', 'THB') AS currency,
      (r->>'fx_rate')::numeric AS fx_rate,
      COALESCE(r->>'statement_format', 'thai_legacy') AS statement_format
    FROM jsonb_array_elements(rows) AS r
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
      statement_format
    )
    SELECT
      tx_datetime, effective_date, description, cheque_number,
      withdraw, deposit, balance, channel, type,
      branch, location, terminal_id, narrative,
      counterparty_name, counterparty_account, currency, fx_rate,
      statement_format
    FROM to_insert
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM inserted;

  v_skipped := v_total - v_inserted;

  RETURN jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped);
END;
$$;
