import { NavLink, useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import '../styles/layout.css'

export default function Layout({ children }) {
  const { user } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await signOut(auth)
    navigate('/login')
  }

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="sidebar-header">
          <h2>💰 Banking</h2>
        </div>
        <div className="sidebar-nav">
          <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            📊 Dashboard
          </NavLink>
          <NavLink to="/transactions" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            💳 Transactions
          </NavLink>
        </div>
        <div className="sidebar-footer">
          <div className="user-info">
            <span className="user-avatar">👤</span>
            <span className="user-name">{user?.displayName || user?.email}</span>
          </div>
          <button className="btn-logout" onClick={handleLogout}>Sign Out</button>
        </div>
      </nav>
      <main className="main-content">
        {children}
      </main>
    </div>
  )
}
