import { ROLES } from '../lib/constants'
import { formatBaht } from '../lib/utils'

export function StatsBar({ stats, role }) {
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
