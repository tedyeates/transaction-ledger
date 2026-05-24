/**
 * @vitest-environment jsdom
 */

/**
 * Property 2: Non-Admin Rejection
 * Validates: Requirements 2.3, 3.4
 *
 * FOR ALL non-admin roles (withdrawal, income), WHEN user calls toggleHighlight,
 * THEN the RPC returns a permission denied error, the optimistic update is reverted,
 * and an error toast is shown.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import * as fc from 'fast-check'
import { useTransactions } from './useTransactions'
import { ROLES } from '../lib/constants'

// Mock supabase
vi.mock('../lib/supabase', () => {
  const rpcMock = vi.fn()
  return {
    supabase: {
      rpc: rpcMock,
    },
  }
})

// Mock useToast
const mockAddToast = vi.fn()
vi.mock('./useToast', () => ({
  useToast: () => mockAddToast,
}))

// Import mocked supabase for test control
import { supabase } from '../lib/supabase'

/**
 * Helper: set up supabase.rpc to handle initial data load calls,
 * then simulate permission denied on toggle_highlight.
 */
function setupRpcMock(initialTransactions) {
  supabase.rpc.mockImplementation((fnName, params, opts) => {
    if (fnName === 'get_latest_balance') {
      return Promise.resolve({ data: 1000 })
    }
    if (fnName === 'get_transaction_stats_v2') {
      return Promise.resolve({ data: [{ total_withdraws: 0, total_deposits: 0 }] })
    }
    if (fnName === 'get_transactions_v2') {
      // Return chainable query builder
      return {
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({
          data: initialTransactions,
          error: null,
          count: initialTransactions.length,
        }),
      }
    }
    if (fnName === 'toggle_highlight') {
      // Non-admin: always returns permission denied error
      return Promise.resolve({
        data: null,
        error: { message: 'Permission denied' },
      })
    }
    return Promise.resolve({ data: null, error: null })
  })
}

// Arbitraries
const nonAdminRoleArb = fc.constantFrom(ROLES.withdraw, ROLES.deposit)
const txIdArb = fc.integer({ min: 1, max: 100000 })
const txIdsArb = fc.array(txIdArb, { minLength: 1, maxLength: 20 }).map(ids => [...new Set(ids)])
const highlightedArb = fc.boolean()

describe('Property 2: Non-Admin Rejection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('non-admin toggleHighlight always reverts optimistic update and shows error toast', async () => {
    await fc.assert(
      fc.asyncProperty(
        nonAdminRoleArb,
        txIdsArb,
        highlightedArb,
        async (role, ids, highlighted) => {
          vi.clearAllMocks()

          // Create initial transactions with opposite highlight state
          const initialTxs = ids.map(id => ({
            id,
            is_highlighted: !highlighted,
            tx_datetime: '2024-01-01',
            description: 'test',
          }))

          setupRpcMock(initialTxs)

          const { result } = renderHook(() => useTransactions(role))

          // Wait for initial load
          await waitFor(() => {
            expect(result.current.isLoading).toBe(false)
          })

          // Verify initial state: all transactions have opposite highlight
          const txsBefore = result.current.transactions.filter(tx => ids.includes(tx.id))
          for (const tx of txsBefore) {
            expect(tx.is_highlighted).toBe(!highlighted)
          }

          // Call toggleHighlight (simulating non-admin attempting toggle)
          await act(async () => {
            await result.current.toggleHighlight(ids, highlighted)
          })

          // Property: after RPC error, state is reverted to original
          const txsAfter = result.current.transactions.filter(tx => ids.includes(tx.id))
          for (const tx of txsAfter) {
            expect(tx.is_highlighted).toBe(!highlighted)
          }

          // Property: error toast was shown
          expect(mockAddToast).toHaveBeenCalledWith('Permission denied', 'error')
        }
      ),
      { numRuns: 50 }
    )
  })
})
