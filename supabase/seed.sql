-- =============================================================================
-- SEED DATA: Thai Bank Ledger (local development)
-- =============================================================================
-- Test accounts (password for all: "password123")
-- =============================================================================

-- Create auth users
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, confirmation_token, recovery_token, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, email_change, email_change_token_new, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@test.com',    crypt('password123', gen_salt('bf')), now(), now(), now(), '', '', '{"provider":"email","providers":["email"]}', '{}', false, false, '', '', '', '', '', ''),
  ('aaaaaaaa-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'withdraw@test.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '', '{"provider":"email","providers":["email"]}', '{}', false, false, '', '', '', '', '', ''),
  ('aaaaaaaa-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'income@test.com',   crypt('password123', gen_salt('bf')), now(), now(), now(), '', '', '{"provider":"email","providers":["email"]}', '{}', false, false, '', '', '', '', '', '');

-- Create identities (required for email login to work)
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001', 'email', 'admin@test.com'),    'email', now(), now(), now()),
  (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', jsonb_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000002', 'email', 'withdraw@test.com'), 'email', now(), now(), now()),
  (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000003', jsonb_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000003', 'email', 'income@test.com'),   'email', now(), now(), now());

-- Assign roles
INSERT INTO public.user_roles (user_id, role) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'withdrawal'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'income');

-- =============================================================================
-- TRANSACTIONS
-- Mix of withdrawal + income, various channels, spread over ~3 months
-- Realistic Kasikorn Bank patterns: K PLUS, K-Cyber, Counter, ATM, etc.
-- =============================================================================

INSERT INTO public.transactions (tx_datetime, effective_date, description, cheque_number, withdraw, deposit, balance, channel, memo, remark, type, is_highlighted) VALUES
-- === May 2026 Withdrawals ===
('2026-05-01 09:15:00+07', '01/05/2569', 'โอนเงิน นาย สมชาย ใจดี', NULL, 15000.00, NULL, 985000.00, 'K PLUS', 'ค่าจ้างรายวัน', NULL, 'withdrawal', false),
('2026-05-02 10:30:00+07', '02/05/2569', 'ชำระค่าไฟฟ้า กฟน.', NULL, 4523.75, NULL, 980476.25, 'K PLUS', NULL, NULL, 'withdrawal', false),
('2026-05-03 14:00:00+07', '03/05/2569', 'โอนเงิน บจก. สยามซัพพลาย', NULL, 82500.00, NULL, 897976.25, 'K-Cyber', 'ค่าวัสดุก่อสร้าง', 'PO-2026-0451', 'withdrawal', true),
('2026-05-05 08:45:00+07', '05/05/2569', 'ชำระค่าน้ำประปา', NULL, 1890.50, NULL, 896085.75, 'K PLUS', NULL, NULL, 'withdrawal', false),
('2026-05-07 11:20:00+07', '07/05/2569', 'เบิกเงินสด', NULL, 50000.00, NULL, 846085.75, 'ATM', 'เงินสดย่อย สำนักงาน', NULL, 'withdrawal', false),
('2026-05-08 16:10:00+07', '08/05/2569', 'โอนเงิน นาง สมหญิง รักษ์ดี', NULL, 25000.00, NULL, 821085.75, 'K PLUS', 'ค่าจ้างพนักงาน', NULL, 'withdrawal', false),
('2026-05-10 09:00:00+07', '10/05/2569', 'ชำระค่าโทรศัพท์ AIS', NULL, 2499.00, NULL, 818586.75, 'K PLUS', NULL, NULL, 'withdrawal', false),
('2026-05-12 13:45:00+07', '12/05/2569', 'โอนเงิน บจก. ไทยทรานสปอร์ต', '005892', 120000.00, NULL, 698586.75, 'Counter', 'ค่าขนส่งสินค้า', NULL, 'withdrawal', true),
('2026-05-14 10:20:00+07', '14/05/2569', 'ค่าธรรมเนียมโอน', NULL, 25.00, NULL, 698561.75, 'K PLUS', NULL, NULL, 'withdrawal', false),
('2026-05-15 15:30:00+07', '15/05/2569', 'โอนเงิน นาย วิชัย แสนดี', NULL, 18000.00, NULL, 680561.75, 'K PLUS', 'ค่าแรงช่างไฟ', NULL, 'withdrawal', false),
('2026-05-17 08:00:00+07', '17/05/2569', 'ชำระประกันสังคม', NULL, 12750.00, NULL, 667811.75, 'K-Cyber', 'ประกันสังคม พ.ค.', NULL, 'withdrawal', false),
('2026-05-19 14:15:00+07', '19/05/2569', 'โอนเงิน บจก. เอส.พี.อิเลคทริค', NULL, 45600.00, NULL, 622211.75, 'K PLUS', 'ค่าอุปกรณ์ไฟฟ้า', NULL, 'withdrawal', false),
('2026-05-20 09:30:00+07', '20/05/2569', 'ค่าเช่าสำนักงาน', NULL, 35000.00, NULL, 587211.75, 'K-Cyber', 'เช่า มิ.ย. 69', NULL, 'withdrawal', false),
('2026-05-22 11:00:00+07', '22/05/2569', 'เบิกเงินสด', NULL, 30000.00, NULL, 557211.75, 'ATM', NULL, NULL, 'withdrawal', false),
('2026-05-25 16:45:00+07', '25/05/2569', 'โอนเงิน หจก. แสงทองการช่าง', NULL, 67800.00, NULL, 489411.75, 'Counter', 'ค่างานทาสี', 'INV-0892', 'withdrawal', false),
('2026-05-28 10:00:00+07', '28/05/2569', 'ชำระค่าอินเทอร์เน็ต TRUE', NULL, 1299.00, NULL, 488112.75, 'K PLUS', NULL, NULL, 'withdrawal', false),
('2026-05-30 13:20:00+07', '30/05/2569', 'โอนเงิน นาย ประเสริฐ มั่นคง', NULL, 22000.00, NULL, 466112.75, 'K PLUS', 'ค่าจ้างรายเดือน', NULL, 'withdrawal', false);

INSERT INTO public.transactions (tx_datetime, effective_date, description, cheque_number, withdraw, deposit, balance, channel, memo, remark, type, is_highlighted) VALUES
-- === June 2026 Withdrawals ===
('2026-06-02 09:00:00+07', '02/06/2569', 'โอนเงิน บจก. กรุงเทพคอนกรีต', NULL, 95000.00, NULL, 371112.75, 'K-Cyber', 'ค่าคอนกรีตผสมเสร็จ', 'PO-2026-0523', 'withdrawal', true),
('2026-06-03 10:45:00+07', '03/06/2569', 'ชำระค่าไฟฟ้า กฟน.', NULL, 5120.25, NULL, 365992.50, 'K PLUS', NULL, NULL, 'withdrawal', false),
('2026-06-05 08:30:00+07', '05/06/2569', 'เบิกเงินสด', NULL, 40000.00, NULL, 325992.50, 'ATM', 'เงินสดย่อย', NULL, 'withdrawal', false),
('2026-06-07 14:30:00+07', '07/06/2569', 'โอนเงิน นาย สมชาย ใจดี', NULL, 15000.00, NULL, 310992.50, 'K PLUS', 'ค่าจ้างรายวัน', NULL, 'withdrawal', false),
('2026-06-09 11:15:00+07', '09/06/2569', 'ชำระค่าน้ำประปา', NULL, 2105.00, NULL, 308887.50, 'K PLUS', NULL, NULL, 'withdrawal', false),
('2026-06-10 09:45:00+07', '10/06/2569', 'โอนเงิน บจก. ทีพี เพ้นท์', NULL, 28900.00, NULL, 279987.50, 'K PLUS', 'ค่าสีทาอาคาร', NULL, 'withdrawal', false),
('2026-06-12 16:00:00+07', '12/06/2569', 'โอนเงิน นาง สมหญิง รักษ์ดี', NULL, 25000.00, NULL, 254987.50, 'K PLUS', 'ค่าจ้างพนักงาน', NULL, 'withdrawal', false),
('2026-06-14 10:10:00+07', '14/06/2569', 'ค่าธรรมเนียมโอน', NULL, 50.00, NULL, 254937.50, 'K-Cyber', NULL, NULL, 'withdrawal', false),
('2026-06-16 13:00:00+07', '16/06/2569', 'โอนเงิน หจก. พิพัฒน์การไฟฟ้า', '006201', 156000.00, NULL, 98937.50, 'Counter', 'ค่างานระบบไฟฟ้า', 'INV-0934', 'withdrawal', true),
('2026-06-18 08:20:00+07', '18/06/2569', 'ชำระประกันสังคม', NULL, 12750.00, NULL, 86187.50, 'K-Cyber', 'ประกันสังคม มิ.ย.', NULL, 'withdrawal', false),
('2026-06-20 15:00:00+07', '20/06/2569', 'ค่าเช่าสำนักงาน', NULL, 35000.00, NULL, 51187.50, 'K-Cyber', 'เช่า ก.ค. 69', NULL, 'withdrawal', false),
('2026-06-22 09:30:00+07', '22/06/2569', 'ชำระค่าโทรศัพท์ AIS', NULL, 2499.00, NULL, 48688.50, 'K PLUS', NULL, NULL, 'withdrawal', false),
('2026-06-25 11:40:00+07', '25/06/2569', 'โอนเงิน นาย วิชัย แสนดี', NULL, 18000.00, NULL, 30688.50, 'K PLUS', 'ค่าแรงช่างไฟ', NULL, 'withdrawal', false),
('2026-06-28 14:20:00+07', '28/06/2569', 'ชำระค่าอินเทอร์เน็ต TRUE', NULL, 1299.00, NULL, 29389.50, 'K PLUS', NULL, NULL, 'withdrawal', false);

INSERT INTO public.transactions (tx_datetime, effective_date, description, cheque_number, withdraw, deposit, balance, channel, memo, remark, type, is_highlighted) VALUES
-- === July 2026 Withdrawals ===
('2026-07-01 09:00:00+07', '01/07/2569', 'โอนเงิน บจก. สยามซัพพลาย', NULL, 55000.00, NULL, 974389.50, 'K-Cyber', 'ค่าวัสดุ ก.ค.', NULL, 'withdrawal', false),
('2026-07-02 10:15:00+07', '02/07/2569', 'ชำระค่าไฟฟ้า กฟน.', NULL, 4890.50, NULL, 969499.00, 'K PLUS', NULL, NULL, 'withdrawal', false),
('2026-07-03 14:30:00+07', '03/07/2569', 'โอนเงิน นาย สมชาย ใจดี', NULL, 15000.00, NULL, 954499.00, 'K PLUS', 'ค่าจ้างรายวัน', NULL, 'withdrawal', false),
('2026-07-05 08:00:00+07', '05/07/2569', 'เบิกเงินสด', NULL, 60000.00, NULL, 894499.00, 'ATM', 'เงินสดย่อย ก.ค.', NULL, 'withdrawal', false),
('2026-07-07 11:30:00+07', '07/07/2569', 'โอนเงิน บจก. เจริญทรัพย์ก่อสร้าง', '006455', 250000.00, NULL, 644499.00, 'Counter', 'ค่างานโครงสร้าง', 'PO-2026-0601', 'withdrawal', true),
('2026-07-08 09:20:00+07', '08/07/2569', 'โอนเงิน นาง สมหญิง รักษ์ดี', NULL, 25000.00, NULL, 619499.00, 'K PLUS', 'ค่าจ้างพนักงาน', NULL, 'withdrawal', false),
('2026-07-09 13:10:00+07', '09/07/2569', 'ชำระค่าน้ำประปา', NULL, 1950.75, NULL, 617548.25, 'K PLUS', NULL, NULL, 'withdrawal', false),
('2026-07-10 15:45:00+07', '10/07/2569', 'โอนเงิน หจก. แสงทองการช่าง', NULL, 43200.00, NULL, 574348.25, 'K PLUS', 'ค่างานทาสี งวด 2', NULL, 'withdrawal', false),
('2026-07-11 10:00:00+07', '11/07/2569', 'ค่าธรรมเนียมรายเดือน', NULL, 200.00, NULL, 574148.25, 'K-Cyber', NULL, NULL, 'withdrawal', false);

INSERT INTO public.transactions (tx_datetime, effective_date, description, cheque_number, withdraw, deposit, balance, channel, memo, remark, type, is_highlighted) VALUES
-- === May 2026 Income ===
('2026-05-01 08:00:00+07', '01/05/2569', 'รับโอนเงิน บจก. แลนด์มาร์ค พร็อพเพอร์ตี้', NULL, NULL, 500000.00, 1000000.00, 'K PLUS', 'ค่างานงวดที่ 3', 'Project Landmark', 'income', true),
('2026-05-06 09:30:00+07', '06/05/2569', 'รับโอนเงิน นาย อนันต์ รุ่งเรือง', NULL, NULL, 85000.00, 931085.75, 'K PLUS', 'มัดจำงานต่อเติม', NULL, 'income', false),
('2026-05-10 14:00:00+07', '10/05/2569', 'รับโอนเงิน บจก. เมืองทองพัฒนา', NULL, NULL, 320000.00, 1138586.75, 'Counter', 'ค่างานงวดที่ 2', 'Project MT-2026', 'income', true),
('2026-05-15 10:30:00+07', '15/05/2569', 'ดอกเบี้ยเงินฝาก', NULL, NULL, 1250.00, 681811.75, 'K-Cyber', NULL, NULL, 'income', false),
('2026-05-18 13:00:00+07', '18/05/2569', 'รับโอนเงิน นาง พิมพ์ใจ สุขสม', NULL, NULL, 45000.00, 667211.75, 'K PLUS', 'ค่างานซ่อมบ้าน', NULL, 'income', false),
('2026-05-23 09:15:00+07', '23/05/2569', 'รับโอนเงิน บจก. แลนด์มาร์ค พร็อพเพอร์ตี้', NULL, NULL, 250000.00, 739411.75, 'Counter', 'ค่างานงวดที่ 4', 'Project Landmark', 'income', false),
('2026-05-27 11:45:00+07', '27/05/2569', 'รับโอนเงิน หจก. ศรีสุข', NULL, NULL, 67500.00, 555912.75, 'K PLUS', 'ค่าออกแบบ', NULL, 'income', false),
('2026-05-31 16:00:00+07', '31/05/2569', 'รับโอนเงิน นาย สุรศักดิ์ พงษ์เจริญ', NULL, NULL, 120000.00, 586112.75, 'K PLUS', 'มัดจำงานรีโนเวท', NULL, 'income', false);

INSERT INTO public.transactions (tx_datetime, effective_date, description, cheque_number, withdraw, deposit, balance, channel, memo, remark, type, is_highlighted) VALUES
-- === June 2026 Income ===
('2026-06-01 08:30:00+07', '01/06/2569', 'รับโอนเงิน บจก. เมืองทองพัฒนา', NULL, NULL, 450000.00, 916112.75, 'Counter', 'ค่างานงวดที่ 3', 'Project MT-2026', 'income', true),
('2026-06-04 10:00:00+07', '04/06/2569', 'รับโอนเงิน นาย อนันต์ รุ่งเรือง', NULL, NULL, 150000.00, 515992.50, 'K PLUS', 'ค่างานต่อเติม งวด 1', NULL, 'income', false),
('2026-06-08 14:30:00+07', '08/06/2569', 'รับโอนเงิน บจก. สุขุมวิท ดีเวลลอป', NULL, NULL, 680000.00, 990987.50, 'Counter', 'ค่างานงวดที่ 1', 'Project SKV-401', 'income', true),
('2026-06-11 09:00:00+07', '11/06/2569', 'รับโอนเงิน นาง พิมพ์ใจ สุขสม', NULL, NULL, 35000.00, 314987.50, 'K PLUS', 'ค่างานซ่อมบ้าน งวดสุดท้าย', NULL, 'income', false),
('2026-06-15 11:20:00+07', '15/06/2569', 'ดอกเบี้ยเงินฝาก', NULL, NULL, 980.00, 255917.50, 'K-Cyber', NULL, NULL, 'income', false),
('2026-06-19 13:45:00+07', '19/06/2569', 'รับโอนเงิน นาย สุรศักดิ์ พงษ์เจริญ', NULL, NULL, 200000.00, 286187.50, 'K PLUS', 'ค่างานรีโนเวท งวด 1', NULL, 'income', false),
('2026-06-24 15:30:00+07', '24/06/2569', 'รับโอนเงิน บจก. แลนด์มาร์ค พร็อพเพอร์ตี้', NULL, NULL, 180000.00, 228688.50, 'Counter', 'ค่างานงวดที่ 5', 'Project Landmark', 'income', false),
('2026-06-27 10:15:00+07', '27/06/2569', 'รับโอนเงิน หจก. ศรีสุข', NULL, NULL, 42000.00, 71389.50, 'K PLUS', 'ค่าควบคุมงาน', NULL, 'income', false),
('2026-06-30 16:30:00+07', '30/06/2569', 'รับโอนเงิน บจก. สุขุมวิท ดีเวลลอป', NULL, NULL, 340000.00, 369389.50, 'K PLUS', 'ค่างานงวดที่ 2', 'Project SKV-401', 'income', false);

INSERT INTO public.transactions (tx_datetime, effective_date, description, cheque_number, withdraw, deposit, balance, channel, memo, remark, type, is_highlighted) VALUES
-- === July 2026 Income ===
('2026-07-01 07:30:00+07', '01/07/2569', 'รับโอนเงิน บจก. เมืองทองพัฒนา', NULL, NULL, 600000.00, 1029389.50, 'Counter', 'ค่างานงวดสุดท้าย', 'Project MT-2026', 'income', true),
('2026-07-03 09:00:00+07', '03/07/2569', 'รับโอนเงิน นาย อนันต์ รุ่งเรือง', NULL, NULL, 75000.00, 1029499.00, 'K PLUS', 'ค่างานต่อเติม งวดสุดท้าย', NULL, 'income', false),
('2026-07-06 14:00:00+07', '06/07/2569', 'รับโอนเงิน บจก. สุขุมวิท ดีเวลลอป', NULL, NULL, 340000.00, 1234499.00, 'Counter', 'ค่างานงวดที่ 3', 'Project SKV-401', 'income', false),
('2026-07-08 10:30:00+07', '08/07/2569', 'รับโอนเงิน นาย ธนกร วงศ์สว่าง', NULL, NULL, 95000.00, 714499.00, 'K PLUS', 'มัดจำงานสร้างบ้าน', NULL, 'income', false),
('2026-07-10 08:45:00+07', '10/07/2569', 'รับโอนเงิน บจก. แลนด์มาร์ค พร็อพเพอร์ตี้', NULL, NULL, 350000.00, 924348.25, 'Counter', 'ค่างานงวดที่ 6 (สุดท้าย)', 'Project Landmark', 'income', true),
('2026-07-11 11:00:00+07', '11/07/2569', 'ดอกเบี้ยเงินฝาก', NULL, NULL, 1150.00, 575298.25, 'K-Cyber', NULL, NULL, 'income', false);
