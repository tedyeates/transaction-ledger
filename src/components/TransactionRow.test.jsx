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
    onDeleteClick: vi.fn(),
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
  // Counterparty name is bank-sourced descriptive data at the same
  // sensitivity as description (statement-format-v2 design.md), so all
  // three roles — admin, withdrawal, income — see the same cell. The masked
  // account number is admin-only operational metadata (#30 acceptance
  // criteria) and renders as its own column next to the name, not as a
  // hover title on the name cell.
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

  it('shows the masked counterparty account as its own visible column for admin, adjacent to counterparty name', () => {
    const tr = renderRow({
      role: ROLES.admin,
      txOverrides: { counterparty_name: 'Example Counterparty', counterparty_account: '0942XXX148' },
    })
    const nameCell = tr.querySelector('.cell-counterparty')
    const accountCell = tr.querySelector('.cell-counterparty-account')
    expect(nameCell.textContent).toBe('Example Counterparty')
    expect(accountCell).not.toBeNull()
    expect(accountCell.textContent).toBe('0942XXX148')
    // Adjacent columns: the account cell's <td> is the next sibling of the
    // name cell's <td> (each is a <span> wrapped in its own <td>).
    expect(nameCell.parentElement.nextElementSibling).toBe(accountCell.parentElement)
  })

  it.each([ROLES.withdraw, ROLES.deposit])(
    'hides the counterparty_account column entirely for %s role',
    (role) => {
      const tr = renderRow({
        role,
        txOverrides: { counterparty_name: 'Example Counterparty', counterparty_account: '0942XXX148' },
      })
      expect(tr.querySelector('.cell-counterparty-account')).toBeNull()
      expect(tr.textContent).not.toContain('0942XXX148')
    }
  )
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

describe('TransactionRow admin-only operational metadata (fx_rate)', () => {
  it('shows fx_rate for admin', () => {
    const tr = renderRow({
      role: ROLES.admin,
      txOverrides: { fx_rate: 33.5 },
    })
    // fx_rate cell has no dedicated class beyond cell-amt; assert via td order
    // is brittle, so assert the formatted value appears somewhere in the row.
    expect(tr.textContent).toContain('33.50')
  })

  it.each([ROLES.withdraw, ROLES.deposit])(
    'hides fx_rate for %s role',
    (role) => {
      const tr = renderRow({
        role,
        txOverrides: { fx_rate: 33.5 },
      })
      expect(tr.textContent).not.toContain('33.50')
    }
  )
})

describe('TransactionRow delete action (admin-only, isolated, confirmable)', () => {
  it('shows a delete button for admin role', () => {
    renderRow({ role: ROLES.admin })
    expect(screen.getByRole('button', { name: /ลบรายการ/ })).toBeTruthy()
  })

  it.each([ROLES.withdraw, ROLES.deposit])(
    'hides the delete button for %s role',
    (role) => {
      renderRow({ role })
      expect(screen.queryByRole('button', { name: /ลบรายการ/ })).toBeNull()
    }
  )

  it('uses the btn-danger class for the delete button', () => {
    renderRow({ role: ROLES.admin })
    const btn = screen.getByRole('button', { name: /ลบรายการ/ })
    expect(btn.classList.contains('btn-danger')).toBe(true)
  })

  it('has an aria-label naming the transaction being deleted', () => {
    const tr = renderRow({ role: ROLES.admin, txOverrides: { description: 'ค่าน้ำค่าไฟ' } })
    const btn = tr.querySelector('.btn-danger')
    expect(btn.getAttribute('aria-label')).toContain('ค่าน้ำค่าไฟ')
  })

  it('calls onDeleteClick with the transaction when clicked, without opening other modals', () => {
    const onDeleteClick = vi.fn()
    const onEditRemark = vi.fn()
    const tr = renderRow({ role: ROLES.admin, onDeleteClick, onEditRemark })
    tr.querySelector('.btn-danger').click()
    expect(onDeleteClick).toHaveBeenCalledTimes(1)
    expect(onDeleteClick.mock.calls[0][0].id).toBe(1)
    expect(onEditRemark).not.toHaveBeenCalled()
  })

  it('places the delete action in its own isolated cell, separate from the highlight toggle', () => {
    const tr = renderRow({ role: ROLES.admin })
    const deleteCell = tr.querySelector('.cell-delete-action')
    const highlightCell = tr.querySelector('.cell-highlight-toggle')
    expect(deleteCell).not.toBeNull()
    expect(highlightCell).not.toBeNull()
    // Delete cell must be its own <td>, not sharing a cell with the highlight toggle.
    expect(deleteCell).not.toBe(highlightCell)
    expect(deleteCell.contains(highlightCell)).toBe(false)
  })
})
