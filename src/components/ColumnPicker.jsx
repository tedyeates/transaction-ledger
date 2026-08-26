import { useEffect, useRef, useState } from 'react'
import { TOGGLEABLE_COLUMNS, getDefaultVisibleColumns } from '../lib/columns'

function isDefaultColumns(visibleColumns) {
  const defaults = getDefaultVisibleColumns()
  return TOGGLEABLE_COLUMNS.every(col => {
    const current = visibleColumns[col.key] !== false
    const isDefault = defaults[col.key] !== false
    return current === isDefault
  })
}

export function ColumnPicker({ visibleColumns, onChange }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = e => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const shownCount = TOGGLEABLE_COLUMNS.filter(col => visibleColumns[col.key] !== false).length
  const isDefault = isDefaultColumns(visibleColumns)

  const toggleColumn = key => {
    onChange({ ...visibleColumns, [key]: visibleColumns[key] === false })
  }

  const resetToDefault = e => {
    e.stopPropagation()
    onChange(getDefaultVisibleColumns())
  }

  return (
    <div className="column-picker" ref={rootRef}>
      <button
        type="button"
        className="filter-select column-picker-trigger"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        คอลัมน์ ({shownCount}/{TOGGLEABLE_COLUMNS.length}) ▾
      </button>
      {!isDefault && (
        <button
          type="button"
          className="column-picker-clear"
          onClick={resetToDefault}
          title="คืนค่าคอลัมน์เริ่มต้น"
          aria-label="คืนค่าคอลัมน์เริ่มต้น"
        >
          ✕
        </button>
      )}
      {open && (
        <div className="column-picker-menu" role="listbox">
          <button
            type="button"
            className="column-picker-reset"
            onClick={resetToDefault}
            disabled={isDefault}
          >
            คืนค่าเริ่มต้น
          </button>
          {TOGGLEABLE_COLUMNS.map(col => (
            <label key={col.key} className="column-picker-option">
              <input
                type="checkbox"
                checked={visibleColumns[col.key] !== false}
                onChange={() => toggleColumn(col.key)}
              />
              {col.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
