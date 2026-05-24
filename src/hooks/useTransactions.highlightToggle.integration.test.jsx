/**
 * Integration tests for highlight toggle flow
 * Validates: Requirements 5.3, 5.4
 *
 * Tests the full optimistic update → RPC → rollback cycle
 * by rendering the useTransactions hook with mocked supabase.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useTransactions } from './useTransactions'
import { ToastProvider } from './useToast'

// Mock supabase module
vi.mock('../lib/supabase', () => {
  const rpcMock = vi.fn()
  return {
    supabase: {
      rpc: rpcMock,
    },
  }
})

// Import the mocked supabase so we can control rpc behavior per test
import { supabase } from '../lib/supabase'

/**
 * Helper: create a chainable query builder mock that resolves with given data.
 * get_transactions_v2 calls .order().order().range() after rpc().
 */
function makeQueryChain(resolveValue) {
  const chain = {
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue(resolveValue),
  }
  return chain
}

/**
 * Wrapper component providing ToastProvider context.
 */
function wrapper({ children }) {
  return <ToastProvider>{children}</ToastProvider>
}

const sampleTransactions = [
  { id: 1, is_highlighted: false, description: 'tx1', tx_datetime: '2024-01-01T00:00:00' },
  { id: 2, is_highlighted: false, description: 'tx2', tx_datetime: '2024-01-02T00:00:00' },
  { id: 3, is_highlighted: true, description: 'tx3', tx_datetime: '2024-01-03T00:00:00' },
]

describe('Highlight toggle integration', () => {
  let rpcResolvers = {}

  beforeEach(() => {
    vi.clearAllMocks()
    rpcResolvers = {}

    // Default: get_transactions_v2 returns sample data, get_latest_balance returns null,
    // get_transaction_stats_v2 returns stats
    supabase.rpc.mockImplementation((fnName, params, opts) => {
      if (fnName === 'get_transactions_v2') {
        return makeQueryChain({
          data: sampleTransactions,
          error: null,
          count: sampleTransactions.length,
        })
      }
      if (fnName === 'get_latest_balance') {
        return Promise.resolve({ data: 50000, error: null })
      }
      if (fnName === 'get_transaction_stats_v2') {
        return Promise.resolve({ data: [{ total_withdraws: 1000, total_deposits: 2000 }], error: null })
      }
      if (fnName === 'toggle_highlight') {
        // Return a controllable promise for toggle_highlight
        return new Promise((resolve) => {
          rpcResolvers.toggleHighlight = resolve
        })
      }
      return Promise.resolve({ data: null, error: null })
    })
  })

  it('optimistic update applies immediately before RPC resolves', async () => {
    const { result } = renderHook(() => useTransactions('admin'), { wrapper })

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.transactions.length).toBe(3)
    })

    // Verify initial state: tx id=1 is not highlighted
    expect(result.current.transactions.find(t => t.id === 1).is_highlighted).toBe(false)

    // Call toggleHighlight — RPC will NOT resolve yet (pending promise)
    act(() => {
      result.current.toggleHighlight([1], true)
    })

    // Optimistic update should apply immediately, before RPC resolves
    expect(result.current.transactions.find(t => t.id === 1).is_highlighted).toBe(true)
    // Other rows unchanged
    expect(result.current.transactions.find(t => t.id === 2).is_highlighted).toBe(false)
    expect(result.current.transactions.find(t => t.id === 3).is_highlighted).toBe(true)

    // Now resolve the RPC successfully
    await act(async () => {
      rpcResolvers.toggleHighlight({ error: null })
    })

    // State remains highlighted after success
    expect(result.current.transactions.find(t => t.id === 1).is_highlighted).toBe(true)
  })

  it('rollback on RPC error reverts optimistic update', async () => {
    const { result } = renderHook(() => useTransactions('admin'), { wrapper })

    await waitFor(() => {
      expect(result.current.transactions.length).toBe(3)
    })

    // tx id=3 starts highlighted
    expect(result.current.transactions.find(t => t.id === 3).is_highlighted).toBe(true)

    // Toggle highlight OFF for tx id=3
    act(() => {
      result.current.toggleHighlight([3], false)
    })

    // Optimistic: immediately set to false
    expect(result.current.transactions.find(t => t.id === 3).is_highlighted).toBe(false)

    // RPC fails
    await act(async () => {
      rpcResolvers.toggleHighlight({ error: { message: 'Permission denied' } })
    })

    // Rollback: reverts to original value (true)
    expect(result.current.transactions.find(t => t.id === 3).is_highlighted).toBe(true)
  })

  it('error toast shown on RPC failure', async () => {
    const { result, container } = renderHook(() => useTransactions('admin'), { wrapper })

    await waitFor(() => {
      expect(result.current.transactions.length).toBe(3)
    })

    // Toggle highlight
    act(() => {
      result.current.toggleHighlight([1], true)
    })

    // RPC fails with error message
    await act(async () => {
      rpcResolvers.toggleHighlight({ error: { message: 'Network error' } })
    })

    // Check toast rendered in DOM — ToastProvider renders toasts in .toast-container
    await waitFor(() => {
      const toastContainer = document.querySelector('.toast-container')
      expect(toastContainer).not.toBeNull()
      const errorToast = toastContainer.querySelector('.toast-error')
      expect(errorToast).not.toBeNull()
      expect(errorToast.textContent).toBe('Network error')
    })
  })
})
