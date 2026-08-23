import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseBankCSV, splitCSVLine, detectStatementFormat } from './csv'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('splitCSVLine', () => {
  it('unescapes escaped quotes inside quoted fields', () => {
    expect(splitCSVLine('"value with ""quote""",next')).toEqual([
      'value with "quote"',
      'next',
    ])
  })
})

describe('detectStatementFormat', () => {
  it('detects thai_legacy from the Thai header token', () => {
    expect(detectStatementFormat('วันที่ทำรายการ,วันที่มีผล')).toBe('thai_legacy')
  })

  it('detects english_v2 from the English header signature', () => {
    expect(detectStatementFormat('Transaction Date and Time,Value Date')).toBe('english_v2')
  })

  it('strips a leading BOM before comparing', () => {
    expect(detectStatementFormat('\uFEFFTransaction Date and Time,Value Date')).toBe('english_v2')
  })

  it('returns null for an unrecognised file', () => {
    expect(detectStatementFormat('foo,bar,baz')).toBeNull()
  })
})

describe('parseBankCSV — thai_legacy', () => {
  it('preserves existing Thai bank CSV row shape and values', () => {
    const csv = [
      'วันที่ทำรายการ,วันที่มีผล,คำอธิบาย,เลขที่เช็ค,หักบัญชี,เข้าบัญชี,ยอดคงเหลือ,ช่องทางทำรายการ',
      '15 ม.ค. 2569 9:30,15/01/69,"ค่าบริการ ""พิเศษ""",,500.00,,10000.00,K PLUS',
    ].join('\r\n')

    const result = parseBankCSV(new TextEncoder().encode(csv).buffer, { format: 'thai_legacy' })

    expect(result.format).toBe('thai_legacy')
    expect(result.exportedAt).toBeNull()
    expect(result.rows).toEqual([{
      tx_datetime: '2026-01-15T09:30:00',
      effective_date: '2026-01-15',
      description: 'ค่าบริการ "พิเศษ"',
      cheque_number: null,
      withdraw: 500,
      deposit: null,
      balance: 10000,
      channel: 'K PLUS',
      type: 'withdrawal',
      channel_code: 'K_PLUS',
      cheque_number_normalized: null,
      currency: 'THB',
      fx_rate: null,
      branch: null,
      location: null,
      terminal_id: null,
      narrative: null,
      counterparty_name: null,
      counterparty_account: null,
      statement_format: 'thai_legacy',
      statement_exported_at: null,
    }])
  })

  it('defaults to auto-detection agreeing with an explicit thai_legacy selection', () => {
    const csv = [
      'วันที่ทำรายการ,วันที่มีผล,คำอธิบาย,เลขที่เช็ค,หักบัญชี,เข้าบัญชี,ยอดคงเหลือ,ช่องทางทำรายการ',
      '15 ม.ค. 2569 9:30,15/01/69,ทดสอบ,,500.00,,10000.00,K PLUS',
    ].join('\r\n')

    const result = parseBankCSV(new TextEncoder().encode(csv).buffer, { format: 'auto' })
    expect(result.format).toBe('thai_legacy')
    expect(result.rows).toHaveLength(1)
  })

  it('throws naming both formats when selected as english_v2', () => {
    const csv = [
      'วันที่ทำรายการ,วันที่มีผล,คำอธิบาย,เลขที่เช็ค,หักบัญชี,เข้าบัญชี,ยอดคงเหลือ,ช่องทางทำรายการ',
      '15 ม.ค. 2569 9:30,15/01/69,ทดสอบ,,500.00,,10000.00,K PLUS',
    ].join('\r\n')

    expect(() => parseBankCSV(new TextEncoder().encode(csv).buffer, { format: 'english_v2' }))
      .toThrow(/ไทย.*English|English.*ไทย/)
  })
})

describe('parseBankCSV — english_v2', () => {
  const fixturePath = resolve(__dirname, '../../texport.csv')
  let fixtureBuffer
  try {
    fixtureBuffer = readFileSync(fixturePath)
  } catch {
    fixtureBuffer = null
  }

  it.runIf(fixtureBuffer)('parses the real texport.csv fixture', () => {
    const result = parseBankCSV(fixtureBuffer.buffer.slice(fixtureBuffer.byteOffset, fixtureBuffer.byteOffset + fixtureBuffer.byteLength), { format: 'english_v2' })

    expect(result.format).toBe('english_v2')
    expect(result.exportedAt).toBe('2026-08-21T10:49:45')
    expect(result.rows.length).toBeGreaterThan(0)

    for (const row of result.rows) {
      expect(row.withdraw === null || row.deposit === null).toBe(true)
      expect(row.withdraw === null ? true : row.withdraw > 0).toBe(true)
      expect(row.deposit === null ? true : row.deposit > 0).toBe(true)
      expect(row.tx_datetime.startsWith('2026-08-')).toBe(true)
    }
  })

  it('parses a signed debit row into a positive withdraw amount with currency', () => {
    const csv = [
      '\uFEFFExport Date and Time',
      '"21/08/2026 10:49:45"',
      'Transaction Date and Time,Value Date,Description,Cheque Number,Debit Amount,Credit Amount,Ledger Balance,Channel of transaction,Branch,Location,TerminalID,Narrative,Counter Party Account Name,Counter Party Account Number,FX Rate',
      '"20/08/2026 21:07:00","20/08/2026","CHEQUE AUTOPOST (Sys.Gen)","0002933140","-4,121.64 THB",0.00,"2,589,588.86 THB","Automatic","BANG KHRU, PHRA PRADAENG BRANCH","Phra Pradaeng ","020200","","","","0.00"',
      '',
    ].join('\n')

    const result = parseBankCSV(new TextEncoder().encode(csv).buffer, { format: 'english_v2' })
    expect(result.rows).toHaveLength(1)
    const row = result.rows[0]

    expect(row.tx_datetime).toBe('2026-08-20T21:07:00')
    expect(row.effective_date).toBe('2026-08-20')
    expect(row.withdraw).toBe(4121.64)
    expect(row.deposit).toBeNull()
    expect(row.type).toBe('withdrawal')
    expect(row.currency).toBe('THB')
    expect(row.balance).toBe(2589588.86)
    expect(row.branch).toBe('BANG KHRU, PHRA PRADAENG BRANCH')
    expect(row.location).toBe('Phra Pradaeng')
    expect(row.terminal_id).toBe('020200')
    expect(row.cheque_number).toBe('0002933140')
    expect(row.cheque_number_normalized).toBe('2933140')
    expect(row.channel_code).toBe('AUTOMATIC')
    expect(row.statement_format).toBe('english_v2')
  })

  it('parses a credit row with counterparty fields populated', () => {
    const csv = [
      '\uFEFFExport Date and Time',
      '"21/08/2026 10:49:45"',
      'Transaction Date and Time,Value Date,Description,Cheque Number,Debit Amount,Credit Amount,Ledger Balance,Channel of transaction,Branch,Location,TerminalID,Narrative,Counter Party Account Name,Counter Party Account Number,FX Rate',
      '"19/08/2026 17:09:49","19/08/2026","TRF FR OTH BK","",0.00,"59,171.00 THB","2,670,300.77 THB","Mobile Phone Banking","","","004286","","บจก. ชิโนซาวา (ประเทศไทย)","0942XXX148","0.00"',
      '',
    ].join('\n')

    const result = parseBankCSV(new TextEncoder().encode(csv).buffer, { format: 'english_v2' })
    const row = result.rows[0]

    expect(row.withdraw).toBeNull()
    expect(row.deposit).toBe(59171)
    expect(row.type).toBe('income')
    expect(row.counterparty_name).toBe('บจก. ชิโนซาวา (ประเทศไทย)')
    expect(row.counterparty_account).toBe('0942XXX148')
    expect(row.terminal_id).toBe('004286')
    expect(row.cheque_number).toBeNull()
  })

  it('stops at the trailing blank line without producing an empty transaction', () => {
    const csv = [
      '\uFEFFExport Date and Time',
      '"21/08/2026 10:49:45"',
      'Transaction Date and Time,Value Date,Description,Cheque Number,Debit Amount,Credit Amount,Ledger Balance,Channel of transaction,Branch,Location,TerminalID,Narrative,Counter Party Account Name,Counter Party Account Number,FX Rate',
      '"21/08/2026 10:30:57","21/08/2026","Clearing Cheque Deposit","",0.00,"94,267.00 THB","2,838,952.36 THB","Branch  Counter","PATHUMTHANI","Mueang Pathum Thani ",,,"","","0.00"',
      '',
    ].join('\n')

    const result = parseBankCSV(new TextEncoder().encode(csv).buffer, { format: 'english_v2' })
    expect(result.rows).toHaveLength(1)
  })

  it('captures the export timestamp from the two-line preamble', () => {
    const csv = [
      '\uFEFFExport Date and Time',
      '"21/08/2026 10:49:45"',
      'Transaction Date and Time,Value Date,Description,Cheque Number,Debit Amount,Credit Amount,Ledger Balance,Channel of transaction,Branch,Location,TerminalID,Narrative,Counter Party Account Name,Counter Party Account Number,FX Rate',
      '"21/08/2026 10:30:57","21/08/2026","Test","",0.00,"1.00 THB","1.00 THB","Automatic","","",,,"","","0.00"',
    ].join('\n')

    const result = parseBankCSV(new TextEncoder().encode(csv).buffer, { format: 'english_v2' })
    expect(result.exportedAt).toBe('2026-08-21T10:49:45')
  })

  it('stamps statement_exported_at onto every row so the RPC payload carries it', () => {
    const csv = [
      '\uFEFFExport Date and Time',
      '"21/08/2026 10:49:45"',
      'Transaction Date and Time,Value Date,Description,Cheque Number,Debit Amount,Credit Amount,Ledger Balance,Channel of transaction,Branch,Location,TerminalID,Narrative,Counter Party Account Name,Counter Party Account Number,FX Rate',
      '"21/08/2026 10:30:57","21/08/2026","Test one","",0.00,"1.00 THB","1.00 THB","Automatic","","",,,"","","0.00"',
      '"21/08/2026 10:31:00","21/08/2026","Test two","",0.00,"2.00 THB","3.00 THB","Automatic","","",,,"","","0.00"',
    ].join('\n')

    const result = parseBankCSV(new TextEncoder().encode(csv).buffer, { format: 'english_v2' })
    expect(result.rows).toHaveLength(2)
    for (const row of result.rows) {
      expect(row.statement_exported_at).toBe('2026-08-21T10:49:45')
    }
  })

  it('throws naming both formats when a v2 file is selected as thai_legacy', () => {
    const csv = [
      '\uFEFFExport Date and Time',
      '"21/08/2026 10:49:45"',
      'Transaction Date and Time,Value Date,Description,Cheque Number,Debit Amount,Credit Amount,Ledger Balance,Channel of transaction,Branch,Location,TerminalID,Narrative,Counter Party Account Name,Counter Party Account Number,FX Rate',
      '"21/08/2026 10:30:57","21/08/2026","Test","",0.00,"1.00 THB","1.00 THB","Automatic","","",,,"","","0.00"',
    ].join('\n')

    expect(() => parseBankCSV(new TextEncoder().encode(csv).buffer, { format: 'thai_legacy' }))
      .toThrow(/ไทย.*English|English.*ไทย/)
  })

  it('resolves auto-detection to english_v2 for a v2 file', () => {
    const csv = [
      '\uFEFFExport Date and Time',
      '"21/08/2026 10:49:45"',
      'Transaction Date and Time,Value Date,Description,Cheque Number,Debit Amount,Credit Amount,Ledger Balance,Channel of transaction,Branch,Location,TerminalID,Narrative,Counter Party Account Name,Counter Party Account Number,FX Rate',
      '"21/08/2026 10:30:57","21/08/2026","Test","",0.00,"1.00 THB","1.00 THB","Automatic","","",,,"","","0.00"',
    ].join('\n')

    const result = parseBankCSV(new TextEncoder().encode(csv).buffer, { format: 'auto' })
    expect(result.format).toBe('english_v2')
  })
})

describe('parseBankCSV — unknown file', () => {
  it('throws listing supported formats when format is auto and file is unrecognised', () => {
    const csv = 'foo,bar,baz\n1,2,3\n'
    expect(() => parseBankCSV(new TextEncoder().encode(csv).buffer, { format: 'auto' }))
      .toThrow(/ไทย.*English|English.*ไทย/)
  })
})
