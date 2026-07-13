-- Flag duplicate rows: same (tx_datetime, withdraw/deposit, type) appearing more than once
-- Run against production to identify rows that need manual dedup before migration

SELECT 
  t.id,
  t.tx_datetime,
  t.withdraw,
  t.deposit,
  t.type,
  t.balance,
  t.channel,
  t.description,
  t.memo,
  t.remark,
  t.is_highlighted
FROM transactions t
JOIN (
  SELECT tx_datetime, COALESCE(withdraw, 0) AS w, COALESCE(deposit, 0) AS d, type
  FROM transactions
  GROUP BY tx_datetime, COALESCE(withdraw, 0), COALESCE(deposit, 0), type
  HAVING COUNT(*) > 1
) dupes 
  ON t.tx_datetime = dupes.tx_datetime
  AND COALESCE(t.withdraw, 0) = dupes.w
  AND COALESCE(t.deposit, 0) = dupes.d
  AND t.type = dupes.type
ORDER BY t.tx_datetime, t.id;
