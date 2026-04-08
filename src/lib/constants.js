export const PAGE_SIZE = 75
export const PREVIEW_COLS = ['tx_datetime', 'description', 'withdraw', 'deposit', 'balance', 'channel']

export const ROLES = {
  admin: 'admin',
  withdraw: 'withdrawal',
  deposit: 'income',
}

export const ROLE_LABELS = {
  [ROLES.withdraw]: 'หักบัญชี · แก้ไขรายการเท่านั้น',
  [ROLES.deposit]:  'เข้าบัญชี · แก้ไขรายการเท่านั้น',
  [ROLES.admin]:    'ผู้บริหาร',
}

export const THAI_MONTHS = {
  'ม.ค.': 1, 'ก.พ.': 2, 'มี.ค.': 3, 'เม.ย.': 4,
  'พ.ค.': 5, 'มิ.ย.': 6, 'ก.ค.': 7, 'ส.ค.': 8,
  'ก.ย.': 9, 'ต.ค.': 10, 'พ.ย.': 11, 'ธ.ค.': 12,
}
