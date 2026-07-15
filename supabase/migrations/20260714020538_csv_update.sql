-- Migration: Update bank-sourced fields from CSV re-import
-- Generated: 2026-07-14T02:05:38.750Z
-- Rows: 22
--
-- Only updates: balance, description, channel, effective_date, cheque_number
-- Preserves: id, memo, remark, is_highlighted, imported_at

BEGIN;

UPDATE public.transactions
  SET balance = 362614.66,
      description = 'รับเงินโอนจากบัญชีต่างธนาคาร',
      channel = 'MOB',
      effective_date = '08 ก.ค. 2569',
      cheque_number = NULL,
      updated_at = now()
  WHERE tx_datetime = '2026-07-08T10:35:00'
    AND COALESCE(withdraw, 0) = 0
    AND COALESCE(deposit, 0) = 51335.93
    AND type = 'income';

UPDATE public.transactions
  SET balance = 311278.73,
      description = 'ถอนเงินสด',
      channel = 'BR0202',
      effective_date = '08 ก.ค. 2569',
      cheque_number = '02933114',
      updated_at = now()
  WHERE tx_datetime = '2026-07-08T09:51:00'
    AND COALESCE(withdraw, 0) = 748
    AND COALESCE(deposit, 0) = 0
    AND type = 'withdrawal';

UPDATE public.transactions
  SET balance = 312026.73,
      description = 'รับเงินโอนจากบัญชีต่างธนาคาร',
      channel = 'IB',
      effective_date = '07 ก.ค. 2569',
      cheque_number = NULL,
      updated_at = now()
  WHERE tx_datetime = '2026-07-07T18:52:00'
    AND COALESCE(withdraw, 0) = 0
    AND COALESCE(deposit, 0) = 44940
    AND type = 'income';

UPDATE public.transactions
  SET balance = 267086.73,
      description = 'ฝากเช็คเรียกเก็บ',
      channel = 'BR0231',
      effective_date = '07 ก.ค. 2569',
      cheque_number = NULL,
      updated_at = now()
  WHERE tx_datetime = '2026-07-07T09:53:00'
    AND COALESCE(withdraw, 0) = 0
    AND COALESCE(deposit, 0) = 8988
    AND type = 'income';

UPDATE public.transactions
  SET balance = 258098.73,
      description = 'ฝากเช็คเรียกเก็บ',
      channel = 'BR0231',
      effective_date = '07 ก.ค. 2569',
      cheque_number = NULL,
      updated_at = now()
  WHERE tx_datetime = '2026-07-07T09:52:00'
    AND COALESCE(withdraw, 0) = 0
    AND COALESCE(deposit, 0) = 8424.75
    AND type = 'income';

UPDATE public.transactions
  SET balance = 249673.98,
      description = 'รับเงินโอนจากบัญชีต่างธนาคาร',
      channel = 'MOB',
      effective_date = '06 ก.ค. 2569',
      cheque_number = NULL,
      updated_at = now()
  WHERE tx_datetime = '2026-07-06T15:13:00'
    AND COALESCE(withdraw, 0) = 0
    AND COALESCE(deposit, 0) = 156220
    AND type = 'income';

UPDATE public.transactions
  SET balance = 93453.98,
      description = 'โอนเงินผ่าน SMART',
      channel = 'AUTO',
      effective_date = '06 ก.ค. 2569',
      cheque_number = NULL,
      updated_at = now()
  WHERE tx_datetime = '2026-07-06T14:02:00'
    AND COALESCE(withdraw, 0) = 0
    AND COALESCE(deposit, 0) = 96300
    AND type = 'income';

UPDATE public.transactions
  SET balance = -2846.02,
      description = 'รับเงินโอนจากบัญชีต่างธนาคาร',
      channel = 'MOB',
      effective_date = '06 ก.ค. 2569',
      cheque_number = NULL,
      updated_at = now()
  WHERE tx_datetime = '2026-07-06T13:43:00'
    AND COALESCE(withdraw, 0) = 0
    AND COALESCE(deposit, 0) = 24717
    AND type = 'income';

UPDATE public.transactions
  SET balance = -27563.02,
      description = 'รับเงินโอนจากบัญชีต่างธนาคาร',
      channel = 'MOB',
      effective_date = '06 ก.ค. 2569',
      cheque_number = NULL,
      updated_at = now()
  WHERE tx_datetime = '2026-07-06T12:19:00'
    AND COALESCE(withdraw, 0) = 0
    AND COALESCE(deposit, 0) = 14552
    AND type = 'income';

UPDATE public.transactions
  SET balance = -42115.02,
      description = 'รับเงินโอนจากบัญชีต่างธนาคาร',
      channel = 'MOB',
      effective_date = '06 ก.ค. 2569',
      cheque_number = NULL,
      updated_at = now()
  WHERE tx_datetime = '2026-07-06T11:33:00'
    AND COALESCE(withdraw, 0) = 0
    AND COALESCE(deposit, 0) = 9095
    AND type = 'income';

UPDATE public.transactions
  SET balance = -51210.02,
      description = 'ค่าธรรมเนียม',
      channel = 'AUTO',
      effective_date = '06 ก.ค. 2569',
      cheque_number = NULL,
      updated_at = now()
  WHERE tx_datetime = '2026-07-06T11:01:00'
    AND COALESCE(withdraw, 0) = 720
    AND COALESCE(deposit, 0) = 0
    AND type = 'withdrawal';

UPDATE public.transactions
  SET balance = -50490.02,
      description = 'รับเงินโอนจากบัญชีต่างธนาคาร',
      channel = 'MOB',
      effective_date = '06 ก.ค. 2569',
      cheque_number = NULL,
      updated_at = now()
  WHERE tx_datetime = '2026-07-06T10:42:00'
    AND COALESCE(withdraw, 0) = 0
    AND COALESCE(deposit, 0) = 21935
    AND type = 'income';

UPDATE public.transactions
  SET balance = -72425.02,
      description = 'ฝากเช็คเรียกเก็บ',
      channel = 'BR0231',
      effective_date = '06 ก.ค. 2569',
      cheque_number = NULL,
      updated_at = now()
  WHERE tx_datetime = '2026-07-06T10:01:00'
    AND COALESCE(withdraw, 0) = 0
    AND COALESCE(deposit, 0) = 21571.2
    AND type = 'income';

UPDATE public.transactions
  SET balance = -93996.22,
      description = 'ฝากเช็คเรียกเก็บ',
      channel = 'BR0231',
      effective_date = '06 ก.ค. 2569',
      cheque_number = NULL,
      updated_at = now()
  WHERE tx_datetime = '2026-07-06T10:01:00'
    AND COALESCE(withdraw, 0) = 0
    AND COALESCE(deposit, 0) = 44479.76
    AND type = 'income';

UPDATE public.transactions
  SET balance = -138475.98,
      description = 'โอนเงินผ่าน SMART',
      channel = 'AUTO',
      effective_date = '06 ก.ค. 2569',
      cheque_number = NULL,
      updated_at = now()
  WHERE tx_datetime = '2026-07-06T10:01:00'
    AND COALESCE(withdraw, 0) = 2059995.98
    AND COALESCE(deposit, 0) = 0
    AND type = 'withdrawal';

UPDATE public.transactions
  SET balance = 1921520,
      description = 'ฝากเช็คเรียกเก็บ',
      channel = 'BR0231',
      effective_date = '06 ก.ค. 2569',
      cheque_number = NULL,
      updated_at = now()
  WHERE tx_datetime = '2026-07-06T10:01:00'
    AND COALESCE(withdraw, 0) = 0
    AND COALESCE(deposit, 0) = 125939
    AND type = 'income';

UPDATE public.transactions
  SET balance = 1795581,
      description = 'รับเงินโอนจากบัญชีต่างธนาคาร',
      channel = 'MOB',
      effective_date = '05 ก.ค. 2569',
      cheque_number = NULL,
      updated_at = now()
  WHERE tx_datetime = '2026-07-05T14:35:00'
    AND COALESCE(withdraw, 0) = 0
    AND COALESCE(deposit, 0) = 45793.33
    AND type = 'income';

UPDATE public.transactions
  SET balance = 1749787.67,
      description = 'รับเงินโอนจากบัญชีต่างธนาคาร',
      channel = 'MOB',
      effective_date = '05 ก.ค. 2569',
      cheque_number = NULL,
      updated_at = now()
  WHERE tx_datetime = '2026-07-05T14:23:00'
    AND COALESCE(withdraw, 0) = 0
    AND COALESCE(deposit, 0) = 7490
    AND type = 'income';

UPDATE public.transactions
  SET balance = 1742297.67,
      description = 'รับเงินโอนจากบัญชีต่างธนาคาร',
      channel = 'MOB',
      effective_date = '04 ก.ค. 2569',
      cheque_number = NULL,
      updated_at = now()
  WHERE tx_datetime = '2026-07-04T16:56:00'
    AND COALESCE(withdraw, 0) = 0
    AND COALESCE(deposit, 0) = 21828
    AND type = 'income';

UPDATE public.transactions
  SET balance = 1720469.67,
      description = 'โอนเงินไป/มาจากบัญชีกระแสรายวัน',
      channel = 'BR1646',
      effective_date = '04 ก.ค. 2569',
      cheque_number = NULL,
      updated_at = now()
  WHERE tx_datetime = '2026-07-04T15:00:00'
    AND COALESCE(withdraw, 0) = 0
    AND COALESCE(deposit, 0) = 23219
    AND type = 'income';

UPDATE public.transactions
  SET balance = 1697250.67,
      description = 'รับเงินโอนจากบัญชีต่างธนาคาร',
      channel = 'MOB',
      effective_date = '03 ก.ค. 2569',
      cheque_number = NULL,
      updated_at = now()
  WHERE tx_datetime = '2026-07-03T16:20:00'
    AND COALESCE(withdraw, 0) = 0
    AND COALESCE(deposit, 0) = 10700
    AND type = 'income';

UPDATE public.transactions
  SET balance = 1686550.67,
      description = 'ชำระค่าสินค้า/บริการ',
      channel = 'CMS',
      effective_date = '01 ก.ค. 2569',
      cheque_number = NULL,
      updated_at = now()
  WHERE tx_datetime = '2026-07-01T04:01:00'
    AND COALESCE(withdraw, 0) = 0
    AND COALESCE(deposit, 0) = 4992
    AND type = 'income';

COMMIT;
