import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import api from '../utils/api'
import PageHeader from '../components/PageHeader'

const FAILURE_COLORS = {
  parse_error:    { bg: 'rgba(239,68,68,0.1)',   color: '#f87171',  border: 'rgba(239,68,68,0.3)' },
  missing_field:  { bg: 'rgba(234,179,8,0.1)',   color: '#fbbf24',  border: 'rgba(234,179,8,0.3)' },
  invalid_unit:   { bg: 'rgba(249,115,22,0.1)',  color: '#fb923c',  border: 'rgba(249,115,22,0.3)' },
  invalid_date:   { bg: 'rgba(168,85,247,0.1)',  color: '#c084fc',  border: 'rgba(168,85,247,0.3)' },
  unknown_code:   { bg: 'rgba(59,130,246,0.1)',  color: '#60a5fa',  border: 'rgba(59,130,246,0.3)' },
  validation:     { bg: 'rgba(107,138,122,0.1)', color: '#6b8a7a',  border: 'rgba(107,138,122,0.3)' },
}

export default function FailuresPage() {
  const [params] = useSearchParams()
  const jobId = params.get('job')

  const { data: jobs } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => api.get('/jobs/').then(r => r.data),
  })

  const jobList = jobs?.results || jobs || []
  const selectedJob = jobId || jobList.find(j => j.failed_rows > 0)?.id

  const { data: failures, isLoading } = useQuery({
    queryKey: ['failures', selectedJob],
    queryFn: () => selectedJob
      ? api.get(`/jobs/${selectedJob}/failures/`).then(r => r.data)
      : Promise.resolve({ results: [] }),
    enabled: !!selectedJob,
  })

  const failureList = failures?.results || failures || []
  const currentJob = jobList.find(j => j.id === selectedJob)

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Parse Failures"
        subtitle="Rows that could not be parsed or failed validation during ingestion"
      />

      {/* Job selector */}
      <div className="mb-5 flex items-center gap-3">
        <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Job:</label>
        <select
          value={selectedJob || ''}
          onChange={e => window.history.replaceState(null, '', `?job=${e.target.value}`)}
          className="input text-xs py-1.5" style={{ width: 'auto', maxWidth: 400 }}>
          <option value="">— Select a job —</option>
          {jobList.filter(j => j.failed_rows > 0).map(j => (
            <option key={j.id} value={j.id}>
              {j.original_filename} · {j.failed_rows} failures
            </option>
          ))}
        </select>
      </div>

      {currentJob && (
        <div className="mb-5 p-3 rounded-xl flex items-center gap-3"
          style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
          <AlertTriangle size={14} className="text-red-400" />
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{currentJob.original_filename}</strong>
            {' '}— {currentJob.failed_rows} failed rows out of {currentJob.total_rows} total
          </span>
        </div>
      )}

      {isLoading && (
        <div className="p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Loading failures…</div>
      )}

      {!isLoading && failureList.length === 0 && selectedJob && (
        <div className="card p-8 text-center">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No failures for this job</p>
        </div>
      )}

      <div className="space-y-3">
        {failureList.map((f, i) => {
          const style = FAILURE_COLORS[f.failure_type] || FAILURE_COLORS.parse_error
          return (
            <div key={f.id} className="card p-4 animate-slide-up" style={{ borderColor: style.border, animationDelay: `${i * 30}ms` }}>
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs px-2 py-0.5 rounded"
                    style={{ background: 'var(--bg-deep)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                    Row #{f.row_index}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded font-medium"
                    style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}>
                    {f.failure_type?.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {f.created_at ? new Date(f.created_at).toLocaleString() : ''}
                </p>
              </div>

              <p className="text-sm mb-3" style={{ color: '#f87171' }}>
                {f.failure_reason}
              </p>

              <details className="group">
                <summary className="text-xs cursor-pointer select-none" style={{ color: 'var(--text-muted)' }}>
                  Raw row data ▶
                </summary>
                <pre className="mt-2 text-xs p-3 rounded-lg overflow-x-auto font-mono"
                  style={{ background: 'var(--bg-deep)', color: '#4ade80', border: '1px solid var(--border)' }}>
                  {JSON.stringify(f.raw_row, null, 2)}
                </pre>
              </details>
            </div>
          )
        })}
      </div>
    </div>
  )
}
