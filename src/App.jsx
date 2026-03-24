import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react'
import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────
// Supabase client
// ─────────────────────────────────────────────────────────────
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const PAGE_SIZE = 75
const PREVIEW_COLS = ['tx_datetime', 'description', 'withdraw', 'deposit', 'balance', 'channel']

const ROLES = {
  admin: 'admin',
  withdraw: 'withdrawal',
  deposit: 'income',
}

const ROLE_LABELS = {
  [ROLES.withdraw]: 'หักบัญชี · แก้ไขรายการเท่านั้น',
  [ROLES.deposit]:  'เข้าบัญชี · แก้ไขรายการเท่านั้น',
  [ROLES.admin]:    'ผู้บริหาร',
}

// ─────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────

const THAI_MONTHS = {
  'ม.ค.': 1, 'ก.พ.': 2, 'มี.ค.': 3, 'เม.ย.': 4,
  'พ.ค.': 5, 'มิ.ย.': 6, 'ก.ค.': 7, 'ส.ค.': 8,
  'ก.ย.': 9, 'ต.ค.': 10, 'พ.ย.': 11, 'ธ.ค.': 12,
}

function thaiDateStringToISO(str) {
  if (!str) return null

  const thaiMatch = str.match(/^(\d{1,2})\s+(\S+)\s+(\d{4})\s+(\d{1,2}):(\d{2})/)
  if (thaiMatch) {
    const [, d, monthAbbr, y, h, min] = thaiMatch
    const month = THAI_MONTHS[monthAbbr]
    if (!month) return null
    const gregorianYear = parseInt(y) - 543
    return `${gregorianYear}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:${min}:00`
  }

  const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/)
  if (slashMatch) {
    const [, d, m, y, h, min] = slashMatch
    const gregorianYear = parseInt(y) - 543
    return `${gregorianYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:${min}:00`
  }

  return null
}

function formatBaht(value) {
  if (value == null || value === '') return ''
  return '฿' + Number(value).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatThaiDateTime(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  const d = date.getUTCDate()
  const m = date.getUTCMonth() + 1
  const y = date.getUTCFullYear() + 543
  const h = String(date.getUTCHours()).padStart(2, '0')
  const min = String(date.getUTCMinutes()).padStart(2, '0')
  return `${d}/${m}/${y} ${h}:${min}`
}

function exportToCSV(transactions) {
  const headers = [
    'วันที่ทำรายการ', 'วันที่มีผล', 'คำอธิบาย', 'เลขที่เช็ค',
    'หักบัญชี', 'เข้าบัญชี', 'ยอดคงเหลือ', 'ช่องทาง', 'รายการ', 'หมายเหตุ'
  ]

  const rows = transactions.map(tx => [
    formatThaiDateTime(tx.tx_datetime),
    tx.effective_date ?? '',
    tx.description ?? '',
    tx.cheque_number ?? '',
    tx.withdraw ?? '',
    tx.deposit ?? '',
    tx.balance ?? '',
    tx.channel ?? '',
    tx.memo ?? '',
    tx.remark ?? '',
  ])

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const BOM = '\uFEFF'
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `transactions_${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

function splitCSVLine(line) {
  const fields = []
  let current = ''
  let inQuotes = false
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      fields.push(current)
      current = ''
    } else {
      current += char
    }
  }
  fields.push(current)
  return fields
}

function parseBankCSV(arrayBuffer) {
  let text
  try {
    const decoded = new TextDecoder('windows-874').decode(new Uint8Array(arrayBuffer))
    text = decoded.includes('วันที่ทำรายการ') ? decoded : new TextDecoder('utf-8').decode(new Uint8Array(arrayBuffer))
  } catch {
    text = new TextDecoder('utf-8').decode(new Uint8Array(arrayBuffer))
  }

  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

  let headerIndex = -1
  let headers = []
  for (let i = 0; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i])
    if (cols[0]?.trim() === 'วันที่ทำรายการ') {
      headerIndex = i
      headers = cols.map(c => c.trim())
      break
    }
  }
  if (headerIndex === -1) throw new Error('ไม่พบหัวตาราง (วันที่ทำรายการ) ในไฟล์ CSV')

  const rows = []
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i])
    const dateValue = cols[headers.indexOf('วันที่ทำรายการ')]?.trim()
    if (!dateValue) break

    const rowObj = {}
    headers.forEach((h, j) => { rowObj[h] = cols[j]?.trim() ?? '' })
    rows.push(rowObj)
  }
  if (rows.length === 0) throw new Error('ไม่พบรายการธุรกรรมในไฟล์')

  return rows.map(r => {
    const withdraw  = parseFloat(r['หักบัญชี']?.replace(/,/g, ''))  || null
    const deposit   = parseFloat(r['เข้าบัญชี']?.replace(/,/g, '')) || null
    const balance   = parseFloat(r['ยอดคงเหลือ']?.replace(/,/g, '')) || null
    const txDatetime = thaiDateStringToISO(r['วันที่ทำรายการ'])

    return {
      tx_datetime:    txDatetime,
      effective_date: r['วันที่มีผล']        || null,
      description:    r['คำอธิบาย']          || null,
      cheque_number:  r['เลขที่เช็ค']        || null,
      withdraw,
      deposit,
      balance,
      channel:        r['ช่องทางทำรายการ']   || null,
      type:           withdraw != null ? 'withdrawal' : 'income',
    }
  })
}

// ─────────────────────────────────────────────────────────────
// Toast context
// ─────────────────────────────────────────────────────────────
const ToastContext = createContext(null)
const useToast = () => useContext(ToastContext)

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((message, variant = 'default') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, variant }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4200)
  }, [])

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.variant}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// ─────────────────────────────────────────────────────────────
// useTransactions — infinite scroll version
// Key changes:
//   • transactions is now an accumulated list (append-only per filter set)
//   • page tracks the *next* page to load
//   • hasMore signals whether more pages exist
//   • loadMore() fetches the next page and appends
//   • resetAndLoad() resets the list and loads page 1 fresh
// ─────────────────────────────────────────────────────────────
function useTransactions(role) {
  const [transactions, setTransactions] = useState([])
  const [totalCount, setTotalCount]     = useState(0)
  const [isLoading, setIsLoading]       = useState(false)
  const [isFetchingMore, setIsFetchingMore] = useState(false)
  const [hasMore, setHasMore]           = useState(false)
  const [page, setPage]                 = useState(1)         // next page to fetch
  const [filters, setFilters]           = useState({
    search: '', type: '', channel: '', dateFrom: '', dateTo: '',
    colDesc: '', colCheque: '', colMemo: '', colRemark: '',
    colChannel: '', colWithdraw: '', colDeposit: '', colBalance: '',
  })
  const [sort, setSort]                 = useState({ col: 'tx_datetime', dir: 'desc' })
  const [fullStats, setFullStats]       = useState({ withdraws: 0, deposits: 0 })
  const [latestBalance, setLatestBalance] = useState(null)
  const addToast = useToast()

  // Stable ref so loadMore closure always sees latest page/filters/sort
  const stateRef = useRef({ page, filters, sort })
  useEffect(() => { stateRef.current = { page, filters, sort } }, [page, filters, sort])

  const buildFilterParams = useCallback((f = filters) => ({
    p_type:        f.type        || null,
    p_channel:     f.channel     || null,
    p_date_from:   f.dateFrom    || null,
    p_date_to:     f.dateTo ? f.dateTo + 'T23:59:59' : null,
    p_search:      f.search      || null,
    p_desc:        f.colDesc     || null,
    p_cheque:      f.colCheque   || null,
    p_memo:        f.colMemo     || null,
    p_remark:      f.colRemark   || null,
    p_col_channel: f.colChannel  || null,
    p_withdraw:    f.colWithdraw ? Number(f.colWithdraw) : null,
    p_deposit:     f.colDeposit  ? Number(f.colDeposit)  : null,
    p_balance:     f.colBalance  ? Number(f.colBalance)  : null,
  }), [filters])

  // Fetch latest balance once
  useEffect(() => {
    supabase.rpc('get_latest_balance').then(({ data }) => {
      if (data != null) setLatestBalance(data)
    })
  }, [])

  // Lock type filter for accountants
  useEffect(() => {
    if (role === ROLES.withdraw) setFilters(f => ({ ...f, type: 'withdrawal' }))
    if (role === ROLES.deposit)  setFilters(f => ({ ...f, type: 'income' }))
  }, [role])

  // Stats query (re-runs on filter change)
  useEffect(() => {
    supabase.rpc('get_transaction_stats_v2', buildFilterParams()).then(({ data }) => {
      if (data?.[0]) {
        setFullStats({
          withdraws: Number(data[0].total_withdraws),
          deposits:  Number(data[0].total_deposits),
        })
      }
    })
  }, [buildFilterParams])

  // ── resetAndLoad: wipe list, fetch page 1 ──────────────────
  const resetAndLoad = useCallback(async (newFilters = filters, newSort = sort) => {
    setIsLoading(true)
    setTransactions([])
    setPage(1)
    setHasMore(false)

    const params = buildFilterParams(newFilters)
    const { data, error, count } = await supabase
      .rpc('get_transactions_v2', params, { count: 'exact' })
      .order(newSort.col, { ascending: newSort.dir === 'asc' })
      .order('id', { ascending: newSort.dir !== 'asc' }) 
      .range(0, PAGE_SIZE - 1)

    if (error) {
      addToast(error.message, 'error')
    } else {
      const rows = data ?? []
      setTransactions(rows)
      setTotalCount(count ?? 0)
      setHasMore(rows.length === PAGE_SIZE && rows.length < (count ?? 0))
      setPage(2)    // next fetch will request page 2
    }
    setIsLoading(false)
  }, [addToast, buildFilterParams, filters, sort])

  // ── loadMore: append next page ─────────────────────────────
  const loadMore = useCallback(async () => {
    if (isFetchingMore) return
    setIsFetchingMore(true)

    const { page: currentPage, filters: currentFilters, sort: currentSort } = stateRef.current
    const params = buildFilterParams(currentFilters)
    const from = (currentPage - 1) * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1

    const { data, error, count } = await supabase
      .rpc('get_transactions_v2', params, { count: 'exact' })
      .order(currentSort.col, { ascending: currentSort.dir === 'asc' })
      .order('id', { ascending: currentSort.dir !== 'asc' })
      .range(from, to)

    if (error) {
      addToast(error.message, 'error')
    } else {
      const rows = data ?? []
      setTransactions(prev => {
        const existingIds = new Set(prev.map(t => t.id))
        const fresh = rows.filter(r => !existingIds.has(r.id))
        return [...prev, ...fresh]
      })
      setTotalCount(count ?? 0)
      const newTotal = transactions.length + rows.length
      setHasMore(rows.length === PAGE_SIZE && newTotal < (count ?? 0))
      setPage(p => p + 1)
    }
    setIsFetchingMore(false)
  }, [addToast, buildFilterParams, isFetchingMore, transactions.length])

  // Initial load
  useEffect(() => {
    resetAndLoad(filters, sort)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSort = useCallback(col => {
    const newSort = { col, dir: sort.col === col && sort.dir === 'desc' ? 'asc' : 'desc' }
    setSort(newSort)
    resetAndLoad(filters, newSort)
  }, [filters, sort, resetAndLoad])

  const handleFilterChange = useCallback(delta => {
    const newFilters = { ...filters, ...delta }
    setFilters(newFilters)
    resetAndLoad(newFilters, sort)
  }, [filters, sort, resetAndLoad])

  const updateRayganLocally = useCallback((id, value) => {
    setTransactions(prev => prev.map(tx => tx.id === id ? { ...tx, memo: value || null } : tx))
  }, [])

  const updateRemarkLocally = useCallback((id, value) => {
    setTransactions(prev => prev.map(tx => tx.id === id ? { ...tx, remark: value || null } : tx))
  }, [])

  const exportAllTransactions = useCallback(async () => {
    const EXPORT_CHUNK = 1000
    let allRows = []
    let from = 0
    let more = true
    addToast('กำลังเตรียมข้อมูล…', 'default')
    while (more) {
      const { data, error } = await supabase
        .rpc('get_transactions_v2', buildFilterParams())
        .order(sort.col, { ascending: sort.dir === 'asc' })
        .range(from, from + EXPORT_CHUNK - 1)
      if (error) { addToast(error.message, 'error'); return }
      allRows = [...allRows, ...(data ?? [])]
      more = data?.length === EXPORT_CHUNK
      from += EXPORT_CHUNK
    }
    if (!allRows.length) { addToast('ไม่มีข้อมูลที่จะส่งออก', 'default'); return }
    exportToCSV(allRows)
    addToast(`ส่งออก ${allRows.length.toLocaleString('th-TH')} รายการเรียบร้อย`, 'success')
  }, [addToast, buildFilterParams, sort])

  const stats = {
    total:     totalCount,
    withdraws: fullStats.withdraws,
    deposits:  fullStats.deposits,
    balance:   latestBalance,
  }

  return {
    isLoading, isFetchingMore, hasMore,
    filters, sort,
    transactions, totalCount,
    stats,
    loadMore, resetAndLoad,
    handleSort, handleFilterChange,
    updateRayganLocally, updateRemarkLocally,
    exportAllTransactions,
  }
}

// ─────────────────────────────────────────────────────────────
// Small reusable UI components
// ─────────────────────────────────────────────────────────────

function Spinner({ small }) {
  return <div className={`spinner${small ? ' spinner-sm' : ''}`} role="status" aria-label="กำลังโหลด" />
}

function Modal({ title, onClose, footer, size, children }) {
  const handleOverlayClick = e => { if (e.target === e.currentTarget) onClose() }
  useEffect(() => {
    const handleKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={handleOverlayClick} role="dialog" aria-modal="true">
      <div className={`modal ${size === 'sm' ? 'modal-sm' : ''}`}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="modal-close" onClick={onClose} aria-label="ปิด">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

function SortableHeader({ col, label, sort, onSort, filterValue, onFilterChange, numeric }) {
  const isActive = sort.col === col
  const hasFilter = filterValue && filterValue.length > 0
  const arrow = isActive ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''

  const [localValue, setLocalValue] = useState(filterValue ?? '')
  const debouncedValue = useDebounce(localValue, 400)

  useEffect(() => {
    if (debouncedValue !== filterValue) onFilterChange?.(debouncedValue)
  }, [debouncedValue])

  useEffect(() => {
    if (filterValue === '' && localValue !== '') setLocalValue('')
  }, [filterValue])

  const handleChange = e => {
    const val = numeric ? e.target.value.replace(/[^0-9.]/g, '') : e.target.value
    setLocalValue(val)
  }

  return (
    <th className={isActive ? 'col-sorted' : ''}>
      <div className="th-label" onClick={() => onSort(col)} style={{ cursor: 'pointer' }}>
        {label}{arrow}
      </div>
      {onFilterChange && (
        <input
          className={`col-filter-input ${hasFilter ? 'col-filter-active' : ''}`}
          value={localValue}
          onChange={handleChange}
          onClick={e => e.stopPropagation()}
          placeholder="ค้นหา…"
          inputMode={numeric ? 'decimal' : 'text'}
        />
      )}
    </th>
  )
}

// ─────────────────────────────────────────────────────────────
// ScrollToTop button — appears after scrolling down
// ─────────────────────────────────────────────────────────────
function ScrollToTopButton() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!visible) return null

  return (
    <button
      className="scroll-to-top"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="กลับขึ้นด้านบน"
      title="กลับขึ้นด้านบน"
    >
      ↑
    </button>
  )
}

// ─────────────────────────────────────────────────────────────
// InfiniteScrollSentinel — triggers loadMore via IntersectionObserver
// ─────────────────────────────────────────────────────────────
function InfiniteScrollSentinel({ hasMore, isFetchingMore, onLoadMore, totalCount, loadedCount }) {
  const sentinelRef = useRef(null)

  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return
    const scrollContainer = sentinelRef.current.closest('.table-scroll')
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) onLoadMore() },
      { root: scrollContainer, rootMargin: '300px' }
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [hasMore, onLoadMore])

  return (
    <div className="infinite-sentinel" ref={sentinelRef}>
      {isFetchingMore && (
        <div className="infinite-loading">
          <Spinner small />
          <span>กำลังโหลดเพิ่มเติม…</span>
        </div>
      )}
      {!hasMore && loadedCount > 0 && (
        <div className="infinite-end">
          แสดงครบทั้ง {loadedCount.toLocaleString('th-TH')} รายการ จาก {totalCount.toLocaleString('th-TH')} รายการ
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// AuthScreen
// ─────────────────────────────────────────────────────────────
function AuthScreen({ onLogin }) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const addToast = useToast()

  const configured = (
    import.meta.env.VITE_SUPABASE_URL !== 'YOUR_SUPABASE_URL' &&
    !!import.meta.env.VITE_SUPABASE_URL
  )

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    if (!email || !password) { setError('กรุณากรอกอีเมลและรหัสผ่าน'); return }
    setLoading(true)
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (authError) { setError(authError.message); return }
    addToast('เข้าสู่ระบบสำเร็จ', 'success')
    onLogin(data.user)
  }

  return (
    <div className="auth-screen">
      <div className="auth-box">
        <div className="auth-logo">บัญชี<span>รายการ</span></div>
        <div className="auth-sub">Thai Bank Ledger System</div>

        {!configured && (
          <div className="config-notice">
            ⚠ กรุณากำหนดค่า Supabase ก่อนใช้งาน<br />
            เพิ่ม VITE_SUPABASE_URL และ VITE_SUPABASE_ANON_KEY ในไฟล์ .env
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="accountant@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          {error && <div className="error-msg" role="alert">{error}</div>}

          <button
            type="submit"
            className="btn btn-primary btn-full"
            style={{ marginTop: '1.25rem' }}
            disabled={loading}
          >
            {loading ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// StatsBar
// ─────────────────────────────────────────────────────────────
function StatsBar({ stats, role }) {
  const net = stats.deposits - stats.withdraws
  const netColor = net >= 0 ? 'var(--deposit)' : 'var(--withdraw)'

  return (
    <div className="stats-bar">
      <div className="stat">
        <div className="stat-label">รายการทั้งหมด</div>
        <div className="stat-value stat-value-neutral">
          {stats.total.toLocaleString('th-TH')}
        </div>
      </div>

      {role !== 'income' && (
        <div className="stat">
          <div className="stat-label">ยอดหักรวม</div>
          <div className="stat-value stat-value-withdraw">{formatBaht(stats.withdraws)}</div>
        </div>
      )}

      {role !== 'withdrawal' && (
        <div className="stat">
          <div className="stat-label">ยอดเข้ารวม</div>
          <div className="stat-value stat-value-deposit">{formatBaht(stats.deposits)}</div>
        </div>
      )}

      {role === ROLES.admin && (
        <>
          <div className="stat">
            <div className="stat-label">Total gain</div>
            <div className="stat-value" style={{ color: netColor }}>
              {net >= 0 ? '+' : '-'}{formatBaht(Math.abs(net))}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">ยอดคงเหลือปัจจุบัน</div>
            <div className="stat-value" style={{ color: 'var(--deposit)' }}>
              {formatBaht(stats.balance)}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Toolbar
// ─────────────────────────────────────────────────────────────
function Toolbar({ filters, role, onFilterChange, onImportClick, onExportClick, exporting }) {
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

// ─────────────────────────────────────────────────────────────
// EditRayganModal
// ─────────────────────────────────────────────────────────────
function EditRayganModal({ transaction, onClose, onSaved }) {
  const [value, setValue]   = useState(transaction['memo'] ?? '')
  const [error, setError]   = useState('')
  const [saving, setSaving] = useState(false)
  const addToast = useToast()

  const handleSave = async () => {
    setError('')
    setSaving(true)
    const { error: sbError } = await supabase
      .rpc('update_memo', { tx_id: transaction.id, new_memo: value.trim() || null })
    setSaving(false)
    if (sbError) { setError(sbError.message); return }
    addToast('บันทึกรายการเรียบร้อย', 'success')
    onSaved(transaction.id, value.trim())
    onClose()
  }

  return (
    <Modal
      title="แก้ไขรายการ"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </>
      }
    >
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--muted)', marginBottom: '1rem', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
        {`วันที่: ${transaction['tx_datetime']}\nคำอธิบาย: ${transaction['description'] ?? '—'}`}
      </p>
      <div className="field">
        <label htmlFor="raygan-input">รายการ (บันทึกของนักบัญชี)</label>
        <textarea
          id="raygan-input"
          rows={3}
          placeholder="ระบุรายการหรือหมวดหมู่…"
          style={{ resize: 'vertical' }}
          value={value}
          onChange={e => setValue(e.target.value)}
          autoFocus
        />
      </div>
      {error && <div className="error-msg" role="alert">{error}</div>}
    </Modal>
  )
}

function EditRemarkModal({ transaction, onClose, onSaved }) {
  const [value, setValue]   = useState(transaction.remark ?? '')
  const [error, setError]   = useState('')
  const [saving, setSaving] = useState(false)
  const addToast = useToast()

  const handleSave = async () => {
    setError('')
    setSaving(true)
    const { error: sbError } = await supabase
      .rpc('update_remark', { tx_id: transaction.id, new_remark: value.trim() || null })
    setSaving(false)
    if (sbError) { console.error('Remark error:', sbError); setError(sbError.message); return }
    addToast('บันทึกหมายเหตุเรียบร้อย', 'success')
    onSaved(transaction.id, value.trim())
    onClose()
  }

  return (
    <Modal
      title="แก้ไขหมายเหตุ"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </>
      }
    >
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--muted)', marginBottom: '1rem', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
        {`วันที่: ${transaction.tx_datetime}\nคำอธิบาย: ${transaction.description ?? '—'}`}
      </p>
      <div className="field">
        <label htmlFor="remark-input">หมายเหตุ (สำหรับผู้บริหาร)</label>
        <textarea
          id="remark-input"
          rows={3}
          placeholder="ระบุหมายเหตุ…"
          style={{ resize: 'vertical' }}
          value={value}
          onChange={e => setValue(e.target.value)}
          autoFocus
        />
      </div>
      {error && <div className="error-msg" role="alert">{error}</div>}
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────
// ImportModal
// ─────────────────────────────────────────────────────────────
function ImportModal({ onClose, onImported }) {
  const [parsedRows, setParsedRows] = useState(null)
  const [error, setError]           = useState('')
  const [importing, setImporting]   = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const fileRef = useRef(null)
  const addToast = useToast()

  const handleFile = file => {
    if (!file) return
    setError('')
    setParsedRows(null)
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const rows = parseBankCSV(e.target.result)
        setParsedRows(rows)
      } catch (err) {
        console.error('CSV parse error:', err)
        setError(err.message)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleDrop = e => {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleImport = async () => {
    if (!parsedRows) return
    setImporting(true)
    setError('')
    const CHUNK = 500
    let imported = 0
    for (let i = 0; i < parsedRows.length; i += CHUNK) {
      const chunk = parsedRows.slice(i, i + CHUNK)
      const { error: sbError } = await supabase.rpc('import_transactions', { rows: chunk })
      if (sbError) {
        console.error('Import error:', sbError)
        setError(sbError.message)
        setImporting(false)
        return
      }
      imported += chunk.length
    }
    setImporting(false)
    addToast(`นำเข้า ${imported} รายการ — ข้ามรายการซ้ำ`, 'success')
    onImported()
    onClose()
  }

  return (
    <Modal
      title="นำเข้า CSV จากธนาคาร"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
          {parsedRows && (
            <button className="btn btn-accent" onClick={handleImport} disabled={importing}>
              {importing ? 'กำลังนำเข้า…' : 'นำเข้ารายการ'}
            </button>
          )}
        </>
      }
    >
      <p className="import-note">
        รองรับไฟล์ CSV จากธนาคารกสิกร (TIS-620)<br />
        ระบบจะข้ามแถวก่อนหัวตาราง และหยุดที่แถวที่ไม่มีวันที่<br />
        รายการซ้ำ (วันที่ + ยอดคงเหลือเดิม) จะถูกข้ามโดยอัตโนมัติ
      </p>

      <div
        className={`dropzone ${dragActive ? 'dropzone-active' : ''}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragActive(true) }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        aria-label="อัปโหลดไฟล์ CSV"
        onKeyDown={e => e.key === 'Enter' && fileRef.current?.click()}
      >
        <div className="dropzone-icon">📄</div>
        <div className="dropzone-text">
          คลิกหรือลากไฟล์ CSV มาวางที่นี่<br />รองรับ TIS-620 / UTF-8
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          style={{ display: 'none' }}
          onChange={e => handleFile(e.target.files[0])}
        />
      </div>

      {parsedRows && (
        <>
          <div className="preview-wrap">
            <table>
              <thead>
                <tr>{PREVIEW_COLS.map(c => <th key={c}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {parsedRows.slice(0, 6).map((row, i) => (
                  <tr key={i}>
                    {PREVIEW_COLS.map(c => (
                      <td key={c}>{row[c] != null ? String(row[c]) : ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="preview-info">
            {parsedRows.length} รายการพร้อมนำเข้า — รายการซ้ำจะถูกข้ามโดยอัตโนมัติ
          </div>
        </>
      )}

      {error && <div className="error-msg" role="alert">{error}</div>}
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────
// TransactionTable — no pagination UI; sentinel at bottom
// ─────────────────────────────────────────────────────────────
function TransactionTable({
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

// ─────────────────────────────────────────────────────────────
// TransactionRow (unchanged)
// ─────────────────────────────────────────────────────────────
function TransactionRow({ transaction: tx, canEdit, onEditRaygan, onEditRemark, role }) {
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

// ─────────────────────────────────────────────────────────────
// AppShell
// ─────────────────────────────────────────────────────────────
function AppShell({ user, role, onLogout }) {
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

// ─────────────────────────────────────────────────────────────
// App — root component, handles auth state
// ─────────────────────────────────────────────────────────────
function App() {
  const [user, setUser]   = useState(null)
  const [role, setRole]   = useState(null)
  const [ready, setReady] = useState(false)
  const addToast = useToast()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        resolveRole(session.user).then(() => setReady(true))
      } else {
        setReady(true)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) { setUser(null); setRole(null) }
    })
    return () => subscription.unsubscribe()
  }, [])

  const resolveRole = async authUser => {
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', authUser.id)
      .single()
    setUser(authUser)
    setRole(data?.role ?? null)
  }

  const handleLogin = async authUser => { await resolveRole(authUser) }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setRole(null)
    addToast('ออกจากระบบแล้ว')
  }

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ink)' }}>
        <Spinner />
      </div>
    )
  }

  if (!user) return <AuthScreen onLogin={handleLogin} />

  return <AppShell user={user} role={role} onLogout={handleLogout} />
}

function RootApp() {
  return (
    <ToastProvider>
      <App />
    </ToastProvider>
  )
}

export default RootApp