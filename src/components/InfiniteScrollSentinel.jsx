import { useEffect, useRef } from 'react'
import { Spinner } from './Spinner'

export function InfiniteScrollSentinel({ hasMore, isFetchingMore, onLoadMore, totalCount, loadedCount }) {
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
