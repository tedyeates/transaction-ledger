/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, afterEach } from 'vitest'
import { exportToCSV, formatThaiDate } from './utils'
import { parseBankCSV } from './csv'

// exportToCSV builds a Blob and drives it through an anchor click rather than
// returning a value, so the seam under test is the Blob content — capture it
// via a real Blob.text() rather than mocking URL/anchor internals.
async function captureExportedCSV(transactions) {
  const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  const createSpy = vi.spyOn(URL, 'createObjectURL')
  const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

  exportToCSV(transactions)

  const blob = createSpy.mock.calls[0][0]
  const text = await blob.text()

  clickSpy.mockRestore()
  createSpy.mockRestore()
  revokeSpy.mockRestore()

  return text
}

// Every cell in exportToCSV's output is quoted, so a quote-aware split is
// required — a naive split(',') breaks on any cell containing a comma.
function splitQuotedLine(line) {
  const cells = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++ }
      else if (ch === '"') { inQuotes = false }
      else { current += ch }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      cells.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current)
  return cells
}

function parseCSV(text) {
  const stripped = text.replace(/^\uFEFF/, '')
  return stripped.split('\n').map(splitQuotedLine)
}

const baseTx = {
  tx_datetime: '2026-01-15T09:30:00',
  effective_date: '2026-01-15',
  description: 'ค่าบริการ',
  cheque_number: null,
  withdraw: 500,
  deposit: null,
  balance: 10000,
  channel: 'K PLUS',
  memo: '',
  remark: '',
  branch: 'BANG KHRU',
  location: 'Phra Pradaeng',
  terminal_id: '020200',
  narrative: null,
  counterparty_name: 'Somchai',
  counterparty_account: '123-4-56789-0',
  currency: 'THB',
  fx_rate: null,
  statement_format: 'english_v2',
}

describe('exportToCSV', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('includes the new bank fields with Thai headers, in order after the existing columns', async () => {
    const text = await captureExportedCSV([baseTx])
    const [headers] = parseCSV(text)

    expect(headers).toEqual([
      'วันที่ทำรายการ', 'วันที่มีผล', 'คำอธิบาย', 'เลขที่เช็ค',
      'หักบัญชี', 'เข้าบัญชี', 'ยอดคงเหลือ', 'ช่องทาง', 'รายการ', 'หมายเหตุ',
      'สาขา', 'ที่ตั้ง', 'รหัสเครื่อง', 'หมายเหตุธนาคาร', 'คู่ค้า', 'เลขที่บัญชีคู่ค้า',
      'สกุลเงิน', 'อัตราแลกเปลี่ยน', 'รูปแบบใบแจ้งยอด',
    ])
  })

  it('does not change existing column headers or their order', async () => {
    const text = await captureExportedCSV([baseTx])
    const [headers] = parseCSV(text)

    expect(headers.slice(0, 10)).toEqual([
      'วันที่ทำรายการ', 'วันที่มีผล', 'คำอธิบาย', 'เลขที่เช็ค',
      'หักบัญชี', 'เข้าบัญชี', 'ยอดคงเหลือ', 'ช่องทาง', 'รายการ', 'หมายเหตุ',
    ])
  })

  it('exports value date as a formatted Thai date, not the raw ISO value', async () => {
    const text = await captureExportedCSV([baseTx])
    const [, row] = parseCSV(text)

    expect(row[1]).toBe(formatThaiDate(baseTx.effective_date))
    expect(row[1]).not.toContain(baseTx.effective_date)
  })

  it('populates branch, location, terminal, narrative, counterparty and FX fields', async () => {
    const tx = { ...baseTx, narrative: 'bank narrative text', fx_rate: 33.125 }
    const text = await captureExportedCSV([tx])
    const [, row] = parseCSV(text)

    expect(row).toEqual(expect.arrayContaining([
      'BANG KHRU', 'Phra Pradaeng', '020200', 'bank narrative text',
      'Somchai', '123-4-56789-0', 'THB',
    ]))
    expect(row).toContain('33.13')
  })

  it('renders missing bank fields as empty cells, not "null" or "undefined"', async () => {
    const tx = {
      ...baseTx,
      branch: null, location: null, terminal_id: null, narrative: null,
      counterparty_name: null, counterparty_account: null, fx_rate: null,
    }
    const text = await captureExportedCSV([tx])

    expect(text).not.toMatch(/null|undefined/i)
  })

  it('retains the byte-order mark for Thai Excel compatibility', async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const createSpy = vi.spyOn(URL, 'createObjectURL')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    exportToCSV([baseTx])
    const blob = createSpy.mock.calls[0][0]
    const bytes = new Uint8Array(await blob.arrayBuffer())

    // UTF-8 BOM is the 3-byte sequence EF BB BF; Blob.text() decodes it away
    // (TextDecoder strips BOM by default), so the raw bytes must be checked
    // directly to confirm the downloaded file itself carries the BOM.
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xEF, 0xBB, 0xBF])

    clickSpy.mockRestore()
    createSpy.mockRestore()
  })

  it('quotes every cell, including empty ones', async () => {
    const tx = { ...baseTx, cheque_number: null, narrative: null }
    const text = await captureExportedCSV([tx])
    const dataLine = text.split('\n')[1]

    expect(dataLine.startsWith('"')).toBe(true)
    expect(dataLine).toContain('""')
  })

  it('escapes commas, quotes and Thai text so the row survives export and re-import', async () => {
    const tricky = {
      ...baseTx,
      description: 'ค่าบริการ, "พิเศษ"',
      counterparty_name: 'บริษัท "เอ, บี" จำกัด',
    }
    const text = await captureExportedCSV([tricky])
    const [, row] = parseCSV(text)

    expect(row[2]).toBe(tricky.description)
    expect(row).toContain(tricky.counterparty_name)
  })

  it('produces no empty or misaligned columns for a v1 (thai_legacy)-imported transaction', async () => {
    const csv = [
      'วันที่ทำรายการ,วันที่มีผล,คำอธิบาย,เลขที่เช็ค,หักบัญชี,เข้าบัญชี,ยอดคงเหลือ,ช่องทางทำรายการ',
      '15 ม.ค. 2569 9:30,15/01/69,ทดสอบ,,500.00,,10000.00,K PLUS',
    ].join('\r\n')
    const { rows } = parseBankCSV(new TextEncoder().encode(csv).buffer, { format: 'thai_legacy' })

    const text = await captureExportedCSV(rows)
    const [headers, row] = parseCSV(text)

    expect(row).toHaveLength(headers.length)
  })

  it('produces no empty or misaligned columns for a v2 (english)-imported transaction', async () => {
    const csv = [
      '"Export Date and Time"',
      '"21/08/2026 10:00:00"',
      'Transaction Date and Time,Value Date,Description,Cheque Number,Debit Amount,Credit Amount,Ledger Balance,Channel of transaction,Branch,Location,TerminalID,Narrative,Counter Party Account Name,Counter Party Account Number,FX Rate',
      '20/08/2026 21:07:00,20/08/2026,test,,4121.64,,2589588.86,Automatic,BANG KHRU,Phra Pradaeng,020200,,,,0.00',
    ].join('\r\n')
    const { rows } = parseBankCSV(new TextEncoder().encode(csv).buffer, { format: 'english_v2' })

    const text = await captureExportedCSV(rows)
    const [headers, row] = parseCSV(text)

    expect(row).toHaveLength(headers.length)
  })
})
