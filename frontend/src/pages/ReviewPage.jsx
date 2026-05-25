import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, XCircle, Flag, Lock, Filter, ChevronLeft, ChevronRight, Eye } from 'lucide-react'
import api from '../utils/api'
import PageHeader from '../components/PageHeader'
import { ScopeBadge, StatusBadge, SourceBadge } from '../components/Badges'
import { format } from 'date-fns'

const SCOPES = ['', 'scope1', 'scope2', 'scope3']
const STATUSES = ['', 'pending', 'approved', 'rejected', 'flagged']
const SOURCES = ['', 'sap', 'utility', 'travel']

function RecordDetailModal({ record, onClose }) {
  if (!record) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className="card w-full max-w-2xl max-h-[80vh] overflow-y-auto"
        style={{ border: '1px solid var(--border-bright)' }}>
        <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <ScopeBadge scope={record.scope} />
            <StatusBadge status={record.status} />
            {record.is_locked && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
                style={{ background: 'rgba(107,138,122,0.15)', color: '#6b8a7a', border: '1px solid rgba(107,138,122,0.3)' }}>
                <Lock size={10} /> Locked
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-xs btn-ghost px-2 py-1">✕ Close</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {[
              ['Category', record.category_display],
              ['Activity Date', record.activity_date],
              ['Activity Value', `${record.activity_value?.toFixed(2)} ${record.activity_unit}`],
              ['CO₂e', `${record.co2e_kg?.toFixed(2)} kg`],
              ['Emission Factor', `${record.emission_factor} kgCO₂e/${record.activity_unit}`],
              ['EF Source', record.emission_factor_source],
              ['Site / Cost Center', record.site_or_cost_center || '—'],
              ['Country', record.country || '—'],
              ['Source File', record.source_filename || '—'],
              ['Row Index', `#${record.source_row_index}`],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
                <p className="text-sm font-mono" style={{ color: 'var(--text-primary)' }}>{value}</p>
              </div>
            ))}
          </div>

          {record.flag_reason && (
            <div className="p-3 rounded-lg text-xs" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
              ⚠ {record.flag_reason}
            </div>
          )}

          {record.review_note && (
            <div className="p-3 rounded-lg text-xs" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)' }}>
              <p className="uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Review Note</p>
              <p style={{ color: 'var(--text-primary)' }}>{record.review_note}</p>
            </div>
          )}

          <div>
            <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Raw Source Data</p>
            <pre className="text-xs p-3 rounded-lg overflow-x-auto font-mono"
              style={{ background: 'var(--bg-deep)', color: '#4ade80', border: '1px solid var(--border)' }}>
              {JSON.stringify(record.raw_data, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ReviewPage() {
  const [page, setPage] = useState(1)
  const [scope, setScope] = useState('')
  const [status, setStatus] = useState('')
  const [source, setSource] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [reviewNote, setReviewNote] = useState('')
  const [detail, setDetail] = useState(null)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['records', page, scope, status, source],
    queryFn: () => api.get('/records/', {
      params: { page, scope: scope || undefined, status: status || undefined, source_type: source || undefined }
    }).then(r => r.data),
  })

  const bulkMutation = useMutation({
    mutationFn: ({ action, ids }) => api.post('/records/bulk-review/', {
      record_ids: ids, action, note: reviewNote
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['records'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setSelected(new Set())
      setReviewNote('')
    },
  })

  const lockMutation = useMutation({
    mutationFn: (ids) => api.post('/records/lock/', { record_ids: ids }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['records'] })
      setSelected(new Set())
    },
  })

  const records = data?.results || []
  const totalPages = data ? Math.ceil(data.count / 20) : 1
  const allSelected = records.length > 0 && records.every(r => selected.has(r.id))

  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(records.map(r => r.id)))
  }

  const toggle = (id) => {
    const s = new Set(selected)
    s.has(id) ? s.delete(id) : s.add(id)
    setSelected(s)
  }

  const selectedIds = [...selected]

  return (
    <div className="animate-fade-in">
      <PageHeader title="Review Records" subtitle={`${data?.count || 0} total records`} />

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <Filter size={14} style={{ color: 'var(--text-muted)' }} />
        {[
          { label: 'Scope', value: scope, onChange: setScope, options: [['', 'All Scopes'], ['scope1', 'Scope 1'], ['scope2', 'Scope 2'], ['scope3', 'Scope 3']] },
          { label: 'Status', value: status, onChange: setStatus, options: [['', 'All Status'], ['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['flagged', 'Flagged']] },
          { label: 'Source', value: source, onChange: setSource, options: [['', 'All Sources'], ['sap', 'SAP'], ['utility', 'Utility'], ['travel', 'Travel']] },
        ].map(({ label, value, onChange, options }) => (
          <select key={label} value={value} onChange={e => { onChange(e.target.value); setPage(1) }}
            className="input text-xs py-1.5" style={{ width: 'auto' }}>
            {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        ))}
      </div>

      {/* Bulk actions */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 rounded-xl flex-wrap"
          style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-bright)' }}>
          <span className="text-sm font-medium" style={{ color: 'var(--accent)' }}>
            {selectedIds.length} selected
          </span>
          <input
            className="input flex-1 max-w-xs text-xs py-1.5"
            placeholder="Review note (optional)…"
            value={reviewNote}
            onChange={e => setReviewNote(e.target.value)}
          />
          <button onClick={() => bulkMutation.mutate({ action: 'approve', ids: selectedIds })}
            disabled={bulkMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' }}>
            <CheckCircle2 size={12} /> Approve
          </button>
          <button onClick={() => bulkMutation.mutate({ action: 'reject', ids: selectedIds })}
            disabled={bulkMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
            <XCircle size={12} /> Reject
          </button>
          <button onClick={() => lockMutation.mutate(selectedIds)}
            disabled={lockMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ background: 'rgba(107,138,122,0.15)', color: '#6b8a7a', border: '1px solid rgba(107,138,122,0.3)' }}>
            <Lock size={12} /> Lock for Audit
          </button>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--bg-deep)', borderBottom: '1px solid var(--border)' }}>
                <th className="p-3 text-left w-10">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll}
                    className="w-3.5 h-3.5 accent-green-500 cursor-pointer" />
                </th>
                {['Date', 'Scope', 'Category', 'Activity', 'CO₂e (kg)', 'Site', 'Source', 'Flags', 'Status', ''].map(h => (
                  <th key={h} className="p-3 text-left text-xs font-medium uppercase tracking-wider"
                    style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={10} className="p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                  Loading records…
                </td></tr>
              )}
              {!isLoading && records.length === 0 && (
                <tr><td colSpan={10} className="p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                  No records match current filters
                </td></tr>
              )}
              {records.map(record => (
                <tr key={record.id} className="table-row">
                  <td className="p-3">
                    <input type="checkbox" checked={selected.has(record.id)}
                      onChange={() => toggle(record.id)}
                      className="w-3.5 h-3.5 accent-green-500 cursor-pointer" />
                  </td>
                  <td className="p-3 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                    {record.activity_date}
                  </td>
                  <td className="p-3"><ScopeBadge scope={record.scope} /></td>
                  <td className="p-3 text-xs" style={{ color: 'var(--text-primary)' }}>
                    {record.category_display}
                  </td>
                  <td className="p-3 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                    {record.activity_value?.toFixed(1)} {record.activity_unit}
                  </td>
                  <td className="p-3 font-mono text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {record.co2e_kg?.toFixed(2)}
                  </td>
                  <td className="p-3 text-xs max-w-[160px] truncate" style={{ color: 'var(--text-muted)' }}>
                    {record.site_or_cost_center || '—'}
                  </td>
                  <td className="p-3"><SourceBadge sourceType={record.ingestion_job?.source_type || ''} /></td>
                  <td className="p-3">
                    <div className="flex items-center gap-1.5">
                      {record.is_duplicate && (
                        <span className="text-xs px-1.5 py-0.5 rounded font-mono"
                          style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>DUP</span>
                      )}
                      {record.is_outlier && (
                        <span className="text-xs px-1.5 py-0.5 rounded font-mono"
                          style={{ background: 'rgba(234,179,8,0.1)', color: '#fbbf24' }}>OUT</span>
                      )}
                      {record.is_locked && (
                        <Lock size={10} style={{ color: 'var(--text-muted)' }} />
                      )}
                    </div>
                  </td>
                  <td className="p-3"><StatusBadge status={record.status} /></td>
                  <td className="p-3">
                    <button onClick={() => setDetail(record)}
                      className="p-1.5 rounded transition-all opacity-50 hover:opacity-100"
                      style={{ border: '1px solid var(--border)' }}>
                      <Eye size={12} style={{ color: 'var(--text-muted)' }} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--border)' }}>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Page {page} of {totalPages} · {data?.count} records
            </span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="btn-ghost py-1.5 px-2 disabled:opacity-40">
                <ChevronLeft size={14} />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="btn-ghost py-1.5 px-2 disabled:opacity-40">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      <RecordDetailModal record={detail} onClose={() => setDetail(null)} />
    </div>
  )
}
