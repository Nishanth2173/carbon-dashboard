export function ScopeBadge({ scope }) {
  if (scope === 'scope1') return <span className="badge-scope1">Scope 1</span>
  if (scope === 'scope2') return <span className="badge-scope2">Scope 2</span>
  if (scope === 'scope3') return <span className="badge-scope3">Scope 3</span>
  return null
}

export function StatusBadge({ status }) {
  const map = {
    pending:  <span className="badge-pending">Pending</span>,
    approved: <span className="badge-approved">Approved</span>,
    rejected: <span className="badge-rejected">Rejected</span>,
    flagged:  <span className="badge-flagged">Flagged</span>,
  }
  return map[status] || <span className="badge-pending">{status}</span>
}

export function SourceBadge({ sourceType }) {
  const map = {
    sap:     { label: 'SAP',     bg: 'rgba(249,115,22,0.12)', color: '#fb923c', border: 'rgba(249,115,22,0.3)' },
    utility: { label: 'Utility', bg: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: 'rgba(59,130,246,0.3)' },
    travel:  { label: 'Travel',  bg: 'rgba(168,85,247,0.12)', color: '#c084fc', border: 'rgba(168,85,247,0.3)' },
  }
  const s = map[sourceType] || { label: sourceType, bg: 'rgba(107,138,122,0.12)', color: '#6b8a7a', border: 'rgba(107,138,122,0.3)' }
  return (
    <span className="px-2 py-0.5 rounded text-xs font-medium font-mono"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {s.label}
    </span>
  )
}
