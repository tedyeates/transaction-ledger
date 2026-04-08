import { THAI_MONTHS } from './constants'

export function thaiDateStringToISO(str) {
  if (!str) return null

  const thaiMatch = str.match(/^(\d{1,2})\s+(\S+)\s+(\d{4})\s+(\d{1,2}):(\d{2})/)
  if (thaiMatch) {
    const [, d, monthAbbr, y, h, min] = thaiMatch
    const month = THAI_MONTHS[monthAbbr]
    if (!month) return null
    const gregorianYear = parseInt(y) - 543
    return `${gregorianYear}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:${min}:00`
  }

  const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/)
  if (slashMatch) {
    const [, d, m, y, h, min] = slashMatch
    const gregorianYear = parseInt(y) - 543
    return `${gregorianYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:${min}:00`
  }

  return null
}

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

export function exportToCSV(transactions) {
  const headers = [
    'วันที่ทำรายการ', 'วันที่มีผล', 'คำอธิบาย', 'เลขที่เช็ค',
    'หักบัญชี', 'เข้าบัญชี', 'ยอดคงเหลือ', 'ช่องทาง', 'รายการ', 'หมายเหตุ'
  ]

  const rows = transactions.map(tx => [
    formatThaiDateTime(tx.tx_datetime),
    tx.effective_date ?? '',
    tx.description ?? '',
    tx.cheque_number ?? '',
    tx.withdraw != null ? Number(tx.withdraw).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '',
    tx.deposit != null ? Number(tx.deposit).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '',
    tx.balance != null ? Number(tx.balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '',
    tx.channel ?? '',
    tx.memo ?? '',
    tx.remark ?? '',
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

export function splitCSVLine(line) {
  const fields = []
  let current = ''
  let inQuotes = false
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      fields.push(current)
      current = ''
    } else {
      current += char
    }
  }
  fields.push(current)
  return fields
}

export function parseBankCSV(arrayBuffer) {
  let text
  try {
    const decoded = new TextDecoder('windows-874').decode(new Uint8Array(arrayBuffer))
    text = decoded.includes('วันที่ทำรายการ') ? decoded : new TextDecoder('utf-8').decode(new Uint8Array(arrayBuffer))
  } catch {
    text = new TextDecoder('utf-8').decode(new Uint8Array(arrayBuffer))
  }

  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

  let headerIndex = -1
  let headers = []
  for (let i = 0; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i])
    if (cols[0]?.trim() === 'วันที่ทำรายการ') {
      headerIndex = i
      headers = cols.map(c => c.trim())
      break
    }
  }
  if (headerIndex === -1) throw new Error('ไม่พบหัวตาราง (วันที่ทำรายการ) ในไฟล์ CSV')

  const rows = []
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i])
    const dateValue = cols[headers.indexOf('วันที่ทำรายการ')]?.trim()
    if (!dateValue) break

    const rowObj = {}
    headers.forEach((h, j) => { rowObj[h] = cols[j]?.trim() ?? '' })
    rows.push(rowObj)
  }
  if (rows.length === 0) throw new Error('ไม่พบรายการธุรกรรมในไฟล์')

  return rows.map(r => {
    const withdraw  = parseFloat(r['หักบัญชี']?.replace(/,/g, ''))  || null
    const deposit   = parseFloat(r['เข้าบัญชี']?.replace(/,/g, '')) || null
    const balance   = parseFloat(r['ยอดคงเหลือ']?.replace(/,/g, '')) || null
    const txDatetime = thaiDateStringToISO(r['วันที่ทำรายการ'])

    return {
      tx_datetime:    txDatetime,
      effective_date: r['วันที่มีผล']        || null,
      description:    r['คำอธิบาย']          || null,
      cheque_number:  r['เลขที่เช็ค']        || null,
      withdraw,
      deposit,
      balance,
      channel:        r['ช่องทางทำรายการ']   || null,
      type:           withdraw != null ? 'withdrawal' : 'income',
    }
  })
}
