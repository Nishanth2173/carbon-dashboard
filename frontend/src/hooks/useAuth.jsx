import { createContext, useContext, useState, useEffect } from 'react'
import api from '../utils/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [org, setOrg] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (token) fetchMe()
    else setLoading(false)
  }, [])

  const fetchMe = async () => {
    try {
      const { data } = await api.get('/me/')
      setUser(data.user)
      setOrg(data.organization)
    } catch {
      localStorage.clear()
    } finally {
      setLoading(false)
    }
  }

  const login = async (username, password) => {
    const { data } = await api.post('/token/', { username, password })
    localStorage.setItem('access_token', data.access)
    localStorage.setItem('refresh_token', data.refresh)
    await fetchMe()
  }

  const logout = () => {
    localStorage.clear()
    setUser(null)
    setOrg(null)
  }

  return (
    <AuthContext.Provider value={{ user, org, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
