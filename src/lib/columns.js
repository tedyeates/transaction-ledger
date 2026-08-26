// Shared column config for TransactionTable/TransactionRow and the
// column-visibility multiselect in the Toolbar.
//
// `key` matches the transaction field / TransactionTable column key.
// Every toggleable column can be shown/hidden via the multiselect.
// `hiddenByDefault` columns start unchecked; everything else toggleable
// starts checked. Columns not listed here (dates, amounts, memo, remark,
// highlight, delete action, etc.) are always shown and not offered in the
// picker.
export const TOGGLEABLE_COLUMNS = [
  { key: 'effective_date',       label: 'วันที่มีผล' },
  { key: 'description',          label: 'คำอธิบาย' },
  { key: 'cheque_number',        label: 'เลขที่เช็ค' },
  { key: 'withdraw',             label: 'หักบัญชี' },
  { key: 'deposit',              label: 'เข้าบัญชี' },
  { key: 'balance',              label: 'ยอดคงเหลือ' },
  { key: 'channel',              label: 'ช่องทาง',        hiddenByDefault: true },
  { key: 'branch',               label: 'สาขา',           hiddenByDefault: true },
  { key: 'location',             label: 'ที่ตั้ง',          hiddenByDefault: true },
  { key: 'terminal_id',          label: 'รหัสเครื่อง',      hiddenByDefault: true },
  { key: 'narrative',            label: 'หมายเหตุธนาคาร',  hiddenByDefault: true },
  { key: 'counterparty_name',    label: 'คู่ค้า' },
  { key: 'counterparty_account', label: 'เลขที่บัญชีคู่ค้า' },
  { key: 'fx_rate',              label: 'อัตราแลกเปลี่ยน' },
]

export function getDefaultVisibleColumns() {
  const visible = {}
  for (const col of TOGGLEABLE_COLUMNS) {
    visible[col.key] = !col.hiddenByDefault
  }
  return visible
}
