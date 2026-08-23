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

describe('TransactionRow counterparty display', () => {
  // Counterparty name and masked account are bank-sourced descriptive data
  // at the same sensitivity as description (statement-format-v2 design.md),
  // so all three roles — admin, withdrawal, income — see the same cell.
  // The masked account (e.g. 0942XXX148) shows only as a hover title, never
  // as visible cell text — the bank's own masking must not be exposed further.
  it.each([ROLES.admin, ROLES.withdraw, ROLES.deposit])(
    'shows counterparty_name text for %s role',
    (role) => {
      const tr = renderRow({
        role,
        txOverrides: { counterparty_name: 'บจก. ชิโนซาวา (ประเทศไทย)', counterparty_account: '0942XXX148' },
      })
      const cell = tr.querySelector('.cell-counterparty')
      expect(cell).not.toBeNull()
      expect(cell.textContent).toBe('บจก. ชิโนซาวา (ประเทศไทย)')
    }
  )

  it.each([ROLES.admin, ROLES.withdraw, ROLES.deposit])(
    'renders an empty counterparty cell rather than hiding it for %s role when counterparty_name is null',
    (role) => {
      const tr = renderRow({ role, txOverrides: { counterparty_name: null, counterparty_account: null } })
      const cell = tr.querySelector('.cell-counterparty')
      expect(cell).not.toBeNull()
      expect(cell.textContent).toBe('')
    }
  )

  it('exposes the masked counterparty account only as a title attribute, not as visible text', () => {
    const tr = renderRow({
      role: ROLES.admin,
      txOverrides: { counterparty_name: 'Example Counterparty', counterparty_account: '0942XXX148' },
    })
    const cell = tr.querySelector('.cell-counterparty')
    expect(cell.getAttribute('title')).toBe('0942XXX148')
    expect(cell.textContent).not.toContain('0942XXX148')
  })
})

describe('TransactionRow bank-descriptive columns (branch, location, terminal, narrative)', () => {
  // Branch, location, terminal ID, and narrative are bank-sourced descriptive
  // data at the same sensitivity as description/counterparty_name (#30), so
  // all three roles see the same cells.
  it.each([ROLES.admin, ROLES.withdraw, ROLES.deposit])(
    'shows branch, location, terminal_id and narrative text for %s role',
    (role) => {
      const tr = renderRow({
        role,
        txOverrides: {
          branch: 'HEAD OFFICE',
          location: 'Sathorn',
          terminal_id: '004286',
          narrative: 'Bank narrative text',
        },
      })
      expect(tr.querySelector('.cell-branch').textContent).toBe('HEAD OFFICE')
      expect(tr.querySelector('.cell-location').textContent).toBe('Sathorn')
      expect(tr.querySelector('.cell-terminal').textContent).toBe('004286')
      expect(tr.querySelector('.cell-narrative').textContent).toBe('Bank narrative text')
    }
  )

  it.each([ROLES.admin, ROLES.withdraw, ROLES.deposit])(
    'renders empty branch/location/terminal/narrative cells rather than hiding them for %s role when null',
    (role) => {
      const tr = renderRow({
        role,
        txOverrides: { branch: null, location: null, terminal_id: null, narrative: null },
      })
      expect(tr.querySelector('.cell-branch').textContent).toBe('')
      expect(tr.querySelector('.cell-location').textContent).toBe('')
      expect(tr.querySelector('.cell-terminal').textContent).toBe('')
      expect(tr.querySelector('.cell-narrative').textContent).toBe('')
    }
  )
})

describe('TransactionRow admin-only operational metadata (counterparty_account, fx_rate, statement_format, statement_exported_at)', () => {
  it('shows counterparty_account, fx_rate, statement_format and statement_exported_at for admin', () => {
    const tr = renderRow({
      role: ROLES.admin,
      txOverrides: {
        counterparty_account: '0942XXX148',
        fx_rate: 33.5,
        statement_format: 'english_v2',
        statement_exported_at: '2026-08-21T10:49:45Z',
      },
    })
    expect(tr.querySelector('.cell-counterparty-account').textContent).toBe('0942XXX148')
    expect(tr.querySelector('.cell-statement-format').textContent).toBe('english_v2')
    expect(tr.querySelector('.cell-exported-at').textContent).not.toBe('')
    // fx_rate cell has no dedicated class beyond cell-amt; assert via td order
    // is brittle, so assert the formatted value appears somewhere in the row.
    expect(tr.textContent).toContain('33.50')
  })

  it.each([ROLES.withdraw, ROLES.deposit])(
    'hides counterparty_account, fx_rate, statement_format and statement_exported_at cells for %s role',
    (role) => {
      const tr = renderRow({
        role,
        txOverrides: {
          counterparty_account: '0942XXX148',
          fx_rate: 33.5,
          statement_format: 'english_v2',
          statement_exported_at: '2026-08-21T10:49:45Z',
        },
      })
      expect(tr.querySelector('.cell-counterparty-account')).toBeNull()
      expect(tr.querySelector('.cell-statement-format')).toBeNull()
      expect(tr.querySelector('.cell-exported-at')).toBeNull()
    }
  )
})
