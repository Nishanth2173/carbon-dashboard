import clsx from 'clsx'

export default function StatCard({ label, value, unit, icon: Icon, color = 'green', trend, sublabel }) {
  const colors = {
    green:  { bg: 'rgba(34,197,94,0.1)',   border: 'rgba(34,197,94,0.25)',   text: '#4ade80',  icon: '#22c55e' },
    orange: { bg: 'rgba(249,115,22,0.1)',  border: 'rgba(249,115,22,0.25)',  text: '#fb923c',  icon: '#f97316' },
    blue:   { bg: 'rgba(59,130,246,0.1)',  border: 'rgba(59,130,246,0.25)', text: '#60a5fa',  icon: '#3b82f6' },
    purple: { bg: 'rgba(168,85,247,0.1)',  border: 'rgba(168,85,247,0.25)', text: '#c084fc',  icon: '#a855f7' },
    yellow: { bg: 'rgba(234,179,8,0.1)',   border: 'rgba(234,179,8,0.25)',   text: '#fbbf24',  icon: '#eab308' },
    red:    { bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.25)',   text: '#f87171',  icon: '#ef4444' },
  }
  const c = colors[color] || colors.green

  return (
    <div className="card p-5 animate-slide-up" style={{ borderColor: c.border }}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          {label}
        </p>
        {Icon && (
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: c.bg }}>
            <Icon size={16} style={{ color: c.icon }} />
          </div>
        )}
      </div>

      <div className="flex items-end gap-2">
        <span className="text-3xl font-bold font-mono" style={{ color: c.text }}>
          {value}
        </span>
        {unit && <span className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>{unit}</span>}
      </div>

      {sublabel && (
        <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>{sublabel}</p>
      )}
    </div>
  )
}
