import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { CheckCircle2, XCircle, Clock, AlertTriangle, ExternalLink } from 'lucide-react'
import api from '../utils/api'
import PageHeader from '../components/PageHeader'
import { SourceBadge } from '../components/Badges'

const StatusIcon = ({ status }) => {
  if (status === 'completed') return <CheckCircle2 size={14} className="text-carbon-400" />
  if (status === 'failed') return <XCircle size={14} className="text-red-400" />
  if (status === 'processing') return <Clock size={14} className="text-yellow-400 animate-pulse" />
  return <Clock size={14} style={{ color: 'var(--text-muted)' }} />
}

export default function JobsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => api.get('/jobs/').then(r => r.data),
    refetchInterval: 5000,
  })

  const jobs = data?.results || data || []

  return (
    <div className="animate-fade-in">
      <PageHeader title="Ingestion Jobs" subtitle="All file upload and parsing jobs for your organization" />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--bg-deep)', borderBottom: '1px solid var(--border)' }}>
              {['File', 'Source', 'Status', 'Total', 'Success', 'Failed', 'Flagged', 'Duration', 'Uploaded By', 'Started', 'Failures'].map(h => (
                <th key={h} className="p-3 text-left text-xs font-medium uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={11} className="p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                Loading jobs…
              </td></tr>
            )}
            {!isLoading && jobs.length === 0 && (
              <tr><td colSpan={11} className="p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                No jobs yet. Upload a file to get started.
              </td></tr>
            )}
            {jobs.map(job => (
              <tr key={job.id} className="table-row">
                <td className="p-3 max-w-[200px]">
                  <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {job.original_filename}
                  </p>
                  <p className="text-xs font-mono mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                    {job.id?.slice(0, 8)}…
                  </p>
                </td>
                <td className="p-3"><SourceBadge sourceType={job.source_type} /></td>
                <td className="p-3">
                  <div className="flex items-center gap-1.5">
                    <StatusIcon status={job.status} />
                    <span className="text-xs" style={{ color: 'var(--text-primary)' }}>
                      {job.status_display}
                    </span>
                  </div>
                  {job.error_message && (
                    <p className="text-xs mt-1 text-red-400 truncate max-w-[150px]">{job.error_message}</p>
                  )}
                </td>
                <td className="p-3 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{job.total_rows}</td>
                <td className="p-3 font-mono text-xs text-carbon-400">{job.successful_rows}</td>
                <td className="p-3 font-mono text-xs text-red-400">{job.failed_rows}</td>
                <td className="p-3 font-mono text-xs text-yellow-400">{job.flagged_rows}</td>
                <td className="p-3 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                  {job.duration_seconds != null ? `${job.duration_seconds.toFixed(1)}s` : '—'}
                </td>
                <td className="p-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                  {job.uploaded_by?.username || '—'}
                </td>
                <td className="p-3 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                  {job.started_at ? new Date(job.started_at).toLocaleString() : '—'}
                </td>
                <td className="p-3">
                  {job.failed_rows > 0 && (
                    <Link to={`/failures?job=${job.id}`}
                      className="flex items-center gap-1 text-xs transition-colors"
                      style={{ color: '#f87171' }}
                      onMouseEnter={e => e.currentTarget.style.color = '#fca5a5'}
                      onMouseLeave={e => e.currentTarget.style.color = '#f87171'}>
                      <AlertTriangle size={11} />
                      View
                      <ExternalLink size={10} />
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
