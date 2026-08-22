import { THAI_MONTHS } from './constants'

// =============================================================================
// Statement format registry
// =============================================================================
//
// A "statement format" is a bank export dialect: encoding, header language,
// year era, sign convention, currency suffix. Adding a third bank means
// adding an entry here, not touching ImportModal or import_transactions.
//
// Format ids match the values already stored in transactions.statement_format
// ('thai_legacy' for pre-existing/backfilled rows, 'english_v2' for the new
// Kasikorn English/Gregorian export).

export const STATEMENT_FORMATS = {
  thai_legacy: {
    id: 'thai_legacy',
    label: 'ไทย / TIS-620 (เดิม)',
  },
  english_v2: {
    id: 'english_v2',
    label: 'English / Gregorian (ใหม่)',
  },
}

export const DEFAULT_STATEMENT_FORMAT = 'english_v2'

// Ordered for display in the format select box.
export const SOURCE_FORMATS = [
  STATEMENT_FORMATS.english_v2,
  STATEMENT_FORMATS.thai_legacy,
]

const THAI_HEADER_TOKEN = 'วันที่ทำรายการ'
const ENGLISH_HEADER_SIGNATURE = 'Transaction Date and Time'

/**
 * Strip a UTF-8 BOM if present. texport.csv is UTF-8 with BOM; a naive
 * header compare against a BOM-prefixed first line fails silently.
 */
function stripBOM(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/**
 * Detect which statement format a decoded CSV text is. Returns a format id
 * or null if neither format's header signature is found.
 */
export function detectStatementFormat(text) {
  const stripped = stripBOM(text)
  if (stripped.includes(ENGLISH_HEADER_SIGNATURE)) return 'english_v2'
  if (stripped.includes(THAI_HEADER_TOKEN)) return 'thai_legacy'
  return null
}

function formatSupportList() {
  return SOURCE_FORMATS.map(f => f.label).join(', ')
}

// =============================================================================
// Shared low-level helpers
// =============================================================================

export function splitCSVLine(line) {
  const fields = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
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

/**
 * Legacy Thai/TIS-620 timestamp: "15 ม.ค. 2569 9:30" or "15/01/2569 9:30".
 * Buddhist-era year (subtract 543 for Gregorian). Minute precision, no
 * seconds. Returns an ISO-shaped local datetime string (no timezone suffix,
 * matching how the rest of the app has always stored these).
 */
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

/**
 * Legacy Thai/TIS-620 effective date: "15/01/69" or "08 ก.ค. 2569" (Buddhist
 * era, 2-digit years assumed 25xx). Normalised to ISO YYYY-MM-DD so the RPC
 * never needs to parse locale-specific date text.
 */
export function thaiEffectiveDateToISO(str) {
  if (!str) return null
  const value = str.trim()
  if (!value) return null

  const slashMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (slashMatch) {
    const [, d, m, yRaw] = slashMatch
    let buddhistYear = parseInt(yRaw, 10)
    if (yRaw.length === 2) buddhistYear = 2500 + buddhistYear
    const gregorianYear = buddhistYear - 543
    return `${gregorianYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  const thaiMatch = value.match(/^(\d{1,2})\s+(\S+)\s+(\d{4})$/)
  if (thaiMatch) {
    const [, d, monthAbbr, yRaw] = thaiMatch
    const month = THAI_MONTHS[monthAbbr]
    if (!month) return null
    const gregorianYear = parseInt(yRaw, 10) - 543
    return `${gregorianYear}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  return null
}

/**
 * New English/Gregorian datetime: "21/08/2026 10:30:57" (D/M/YYYY, Gregorian
 * year, second precision). Returns an ISO-shaped local datetime string.
 */
export function gregorianDateTimeToISO(str) {
  if (!str) return null
  const match = str.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/)
  if (!match) return null
  const [, d, m, y, h, min, s] = match
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:${min}:${s}`
}

/**
 * New English/Gregorian date-only value: "21/08/2026" (D/M/YYYY, Gregorian).
 * Returns ISO YYYY-MM-DD.
 */
export function gregorianDateToISO(str) {
  if (!str) return null
  const match = str.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!match) return null
  const [, d, m, y] = match
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * Parse a v2 signed amount cell: "-4,121.64 THB", "94,267.00 THB", "0.00".
 * Strips thousands separators and a trailing currency code, takes the
 * absolute value (sign is a formatting artefact of the debit column, not
 * data), and treats the 0.00 sentinel as "no amount" (returns null).
 */
export function parseSignedAmount(str) {
  if (str == null) return { value: null, currency: null }
  const trimmed = String(str).trim()
  if (!trimmed) return { value: null, currency: null }

  const match = trimmed.match(/^(-?[\d,]+\.?\d*)\s*([A-Z]{3})?$/)
  if (!match) return { value: null, currency: null }

  const [, numPart, currency] = match
  const num = parseFloat(numPart.replace(/,/g, ''))
  if (Number.isNaN(num) || num === 0) return { value: null, currency: currency ?? null }

  return { value: Math.abs(num), currency: currency ?? null }
}

/**
 * Normalise bank channel text to a filterable code. Raw text is preserved
 * separately as `channel`; this is only ever derived from it.
 */
export function normaliseChannelCode(channel) {
  if (!channel) return null
  const code = channel
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return code || null
}

/**
 * Strip leading zeros from a cheque number so "02933114" and "0002933140"
 * are recognised as related. Empty/blank input normalises to null.
 */
export function normaliseChequeNumber(chequeNumber) {
  if (!chequeNumber) return null
  const stripped = chequeNumber.trim().replace(/^0+/, '')
  return stripped || null
}

// =============================================================================
// Legacy Thai/TIS-620 format (thai_legacy)
// =============================================================================

function parseThaiLegacy(arrayBuffer) {
  let text
  try {
    const decoded = new TextDecoder('windows-874').decode(new Uint8Array(arrayBuffer))
    text = decoded.includes(THAI_HEADER_TOKEN) ? decoded : new TextDecoder('utf-8').decode(new Uint8Array(arrayBuffer))
  } catch {
    text = new TextDecoder('utf-8').decode(new Uint8Array(arrayBuffer))
  }

  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

  let headerIndex = -1
  let headers = []
  for (let i = 0; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i])
    if (cols[0]?.trim() === THAI_HEADER_TOKEN) {
      headerIndex = i
      headers = cols.map(c => c.trim())
      break
    }
  }
  if (headerIndex === -1) throw new Error('ไม่พบหัวตาราง (วันที่ทำรายการ) ในไฟล์ CSV')

  const rawRows = []
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i])
    const dateValue = cols[headers.indexOf(THAI_HEADER_TOKEN)]?.trim()
    if (!dateValue) break

    const rowObj = {}
    headers.forEach((h, j) => { rowObj[h] = cols[j]?.trim() ?? '' })
    rawRows.push(rowObj)
  }
  if (rawRows.length === 0) throw new Error('ไม่พบรายการธุรกรรมในไฟล์')

  const rows = rawRows.map(r => {
    const withdrawRaw = parseFloat(r['หักบัญชี']?.replace(/,/g, ''))
    const depositRaw = parseFloat(r['เข้าบัญชี']?.replace(/,/g, ''))
    const balanceRaw = parseFloat(r['ยอดคงเหลือ']?.replace(/,/g, ''))
    const withdraw = Number.isNaN(withdrawRaw) ? null : withdrawRaw
    const deposit = Number.isNaN(depositRaw) ? null : depositRaw
    const balance = Number.isNaN(balanceRaw) ? null : balanceRaw
    const txDatetime = thaiDateStringToISO(r[THAI_HEADER_TOKEN])

    return {
      tx_datetime: txDatetime,
      effective_date: thaiEffectiveDateToISO(r['วันที่มีผล']) || null,
      description: r['คำอธิบาย'] || null,
      cheque_number: r['เลขที่เช็ค'] || null,
      withdraw,
      deposit,
      balance,
      channel: r['ช่องทางทำรายการ'] || null,
      type: withdraw != null ? 'withdrawal' : 'income',
      channel_code: normaliseChannelCode(r['ช่องทางทำรายการ'] || null),
      cheque_number_normalized: normaliseChequeNumber(r['เลขที่เช็ค'] || null),
      currency: 'THB',
      fx_rate: null,
      branch: null,
      location: null,
      terminal_id: null,
      narrative: null,
      counterparty_name: null,
      counterparty_account: null,
      statement_format: 'thai_legacy',
    }
  })

  return { rows, exportedAt: null }
}

// =============================================================================
// New English/Gregorian format (english_v2)
// =============================================================================

const V2_HEADERS = [
  'Transaction Date and Time', 'Value Date', 'Description', 'Cheque Number',
  'Debit Amount', 'Credit Amount', 'Ledger Balance', 'Channel of transaction',
  'Branch', 'Location', 'TerminalID', 'Narrative',
  'Counter Party Account Name', 'Counter Party Account Number', 'FX Rate',
]

function parseEnglishV2(arrayBuffer) {
  const text = stripBOM(new TextDecoder('utf-8').decode(new Uint8Array(arrayBuffer)))
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

  // Two-line preamble: "Export Date and Time" then a quoted timestamp.
  let exportedAt = null
  if (lines[1]) {
    const preambleCols = splitCSVLine(lines[1])
    exportedAt = gregorianDateTimeToISO(preambleCols[0]?.trim())
  }

  let headerIndex = -1
  let headers = []
  for (let i = 0; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i])
    if (cols[0]?.trim() === V2_HEADERS[0]) {
      headerIndex = i
      headers = cols.map(c => c.trim())
      break
    }
  }
  if (headerIndex === -1) throw new Error('ไม่พบหัวตาราง (Transaction Date and Time) ในไฟล์ CSV')

  const rawRows = []
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i])
    const dateValue = cols[headers.indexOf('Transaction Date and Time')]?.trim()
    if (!dateValue) break

    const rowObj = {}
    headers.forEach((h, j) => { rowObj[h] = cols[j]?.trim() ?? '' })
    rawRows.push(rowObj)
  }
  if (rawRows.length === 0) throw new Error('ไม่พบรายการธุรกรรมในไฟล์')

  const rows = rawRows.map(r => {
    const debit = parseSignedAmount(r['Debit Amount'])
    const credit = parseSignedAmount(r['Credit Amount'])
    const balance = parseSignedAmount(r['Ledger Balance'])
    const fx = parseSignedAmount(r['FX Rate'])
    const channelRaw = r['Channel of transaction'] || null

    const withdraw = debit.value
    const deposit = credit.value
    const currency = debit.currency || credit.currency || balance.currency || 'THB'

    return {
      tx_datetime: gregorianDateTimeToISO(r['Transaction Date and Time']),
      effective_date: gregorianDateToISO(r['Value Date']) || null,
      description: r['Description'] || null,
      cheque_number: r['Cheque Number'] || null,
      withdraw,
      deposit,
      balance: balance.value,
      channel: channelRaw,
      type: withdraw != null ? 'withdrawal' : 'income',
      channel_code: normaliseChannelCode(channelRaw),
      cheque_number_normalized: normaliseChequeNumber(r['Cheque Number'] || null),
      currency,
      fx_rate: fx.value,
      branch: r['Branch'] || null,
      location: r['Location']?.trim() || null,
      terminal_id: r['TerminalID'] || null,
      narrative: r['Narrative'] || null,
      counterparty_name: r['Counter Party Account Name'] || null,
      counterparty_account: r['Counter Party Account Number'] || null,
      statement_format: 'english_v2',
    }
  })

  return { rows, exportedAt }
}

// =============================================================================
// Public entry point
// =============================================================================

const PARSERS = {
  thai_legacy: parseThaiLegacy,
  english_v2: parseEnglishV2,
}

/**
 * Parse bank CSV bytes under a chosen (or auto-detected) statement format.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @param {{ format?: string }} options - format id from STATEMENT_FORMATS,
 *   or 'auto' to defer entirely to header detection. Defaults to
 *   DEFAULT_STATEMENT_FORMAT.
 * @returns {{ format: string, exportedAt: string|null, rows: object[] }}
 */
export function parseBankCSV(arrayBuffer, options = {}) {
  const { format = DEFAULT_STATEMENT_FORMAT } = options

  // Detection always runs and is used either to resolve 'auto' or to guard
  // an explicit selection against a mismatched file. Sniff using whichever
  // decoding lets us see the header signature; both formats' signatures are
  // ASCII/UTF-8-safe so a UTF-8 decode is sufficient for detection alone.
  const sniffText = new TextDecoder('utf-8').decode(new Uint8Array(arrayBuffer))
  const detected = detectStatementFormat(sniffText)

  if (format === 'auto') {
    if (!detected) {
      throw new Error(`ไม่รู้จักรูปแบบไฟล์นี้ — รองรับเฉพาะ: ${formatSupportList()}`)
    }
    const { rows, exportedAt } = PARSERS[detected](arrayBuffer)
    return { format: detected, exportedAt, rows }
  }

  if (!PARSERS[format]) {
    throw new Error(`ไม่รู้จักรูปแบบไฟล์ที่เลือก: ${format} — รองรับเฉพาะ: ${formatSupportList()}`)
  }

  if (detected && detected !== format) {
    const selectedLabel = STATEMENT_FORMATS[format]?.label ?? format
    const detectedLabel = STATEMENT_FORMATS[detected]?.label ?? detected
    throw new Error(
      `ไฟล์นี้ดูเหมือนรูปแบบ "${detectedLabel}" แต่เลือกไว้เป็น "${selectedLabel}" — กรุณาเลือกรูปแบบให้ถูกต้องหรือใช้ตรวจจับอัตโนมัติ`
    )
  }

  const { rows, exportedAt } = PARSERS[format](arrayBuffer)
  return { format, exportedAt, rows }
}
