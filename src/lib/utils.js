export function formatBaht(value) {
  if (value == null || value === '') return ''
  return '฿' + Number(value).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatThaiDateTime(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  const d = date.getUTCDate()
  const m = date.getUTCMonth() + 1
  const y = date.getUTCFullYear() + 543
  const h = String(date.getUTCHours()).padStart(2, '0')
  const min = String(date.getUTCMinutes()).padStart(2, '0')
  return `${d}/${m}/${y} ${h}:${min}`
}

export function formatThaiDate(dateString) {
  if (!dateString) return ''
  const [y, m, d] = dateString.split('-').map(Number)
  if (!y || !m || !d) return ''
  return `${d}/${m}/${y + 543}`
}

export function exportToCSV(transactions) {
  const headers = [
    'วันที่ทำรายการ', 'วันที่มีผล', 'คำอธิบาย', 'เลขที่เช็ค',
    'หักบัญชี', 'เข้าบัญชี', 'ยอดคงเหลือ', 'ช่องทาง', 'รายการ', 'หมายเหตุ',
    'สาขา', 'ที่ตั้ง', 'รหัสเครื่อง', 'หมายเหตุธนาคาร', 'คู่ค้า', 'เลขที่บัญชีคู่ค้า',
    'สกุลเงิน', 'อัตราแลกเปลี่ยน', 'รูปแบบใบแจ้งยอด',
  ]

  const rows = transactions.map(tx => [
    formatThaiDateTime(tx.tx_datetime),
    formatThaiDate(tx.effective_date),
    tx.description ?? '',
    tx.cheque_number ?? '',
    tx.withdraw != null ? Number(tx.withdraw).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '',
    tx.deposit != null ? Number(tx.deposit).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '',
    tx.balance != null ? Number(tx.balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '',
    tx.channel ?? '',
    tx.memo ?? '',
    tx.remark ?? '',
    tx.branch ?? '',
    tx.location ?? '',
    tx.terminal_id ?? '',
    tx.narrative ?? '',
    tx.counterparty_name ?? '',
    tx.counterparty_account ?? '',
    tx.currency ?? '',
    tx.fx_rate != null ? Number(tx.fx_rate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '',
    tx.statement_format ?? '',
  ])

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const BOM = '\uFEFF'
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `transactions_${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
