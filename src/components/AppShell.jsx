import { useState } from 'react'
import { ROLE_LABELS } from '../lib/constants'
import { useTransactions } from '../hooks/useTransactions'
import { Toolbar } from './Toolbar'
import { StatsBar } from './StatsBar'
import { TransactionTable } from './TransactionTable'
import { ImportModal } from './ImportModal'
import { EditRayganModal } from './EditRayganModal'
import { EditRemarkModal } from './EditRemarkModal'
import { ScrollToTopButton } from './ScrollToTopButton'

export function AppShell({ user, role, onLogout }) {
  const [importOpen, setImportOpen]                 = useState(false)
  const [editingTransaction, setEditingTransaction] = useState(null)
  const [editingRemark, setEditingRemark]           = useState(null)
  const [exporting, setExporting]                   = useState(false)

  const {
    isLoading, isFetchingMore, hasMore,
    filters, sort,
    transactions, totalCount,
    stats,
    loadMore, resetAndLoad,
    handleSort, handleFilterChange,
    updateRayganLocally, updateRemarkLocally,
    exportAllTransactions,
  } = useTransactions(role)

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
            columnFilters={filters}
            onColumnFilterChange={(key, val) => handleFilterChange({ [key]: val })}
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

      <ScrollToTopButton />
    </div>
  )
}
