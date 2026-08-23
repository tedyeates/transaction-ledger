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
import {
  parseBankCSV,
  splitCSVLine,
  thaiDateStringToISO,
  DEFAULT_STATEMENT_FORMAT,
} from '../src/lib/csv.js'

export { parseBankCSV, splitCSVLine, thaiDateStringToISO, DEFAULT_STATEMENT_FORMAT }

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = resolve(__dirname, '..')

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
  const {
    tx_datetime, withdraw, deposit, type, balance, description, channel,
    effective_date, cheque_number, branch, location, terminal_id, narrative,
    counterparty_name, counterparty_account, currency, fx_rate,
    channel_code, cheque_number_normalized, statement_format,
  } = row

  if (!tx_datetime) return null

  const setClauses = []
  setClauses.push(`balance = ${balance !== null ? balance : 'NULL'}`)
  setClauses.push(`description = ${sqlEscape(description)}`)
  setClauses.push(`channel = ${sqlEscape(channel)}`)
  setClauses.push(`effective_date = ${effective_date !== null ? sqlEscape(effective_date) + '::date' : 'NULL'}`)
  setClauses.push(`cheque_number = ${sqlEscape(cheque_number)}`)
  setClauses.push(`branch = ${sqlEscape(branch)}`)
  setClauses.push(`location = ${sqlEscape(location)}`)
  setClauses.push(`terminal_id = ${sqlEscape(terminal_id)}`)
  setClauses.push(`narrative = ${sqlEscape(narrative)}`)
  setClauses.push(`counterparty_name = ${sqlEscape(counterparty_name)}`)
  setClauses.push(`counterparty_account = ${sqlEscape(counterparty_account)}`)
  setClauses.push(`currency = ${sqlEscape(currency ?? 'THB')}`)
  setClauses.push(`fx_rate = ${fx_rate !== null && fx_rate !== undefined ? fx_rate : 'NULL'}`)
  setClauses.push(`channel_code = ${sqlEscape(channel_code)}`)
  setClauses.push(`cheque_number_normalized = ${sqlEscape(cheque_number_normalized)}`)
  setClauses.push(`statement_format = ${sqlEscape(statement_format ?? 'thai_legacy')}`)
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
 * Generate full migration SQL from parsed rows.
 */
export function generateMigration(rows, format) {
  const header = `-- Migration: Update bank-sourced fields from CSV re-import
-- Generated: ${new Date().toISOString()}
-- Format: ${format}
-- Rows: ${rows.length}
--
-- Only updates: balance, description, channel, effective_date, cheque_number,
-- branch, location, terminal_id, narrative, counterparty_name,
-- counterparty_account, currency, fx_rate, channel_code,
-- cheque_number_normalized, statement_format
-- Preserves: id, memo, remark, is_highlighted, imported_at

BEGIN;

`

  const statements = rows
    .map(generateUpdateSQL)
    .filter(Boolean)
    .join('\n\n')

  return header + statements + '\n\nCOMMIT;\n'
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
    console.error('Usage: node scripts/csv-to-migration.js <path-to-csv> [--format thai_legacy|english_v2|auto]')
    process.exit(1)
  }

  const formatFlagIndex = args.indexOf('--format')
  const format = formatFlagIndex !== -1 ? args[formatFlagIndex + 1] : DEFAULT_STATEMENT_FORMAT
  const csvPath = resolve(args[0])
  const buffer = readFileSync(csvPath)
  const { format: usedFormat, rows } = parseBankCSV(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), { format })

  console.log(`Parsed ${rows.length} transactions from CSV (format: ${usedFormat})`)

  const sql = generateMigration(rows, usedFormat)
  const timestamp = generateTimestamp()
  const migrationsDir = resolve(PROJECT_ROOT, 'supabase', 'migrations')
  mkdirSync(migrationsDir, { recursive: true })

  const outputPath = resolve(migrationsDir, `${timestamp}_csv_update.sql`)
  writeFileSync(outputPath, sql, 'utf-8')

  console.log(`Migration written to: ${outputPath}`)
  return outputPath
}

const isMain = process.argv[1] && resolve(process.argv[1]) === __filename
if (isMain) {
  main()
}
