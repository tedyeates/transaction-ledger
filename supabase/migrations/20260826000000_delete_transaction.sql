-- Migration: delete_transaction RPC (admin-only, destructive action)
--
-- Adds an admin-only hard delete for a single transaction row, following
-- the same SECURITY DEFINER + explicit role-check pattern established by
-- update_remark / toggle_highlight and hardened further by
-- 20260822080000_rpc_authz_hardening.sql (anon/PUBLIC revoked by default,
-- authenticated + service_role explicitly granted).

BEGIN;

CREATE OR REPLACE FUNCTION "public"."delete_transaction"("tx_id" bigint) RETURNS "void"
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

  DELETE FROM transactions WHERE id = tx_id;
END;
$$;

ALTER FUNCTION "public"."delete_transaction"("tx_id" bigint) OWNER TO "postgres";

-- New function defaults to PUBLIC EXECUTE unless explicitly revoked (see
-- 20260822080000_rpc_authz_hardening.sql notes) — revoke PUBLIC/anon here
-- too rather than relying on that migration having already run first.
REVOKE ALL ON FUNCTION "public"."delete_transaction"("tx_id" bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."delete_transaction"("tx_id" bigint) FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."delete_transaction"("tx_id" bigint) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."delete_transaction"("tx_id" bigint) TO "service_role";

COMMIT;
