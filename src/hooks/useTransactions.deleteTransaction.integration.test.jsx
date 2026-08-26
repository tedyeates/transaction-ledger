/**
 * Integration tests for delete transaction flow
 *
 * Tests the full optimistic removal → RPC → rollback cycle
 * by rendering the useTransactions hook with mocked supabase.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useTransactions } from './useTransactions'
import { ToastProvider } from './useToast'

vi.mock('../lib/supabase', () => {
  const rpcMock = vi.fn()
  return {
    supabase: {
      rpc: rpcMock,
    },
  }
})

import { supabase } from '../lib/supabase'

function makeQueryChain(resolveValue) {
  const chain = {
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue(resolveValue),
  }
  return chain
}

function wrapper({ children }) {
  return <ToastProvider>{children}</ToastProvider>
}

const sampleTransactions = [
  { id: 1, description: 'tx1', tx_datetime: '2024-01-01T00:00:00' },
  { id: 2, description: 'tx2', tx_datetime: '2024-01-02T00:00:00' },
  { id: 3, description: 'tx3', tx_datetime: '2024-01-03T00:00:00' },
]

describe('Delete transaction integration', () => {
  let rpcResolvers = {}

  beforeEach(() => {
    vi.clearAllMocks()
    rpcResolvers = {}

    supabase.rpc.mockImplementation((fnName) => {
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
      if (fnName === 'delete_transaction') {
        return new Promise((resolve) => {
          rpcResolvers.deleteTransaction = resolve
        })
      }
      return Promise.resolve({ data: null, error: null })
    })
  })

  it('optimistically removes the row immediately, before the RPC resolves', async () => {
    const { result } = renderHook(() => useTransactions('admin'), { wrapper })

    await waitFor(() => {
      expect(result.current.transactions.length).toBe(3)
    })

    act(() => {
      result.current.deleteTransaction(2)
    })

    expect(result.current.transactions.map(t => t.id)).toEqual([1, 3])
    expect(result.current.totalCount).toBe(2)

    await act(async () => {
      rpcResolvers.deleteTransaction({ error: null })
    })

    // Stays removed after success
    expect(result.current.transactions.map(t => t.id)).toEqual([1, 3])
  })

  it('calls the delete_transaction RPC with the transaction id', async () => {
    const { result } = renderHook(() => useTransactions('admin'), { wrapper })

    await waitFor(() => {
      expect(result.current.transactions.length).toBe(3)
    })

    act(() => {
      result.current.deleteTransaction(1)
    })

    expect(supabase.rpc).toHaveBeenCalledWith('delete_transaction', { tx_id: 1 })

    await act(async () => {
      rpcResolvers.deleteTransaction({ error: null })
    })
  })

  it('rolls back — reinserts the row at its original position — on RPC failure', async () => {
    const { result } = renderHook(() => useTransactions('admin'), { wrapper })

    await waitFor(() => {
      expect(result.current.transactions.length).toBe(3)
    })

    act(() => {
      result.current.deleteTransaction(2)
    })

    expect(result.current.transactions.map(t => t.id)).toEqual([1, 3])

    await act(async () => {
      rpcResolvers.deleteTransaction({ error: { message: 'Permission denied' } })
    })

    expect(result.current.transactions.map(t => t.id)).toEqual([1, 2, 3])
    expect(result.current.totalCount).toBe(3)
  })

  it('resolves to true on success and false on failure', async () => {
    const { result } = renderHook(() => useTransactions('admin'), { wrapper })

    await waitFor(() => {
      expect(result.current.transactions.length).toBe(3)
    })

    let deletePromise
    act(() => {
      deletePromise = result.current.deleteTransaction(3)
    })

    await act(async () => {
      rpcResolvers.deleteTransaction({ error: { message: 'boom' } })
    })

    expect(await deletePromise).toBe(false)
  })

  it('shows an error toast on RPC failure', async () => {
    const { result } = renderHook(() => useTransactions('admin'), { wrapper })

    await waitFor(() => {
      expect(result.current.transactions.length).toBe(3)
    })

    act(() => {
      result.current.deleteTransaction(1)
    })

    await act(async () => {
      rpcResolvers.deleteTransaction({ error: { message: 'Network error' } })
    })

    await waitFor(() => {
      const toastContainer = document.querySelector('.toast-container')
      expect(toastContainer).not.toBeNull()
      const errorToast = toastContainer.querySelector('.toast-error')
      expect(errorToast).not.toBeNull()
      expect(errorToast.textContent).toBe('Network error')
    })
  })
})
