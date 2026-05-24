


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."get_latest_balance"() RETURNS numeric
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role
  FROM user_roles
  WHERE user_id = auth.uid();

  IF v_role != 'admin' THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN (
    SELECT balance
    FROM transactions
    ORDER BY tx_datetime DESC, id ASC
    LIMIT 1
  );
END;$$;


ALTER FUNCTION "public"."get_latest_balance"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_transaction_stats"("p_type" "text" DEFAULT NULL::"text", "p_channel" "text" DEFAULT NULL::"text", "p_date_from" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_date_to" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_search" "text" DEFAULT NULL::"text") RETURNS TABLE("total_count" bigint, "total_withdraws" numeric, "total_deposits" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT
    COUNT(*)::bigint,
    COALESCE(SUM(withdraw) FILTER (WHERE type = 'withdrawal'), 0),
    COALESCE(SUM(deposit)  FILTER (WHERE type = 'income'), 0)
  FROM transactions
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
    ));
$$;


ALTER FUNCTION "public"."get_transaction_stats"("p_type" "text", "p_channel" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_search" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_transaction_stats_v2"("p_type" "text" DEFAULT NULL::"text", "p_channel" "text" DEFAULT NULL::"text", "p_date_from" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_date_to" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_search" "text" DEFAULT NULL::"text", "p_desc" "text" DEFAULT NULL::"text", "p_cheque" "text" DEFAULT NULL::"text", "p_memo" "text" DEFAULT NULL::"text", "p_remark" "text" DEFAULT NULL::"text") RETURNS TABLE("total_count" bigint, "total_withdraws" numeric, "total_deposits" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT
    COUNT(*)::bigint,
    COALESCE(SUM(withdraw) FILTER (WHERE type = 'withdrawal'), 0),
    COALESCE(SUM(deposit)  FILTER (WHERE type = 'income'), 0)
  FROM transactions
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
    AND (p_remark IS NULL OR remark        ILIKE '%' || p_remark || '%');
$$;


ALTER FUNCTION "public"."get_transaction_stats_v2"("p_type" "text", "p_channel" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_search" "text", "p_desc" "text", "p_cheque" "text", "p_memo" "text", "p_remark" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_transaction_stats_v2"("p_type" "text" DEFAULT NULL::"text", "p_channel" "text" DEFAULT NULL::"text", "p_date_from" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_date_to" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_search" "text" DEFAULT NULL::"text", "p_desc" "text" DEFAULT NULL::"text", "p_cheque" "text" DEFAULT NULL::"text", "p_memo" "text" DEFAULT NULL::"text", "p_remark" "text" DEFAULT NULL::"text", "p_col_channel" "text" DEFAULT NULL::"text", "p_withdraw" numeric DEFAULT NULL::numeric, "p_deposit" numeric DEFAULT NULL::numeric, "p_balance" numeric DEFAULT NULL::numeric) RETURNS TABLE("total_count" bigint, "total_withdraws" numeric, "total_deposits" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT
    COUNT(*)::bigint,
    COALESCE(SUM(withdraw) FILTER (WHERE type = 'withdrawal'), 0),
    COALESCE(SUM(deposit)  FILTER (WHERE type = 'income'), 0)
  FROM transactions
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
    AND (p_balance     IS NULL OR balance       = p_balance);
$$;


ALTER FUNCTION "public"."get_transaction_stats_v2"("p_type" "text", "p_channel" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_search" "text", "p_desc" "text", "p_cheque" "text", "p_memo" "text", "p_remark" "text", "p_col_channel" "text", "p_withdraw" numeric, "p_deposit" numeric, "p_balance" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_transactions"() RETURNS TABLE("id" bigint, "tx_datetime" timestamp with time zone, "effective_date" "text", "description" "text", "cheque_number" "text", "withdraw" numeric, "deposit" numeric, "balance" numeric, "channel" "text", "memo" "text", "type" "text", "imported_at" timestamp with time zone, "updated_at" timestamp with time zone, "remark" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT
    t.id,
    t.tx_datetime,
    t.effective_date,
    t.description,
    t.cheque_number,
    t.withdraw,
    t.deposit,
    -- Mask balance for non-admin users
    CASE
      WHEN EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = auth.uid()
        AND role = 'admin'
      )
      THEN t.balance
      ELSE NULL
    END AS balance,
    t.channel,
    t.memo,
    t.type,
    t.imported_at,
    t.updated_at,
    -- Mask remark for non-admin users
    CASE
      WHEN EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = auth.uid()
        AND role = 'admin'
      )
      THEN t.remark
      ELSE NULL
    END AS remark
  FROM transactions t
  WHERE EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND (
      role = 'admin'
      OR (role = 'withdrawal' AND t.type = 'withdrawal')
      OR (role = 'income'     AND t.type = 'income')
    )
  );
$$;


ALTER FUNCTION "public"."get_transactions"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" bigint NOT NULL,
    "tx_datetime" timestamp with time zone NOT NULL,
    "effective_date" "text",
    "description" "text",
    "cheque_number" "text",
    "withdraw" numeric(18,2),
    "deposit" numeric(18,2),
    "balance" numeric(18,2),
    "channel" "text",
    "memo" "text",
    "type" "text" NOT NULL,
    "imported_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "remark" "text",
    CONSTRAINT "transactions_type_check" CHECK (("type" = ANY (ARRAY['withdrawal'::"text", 'income'::"text"])))
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."transactions"."remark" IS 'Admin comment on transaction';



CREATE OR REPLACE FUNCTION "public"."get_transactions_v2"("p_type" "text" DEFAULT NULL::"text", "p_channel" "text" DEFAULT NULL::"text", "p_date_from" "text" DEFAULT NULL::"text", "p_date_to" "text" DEFAULT NULL::"text", "p_search" "text" DEFAULT NULL::"text", "p_desc" "text" DEFAULT NULL::"text", "p_cheque" "text" DEFAULT NULL::"text", "p_memo" "text" DEFAULT NULL::"text", "p_remark" "text" DEFAULT NULL::"text") RETURNS SETOF "public"."transactions"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT * FROM transactions
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
    AND (p_remark IS NULL OR remark        ILIKE '%' || p_remark || '%');
$$;


ALTER FUNCTION "public"."get_transactions_v2"("p_type" "text", "p_channel" "text", "p_date_from" "text", "p_date_to" "text", "p_search" "text", "p_desc" "text", "p_cheque" "text", "p_memo" "text", "p_remark" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_transactions_v2"("p_type" "text" DEFAULT NULL::"text", "p_channel" "text" DEFAULT NULL::"text", "p_date_from" "text" DEFAULT NULL::"text", "p_date_to" "text" DEFAULT NULL::"text", "p_search" "text" DEFAULT NULL::"text", "p_desc" "text" DEFAULT NULL::"text", "p_cheque" "text" DEFAULT NULL::"text", "p_memo" "text" DEFAULT NULL::"text", "p_remark" "text" DEFAULT NULL::"text", "p_col_channel" "text" DEFAULT NULL::"text", "p_withdraw" numeric DEFAULT NULL::numeric, "p_deposit" numeric DEFAULT NULL::numeric, "p_balance" numeric DEFAULT NULL::numeric) RETURNS SETOF "public"."transactions"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT * FROM transactions t
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


CREATE OR REPLACE FUNCTION "public"."import_transactions"("rows" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Only allow admin
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  INSERT INTO transactions (
    tx_datetime, effective_date, description, cheque_number,
    withdraw, deposit, balance, channel, type
  )
  SELECT
    (r->>'tx_datetime')::timestamptz,
    r->>'effective_date',
    r->>'description',
    r->>'cheque_number',
    (r->>'withdraw')::numeric,
    (r->>'deposit')::numeric,
    (r->>'balance')::numeric,
    r->>'channel',
    r->>'type'
  FROM jsonb_array_elements(rows) AS r
  ON CONFLICT (tx_datetime, balance) DO NOTHING;
END;
$$;


ALTER FUNCTION "public"."import_transactions"("rows" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_memo"("tx_id" bigint, "new_memo" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Verify caller is a withdrawal or income user
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role IN ('withdrawal', 'income')
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  UPDATE transactions
  SET memo = new_memo
  WHERE id = tx_id
  AND (
    (type = 'withdrawal' AND EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'withdrawal'
    ))
    OR
    (type = 'income' AND EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'income'
    ))
  );
END;
$$;


ALTER FUNCTION "public"."update_memo"("tx_id" bigint, "new_memo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_remark"("tx_id" bigint, "new_remark" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Verify caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  UPDATE transactions
  SET remark = new_remark
  WHERE id = tx_id;
END;
$$;


ALTER FUNCTION "public"."update_remark"("tx_id" bigint, "new_remark" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."transactions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."transactions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."transactions_id_seq" OWNED BY "public"."transactions"."id";



CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    CONSTRAINT "user_roles_role_check" CHECK (("role" = ANY (ARRAY['withdrawal'::"text", 'income'::"text", 'admin'::"text"])))
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."transactions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."transactions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id");



CREATE INDEX "idx_tx_balance" ON "public"."transactions" USING "btree" ("balance");



CREATE INDEX "idx_tx_channel" ON "public"."transactions" USING "btree" ("channel");



CREATE INDEX "idx_tx_date" ON "public"."transactions" USING "btree" ("tx_datetime" DESC);



CREATE INDEX "idx_tx_type" ON "public"."transactions" USING "btree" ("type");



CREATE UNIQUE INDEX "idx_tx_unique" ON "public"."transactions" USING "btree" ("tx_datetime", "balance");



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tx_insert_admin" ON "public"."transactions" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text")))));



CREATE POLICY "tx_select_admin" ON "public"."transactions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text")))));



CREATE POLICY "tx_select_income" ON "public"."transactions" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'income'::"text")))) AND ("type" = 'income'::"text")));



CREATE POLICY "tx_select_withdrawal" ON "public"."transactions" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'withdrawal'::"text")))) AND ("type" = 'withdrawal'::"text")));



CREATE POLICY "tx_update_admin" ON "public"."transactions" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text")))));



CREATE POLICY "tx_update_income" ON "public"."transactions" FOR UPDATE TO "authenticated" USING ((("type" = 'income'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'income'::"text")))))) WITH CHECK ((("type" = 'income'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'income'::"text"))))));



CREATE POLICY "tx_update_withdrawal" ON "public"."transactions" FOR UPDATE TO "authenticated" USING ((("type" = 'withdrawal'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'withdrawal'::"text")))))) WITH CHECK ((("type" = 'withdrawal'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'withdrawal'::"text"))))));



ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_roles_self" ON "public"."user_roles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."get_latest_balance"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_latest_balance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_latest_balance"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_transaction_stats"("p_type" "text", "p_channel" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_search" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_transaction_stats"("p_type" "text", "p_channel" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_search" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_transaction_stats"("p_type" "text", "p_channel" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_search" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_transaction_stats_v2"("p_type" "text", "p_channel" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_search" "text", "p_desc" "text", "p_cheque" "text", "p_memo" "text", "p_remark" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_transaction_stats_v2"("p_type" "text", "p_channel" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_search" "text", "p_desc" "text", "p_cheque" "text", "p_memo" "text", "p_remark" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_transaction_stats_v2"("p_type" "text", "p_channel" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_search" "text", "p_desc" "text", "p_cheque" "text", "p_memo" "text", "p_remark" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_transaction_stats_v2"("p_type" "text", "p_channel" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_search" "text", "p_desc" "text", "p_cheque" "text", "p_memo" "text", "p_remark" "text", "p_col_channel" "text", "p_withdraw" numeric, "p_deposit" numeric, "p_balance" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."get_transaction_stats_v2"("p_type" "text", "p_channel" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_search" "text", "p_desc" "text", "p_cheque" "text", "p_memo" "text", "p_remark" "text", "p_col_channel" "text", "p_withdraw" numeric, "p_deposit" numeric, "p_balance" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_transaction_stats_v2"("p_type" "text", "p_channel" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_search" "text", "p_desc" "text", "p_cheque" "text", "p_memo" "text", "p_remark" "text", "p_col_channel" "text", "p_withdraw" numeric, "p_deposit" numeric, "p_balance" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_transactions"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_transactions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_transactions"() TO "service_role";



GRANT ALL ON TABLE "public"."transactions" TO "service_role";
GRANT INSERT ON TABLE "public"."transactions" TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_transactions_v2"("p_type" "text", "p_channel" "text", "p_date_from" "text", "p_date_to" "text", "p_search" "text", "p_desc" "text", "p_cheque" "text", "p_memo" "text", "p_remark" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_transactions_v2"("p_type" "text", "p_channel" "text", "p_date_from" "text", "p_date_to" "text", "p_search" "text", "p_desc" "text", "p_cheque" "text", "p_memo" "text", "p_remark" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_transactions_v2"("p_type" "text", "p_channel" "text", "p_date_from" "text", "p_date_to" "text", "p_search" "text", "p_desc" "text", "p_cheque" "text", "p_memo" "text", "p_remark" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_transactions_v2"("p_type" "text", "p_channel" "text", "p_date_from" "text", "p_date_to" "text", "p_search" "text", "p_desc" "text", "p_cheque" "text", "p_memo" "text", "p_remark" "text", "p_col_channel" "text", "p_withdraw" numeric, "p_deposit" numeric, "p_balance" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."get_transactions_v2"("p_type" "text", "p_channel" "text", "p_date_from" "text", "p_date_to" "text", "p_search" "text", "p_desc" "text", "p_cheque" "text", "p_memo" "text", "p_remark" "text", "p_col_channel" "text", "p_withdraw" numeric, "p_deposit" numeric, "p_balance" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_transactions_v2"("p_type" "text", "p_channel" "text", "p_date_from" "text", "p_date_to" "text", "p_search" "text", "p_desc" "text", "p_cheque" "text", "p_memo" "text", "p_remark" "text", "p_col_channel" "text", "p_withdraw" numeric, "p_deposit" numeric, "p_balance" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."import_transactions"("rows" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."import_transactions"("rows" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."import_transactions"("rows" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_memo"("tx_id" bigint, "new_memo" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_memo"("tx_id" bigint, "new_memo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_memo"("tx_id" bigint, "new_memo" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_remark"("tx_id" bigint, "new_remark" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_remark"("tx_id" bigint, "new_remark" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_remark"("tx_id" bigint, "new_remark" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";


















GRANT ALL ON SEQUENCE "public"."transactions_id_seq" TO "service_role";
GRANT USAGE ON SEQUENCE "public"."transactions_id_seq" TO "authenticated";



GRANT ALL ON TABLE "public"."user_roles" TO "service_role";
GRANT SELECT ON TABLE "public"."user_roles" TO "authenticated";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































drop extension if exists "pg_net";

revoke delete on table "public"."transactions" from "anon";

revoke insert on table "public"."transactions" from "anon";

revoke references on table "public"."transactions" from "anon";

revoke select on table "public"."transactions" from "anon";

revoke trigger on table "public"."transactions" from "anon";

revoke truncate on table "public"."transactions" from "anon";

revoke update on table "public"."transactions" from "anon";

revoke delete on table "public"."transactions" from "authenticated";

revoke references on table "public"."transactions" from "authenticated";

revoke select on table "public"."transactions" from "authenticated";

revoke trigger on table "public"."transactions" from "authenticated";

revoke truncate on table "public"."transactions" from "authenticated";

revoke update on table "public"."transactions" from "authenticated";

revoke delete on table "public"."user_roles" from "anon";

revoke insert on table "public"."user_roles" from "anon";

revoke references on table "public"."user_roles" from "anon";

revoke select on table "public"."user_roles" from "anon";

revoke trigger on table "public"."user_roles" from "anon";

revoke truncate on table "public"."user_roles" from "anon";

revoke update on table "public"."user_roles" from "anon";

revoke delete on table "public"."user_roles" from "authenticated";

revoke insert on table "public"."user_roles" from "authenticated";

revoke references on table "public"."user_roles" from "authenticated";

revoke trigger on table "public"."user_roles" from "authenticated";

revoke truncate on table "public"."user_roles" from "authenticated";

revoke update on table "public"."user_roles" from "authenticated";


