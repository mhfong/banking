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
        <div className="sidebar-nav">
          <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Dashboard">
            <i className="fas fa-chart-pie"></i>
            <span>Dashboard</span>
          </NavLink>
          <NavLink to="/transactions" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Transactions">
            <i className="fas fa-exchange-alt"></i>
            <span>Transactions</span>
          </NavLink>
          <NavLink to="/investment" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Investment">
            <i className="fas fa-chart-line"></i>
            <span>Investment</span>
          </NavLink>
        </div>
        <div className="sidebar-bottom">
          <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Settings">
            <i className="fas fa-cog"></i>
            <span>Settings</span>
          </NavLink>
          <button className="nav-item logout-btn" onClick={handleLogout} title="Sign Out">
            <i className="fas fa-sign-out-alt"></i>
            <span>Sign Out</span>
          </button>
        </div>
      </nav>
      <main className="main-content">
        {children}
      </main>
    </div>
  )
}
