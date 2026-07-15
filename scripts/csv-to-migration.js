#!/usr/bin/env node

/**
 * csv-to-migration.js
 *
 * Converts a Kasikorn Bank CSV export into a Supabase SQL migration file
 * containing UPDATE statements that refresh bank-sourced fields without
 * touching user annotations (memo, remark, is_highlighted).
 *
 * Usage: node scripts/csv-to-migration.js path/to/bank.csv
 * Output: supabase/migrations/<timestamp>_csv_update.sql
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = resolve(__dirname, '..')

// Thai month abbreviations → month number (same as src/lib/constants.js)
const THAI_MONTHS = {
  'ม.ค.': 1, 'ก.พ.': 2, 'มี.ค.': 3, 'เม.ย.': 4,
  'พ.ค.': 5, 'มิ.ย.': 6, 'ก.ค.': 7, 'ส.ค.': 8,
  'ก.ย.': 9, 'ต.ค.': 10, 'พ.ย.': 11, 'ธ.ค.': 12,
}

/**
 * Convert Thai date string to ISO format (same logic as src/lib/utils.js)
 */
export function thaiDateStringToISO(str) {
  if (!str) return null

  // "1 ม.ค. 2569 9:30" format
  const thaiMatch = str.match(/^(\d{1,2})\s+(\S+)\s+(\d{4})\s+(\d{1,2}):(\d{2})/)
  if (thaiMatch) {
    const [, d, monthAbbr, y, h, min] = thaiMatch
    const month = THAI_MONTHS[monthAbbr]
    if (!month) return null
    const gregorianYear = parseInt(y) - 543
    return `${gregorianYear}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:${min}:00`
  }

  // "1/1/2569 9:30" format
  const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/)
  if (slashMatch) {
    const [, d, m, y, h, min] = slashMatch
    const gregorianYear = parseInt(y) - 543
    return `${gregorianYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:${min}:00`
  }

  return null
}

/**
 * Split a CSV line respecting quoted fields (same as src/lib/utils.js)
 */
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

/**
 * Parse Kasikorn Bank CSV from a Buffer.
 * Tries windows-874 (TIS-620) first, falls back to UTF-8.
 */
export function parseBankCSV(buffer) {
  let text
  try {
    const decoded = new TextDecoder('windows-874').decode(buffer)
    text = decoded.includes('วันที่ทำรายการ') ? decoded : new TextDecoder('utf-8').decode(buffer)
  } catch {
    text = new TextDecoder('utf-8').decode(buffer)
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
    const withdrawRaw = parseFloat(r['หักบัญชี']?.replace(/,/g, ''))
    const depositRaw = parseFloat(r['เข้าบัญชี']?.replace(/,/g, ''))
    const balanceRaw = parseFloat(r['ยอดคงเหลือ']?.replace(/,/g, ''))
    const withdraw = Number.isNaN(withdrawRaw) ? null : withdrawRaw
    const deposit = Number.isNaN(depositRaw) ? null : depositRaw
    const balance = Number.isNaN(balanceRaw) ? null : balanceRaw
    const txDatetime = thaiDateStringToISO(r['วันที่ทำรายการ'])

    return {
      tx_datetime: txDatetime,
      effective_date: r['วันที่มีผล'] || null,
      description: r['คำอธิบาย'] || null,
      cheque_number: r['เลขที่เช็ค'] || null,
      withdraw,
      deposit,
      balance,
      channel: r['ช่องทางทำรายการ'] || null,
      type: withdraw != null ? 'withdrawal' : 'income',
    }
  })
}

/**
 * Escape a string value for SQL (single-quote escaping).
 */
export function sqlEscape(value) {
  if (value === null || value === undefined) return 'NULL'
  return `'${String(value).replace(/'/g, "''")}'`
}

/**
 * Generate a single UPDATE statement for a parsed transaction row.
 */
export function generateUpdateSQL(row) {
  const { tx_datetime, withdraw, deposit, type, balance, description, channel, effective_date, cheque_number } = row

  if (!tx_datetime) return null

  const setClauses = []
  setClauses.push(`balance = ${balance !== null ? balance : 'NULL'}`)
  setClauses.push(`description = ${sqlEscape(description)}`)
  setClauses.push(`channel = ${sqlEscape(channel)}`)
  setClauses.push(`effective_date = ${sqlEscape(effective_date)}`)
  setClauses.push(`cheque_number = ${sqlEscape(cheque_number)}`)
  setClauses.push(`updated_at = now()`)

  const whereClauses = [
    `tx_datetime = ${sqlEscape(tx_datetime)}`,
    `COALESCE(withdraw, 0) = ${withdraw !== null ? withdraw : 0}`,
    `COALESCE(deposit, 0) = ${deposit !== null ? deposit : 0}`,
    `type = ${sqlEscape(type)}`,
  ]

  return `UPDATE public.transactions\n  SET ${setClauses.join(',\n      ')}\n  WHERE ${whereClauses.join('\n    AND ')};`
}

/**
 * Generate the full migration SQL from an array of parsed rows.
 */
export function generateMigration(rows) {
  const header = `-- Migration: Update bank-sourced fields from CSV re-import
-- Generated: ${new Date().toISOString()}
-- Rows: ${rows.length}
--
-- Only updates: balance, description, channel, effective_date, cheque_number
-- Preserves: id, memo, remark, is_highlighted, imported_at

BEGIN;

`

  const statements = rows
    .map(generateUpdateSQL)
    .filter(Boolean)
    .join('\n\n')

  const footer = '\n\nCOMMIT;\n'

  return header + statements + footer
}

/**
 * Generate Supabase-style timestamp for migration filename.
 * Format: YYYYMMDDHHmmss
 */
export function generateTimestamp() {
  const now = new Date()
  return now.toISOString()
    .replace(/[-:T]/g, '')
    .slice(0, 14)
}

/**
 * Main CLI entry point.
 */
export function main(args = process.argv.slice(2)) {
  if (args.length === 0) {
    console.error('Usage: node scripts/csv-to-migration.js <path-to-csv>')
    process.exit(1)
  }

  const csvPath = resolve(args[0])
  const buffer = readFileSync(csvPath)
  const rows = parseBankCSV(buffer)

  console.log(`Parsed ${rows.length} transactions from CSV`)

  const sql = generateMigration(rows)
  const timestamp = generateTimestamp()
  const migrationsDir = resolve(PROJECT_ROOT, 'supabase', 'migrations')
  mkdirSync(migrationsDir, { recursive: true })

  const outputPath = resolve(migrationsDir, `${timestamp}_csv_update.sql`)
  writeFileSync(outputPath, sql, 'utf-8')

  console.log(`Migration written to: ${outputPath}`)
  return outputPath
}

// Run if called directly
const isMain = process.argv[1] && resolve(process.argv[1]) === __filename
if (isMain) {
  main()
}
