import { ROLES } from '../lib/constants'
import { SortableHeader } from './SortableHeader'
import { InfiniteScrollSentinel } from './InfiniteScrollSentinel'
import { TransactionRow } from './TransactionRow'

export function TransactionTable({
  transactions, totalCount, isLoading, isFetchingMore, hasMore,
  sort, role, onSort, onLoadMore, onEditRaygan, onEditRemark,
  columnFilters, onColumnFilterChange,
}) {
  const canEdit = role !== ROLES.admin

  const columns = [
    { key: 'tx_datetime',   label: 'วันที่ทำรายการ' },
    { key: 'effective_date', label: 'วันที่มีผล' },
    { key: 'description',   label: 'คำอธิบาย',   filterKey: 'colDesc',     numeric: false },
    { key: 'cheque_number', label: 'เลขที่เช็ค',  filterKey: 'colCheque',   numeric: false },
    { key: 'withdraw',      label: 'หักบัญชี',    filterKey: 'colWithdraw', numeric: true  },
    { key: 'deposit',       label: 'เข้าบัญชี',   filterKey: 'colDeposit',  numeric: true  },
    ...(role === ROLES.admin ? [{ key: 'balance', label: 'ยอดคงเหลือ', filterKey: 'colBalance', numeric: true }] : []),
    { key: 'channel',       label: 'ช่องทาง',     filterKey: 'colChannel',  numeric: false },
    { key: 'memo',          label: canEdit ? 'รายการ ✏' : 'รายการ', filterKey: 'colMemo', numeric: false },
    ...(role === ROLES.admin ? [{ key: 'remark', label: 'หมายเหตุ ✏', filterKey: 'colRemark', numeric: false }] : []),
  ]

  return (
    <>
      <div className={`table-scroll ${isLoading ? 'table-loading' : ''}`}>
        <table>
          <thead>
            <tr>
              {columns.map(({ key, label, filterKey, numeric }) => (
                <SortableHeader
                  key={key}
                  col={key}
                  label={label}
                  sort={sort}
                  onSort={onSort}
                  numeric={numeric}
                  filterValue={filterKey ? columnFilters[filterKey] : undefined}
                  onFilterChange={filterKey ? val => onColumnFilterChange(filterKey, val) : undefined}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 && !isLoading ? (
              <tr>
                <td colSpan={columns.length}>
                  <div className="empty-state">
                    <div className="empty-icon">📒</div>
                    <div className="empty-text">ไม่พบรายการธุรกรรม</div>
                    <div className="empty-sub">ลองปรับตัวกรองหรือนำเข้าไฟล์ CSV</div>
                  </div>
                </td>
              </tr>
            ) : (
              transactions.map(tx => (
                <TransactionRow
                  key={tx.id}
                  transaction={tx}
                  canEdit={canEdit}
                  onEditRaygan={onEditRaygan}
                  onEditRemark={onEditRemark}
                  role={role}
                />
              ))
            )}
          </tbody>
        </table>

        <InfiniteScrollSentinel
          hasMore={hasMore}
          isFetchingMore={isFetchingMore}
          onLoadMore={onLoadMore}
          loadedCount={transactions.length}
          totalCount={totalCount}
        />
      </div>
    </>
  )
}
