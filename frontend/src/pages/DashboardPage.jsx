import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts'
import { Wind, Zap, Plane, ClipboardCheck, AlertTriangle, Clock, CheckCircle2, Leaf } from 'lucide-react'
import api from '../utils/api'
import StatCard from '../components/StatCard'
import PageHeader from '../components/PageHeader'
import { SourceBadge } from '../components/Badges'
import { format } from 'date-fns'

const SCOPE_COLORS = { scope1: '#f97316', scope2: '#3b82f6', scope3: '#a855f7' }

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="card p-3 text-xs space-y-1" style={{ minWidth: 140 }}>
      <p className="font-medium mb-2" style={{ color: 'var(--text-primary)' }}>{label}</p>
      {payload.map(p => (
        <div key={p.dataKey} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
            {(p.value / 1000).toFixed(1)}t
          </span>
        </div>
      ))}
    </div>
  )
}

function fmt(kg) {
  if (kg >= 1000000) return `${(kg / 1000000).toFixed(2)}M`
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}K`
  return kg.toFixed(0)
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/dashboard/').then(r => r.data),
  })

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-pulse-soft text-sm" style={{ color: 'var(--text-muted)' }}>Loading emissions data…</div>
    </div>
  )

  const pieData = [
    { name: 'Scope 1', value: data.scope1_co2e_kg, color: '#f97316' },
    { name: 'Scope 2', value: data.scope2_co2e_kg, color: '#3b82f6' },
    { name: 'Scope 3', value: data.scope3_co2e_kg, color: '#a855f7' },
  ].filter(d => d.value > 0)

  // Process monthly trend
  const monthlyMap = {}
  data.monthly_trend?.forEach(item => {
    const month = item.month ? item.month.slice(0, 7) : 'Unknown'
    if (!monthlyMap[month]) monthlyMap[month] = { month, scope1: 0, scope2: 0, scope3: 0 }
    monthlyMap[month][item.scope] = (item.total || 0)
  })
  const trendData = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month))

  return (
    <div className="animate-fade-in space-y-8">
      <PageHeader
        title="Emissions Dashboard"
        subtitle="Real-time view of your organization's carbon footprint across all scopes"
      />

      {/* Hero metric */}
      <div className="card-elevated p-6 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10"
          style={{ background: 'radial-gradient(ellipse at 20% 50%, #22c55e, transparent 60%)' }} />
        <div className="relative">
          <p className="text-sm font-medium uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
            Total CO₂ Equivalent
          </p>
          <div className="flex items-end gap-3">
            <span className="text-6xl font-bold font-mono glow-text" style={{ color: 'var(--accent)' }}>
              {fmt(data.total_co2e_kg)}
            </span>
            <span className="text-2xl mb-2" style={{ color: 'var(--text-muted)' }}>kg CO₂e</span>
          </div>
          <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
            {data.total_records} records · {data.pending_review} pending review
          </p>
        </div>
      </div>

      {/* Scope cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Scope 1 · Direct" value={fmt(data.scope1_co2e_kg)} unit="kg CO₂e"
          icon={Wind} color="orange" sublabel="Fuel combustion (SAP)" />
        <StatCard label="Scope 2 · Electricity" value={fmt(data.scope2_co2e_kg)} unit="kg CO₂e"
          icon={Zap} color="blue" sublabel="Grid electricity (Utility)" />
        <StatCard label="Scope 3 · Travel" value={fmt(data.scope3_co2e_kg)} unit="kg CO₂e"
          icon={Plane} color="purple" sublabel="Business travel (Concur)" />
        <StatCard label="Flagged Records" value={data.flagged} unit="rows"
          icon={AlertTriangle} color="red" sublabel="Need analyst review" />
      </div>

      {/* Review status + charts */}
      <div className="grid grid-cols-3 gap-6">
        {/* Scope pie */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Scope Breakdown</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3}>
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v) => [`${fmt(v)} kgCO₂e`, '']}
                  contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}
                  labelStyle={{ color: 'var(--text-muted)' }}
                />
                <Legend formatter={(v) => <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>
              No data yet — upload files to begin
            </div>
          )}
        </div>

        {/* Review status */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Review Status</h3>
          <div className="space-y-4">
            {[
              { label: 'Approved', count: data.approved, color: '#22c55e', icon: CheckCircle2 },
              { label: 'Pending', count: data.pending_review, color: '#fbbf24', icon: Clock },
              { label: 'Flagged', count: data.flagged, color: '#f87171', icon: AlertTriangle },
            ].map(({ label, count, color, icon: Icon }) => {
              const pct = data.total_records > 0 ? (count / data.total_records) * 100 : 0
              return (
                <div key={label}>
                  <div className="flex justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <Icon size={12} style={{ color }} />
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
                    </div>
                    <span className="text-xs font-mono" style={{ color }}>{count}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-deep)' }}>
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, background: color }} />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-6 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Total records</p>
            <p className="text-2xl font-bold font-mono mt-1" style={{ color: 'var(--text-primary)' }}>
              {data.total_records}
            </p>
          </div>
        </div>

        {/* Recent jobs */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Recent Ingestion Jobs</h3>
          <div className="space-y-3">
            {data.recent_jobs?.length === 0 && (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No jobs yet</p>
            )}
            {data.recent_jobs?.map(job => (
              <div key={job.id} className="flex items-center gap-3 p-2 rounded-lg"
                style={{ background: 'var(--bg-deep)' }}>
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  job.status === 'completed' ? 'bg-carbon-500' :
                  job.status === 'failed' ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {job.original_filename}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <SourceBadge sourceType={job.source_type} />
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {job.successful_rows} rows
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Monthly trend */}
      {trendData.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold mb-6" style={{ color: 'var(--text-primary)' }}>
            Monthly Emissions Trend
          </h3>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={trendData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                {[['s1', '#f97316'], ['s2', '#3b82f6'], ['s3', '#a855f7']].map(([id, color]) => (
                  <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(34,197,94,0.06)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false}
                tickFormatter={v => `${(v/1000).toFixed(0)}t`} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="scope1" name="Scope 1" stroke="#f97316" fill="url(#s1)" strokeWidth={2} />
              <Area type="monotone" dataKey="scope2" name="Scope 2" stroke="#3b82f6" fill="url(#s2)" strokeWidth={2} />
              <Area type="monotone" dataKey="scope3" name="Scope 3" stroke="#a855f7" fill="url(#s3)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
