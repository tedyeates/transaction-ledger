/**
 * Unit tests for TransactionRow highlight behavior
 * Validates: Requirements 4.1, 4.2, 5.1, 5.2
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TransactionRow } from './TransactionRow'
import { ROLES } from '../lib/constants'

function makeTx(overrides = {}) {
  return {
    id: 1,
    tx_datetime: '2024-01-15T10:30:00',
    effective_date: null,
    description: 'Test transaction',
    cheque_number: null,
    withdraw: 1000,
    deposit: null,
    balance: 50000,
    channel: 'ATM',
    memo: 'some memo',
    remark: null,
    type: 'withdrawal',
    is_highlighted: false,
    ...overrides,
  }
}

function renderRow(props = {}) {
  const defaults = {
    transaction: makeTx(props.txOverrides),
    canEdit: false,
    onEditRaygan: vi.fn(),
    onEditRemark: vi.fn(),
    onToggleHighlight: vi.fn(),
    role: ROLES.admin,
  }
  const merged = { ...defaults, ...props }
  delete merged.txOverrides

  const { container } = render(
    <table><tbody><TransactionRow {...merged} /></tbody></table>
  )
  return container.querySelector('tr')
}

describe('TransactionRow highlight display', () => {
  it('applies row-highlighted class when is_highlighted is true', () => {
    const tr = renderRow({ txOverrides: { is_highlighted: true } })
    expect(tr.classList.contains('row-highlighted')).toBe(true)
  })

  it('does not apply row-highlighted class when is_highlighted is false', () => {
    const tr = renderRow({ txOverrides: { is_highlighted: false } })
    expect(tr.classList.contains('row-highlighted')).toBe(false)
  })

  it('does not apply row-highlighted class when is_highlighted is null', () => {
    const tr = renderRow({ txOverrides: { is_highlighted: null } })
    expect(tr.classList.contains('row-highlighted')).toBe(false)
  })

  it('does not apply row-highlighted class when is_highlighted is undefined', () => {
    const tr = renderRow({ txOverrides: { is_highlighted: undefined } })
    expect(tr.classList.contains('row-highlighted')).toBe(false)
  })
})

describe('TransactionRow highlight toggle visibility', () => {
  it('shows highlight toggle button for admin role', () => {
    renderRow({ role: ROLES.admin, txOverrides: { is_highlighted: false } })
    expect(screen.getByRole('button', { name: 'Add highlight' })).toBeTruthy()
  })

  it('shows filled star for highlighted row (admin)', () => {
    renderRow({ role: ROLES.admin, txOverrides: { is_highlighted: true } })
    expect(screen.getByRole('button', { name: 'Remove highlight' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove highlight' }).textContent).toBe('★')
  })

  it('shows empty star for non-highlighted row (admin)', () => {
    renderRow({ role: ROLES.admin, txOverrides: { is_highlighted: false } })
    expect(screen.getByRole('button', { name: 'Add highlight' }).textContent).toBe('☆')
  })

  it('hides highlight toggle button for withdrawal role', () => {
    renderRow({ role: ROLES.withdraw, txOverrides: { is_highlighted: false } })
    expect(screen.queryByRole('button', { name: 'Add highlight' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove highlight' })).toBeNull()
  })

  it('hides highlight toggle button for income role', () => {
    renderRow({ role: ROLES.deposit, txOverrides: { is_highlighted: true } })
    expect(screen.queryByRole('button', { name: 'Add highlight' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove highlight' })).toBeNull()
  })
})
