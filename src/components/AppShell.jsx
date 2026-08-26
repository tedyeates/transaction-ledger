import { useState } from 'react'
import { ROLE_LABELS } from '../lib/constants'
import { getDefaultVisibleColumns } from '../lib/columns'
import { useTransactions } from '../hooks/useTransactions'
import { Toolbar } from './Toolbar'
import { StatsBar } from './StatsBar'
import { TransactionTable } from './TransactionTable'
import { ImportModal } from './ImportModal'
import { EditRayganModal } from './EditRayganModal'
import { EditRemarkModal } from './EditRemarkModal'
import { ConfirmDeleteModal } from './ConfirmDeleteModal'
import { ScrollToTopButton } from './ScrollToTopButton'

const VISIBLE_COLUMNS_STORAGE_KEY = 'ledger.visibleColumns'

function loadVisibleColumns() {
  const defaults = getDefaultVisibleColumns()
  try {
    const stored = JSON.parse(localStorage.getItem(VISIBLE_COLUMNS_STORAGE_KEY))
    if (stored && typeof stored === 'object') return { ...defaults, ...stored }
  } catch {
    // ignore malformed storage, fall back to defaults
  }
  return defaults
}

export function AppShell({ user, role, onLogout }) {
  const [importOpen, setImportOpen]                 = useState(false)
  const [editingTransaction, setEditingTransaction] = useState(null)
  const [editingRemark, setEditingRemark]           = useState(null)
  const [deletingTransaction, setDeletingTransaction] = useState(null)
  const [exporting, setExporting]                   = useState(false)
  const [visibleColumns, setVisibleColumns]         = useState(loadVisibleColumns)

  const handleVisibleColumnsChange = next => {
    setVisibleColumns(next)
    localStorage.setItem(VISIBLE_COLUMNS_STORAGE_KEY, JSON.stringify(next))
  }

  const {
    isLoading, isFetchingMore, hasMore,
    filters, sort,
    transactions, totalCount,
    stats,
    loadMore, resetAndLoad,
    handleSort, handleFilterChange,
    updateRayganLocally, updateRemarkLocally,
    updateHighlightLocally, toggleHighlight,
    deleteTransaction,
    exportAllTransactions,
  } = useTransactions(role)

  const handleToggleHighlight = async (id, highlighted) => {
    updateHighlightLocally([id], highlighted)
    await toggleHighlight([id], highlighted)
  }

  const handleExport = async () => {
    setExporting(true)
    await exportAllTransactions()
    setExporting(false)
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <header className="header">
        <div className="header-left">
          <div className="header-logo">บัญชี<span>รายการ</span></div>
          <div className={`role-badge role-badge-${role}`}>
            {ROLE_LABELS[role] ?? role}
          </div>
        </div>
        <div className="header-right">
          <span className="header-user">{user.email}</span>
          <button className="btn btn-ghost btn-sm" onClick={onLogout}>
            ออกจากระบบ
          </button>
        </div>
      </header>

      <Toolbar
        filters={filters}
        role={role}
        onFilterChange={handleFilterChange}
        onImportClick={() => setImportOpen(true)}
        onExportClick={handleExport}
        exporting={exporting}
        visibleColumns={visibleColumns}
        onVisibleColumnsChange={handleVisibleColumnsChange}
      />

      <StatsBar stats={stats} role={role} />

      <main className="main">
        <div className="ledger-wrap">
          <div className="ledger-header">
            <div className="ledger-title">สมุดรายการธุรกรรม</div>
            <div className="ledger-count">
              {transactions.length.toLocaleString('th-TH')} / {totalCount.toLocaleString('th-TH')} รายการ
            </div>
          </div>

          <TransactionTable
            transactions={transactions}
            totalCount={totalCount}
            isLoading={isLoading}
            isFetchingMore={isFetchingMore}
            hasMore={hasMore}
            sort={sort}
            role={role}
            onSort={handleSort}
            onLoadMore={loadMore}
            onEditRaygan={setEditingTransaction}
            onEditRemark={setEditingRemark}
            onToggleHighlight={handleToggleHighlight}
            onDeleteClick={setDeletingTransaction}
            columnFilters={filters}
            onColumnFilterChange={(key, val) => handleFilterChange({ [key]: val })}
            visibleColumns={visibleColumns}
          />
        </div>
      </main>

      {importOpen && (
        <ImportModal
          onClose={() => setImportOpen(false)}
          onImported={() => resetAndLoad()}
        />
      )}

      {editingTransaction && (
        <EditRayganModal
          transaction={editingTransaction}
          onClose={() => setEditingTransaction(null)}
          onSaved={updateRayganLocally}
        />
      )}

      {editingRemark && (
        <EditRemarkModal
          transaction={editingRemark}
          onClose={() => setEditingRemark(null)}
          onSaved={updateRemarkLocally}
        />
      )}

      {deletingTransaction && (
        <ConfirmDeleteModal
          transaction={deletingTransaction}
          onClose={() => setDeletingTransaction(null)}
          onConfirm={deleteTransaction}
        />
      )}

      <ScrollToTopButton />
    </div>
  )
}
