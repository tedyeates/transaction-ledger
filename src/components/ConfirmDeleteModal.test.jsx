/**
 * Unit tests for ConfirmDeleteModal — SSW destructive button UX rule:
 * https://www.ssw.com.au/rules/destructive-button-ui-ux
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ConfirmDeleteModal } from './ConfirmDeleteModal'

function makeTx(overrides = {}) {
  return {
    id: 42,
    tx_datetime: '2024-01-15T10:30:00',
    description: 'Test transaction',
    ...overrides,
  }
}

describe('ConfirmDeleteModal', () => {
  it('renders an irreversibility warning', () => {
    render(<ConfirmDeleteModal transaction={makeTx()} onClose={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByText(/ไม่สามารถย้อนกลับได้/)).toBeTruthy()
    expect(screen.getByText(/cannot be undone/i)).toBeTruthy()
  })

  it('renders a red/danger-styled confirm button distinct from cancel', () => {
    render(<ConfirmDeleteModal transaction={makeTx()} onClose={vi.fn()} onConfirm={vi.fn()} />)
    const confirmBtn = screen.getByRole('button', { name: /ลบรายการ/ })
    const cancelBtn = screen.getByRole('button', { name: 'ยกเลิก' })
    expect(confirmBtn.classList.contains('btn-danger')).toBe(true)
    expect(cancelBtn.classList.contains('btn-danger')).toBe(false)
  })

  it('does not call onConfirm on render — requires explicit user action', () => {
    const onConfirm = vi.fn()
    render(<ConfirmDeleteModal transaction={makeTx()} onClose={vi.fn()} onConfirm={onConfirm} />)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('clicking Cancel calls onClose without calling onConfirm', () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()
    render(<ConfirmDeleteModal transaction={makeTx()} onClose={onClose} onConfirm={onConfirm} />)
    act(() => { screen.getByRole('button', { name: 'ยกเลิก' }).click() })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('clicking the delete button calls onConfirm with the transaction id', async () => {
    const onConfirm = vi.fn().mockResolvedValue(true)
    render(<ConfirmDeleteModal transaction={makeTx({ id: 99 })} onClose={vi.fn()} onConfirm={onConfirm} />)
    await act(async () => { screen.getByRole('button', { name: /ลบรายการ/ }).click() })
    expect(onConfirm).toHaveBeenCalledWith(99)
  })

  it('closes the modal after a successful delete', async () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn().mockResolvedValue(true)
    render(<ConfirmDeleteModal transaction={makeTx()} onClose={onClose} onConfirm={onConfirm} />)
    await act(async () => { screen.getByRole('button', { name: /ลบรายการ/ }).click() })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps the modal open and shows an error message when delete fails', async () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn().mockResolvedValue(false)
    render(<ConfirmDeleteModal transaction={makeTx()} onClose={onClose} onConfirm={onConfirm} />)
    await act(async () => { screen.getByRole('button', { name: /ลบรายการ/ }).click() })
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('disables both buttons while the delete is in flight', async () => {
    let resolveConfirm
    const onConfirm = vi.fn(() => new Promise(resolve => { resolveConfirm = resolve }))
    render(<ConfirmDeleteModal transaction={makeTx()} onClose={vi.fn()} onConfirm={onConfirm} />)
    const confirmBtn = screen.getByRole('button', { name: /ลบรายการ/ })
    act(() => { confirmBtn.click() })
    expect(screen.getByRole('button', { name: 'ยกเลิก' }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'กำลังลบ…' }).disabled).toBe(true)
    await act(async () => { resolveConfirm(true) })
  })
})
