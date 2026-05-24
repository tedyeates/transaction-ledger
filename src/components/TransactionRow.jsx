import { useState } from 'react'
import { ROLES } from '../lib/constants'
import { formatBaht, formatThaiDateTime } from '../lib/utils'

export function TransactionRow({ transaction: tx, canEdit, onEditRaygan, onEditRemark, onToggleHighlight, role }) {
  const [highlightInFlight, setHighlightInFlight] = useState(false)
  const handleToggleHighlight = async () => {
    if (!onToggleHighlight || highlightInFlight) return
    setHighlightInFlight(true)
    try {
      await onToggleHighlight(tx.id, !tx.is_highlighted)
    } finally {
      setHighlightInFlight(false)
    }
  }

  const raygan = tx['memo']

  const isMissingMemo =
    canEdit &&
    ((role === ROLES.withdraw && tx.type === 'withdrawal') ||
     (role === ROLES.deposit  && tx.type === 'income')) &&
    !raygan

  const rowClasses = [
    tx.is_highlighted === true && 'row-highlighted',
    isMissingMemo && 'row-memo-missing',
  ].filter(Boolean).join(' ')

  return (
    <tr className={rowClasses}>
      <td>
        <span className="cell-date">{formatThaiDateTime(tx.tx_datetime)}</span>
      </td>
      <td><span className="cell-eff">{tx['effective_date'] ?? ''}</span></td>
      <td>
        <span className="cell-desc" title={tx['description'] ?? ''}>
          {tx['description'] ?? '—'}
        </span>
      </td>
      <td><span className="cell-cheque">{tx['cheque_number'] ?? ''}</span></td>
      <td className={`cell-amt ${tx['withdraw'] ? 'cell-amt-withdraw' : ''}`}>
        {formatBaht(tx['withdraw'])}
      </td>
      <td className={`cell-amt ${tx['deposit'] ? 'cell-amt-deposit' : ''}`}>
        {formatBaht(tx['deposit'])}
      </td>
      {role === ROLES.admin && (
        <td className="cell-balance">{formatBaht(tx['balance'])}</td>
      )}
      <td><span className="cell-channel">{tx['channel'] ?? ''}</span></td>
      <td>
        {canEdit ? (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onEditRaygan(tx)}
            title="แก้ไขรายการ"
          >
            {raygan
              ? <span className="cell-raygan">{raygan}</span>
              : <span className="cell-raygan-empty">+ เพิ่ม</span>
            }
          </button>
        ) : (
          <span className={raygan ? 'cell-raygan' : 'cell-raygan-empty'}>
            {raygan ?? '—'}
          </span>
        )}
      </td>
      {role === ROLES.admin && (
        <td>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onEditRemark(tx)}
            title="แก้ไขหมายเหตุ"
          >
            {tx.remark
              ? <span className="cell-raygan">{tx.remark}</span>
              : <span className="cell-raygan-empty">+ เพิ่ม</span>
            }
          </button>
        </td>
      )}
      {role === ROLES.admin && (
        <td className="cell-highlight-toggle">
          <button
            className="btn btn-ghost btn-sm btn-highlight-toggle"
            onClick={handleToggleHighlight}
            disabled={highlightInFlight}
            title={tx.is_highlighted ? 'ยกเลิกไฮไลท์' : 'ไฮไลท์'}
            aria-label={tx.is_highlighted ? 'Remove highlight' : 'Add highlight'}
          >
            {tx.is_highlighted ? '★' : '☆'}
          </button>
        </td>
      )}
    </tr>
  )
}
