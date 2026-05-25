import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { History, Lock, CheckCircle2, XCircle, Flag, Edit } from 'lucide-react'
import api from '../utils/api'
import PageHeader from '../components/PageHeader'

const ACTION_STYLES = {
  approved: { color: '#4ade80', bg: 'rgba(34,197,94,0.1)', icon: CheckCircle2 },
  rejected: { color: '#f87171', bg: 'rgba(239,68,68,0.1)', icon: XCircle },
  locked:   { color: '#6b8a7a', bg: 'rgba(107,138,122,0.1)', icon: Lock },
  flagged:  { color: '#fb923c', bg: 'rgba(249,115,22,0.1)', icon: Flag },
  edited:   { color: '#60a5fa', bg: 'rgba(59,130,246,0.1)', icon: Edit },
  created:  { color: '#c084fc', bg: 'rgba(168,85,247,0.1)', icon: History },
}

export default function AuditPage() {
  const [recordId, setRecordId] = useState('')
  const [inputVal, setInputVal] = useState('')

  const { data: records } = useQuery({
    queryKey: ['records-ids'],
    queryFn: () => api.get('/records/', { params: { page: 1 } }).then(r => r.data),
  })

  const { data: trail, isLoading, error } = useQuery({
    queryKey: ['audit', recordId],
    queryFn: () => api.get(`/records/${recordId}/audit/`).then(r => r.data),
    enabled: !!recordId,
  })

  const trailList = trail?.results || trail || []

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Audit Trail"
        subtitle="Immutable log of every status change, approval, and lock event"
      />

      <div className="mb-6 p-5 card">
        <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Enter Record ID</p>
        <div className="flex gap-3">
          <input
            className="input flex-1 font-mono text-xs"
            placeholder="Paste a record UUID (e.g. from the Review page)"
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
          />
          <button className="btn-primary" onClick={() => setRecordId(inputVal.trim())}>
            Load Trail
          </button>
        </div>

        {/* Quick pick from recent records */}
        {records?.results?.length > 0 && (
          <div className="mt-3">
            <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Or pick a recent record:</p>
            <div className="flex flex-wrap gap-1.5">
              {records.results.slice(0, 8).map(r => (
                <button key={r.id}
                  onClick={() => { setInputVal(r.id); setRecordId(r.id) }}
                  className="px-2 py-1 rounded text-xs font-mono transition-all"
                  style={{
                    background: recordId === r.id ? 'var(--accent-dim)' : 'var(--bg-deep)',
                    border: recordId === r.id ? '1px solid var(--border-bright)' : '1px solid var(--border)',
                    color: recordId === r.id ? 'var(--accent)' : 'var(--text-muted)',
                  }}>
                  {r.id.slice(0, 8)} · {r.category_display}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {isLoading && (
        <div className="p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          Loading audit trail…
        </div>
      )}

      {!isLoading && recordId && trailList.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No audit events for this record yet</p>
        </div>
      )}

      {trailList.length > 0 && (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-5 top-0 bottom-0 w-px"
            style={{ background: 'var(--border)' }} />

          <div className="space-y-4 pl-12">
            {trailList.map((entry, i) => {
              const s = ACTION_STYLES[entry.action] || ACTION_STYLES.edited
              const Icon = s.icon
              return (
                <div key={entry.id} className="relative animate-slide-up" style={{ animationDelay: `${i * 50}ms` }}>
                  {/* Node */}
                  <div className="absolute -left-[2.65rem] top-3 w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: s.bg, border: `1px solid ${s.color}30` }}>
                    <Icon size={14} style={{ color: s.color }} />
                  </div>

                  <div className="card p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded"
                          style={{ background: s.bg, color: s.color, border: `1px solid ${s.color}30` }}>
                          {entry.action_display}
                        </span>
                        {entry.performed_by && (
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            by <strong style={{ color: 'var(--text-primary)' }}>{entry.performed_by.username}</strong>
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-mono flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                        {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : ''}
                      </span>
                    </div>

                    {entry.note && (
                      <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>"{entry.note}"</p>
                    )}

                    {(entry.before_state || entry.after_state) && (
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        {entry.before_state && (
                          <div>
                            <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Before</p>
                            <pre className="text-xs p-2 rounded font-mono"
                              style={{ background: 'var(--bg-deep)', color: '#f87171', border: '1px solid var(--border)' }}>
                              {JSON.stringify(entry.before_state, null, 2)}
                            </pre>
                          </div>
                        )}
                        {entry.after_state && (
                          <div>
                            <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>After</p>
                            <pre className="text-xs p-2 rounded font-mono"
                              style={{ background: 'var(--bg-deep)', color: '#4ade80', border: '1px solid var(--border)' }}>
                              {JSON.stringify(entry.after_state, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
