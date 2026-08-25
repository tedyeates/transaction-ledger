-- Statement schema expansion and legacy effective-date conversion (#25)
-- Preserve existing annotations while adding fields carried by English statements.

BEGIN;

-- Parse only known Buddhist-era legacy date formats. Any non-null unrecognised
-- value raises, which aborts this migration instead of silently losing data.
CREATE FUNCTION public.parse_legacy_effective_date(p_value text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
DECLARE
  v_value text := btrim(p_value);
  v_match text[];
  v_day integer;
  v_month integer;
  v_buddhist_year integer;
  v_month_token text;
BEGIN
  IF v_value ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}$' THEN
    v_match := regexp_match(v_value, '^([0-9]{1,2})/([0-9]{1,2})/([0-9]{2,4})$');
    v_day := v_match[1]::integer;
    v_month := v_match[2]::integer;
    v_buddhist_year := v_match[3]::integer;

    -- Thai exports occasionally abbreviate the Buddhist year to two digits.
    IF length(v_match[3]) = 2 THEN
      v_buddhist_year := 2500 + v_buddhist_year;
    END IF;
  ELSIF v_value ~ '^[0-9]{1,2}[[:space:]]+[^[:space:]]+[[:space:]]+[0-9]{4}$' THEN
    v_match := regexp_match(v_value, '^([0-9]{1,2})[[:space:]]+([^[:space:]]+)[[:space:]]+([0-9]{4})$');
    v_day := v_match[1]::integer;
    v_month_token := v_match[2];
    v_buddhist_year := v_match[3]::integer;
    v_month := CASE v_month_token
      WHEN 'ม.ค.' THEN 1 WHEN 'มกราคม' THEN 1
      WHEN 'ก.พ.' THEN 2 WHEN 'กุมภาพันธ์' THEN 2
      WHEN 'มี.ค.' THEN 3 WHEN 'มีนาคม' THEN 3
      WHEN 'เม.ย.' THEN 4 WHEN 'เมษายน' THEN 4
      WHEN 'พ.ค.' THEN 5 WHEN 'พฤษภาคม' THEN 5
      WHEN 'มิ.ย.' THEN 6 WHEN 'มิถุนายน' THEN 6
      WHEN 'ก.ค.' THEN 7 WHEN 'กรกฎาคม' THEN 7
      WHEN 'ส.ค.' THEN 8 WHEN 'สิงหาคม' THEN 8
      WHEN 'ก.ย.' THEN 9 WHEN 'กันยายน' THEN 9
      WHEN 'ต.ค.' THEN 10 WHEN 'ตุลาคม' THEN 10
      WHEN 'พ.ย.' THEN 11 WHEN 'พฤศจิกายน' THEN 11
      WHEN 'ธ.ค.' THEN 12 WHEN 'ธันวาคม' THEN 12
      ELSE NULL
    END;

    IF v_month IS NULL THEN
      RAISE EXCEPTION 'Unsupported Thai month in effective_date: %', p_value
        USING ERRCODE = '22007';
    END IF;
  ELSIF v_value ~* '^[0-9]{1,2}-[A-Za-z]{3}-[0-9]{2,4}$' THEN
    v_match := regexp_match(v_value, '^([0-9]{1,2})-([A-Za-z]{3})-([0-9]{2,4})$');
    v_day := v_match[1]::integer;
    v_month_token := lower(v_match[2]);
    v_buddhist_year := v_match[3]::integer;
    v_month := CASE v_month_token
      WHEN 'jan' THEN 1 WHEN 'feb' THEN 2 WHEN 'mar' THEN 3 WHEN 'apr' THEN 4
      WHEN 'may' THEN 5 WHEN 'jun' THEN 6 WHEN 'jul' THEN 7 WHEN 'aug' THEN 8
      WHEN 'sep' THEN 9 WHEN 'oct' THEN 10 WHEN 'nov' THEN 11 WHEN 'dec' THEN 12
      ELSE NULL
    END;

    IF v_month IS NULL THEN
      RAISE EXCEPTION 'Unsupported month abbreviation in effective_date: %', p_value
        USING ERRCODE = '22007';
    END IF;

    -- This format (english_v2 export) uses a 2-digit Buddhist year.
    IF length(v_match[3]) = 2 THEN
      v_buddhist_year := 2500 + v_buddhist_year;
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported effective_date format: %', p_value
      USING ERRCODE = '22007';
  END IF;

  IF v_buddhist_year < 2400 THEN
    RAISE EXCEPTION 'effective_date must use a Buddhist-era year: %', p_value
      USING ERRCODE = '22007';
  END IF;

  RETURN make_date(v_buddhist_year - 543, v_month, v_day);
END;
$$;

ALTER TABLE public.transactions
  ADD COLUMN branch text,
  ADD COLUMN location text,
  ADD COLUMN terminal_id text,
  ADD COLUMN narrative text,
  ADD COLUMN counterparty_name text,
  ADD COLUMN counterparty_account text,
  ADD COLUMN currency text NOT NULL DEFAULT 'THB',
  ADD COLUMN fx_rate numeric,
  ADD COLUMN statement_format text NOT NULL DEFAULT 'thai_legacy',
  ADD COLUMN statement_exported_at timestamp with time zone,
  ADD COLUMN channel_code text,
  ADD COLUMN cheque_number_normalized text;

-- This invokes parse_legacy_effective_date for every non-null legacy value.
-- A parse failure aborts this transaction and retains text values unchanged.
ALTER TABLE public.transactions
  ALTER COLUMN effective_date TYPE date
  USING public.parse_legacy_effective_date(effective_date);

-- Backfill derived values while retaining raw bank values unmodified.
UPDATE public.transactions
SET
  channel_code = NULLIF(
    btrim(regexp_replace(upper(channel), '[^A-Z0-9]+', '_', 'g'), '_'),
    ''
  ),
  cheque_number_normalized = NULLIF(
    regexp_replace(btrim(cheque_number), '^0+', ''),
    ''
  );

-- Keep channel_code / cheque_number_normalized derived on every future insert
-- or update, not just this one-time backfill, so seed data and new imports
-- populate them the same way historical rows were backfilled above.
CREATE FUNCTION public.derive_transaction_normalised_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  NEW.channel_code := NULLIF(
    btrim(regexp_replace(upper(NEW.channel), '[^A-Z0-9]+', '_', 'g'), '_'),
    ''
  );
  NEW.cheque_number_normalized := NULLIF(
    regexp_replace(btrim(NEW.cheque_number), '^0+', ''),
    ''
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_derive_transaction_normalised_fields
  BEFORE INSERT OR UPDATE OF channel, cheque_number ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.derive_transaction_normalised_fields();

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE INDEX idx_transactions_counterparty_name
  ON public.transactions
  USING gin (counterparty_name extensions.gin_trgm_ops);

-- Kept (not dropped): import_transactions still receives raw Thai Buddhist-era
-- effective_date text from the client CSV parser and must convert it the same
-- way on every import now that the column is a real date type.
REVOKE ALL ON FUNCTION public.parse_legacy_effective_date(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.parse_legacy_effective_date(text) TO service_role;

COMMIT;
