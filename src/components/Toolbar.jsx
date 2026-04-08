import { ROLES } from '../lib/constants'

export function Toolbar({ filters, role, onFilterChange, onImportClick, onExportClick, exporting }) {
  const isAccountant = role !== ROLES.admin

  return (
    <div className="toolbar">
      <div className="search-box">
        <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>⌕</span>
        <input
          type="text"
          placeholder="ค้นหารายการ…"
          value={filters.search}
          onChange={e => onFilterChange({ search: e.target.value })}
          aria-label="ค้นหา"
        />
      </div>

      <div className="toolbar-divider" />

      <select
        className="filter-select"
        value={filters.type}
        disabled={isAccountant}
        onChange={e => onFilterChange({ type: e.target.value })}
        aria-label="กรองประเภท"
      >
        <option value="">ทุกประเภท</option>
        <option value="withdrawal">หักบัญชี</option>
        <option value="income">เข้าบัญชี</option>
      </select>

      <input
        type="date"
        className="filter-select"
        value={filters.dateFrom}
        onChange={e => onFilterChange({ dateFrom: e.target.value })}
        title="ตั้งแต่วันที่"
        aria-label="ตั้งแต่วันที่"
      />
      <input
        type="date"
        className="filter-select"
        value={filters.dateTo}
        onChange={e => onFilterChange({ dateTo: e.target.value })}
        title="ถึงวันที่"
        aria-label="ถึงวันที่"
      />

      {role === ROLES.admin && (
        <>
          <div className="toolbar-divider" />
          <button className="btn btn-ghost btn-sm" onClick={onImportClick}>
            ↑ นำเข้า CSV
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={onExportClick}
            disabled={exporting}
          >
            {exporting ? 'กำลังส่งออก…' : '↓ ส่งออก CSV'}
          </button>
        </>
      )}
    </div>
  )
}
