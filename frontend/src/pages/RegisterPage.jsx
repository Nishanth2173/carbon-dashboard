import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Leaf } from 'lucide-react'
import api from '../utils/api'
import { useAuth } from '../hooks/useAuth'

export default function RegisterPage() {
  const [form, setForm] = useState({ username: '', email: '', password: '', first_name: '', last_name: '', org_name: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const nav = useNavigate()

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handle = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/register/', form)
      await login(form.username, form.password)
      nav('/dashboard')
    } catch (err) {
      const d = err.response?.data
      setError(d ? Object.values(d).flat().join(' ') : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center grid-bg p-4">
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 30%, rgba(34,197,94,0.06), transparent 60%)' }} />
      <div className="relative w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-4"
            style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-bright)' }}>
            <Leaf size={22} className="text-carbon-400" />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>CarbonLens</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Create your organization account</p>
        </div>

        <div className="card-elevated p-6">
          <h2 className="text-lg font-semibold mb-5" style={{ color: 'var(--text-primary)' }}>Get started</h2>

          <form onSubmit={handle} className="space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Organization Name</label>
              <input className="input" value={form.org_name} onChange={set('org_name')} placeholder="Acme Corp" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>First Name</label>
                <input className="input" value={form.first_name} onChange={set('first_name')} placeholder="Nishanth" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Last Name</label>
                <input className="input" value={form.last_name} onChange={set('last_name')} placeholder="Kumar" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Username</label>
              <input className="input" value={form.username} onChange={set('username')} placeholder="nishanth" required />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Email</label>
              <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="you@company.com" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Password</label>
              <input className="input" type="password" value={form.password} onChange={set('password')} placeholder="min 6 chars" required />
            </div>

            {error && (
              <p className="text-xs px-3 py-2 rounded-lg"
                style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                {error}
              </p>
            )}

            <button type="submit" disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 mt-1 disabled:opacity-50">
              {loading ? (
                <><div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Creating account…</>
              ) : 'Create Account'}
            </button>
          </form>

          <p className="text-xs text-center mt-4" style={{ color: 'var(--text-muted)' }}>
            Already have an account?{' '}
            <Link to="/login" className="text-carbon-400 hover:text-carbon-300 transition-colors">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
