import { useState, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, FileText, CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react'
import api from '../utils/api'
import PageHeader from '../components/PageHeader'

const SOURCE_CONFIGS = {
  sap: {
    label: 'SAP Fuel & Procurement',
    description: 'Tab-delimited IDoc/SM35 flat file export. Handles BLDAT, MENGE, MEINS columns with German locale dates.',
    accepts: '.txt,.csv,.tsv',
    scope: 'Scope 1',
    color: '#f97316',
    bg: 'rgba(249,115,22,0.08)',
    border: 'rgba(249,115,22,0.25)',
    fields: ['BLDAT (date)', 'MATNR (material)', 'MAKTX (description)', 'MENGE (qty)', 'MEINS (unit)', 'WERKS (plant)'],
  },
  utility: {
    label: 'Utility Electricity',
    description: 'Portal CSV download (BESCOM/PG&E style). Supports billing periods that span partial months.',
    accepts: '.csv',
    scope: 'Scope 2',
    color: '#3b82f6',
    bg: 'rgba(59,130,246,0.08)',
    border: 'rgba(59,130,246,0.25)',
    fields: ['meter_id', 'billing_period_start', 'billing_period_end', 'kwh_consumed', 'site_name', 'tariff_code'],
  },
  travel: {
    label: 'Corporate Travel (Concur/Navan)',
    description: 'Standard Accounting Extract CSV. Handles flights, hotels, ground transport. Calculates flight distance from airport codes.',
    accepts: '.csv',
    scope: 'Scope 3',
    color: '#a855f7',
    bg: 'rgba(168,85,247,0.08)',
    border: 'rgba(168,85,247,0.25)',
    fields: ['transaction_date', 'expense_type', 'employee_id', 'origin', 'destination', 'hotel_nights', 'amount'],
  },
}

function UploadCard({ sourceType, config }) {
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const fileRef = useRef()
  const qc = useQueryClient()

  const { mutate, isPending, isSuccess, isError, data, error, reset } = useMutation({
    mutationFn: (f) => {
      const fd = new FormData()
      fd.append('file', f)
      fd.append('source_type', sourceType)
      return api.post('/upload/', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['jobs'] })
    },
  })

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) { setFile(f); reset() }
  }

  const handleFileChange = (e) => {
    const f = e.target.files[0]
    if (f) { setFile(f); reset() }
  }

  return (
    <div className="card overflow-hidden" style={{ borderColor: config.border }}>
      <div className="p-5" style={{ background: config.bg }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.3)', border: `1px solid ${config.border}` }}>
              <FileText size={16} style={{ color: config.color }} />
            </div>
            <div>
              <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{config.label}</h3>
              <span className="px-2 py-0.5 rounded text-xs font-mono mt-0.5 inline-block"
                style={{ background: 'rgba(0,0,0,0.3)', color: config.color }}>
                {config.scope}
              </span>
            </div>
          </div>
          <button onClick={() => setExpanded(!expanded)}
            className="text-xs flex items-center gap-1 transition-opacity opacity-60 hover:opacity-100"
            style={{ color: config.color }}>
            Expected fields
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        </div>

        {expanded && (
          <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${config.border}` }}>
            <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>{config.description}</p>
            <div className="flex flex-wrap gap-1.5">
              {config.fields.map(f => (
                <span key={f} className="px-2 py-0.5 rounded text-xs font-mono"
                  style={{ background: 'rgba(0,0,0,0.3)', color: config.color, border: `1px solid ${config.border}` }}>
                  {f}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="p-5">
        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current.click()}
          className="rounded-lg p-6 text-center cursor-pointer transition-all duration-200"
          style={{
            border: `2px dashed ${dragging ? config.color : 'var(--border)'}`,
            background: dragging ? config.bg : 'var(--bg-deep)',
          }}>
          <input ref={fileRef} type="file" accept={config.accepts} className="hidden" onChange={handleFileChange} />
          <Upload size={24} className="mx-auto mb-2" style={{ color: file ? config.color : 'var(--text-muted)' }} />
          {file ? (
            <div>
              <p className="text-sm font-medium" style={{ color: config.color }}>{file.name}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {(file.size / 1024).toFixed(1)} KB · Click to change
              </p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Drop file here</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                or click to browse · {config.accepts}
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={() => file && mutate(file)}
            disabled={!file || isPending}
            className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: file ? config.color : undefined }}>
            {isPending ? (
              <>
                <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Processing…
              </>
            ) : 'Ingest File'}
          </button>

          {file && (
            <button onClick={() => { setFile(null); reset() }} className="btn-ghost">
              Clear
            </button>
          )}
        </div>

        {/* Result */}
        {isSuccess && data && (
          <div className="mt-3 p-3 rounded-lg flex items-start gap-2"
            style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <CheckCircle2 size={14} className="text-carbon-400 mt-0.5 flex-shrink-0" />
            <div className="text-xs" style={{ color: 'var(--text-primary)' }}>
              <p className="font-medium">Ingestion complete</p>
              <p style={{ color: 'var(--text-muted)' }}>
                {data.successful_rows} rows parsed · {data.failed_rows} failures · {data.flagged_rows} flagged
              </p>
            </div>
          </div>
        )}

        {isError && (
          <div className="mt-3 p-3 rounded-lg flex items-start gap-2"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <XCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
            <div className="text-xs">
              <p className="font-medium text-red-400">Ingestion failed</p>
              <p style={{ color: 'var(--text-muted)' }}>
                {error?.response?.data?.error || 'Unknown error'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function UploadPage() {
  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Ingest Data"
        subtitle="Upload files from SAP, utility portals, or travel expense platforms. Each source is normalized to kgCO₂e."
      />

      <div className="mb-6 p-4 rounded-xl flex items-start gap-3"
        style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
        <AlertCircle size={16} className="text-carbon-400 mt-0.5 flex-shrink-0" />
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Duplicate detection runs automatically. Rows matching an existing record (same date, quantity, source)
          will be flagged rather than double-counted. All records go to <strong style={{ color: 'var(--text-primary)' }}>Pending Review</strong> until approved.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {Object.entries(SOURCE_CONFIGS).map(([type, config]) => (
          <UploadCard key={type} sourceType={type} config={config} />
        ))}
      </div>
    </div>
  )
}
