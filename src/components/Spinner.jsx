export function Spinner({ small }) {
  return <div className={`spinner${small ? ' spinner-sm' : ''}`} role="status" aria-label="กำลังโหลด" />
}
