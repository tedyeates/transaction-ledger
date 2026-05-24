-- Add highlight column
ALTER TABLE transactions ADD COLUMN is_highlighted BOOLEAN NOT NULL DEFAULT false;

-- Create toggle function
CREATE OR REPLACE FUNCTION toggle_highlight(tx_ids BIGINT[], highlighted BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  UPDATE transactions
  SET is_highlighted = highlighted
  WHERE id = ANY(tx_ids);
END;
$$;

-- Grant execute to authenticated role
GRANT EXECUTE ON FUNCTION toggle_highlight(BIGINT[], BOOLEAN) TO authenticated;
