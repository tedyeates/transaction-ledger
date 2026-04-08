import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { ROLES, PAGE_SIZE } from '../lib/constants'
import { exportToCSV } from '../lib/utils'
import { useToast } from './useToast'

export function useTransactions(role) {
  const [transactions, setTransactions] = useState([])
  const [totalCount, setTotalCount]     = useState(0)
  const [isLoading, setIsLoading]       = useState(false)
  const [isFetchingMore, setIsFetchingMore] = useState(false)
  const [hasMore, setHasMore]           = useState(false)
  const [page, setPage]                 = useState(1)
  const [filters, setFilters]           = useState({
    search: '', type: '', channel: '', dateFrom: '', dateTo: '',
    colDesc: '', colCheque: '', colMemo: '', colRemark: '',
    colChannel: '', colWithdraw: '', colDeposit: '', colBalance: '',
  })
  const [sort, setSort]                 = useState({ col: 'tx_datetime', dir: 'desc' })
  const [fullStats, setFullStats]       = useState({ withdraws: 0, deposits: 0 })
  const [latestBalance, setLatestBalance] = useState(null)
  const addToast = useToast()

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

  useEffect(() => {
    supabase.rpc('get_latest_balance').then(({ data }) => {
      if (data != null) setLatestBalance(data)
    })
  }, [])

  useEffect(() => {
    if (role === ROLES.withdraw) setFilters(f => ({ ...f, type: 'withdrawal' }))
    if (role === ROLES.deposit)  setFilters(f => ({ ...f, type: 'income' }))
  }, [role])

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
      setPage(2)
    }
    setIsLoading(false)
  }, [addToast, buildFilterParams, filters, sort])

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
        .order('id', { ascending: sort.dir !== 'asc' })
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
