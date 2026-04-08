import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { PREVIEW_COLS } from '../lib/constants'
import { parseBankCSV } from '../lib/utils'
import { useToast } from '../hooks/useToast'
import { Modal } from './Modal'

export function ImportModal({ onClose, onImported }) {
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
