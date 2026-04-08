import { useState, useEffect } from 'react'
import { useDebounce } from '../hooks/useDebounce'

export function SortableHeader({ col, label, sort, onSort, filterValue, onFilterChange, numeric }) {
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
