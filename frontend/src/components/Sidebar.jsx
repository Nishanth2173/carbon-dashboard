import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  LayoutDashboard, Upload, ClipboardCheck, AlertTriangle,
  History, Briefcase, LogOut, Leaf, ChevronRight
} from 'lucide-react'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/upload', label: 'Ingest Data', icon: Upload },
  { to: '/review', label: 'Review', icon: ClipboardCheck },
  { to: '/failures', label: 'Failures', icon: AlertTriangle },
  { to: '/jobs', label: 'Ingestion Jobs', icon: Briefcase },
  { to: '/audit', label: 'Audit Trail', icon: History },
]

export default function Sidebar() {
  const { user, org, logout } = useAuth()
  const location = useLocation()

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 flex flex-col z-20"
      style={{ background: 'var(--bg-card)', borderRight: '1px solid var(--border)' }}>

      {/* Logo */}
      <div className="px-6 py-6 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-bright)' }}>
          <Leaf size={16} className="text-carbon-400" />
        </div>
        <div>
          <p className="font-bold text-sm tracking-wide" style={{ color: 'var(--text-primary)' }}>CarbonLens</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Emissions Intelligence</p>
        </div>
      </div>

      {/* Org badge */}
      {org && (
        <div className="mx-4 mt-4 px-3 py-2 rounded-lg" style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-bright)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Organization</p>
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{org.name}</p>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 pt-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, label, icon: Icon }) => {
          const active = location.pathname.startsWith(to)
          return (
            <NavLink key={to} to={to}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group"
              style={{
                color: active ? 'var(--accent)' : 'var(--text-muted)',
                background: active ? 'var(--accent-dim)' : 'transparent',
                border: active ? '1px solid var(--border-bright)' : '1px solid transparent',
              }}>
              <Icon size={16} />
              <span className="flex-1">{label}</span>
              {active && <ChevronRight size={12} className="opacity-60" />}
            </NavLink>
          )
        })}
      </nav>

      {/* User */}
      <div className="p-4" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
            style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--border-bright)' }}>
            {user?.username?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{user?.username}</p>
            <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{user?.email}</p>
          </div>
        </div>
        <button onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all"
          style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
          <LogOut size={14} />
          Sign out
        </button>
      </div>
    </aside>
  )
}
