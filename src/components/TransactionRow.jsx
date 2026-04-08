import { ROLES } from '../lib/constants'
import { formatBaht, formatThaiDateTime } from '../lib/utils'

export function TransactionRow({ transaction: tx, canEdit, onEditRaygan, onEditRemark, role }) {
  const raygan = tx['memo']

  const isMissingMemo =
    canEdit &&
    ((role === ROLES.withdraw && tx.type === 'withdrawal') ||
     (role === ROLES.deposit  && tx.type === 'income')) &&
    !raygan

  return (
    <tr className={isMissingMemo ? 'row-memo-missing' : ''}>
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
    </tr>
  )
}
