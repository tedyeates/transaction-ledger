import { useState } from 'react'
import { Modal } from './Modal'

/**
 * Confirmation modal for destructive delete actions (SSW destructive button
 * UX rule: https://www.ssw.com.au/rules/destructive-button-ui-ux).
 *
 * - Confirm action is a clearly red/danger-styled button, distinct from the
 *   default "safe" Cancel button.
 * - Copy explicitly states the action is irreversible.
 * - Cancel, not Confirm, is the visually primary/default action — deleting
 *   is never the path of least resistance.
 */
export function ConfirmDeleteModal({ transaction, onClose, onConfirm }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError]       = useState('')

  const handleConfirm = async () => {
    setError('')
    setDeleting(true)
    const ok = await onConfirm(transaction.id)
    setDeleting(false)
    if (ok) onClose()
    else setError('ไม่สามารถลบรายการได้ กรุณาลองใหม่')
  }

  return (
    <Modal
      title="ยืนยันการลบรายการ"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={deleting} autoFocus>
            ยกเลิก
          </button>
          <button
            className="btn btn-danger"
            onClick={handleConfirm}
            disabled={deleting}
            aria-label={deleting ? 'กำลังลบ…' : `ลบรายการ ${transaction.description ?? ''}`}
          >
            <span aria-hidden="true">🗑</span>
            {deleting ? 'กำลังลบ…' : 'ลบรายการ'}
          </button>
        </>
      }
    >
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--muted)', marginBottom: '0.9rem', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
        {`วันที่: ${transaction.tx_datetime}\nคำอธิบาย: ${transaction.description ?? '—'}`}
      </p>
      <p style={{ fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '0.5rem' }}>
        คุณแน่ใจหรือไม่ว่าต้องการลบรายการนี้?
      </p>
      <p style={{ fontSize: '0.82rem', color: 'var(--withdraw)', fontWeight: 600 }}>
        การลบนี้ไม่สามารถย้อนกลับได้ (This action cannot be undone.)
      </p>
      {error && <div className="error-msg" role="alert">{error}</div>}
    </Modal>
  )
}
