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
const PAGE_SIZE = 25
const PREVIEW_COLS = ['tx_datetime', 'description', 'withdraw', 'deposit', 'balance', 'channel']

const ROLES ={
  admin: 'admin',
  withdraw: 'withdrawal',
  deposit: 'income',
}

const ROLE_LABELS = {
  [ROLES.withdraw]: 'หักบัญชี · แก้ไขรายการเท่านั้น',
  [ROLES.deposit]:     'เข้าบัญชี · แก้ไขรายการเท่านั้น',
  [ROLES.admin]:       'ผู้บริหาร',
}

// ─────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────

/**
 * Convert "D/M/YYYY HH:MM" Buddhist Era string to ISO format
 * "YYYY-MM-DDTHH:MM:00" in Gregorian year for Supabase TIMESTAMPTZ
 */
function thaiDateStringToISO(str) {
  if (!str) return null
  const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/)
  if (!match) return null
  const [, d, m, y, h, min] = match
  const gregorianYear = parseInt(y) - 543
  return `${gregorianYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:${min}:00`
}

/** Format a number as Thai Baht */
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

/**
 * Split a single CSV line, respecting double-quoted fields.
 */
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

/**
 * Parse a bank CSV buffer (TIS-620 or UTF-8).
 * Skips header rows until วันที่ทำรายการ is found,
 * stops reading at the first row with no date value.
 * Returns an array of transaction objects ready for Supabase insert.
 */
function parseBankCSV(arrayBuffer) {
  // Try TIS-620 (windows-874 is the browser-supported alias), fall back to UTF-8
  let text
  try {
    const decoded = new TextDecoder('windows-874').decode(new Uint8Array(arrayBuffer))
    text = decoded.includes('วันที่ทำรายการ') ? decoded : new TextDecoder('utf-8').decode(new Uint8Array(arrayBuffer))
  } catch {
    text = new TextDecoder('utf-8').decode(new Uint8Array(arrayBuffer))
  }

  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

  // Locate the header row
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

  // Read data rows until no date is found (footer rows)
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
    const deposit = parseFloat(r['เข้าบัญชี']?.replace(/,/g, '')) || null
    const balance = parseFloat(r['ยอดคงเหลือ']?.replace(/,/g, '')) || null
    const txDatetime = thaiDateStringToISO(r['วันที่ทำรายการ'])

    return {
      tx_datetime:    txDatetime,
      effective_date: r['วันที่มีผล']        || null,
      description:    r['คำอธิบาย']          || null,
      cheque_number:  r['เลขที่เช็ค']        || null,
      withdraw:          withdraw,
      deposit:         deposit,
      balance:        balance,
      channel:        r['ช่องทางทำรายการ']   || null,
      type:           withdraw != null ? 'withdrawal' : 'income',
    }
  })
}

// ─────────────────────────────────────────────────────────────
// Toast context — provides addToast() to the whole tree
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
// useTransactions — all data fetching and filtering logic
// ─────────────────────────────────────────────────────────────
function useTransactions(role) {
  const [transactions, setTransactions] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [channels, setChannels] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [filters, setFilters] = useState({ search: '', type: '', channel: '', dateFrom: '', dateTo: '' })
  const [sort, setSort] = useState({ col: 'tx_datetime', dir: 'desc' })
  const [page, setPage] = useState(1)
  const [fullStats, setFullStats] = useState({ withdraws: 0, deposits: 0 })
  const addToast = useToast()

  // Lock type filter for accountants
  useEffect(() => {
    if (role === ROLES.withdraw) setFilters(f => ({ ...f, type: 'withdrawal' }))
    if (role === ROLES.income) setFilters(f => ({ ...f, type: 'income' }))
  }, [role])

  // Fetch channels once on mount for the filter dropdown
  useEffect(() => {
    supabase
      .from('transactions')
      .select('channel')
      .neq('channel', null)
      .then(({ data }) => {
        if (data) setChannels([...new Set(data.map(r => r.channel))].sort())
      })
  }, [])

  useEffect(() => {
    const fetchStats = async () => {
      let query = supabase
        .from('transactions')
        .select('type, withdraw, deposit')

      if (filters.type)     query = query.eq('type', filters.type)
      if (filters.channel)  query = query.eq('channel', filters.channel)
      if (filters.dateFrom) query = query.gte('tx_datetime', filters.dateFrom)
      if (filters.dateTo)   query = query.lte('tx_datetime', filters.dateTo + 'T23:59:59')
      if (filters.search) {
        query = query.or(
          `description.ilike.%${filters.search}%,memo.ilike.%${filters.search}%,cheque_number.ilike.%${filters.search}%,channel.ilike.%${filters.search}%`
        )
      }

      const { data } = await query
      if (data) {
        setFullStats({
          withdraws: data.filter(t => t.type === 'withdrawal').reduce((s, t) => s + Number(t.withdraw  ?? 0), 0),
          deposits:  data.filter(t => t.type === 'income').reduce((s, t)     => s + Number(t.deposit ?? 0), 0),
        })
      }
    }
    fetchStats()
  }, [filters])

  const loadTransactions = useCallback(async () => {
    setIsLoading(true)

    let query = supabase
      .from('transactions')
      .select('*', { count: 'exact' })
      .order(sort.col, { ascending: sort.dir === 'asc' })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

    // Apply filters server-side
    if (filters.type)     query = query.eq('type', filters.type)
    if (filters.channel)  query = query.eq('channel', filters.channel)
    if (filters.dateFrom) query = query.gte('tx_datetime', filters.dateFrom)
    if (filters.dateTo)   query = query.lte('tx_datetime', filters.dateTo + 'T23:59:59')
    if (filters.search) {
      query = query.or(
        `description.ilike.%${filters.search}%,memo.ilike.%${filters.search}%,cheque_number.ilike.%${filters.search}%,channel.ilike.%${filters.search}%`
      )
    }

    const { data, error, count } = await query

    if (error) {
      console.error('Load error:', error)
      addToast(error.message, 'error')
    } else {
      setTransactions(data ?? [])
      setTotalCount(count ?? 0)
    }
    setIsLoading(false)
  }, [addToast, filters, sort, page])

  // Reload whenever filters, sort or page change
  useEffect(() => {
    loadTransactions()
  }, [loadTransactions])

  const handleSort = useCallback(col => {
    setSort(prev => ({ col, dir: prev.col === col && prev.dir === 'desc' ? 'asc' : 'desc' }))
    setPage(1)
  }, [])

  const handleFilterChange = useCallback(delta => {
    setFilters(prev => ({ ...prev, ...delta }))
    setPage(1)
  }, [])

  // Optimistic updates — update current page only
  const updateRayganLocally = useCallback((id, value) => {
    setTransactions(prev =>
      prev.map(tx => tx.id === id ? { ...tx, memo: value || null } : tx)
    )
  }, [])

  const updateRemarkLocally = useCallback((id, value) => {
    setTransactions(prev =>
      prev.map(tx => tx.id === id ? { ...tx, remark: value || null } : tx)
    )
  }, [])

  const stats = {
    total:     totalCount,
    withdraws: fullStats.withdraws,
    deposits:  fullStats.deposits,  
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  return {
    isLoading, filters, sort, page, setPage,
    channels, transactions, totalCount,
    totalPages, stats,
    loadTransactions, handleSort, handleFilterChange,
    updateRayganLocally, updateRemarkLocally,
  }
}

// ─────────────────────────────────────────────────────────────
// Small reusable UI components
// ─────────────────────────────────────────────────────────────

function Spinner() {
  return <div className="spinner" role="status" aria-label="กำลังโหลด" />
}

function Modal({ title, onClose, footer, size, children }) {
  // Close on overlay click
  const handleOverlayClick = e => {
    if (e.target === e.currentTarget) onClose()
  }
  // Close on Escape key
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

function SortableHeader({ col, label, sort, onSort }) {
  const isActive = sort.col === col
  const arrow = isActive ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''
  return (
    <th
      onClick={() => onSort(col)}
      className={isActive ? 'col-sorted' : ''}
      aria-sort={isActive ? sort.dir : 'none'}
    >
      {label}{arrow}
    </th>
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
        <div className="stat">
          <div className="stat-label">ยอดสุทธิ</div>
          <div className="stat-value" style={{ color: netColor }}>
            {net >= 0 ? '+' : '-'}{formatBaht(Math.abs(net))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Toolbar
// ─────────────────────────────────────────────────────────────
function Toolbar({ filters, channels, role, onFilterChange, onImportClick }) {
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

      <select
        className="filter-select"
        value={filters.channel}
        onChange={e => onFilterChange({ channel: e.target.value })}
        aria-label="กรองช่องทาง"
      >
        <option value="">ทุกช่องทาง</option>
        {channels.map(c => <option key={c} value={c}>{c}</option>)}
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
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// EditRayganModal — edit the รายการ field only
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
// ImportModal — CSV upload and preview
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
      const { error: sbError } = await supabase
        .from('transactions')
        .upsert(chunk, { onConflict: 'tx_datetime,balance', ignoreDuplicates: true })

      if (sbError) { 
        console.error('Import error:', sbError)
        setError(sbError.message); setImporting(false); return 
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
// TransactionTable
// ─────────────────────────────────────────────────────────────
function TransactionTable({
  transactions, totalFiltered, isLoading,
  sort, page, totalPages,
  role, onSort, onPageChange, onEditRaygan, onEditRemark,
}) {
  const canEdit = role !== ROLES.admin

  const columns = [
    { key: 'tx_datetime', label: 'วันที่ทำรายการ' },
    { key: 'effective_date',     label: 'วันที่มีผล' },
    { key: 'description',       label: 'คำอธิบาย' },
    { key: 'cheque_number',     label: 'เลขที่เช็ค' },
    { key: 'withdraw',       label: 'หักบัญชี' },
    { key: 'deposit',      label: 'เข้าบัญชี' },
    { key: 'balance',     label: 'ยอดคงเหลือ' },
    { key: 'channel', label: 'ช่องทาง' },
    { key: 'memo',          label: canEdit ? 'รายการ ✏' : 'รายการ' },
    ...(role === ROLES.admin ? [{ key: 'remark', label: 'หมายเหตุ ✏' }] : []),
  ]

  if (isLoading) {
    return (
      <div className="loading-state">
        <Spinner />
        <br />กำลังโหลด…
      </div>
    )
  }

  if (!transactions.length) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📒</div>
        <div className="empty-text">ไม่พบรายการธุรกรรม</div>
        <div className="empty-sub">ลองปรับตัวกรองหรือนำเข้าไฟล์ CSV</div>
      </div>
    )
  }

  return (
    <>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {columns.map(({ key, label }) => (
                <SortableHeader key={key} col={key} label={label} sort={sort} onSort={onSort} />
              ))}
            </tr>
          </thead>
          <tbody>
            {transactions.map(tx => (
              <TransactionRow
                key={tx.id}
                transaction={tx}
                canEdit={canEdit}
                onEditRaygan={onEditRaygan}
                onEditRemark={onEditRemark}
                role={role}
              />
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <div className="page-info">หน้า {page} จาก {totalPages} ({totalFiltered.toLocaleString('th-TH')} รายการ)</div>
          <div className="page-btns">
            <button
              className="page-btn"
              onClick={() => onPageChange(page - 1)}
              disabled={page === 1}
              aria-label="หน้าก่อนหน้า"
            >‹</button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
              .map((p, idx, arr) => (
                <>
                  {idx > 0 && arr[idx - 1] !== p - 1 && (
                    <span key={`ellipsis-${p}`} style={{ padding: '0 0.3rem', color: 'var(--muted)', fontSize: '0.68rem' }}>…</span>
                  )}
                  <button
                    key={p}
                    className={`page-btn ${p === page ? 'page-btn-active' : ''}`}
                    onClick={() => onPageChange(p)}
                  >{p}</button>
                </>
              ))
            }

            <button
              className="page-btn"
              onClick={() => onPageChange(page + 1)}
              disabled={page === totalPages}
              aria-label="หน้าถัดไป"
            >›</button>
          </div>
        </div>
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────
// TransactionRow
// ─────────────────────────────────────────────────────────────
function TransactionRow({ transaction: tx, canEdit, onEditRaygan, onEditRemark, role }) {
  const raygan = tx['memo']

  return (
    <tr>
      <td>
        <span className="cell-date">
          {formatThaiDateTime(tx.tx_datetime)}
        </span>
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
      <td className="cell-balance">{formatBaht(tx['balance'])}</td>
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
// AppShell — the authenticated layout
// ─────────────────────────────────────────────────────────────
function AppShell({ user, role, onLogout }) {
  const [importOpen, setImportOpen]           = useState(false)
  const [editingTransaction, setEditingTransaction] = useState(null)
  const [editingRemark, setEditingRemark] = useState(null)

  const {
    isLoading, filters, sort, page, setPage,
    channels, transactions, totalCount,
    totalPages, stats,
    loadTransactions, handleSort, handleFilterChange,
    updateRayganLocally, updateRemarkLocally,
  } = useTransactions(role)
  // Initial data load
  useEffect(() => { loadTransactions() }, [loadTransactions])

  const handlePageChange = p => {
    setPage(p)
    window.scrollTo(0, 0)
  }

  const handleRayganSaved = (id, value) => {
    updateRayganLocally(id, value)
  }

  const handleRemarkSaved = (id, value) => {
    updateRemarkLocally(id, value)
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Header */}
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

      {/* Toolbar */}
      <Toolbar
        filters={filters}
        channels={channels}
        role={role}
        onFilterChange={handleFilterChange}
        onImportClick={() => setImportOpen(true)}
      />

      {/* Stats */}
      <StatsBar stats={stats} role={role} />

      {/* Ledger */}
      <main className="main">
        <div className="ledger-wrap">
          <div className="ledger-header">
            <div className="ledger-title">สมุดรายการธุรกรรม</div>
            <div className="ledger-count">
              {totalCount.toLocaleString('th-TH')} รายการ
            </div>
          </div>

          <TransactionTable
            transactions={transactions}
            totalFiltered={totalCount}
            isLoading={isLoading}
            sort={sort}
            page={page}
            totalPages={totalPages}
            role={role}
            onSort={handleSort}
            onPageChange={handlePageChange}
            onEditRaygan={setEditingTransaction}
            onEditRemark={setEditingRemark}
          />
        </div>
      </main>

      {/* Modals */}
      {importOpen && (
        <ImportModal
          onClose={() => setImportOpen(false)}
          onImported={loadTransactions}
        />
      )}

      {editingTransaction && (
        <EditRayganModal
          transaction={editingTransaction}
          onClose={() => setEditingTransaction(null)}
          onSaved={handleRayganSaved}
        />
      )}

      {editingRemark && (
        <EditRemarkModal
          transaction={editingRemark}
          onClose={() => setEditingRemark(null)}
          onSaved={handleRemarkSaved}
        />
      )}
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

  // Restore session on mount
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

  const handleLogin = async authUser => {
    await resolveRole(authUser)
  }

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

  if (!user) {
    return <AuthScreen onLogin={handleLogin} />
  }

  return (
    <AppShell
      user={user}
      role={role}
      onLogout={handleLogout}
    />
  )
}

// ─────────────────────────────────────────────────────────────
// Root — ToastProvider wraps the whole tree so every component
// can call useToast(). This is the default export consumed by
// main.jsx.
// ─────────────────────────────────────────────────────────────
function RootApp() {
  return (
    <ToastProvider>
      <App />
    </ToastProvider>
  )
}

export default RootApp
