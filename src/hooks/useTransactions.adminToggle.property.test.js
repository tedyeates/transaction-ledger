/**
 * Property 1: Admin Toggle Updates State
 * Validates: Requirements 2.2, 3.2
 *
 * FOR ALL valid arrays of transaction IDs and boolean values,
 * WHEN admin calls toggleHighlight (optimistic update via updateHighlightLocally),
 * THEN all specified rows have is_highlighted equal to the provided boolean value,
 * AND all other rows remain unchanged.
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

/**
 * Pure logic extracted from useTransactions hook's updateHighlightLocally.
 * Given a list of transactions, an array of IDs to toggle, and a boolean value,
 * returns the updated transaction list.
 */
function applyHighlightUpdate(transactions, ids, value) {
  const idSet = new Set(ids)
  return transactions.map(tx =>
    idSet.has(tx.id) ? { ...tx, is_highlighted: value } : tx
  )
}

// Arbitrary: generate a transaction object with an id and is_highlighted state
const arbTransaction = fc.record({
  id: fc.integer({ min: 1, max: 100000 }),
  is_highlighted: fc.boolean(),
  description: fc.string({ minLength: 0, maxLength: 20 }),
  amount: fc.integer({ min: -999999, max: 999999 }),
})

// Arbitrary: generate a list of unique transactions (unique by id)
const arbTransactions = fc
  .array(arbTransaction, { minLength: 1, maxLength: 50 })
  .map(txs => {
    const seen = new Set()
    return txs.filter(tx => {
      if (seen.has(tx.id)) return false
      seen.add(tx.id)
      return true
    })
  })
  .filter(txs => txs.length > 0)

describe('Property 1: Admin Toggle Updates State', () => {
  it('all targeted rows have is_highlighted set to provided value after update', () => {
    fc.assert(
      fc.property(
        arbTransactions,
        fc.boolean(),
        (transactions, highlightValue) => {
          // Pick a subset of IDs from the transactions to toggle
          const allIds = transactions.map(tx => tx.id)
          const idsToToggle = allIds.filter((_, i) => i % 2 === 0)

          const result = applyHighlightUpdate(transactions, idsToToggle, highlightValue)

          const idSet = new Set(idsToToggle)
          for (const tx of result) {
            if (idSet.has(tx.id)) {
              expect(tx.is_highlighted).toBe(highlightValue)
            }
          }
        }
      ),
      { numRuns: 200 }
    )
  })

  it('non-targeted rows remain unchanged after update', () => {
    fc.assert(
      fc.property(
        arbTransactions,
        fc.boolean(),
        (transactions, highlightValue) => {
          const allIds = transactions.map(tx => tx.id)
          const idsToToggle = allIds.filter((_, i) => i % 2 === 0)
          const idSet = new Set(idsToToggle)

          const result = applyHighlightUpdate(transactions, idsToToggle, highlightValue)

          for (let i = 0; i < result.length; i++) {
            if (!idSet.has(result[i].id)) {
              expect(result[i]).toEqual(transactions[i])
            }
          }
        }
      ),
      { numRuns: 200 }
    )
  })

  it('toggling with arbitrary subset of IDs updates exactly those rows', () => {
    fc.assert(
      fc.property(
        arbTransactions,
        fc.boolean(),
        fc.float({ min: 0, max: 1, noNaN: true }),
        (transactions, highlightValue, ratio) => {
          // Select a random subset based on ratio
          const idsToToggle = transactions
            .filter((_, i) => (i / transactions.length) < ratio)
            .map(tx => tx.id)

          const result = applyHighlightUpdate(transactions, idsToToggle, highlightValue)
          const idSet = new Set(idsToToggle)

          // Result length unchanged
          expect(result.length).toBe(transactions.length)

          for (let i = 0; i < result.length; i++) {
            if (idSet.has(result[i].id)) {
              expect(result[i].is_highlighted).toBe(highlightValue)
            } else {
              expect(result[i].is_highlighted).toBe(transactions[i].is_highlighted)
            }
          }
        }
      ),
      { numRuns: 200 }
    )
  })

  it('toggling with IDs not in transaction list has no effect', () => {
    fc.assert(
      fc.property(
        arbTransactions,
        fc.boolean(),
        fc.array(fc.integer({ min: 100001, max: 200000 }), { minLength: 1, maxLength: 10 }),
        (transactions, highlightValue, nonExistentIds) => {
          const result = applyHighlightUpdate(transactions, nonExistentIds, highlightValue)
          expect(result).toEqual(transactions)
        }
      ),
      { numRuns: 200 }
    )
  })

  it('toggling with empty ID array changes nothing', () => {
    fc.assert(
      fc.property(
        arbTransactions,
        fc.boolean(),
        (transactions, highlightValue) => {
          const result = applyHighlightUpdate(transactions, [], highlightValue)
          expect(result).toEqual(transactions)
        }
      ),
      { numRuns: 100 }
    )
  })
})
