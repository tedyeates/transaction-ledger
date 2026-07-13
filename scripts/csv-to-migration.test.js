import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    readFileSync: vi.fn(actual.readFileSync),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  }
})

import {
  thaiDateStringToISO,
  splitCSVLine,
  parseBankCSV,
  sqlEscape,
  generateUpdateSQL,
  generateMigration,
  generateTimestamp,
  main,
} from './csv-to-migration.js'

// --- Unit: thaiDateStringToISO ---

describe('thaiDateStringToISO', () => {
  it('parses Thai month abbreviation format', () => {
    expect(thaiDateStringToISO('15 ม.ค. 2569 9:30')).toBe('2026-01-15T09:30:00')
  })

  it('parses slash date format', () => {
    expect(thaiDateStringToISO('5/3/2569 14:05')).toBe('2026-03-05T14:05:00')
  })

  it('returns null for empty/invalid input', () => {
    expect(thaiDateStringToISO('')).toBeNull()
    expect(thaiDateStringToISO(null)).toBeNull()
    expect(thaiDateStringToISO('garbage')).toBeNull()
  })

  it('handles unknown Thai month gracefully', () => {
    expect(thaiDateStringToISO('15 xxx 2569 9:30')).toBeNull()
  })
})

// --- Unit: splitCSVLine ---

describe('splitCSVLine', () => {
  it('splits simple comma-separated values', () => {
    expect(splitCSVLine('a,b,c')).toEqual(['a', 'b', 'c'])
  })

  it('handles quoted fields with commas', () => {
    expect(splitCSVLine('"hello, world",b,c')).toEqual(['hello, world', 'b', 'c'])
  })

  it('handles empty fields', () => {
    expect(splitCSVLine('a,,c')).toEqual(['a', '', 'c'])
  })
})

// --- Unit: sqlEscape ---

describe('sqlEscape', () => {
  it('returns NULL for null/undefined', () => {
    expect(sqlEscape(null)).toBe('NULL')
    expect(sqlEscape(undefined)).toBe('NULL')
  })

  it('wraps strings in single quotes', () => {
    expect(sqlEscape('hello')).toBe("'hello'")
  })

  it('escapes single quotes', () => {
    expect(sqlEscape("it's")).toBe("'it''s'")
  })
})

// --- Unit: parseBankCSV ---

describe('parseBankCSV', () => {
  function makeCSVBuffer(content) {
    return Buffer.from(content, 'utf-8')
  }

  it('parses a minimal valid CSV', () => {
    const csv = [
      'วันที่ทำรายการ,วันที่มีผล,คำอธิบาย,เลขที่เช็ค,หักบัญชี,เข้าบัญชี,ยอดคงเหลือ,ช่องทางทำรายการ',
      '15/1/2569 9:30,15/01/69,ค่าน้ำ,,500.00,,10000.00,K PLUS',
      '16/1/2569 10:00,16/01/69,เงินเดือน,,,25000.00,35000.00,K PLUS',
    ].join('\n')

    const rows = parseBankCSV(makeCSVBuffer(csv))
    expect(rows).toHaveLength(2)

    expect(rows[0].tx_datetime).toBe('2026-01-15T09:30:00')
    expect(rows[0].withdraw).toBe(500)
    expect(rows[0].deposit).toBeNull()
    expect(rows[0].balance).toBe(10000)
    expect(rows[0].type).toBe('withdrawal')
    expect(rows[0].description).toBe('ค่าน้ำ')
    expect(rows[0].channel).toBe('K PLUS')

    expect(rows[1].tx_datetime).toBe('2026-01-16T10:00:00')
    expect(rows[1].withdraw).toBeNull()
    expect(rows[1].deposit).toBe(25000)
    expect(rows[1].type).toBe('income')
  })

  it('handles zero values correctly (not treated as null)', () => {
    const csv = [
      'วันที่ทำรายการ,วันที่มีผล,คำอธิบาย,เลขที่เช็ค,หักบัญชี,เข้าบัญชี,ยอดคงเหลือ,ช่องทางทำรายการ',
      '15/1/2569 9:30,15/01/69,ค่าน้ำ,,500.00,,0.00,K PLUS',
    ].join('\n')

    const rows = parseBankCSV(makeCSVBuffer(csv))
    expect(rows[0].balance).toBe(0)
    expect(rows[0].balance).not.toBeNull()
  })

  it('throws if header not found', () => {
    const csv = 'col1,col2\nfoo,bar\n'
    expect(() => parseBankCSV(makeCSVBuffer(csv))).toThrow('ไม่พบหัวตาราง')
  })

  it('throws if no data rows', () => {
    const csv = 'วันที่ทำรายการ,วันที่มีผล,คำอธิบาย,เลขที่เช็ค,หักบัญชี,เข้าบัญชี,ยอดคงเหลือ,ช่องทางทำรายการ\n'
    expect(() => parseBankCSV(makeCSVBuffer(csv))).toThrow('ไม่พบรายการธุรกรรม')
  })

  it('skips preamble lines before header', () => {
    const csv = [
      'Some bank info line',
      'Account: 123-456-789',
      '',
      'วันที่ทำรายการ,วันที่มีผล,คำอธิบาย,เลขที่เช็ค,หักบัญชี,เข้าบัญชี,ยอดคงเหลือ,ช่องทางทำรายการ',
      '15/1/2569 9:30,15/01/69,ค่าน้ำ,,500.00,,10000.00,K PLUS',
    ].join('\n')

    const rows = parseBankCSV(makeCSVBuffer(csv))
    expect(rows).toHaveLength(1)
  })
})

// --- Unit: generateUpdateSQL ---

describe('generateUpdateSQL', () => {
  it('generates valid UPDATE statement', () => {
    const row = {
      tx_datetime: '2026-01-15T09:30:00',
      withdraw: 500,
      deposit: null,
      type: 'withdrawal',
      balance: 10000,
      description: 'ค่าน้ำ',
      channel: 'K PLUS',
      effective_date: '15/01/69',
      cheque_number: null,
    }

    const sql = generateUpdateSQL(row)
    expect(sql).toContain('UPDATE public.transactions')
    expect(sql).toContain("tx_datetime = '2026-01-15T09:30:00'")
    expect(sql).toContain('COALESCE(withdraw, 0) = 500')
    expect(sql).toContain('COALESCE(deposit, 0) = 0')
    expect(sql).toContain("type = 'withdrawal'")
    expect(sql).toContain('balance = 10000')
    expect(sql).toContain("description = 'ค่าน้ำ'")
    expect(sql).toContain("channel = 'K PLUS'")
    expect(sql).toContain("effective_date = '15/01/69'")
    expect(sql).toContain('cheque_number = NULL')
    expect(sql).toContain('updated_at = now()')
  })

  it('does not include memo, remark, or is_highlighted', () => {
    const row = {
      tx_datetime: '2026-01-15T09:30:00',
      withdraw: null,
      deposit: 1000,
      type: 'income',
      balance: 5000,
      description: 'test',
      channel: null,
      effective_date: null,
      cheque_number: null,
    }

    const sql = generateUpdateSQL(row)
    expect(sql).not.toContain('memo')
    expect(sql).not.toContain('remark')
    expect(sql).not.toContain('is_highlighted')
  })

  it('returns null for rows without tx_datetime', () => {
    const row = {
      tx_datetime: null,
      withdraw: 500,
      deposit: null,
      type: 'withdrawal',
      balance: 10000,
      description: 'test',
      channel: null,
      effective_date: null,
      cheque_number: null,
    }

    expect(generateUpdateSQL(row)).toBeNull()
  })

  it('escapes single quotes in description', () => {
    const row = {
      tx_datetime: '2026-01-15T09:30:00',
      withdraw: 100,
      deposit: null,
      type: 'withdrawal',
      balance: 900,
      description: "it's a test",
      channel: null,
      effective_date: null,
      cheque_number: null,
    }

    const sql = generateUpdateSQL(row)
    expect(sql).toContain("description = 'it''s a test'")
  })

  it('handles zero balance correctly in SET clause', () => {
    const row = {
      tx_datetime: '2026-01-15T09:30:00',
      withdraw: 500,
      deposit: null,
      type: 'withdrawal',
      balance: 0,
      description: 'test',
      channel: null,
      effective_date: null,
      cheque_number: null,
    }

    const sql = generateUpdateSQL(row)
    expect(sql).toContain('balance = 0')
    expect(sql).not.toContain('balance = NULL')
  })
})

// --- Unit: generateMigration ---

describe('generateMigration', () => {
  it('wraps statements in BEGIN/COMMIT', () => {
    const rows = [{
      tx_datetime: '2026-01-15T09:30:00',
      withdraw: 500,
      deposit: null,
      type: 'withdrawal',
      balance: 10000,
      description: 'test',
      channel: 'K PLUS',
      effective_date: null,
      cheque_number: null,
    }]

    const sql = generateMigration(rows)
    expect(sql).toContain('BEGIN;')
    expect(sql).toContain('COMMIT;')
    expect(sql).toContain('UPDATE public.transactions')
  })

  it('includes comment header with row count', () => {
    const rows = [{
      tx_datetime: '2026-01-15T09:30:00',
      withdraw: 500,
      deposit: null,
      type: 'withdrawal',
      balance: 10000,
      description: 'test',
      channel: null,
      effective_date: null,
      cheque_number: null,
    }]

    const sql = generateMigration(rows)
    expect(sql).toContain('-- Rows: 1')
    expect(sql).toContain('Only updates: balance, description, channel, effective_date, cheque_number')
    expect(sql).toContain('Preserves: id, memo, remark, is_highlighted, imported_at')
  })

  it('skips rows with null tx_datetime', () => {
    const rows = [
      { tx_datetime: null, withdraw: 500, deposit: null, type: 'withdrawal', balance: 10000, description: 'x', channel: null, effective_date: null, cheque_number: null },
      { tx_datetime: '2026-01-15T09:30:00', withdraw: 500, deposit: null, type: 'withdrawal', balance: 10000, description: 'y', channel: null, effective_date: null, cheque_number: null },
    ]

    const sql = generateMigration(rows)
    // Only 1 UPDATE statement despite 2 rows
    const updates = sql.match(/UPDATE public\.transactions/g)
    expect(updates).toHaveLength(1)
  })
})

// --- Unit: generateTimestamp ---

describe('generateTimestamp', () => {
  it('returns 14-digit timestamp string', () => {
    const ts = generateTimestamp()
    expect(ts).toMatch(/^\d{14}$/)
  })
})

// --- Integration: main() ---

describe('main()', () => {
  beforeEach(() => {
    vi.mocked(readFileSync).mockReset()
    vi.mocked(writeFileSync).mockReset()
    vi.mocked(mkdirSync).mockReset()
  })

  it('reads CSV, generates migration, and writes file', () => {
    const csv = [
      'วันที่ทำรายการ,วันที่มีผล,คำอธิบาย,เลขที่เช็ค,หักบัญชี,เข้าบัญชี,ยอดคงเหลือ,ช่องทางทำรายการ',
      '15/1/2569 9:30,15/01/69,ค่าน้ำ,,500.00,,10000.00,K PLUS',
    ].join('\n')

    vi.mocked(readFileSync).mockReturnValue(Buffer.from(csv, 'utf-8'))

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const outputPath = main(['/tmp/test.csv'])

    expect(readFileSync).toHaveBeenCalledWith(expect.stringContaining('test.csv'))
    expect(mkdirSync).toHaveBeenCalledWith(expect.stringContaining('supabase/migrations'), { recursive: true })
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/csv_update\.sql$/),
      expect.stringContaining('UPDATE public.transactions'),
      'utf-8',
    )
    expect(outputPath).toMatch(/csv_update\.sql$/)

    consoleSpy.mockRestore()
  })

  it('exits with error when no args provided', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => main([])).toThrow('exit')
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Usage:'))

    exitSpy.mockRestore()
    errorSpy.mockRestore()
  })
})
