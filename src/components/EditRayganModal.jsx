import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../hooks/useToast'
import { Modal } from './Modal'

export function EditRayganModal({ transaction, onClose, onSaved }) {
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
