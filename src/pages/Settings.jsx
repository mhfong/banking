import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { updateProfile, updateEmail, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth'
import { doc, getDoc, setDoc, collection, getDocs, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import '../styles/settings.css'

export default function Settings() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('profile')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })

  // Profile
  const [displayName, setDisplayName] = useState('')
  const [currency, setCurrency] = useState('HKD')
  const [monthlyBudget, setMonthlyBudget] = useState('')
  const [savingsGoal, setSavingsGoal] = useState('')

  // Security
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [newEmail, setNewEmail] = useState('')

  // Preferences
  const [defaultView, setDefaultView] = useState('dashboard')
  const [dateFormat, setDateFormat] = useState('YYYY-MM-DD')
  const [showDecimals, setShowDecimals] = useState(true)

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '')
      setNewEmail(user.email || '')
      loadUserSettings()
    }
  }, [user])

  async function loadUserSettings() {
    try {
      const docRef = doc(db, 'userSettings', user.uid)
      const docSnap = await getDoc(docRef)
      if (docSnap.exists()) {
        const data = docSnap.data()
        setCurrency(data.currency || 'HKD')
        setMonthlyBudget(data.monthlyBudget || '')
        setSavingsGoal(data.savingsGoal || '')
        setDefaultView(data.defaultView || 'dashboard')
        setDateFormat(data.dateFormat || 'YYYY-MM-DD')
        setShowDecimals(data.showDecimals !== false)
      }
    } catch (err) {
      console.error('Failed to load settings:', err)
    }
  }

  function showMessage(type, text) {
    setMessage({ type, text })
    setTimeout(() => setMessage({ type: '', text: '' }), 4000)
  }

  async function handleSaveProfile(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await updateProfile(user, { displayName })
      await setDoc(doc(db, 'userSettings', user.uid), {
        currency,
        monthlyBudget: monthlyBudget ? parseFloat(monthlyBudget) : null,
        savingsGoal: savingsGoal ? parseFloat(savingsGoal) : null,
        defaultView,
        dateFormat,
        showDecimals,
        updatedAt: new Date().toISOString()
      }, { merge: true })
      showMessage('success', 'Profile updated successfully!')
    } catch (err) {
      showMessage('error', err.message)
    }
    setSaving(false)
  }

  async function handleChangePassword(e) {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      showMessage('error', 'Passwords do not match')
      return
    }
    if (newPassword.length < 6) {
      showMessage('error', 'Password must be at least 6 characters')
      return
    }
    setSaving(true)
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword)
      await reauthenticateWithCredential(user, credential)
      await updatePassword(user, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      showMessage('success', 'Password changed successfully!')
    } catch (err) {
      showMessage('error', err.code === 'auth/wrong-password' ? 'Current password is incorrect' : err.message)
    }
    setSaving(false)
  }

  async function handleChangeEmail(e) {
    e.preventDefault()
    if (newEmail === user.email) {
      showMessage('error', 'New email is the same as current')
      return
    }
    setSaving(true)
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword)
      await reauthenticateWithCredential(user, credential)
      await updateEmail(user, newEmail)
      showMessage('success', 'Email updated successfully!')
    } catch (err) {
      showMessage('error', err.message)
    }
    setSaving(false)
  }

  const tabs = [
    { id: 'profile', label: 'Profile', icon: 'fas fa-user' },
    { id: 'preferences', label: 'Preferences', icon: 'fas fa-sliders-h' },
    { id: 'security', label: 'Security', icon: 'fas fa-lock' },
    { id: 'account', label: 'Account', icon: 'fas fa-envelope' },
  ]

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h1><i className="fas fa-cog"></i> Settings</h1>
      </div>

      {message.text && (
        <div className={`settings-message ${message.type}`}>
          {message.type === 'success' ? <i className="fas fa-check-circle"></i> : <i className="fas fa-exclamation-circle"></i>} {message.text}
        </div>
      )}

      <div className="settings-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <i className={tab.icon}></i> {tab.label}
          </button>
        ))}
      </div>

      <div className="settings-content">
        {activeTab === 'profile' && (
          <form onSubmit={handleSaveProfile} className="settings-form">
            <div className="settings-card">
              <h3>Profile Information</h3>
              <div className="form-group">
                <label>Display Name</label>
                <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your name" />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={user?.email || ''} disabled className="input-disabled" />
              </div>
            </div>

            <div className="settings-card">
              <h3>Financial Settings</h3>
              <div className="form-row">
                <div className="form-group">
                  <label>Base Currency</label>
                  <select value={currency} onChange={e => setCurrency(e.target.value)}>
                    <option value="HKD">HKD - Hong Kong Dollar</option>
                    <option value="USD">USD - US Dollar</option>
                    <option value="CNY">CNY - Chinese Yuan</option>
                    <option value="JPY">JPY - Japanese Yen</option>
                    <option value="GBP">GBP - British Pound</option>
                    <option value="EUR">EUR - Euro</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Monthly Budget</label>
                  <input type="number" value={monthlyBudget} onChange={e => setMonthlyBudget(e.target.value)} placeholder="e.g. 30000" />
                </div>
              </div>
              <div className="form-group">
                <label>Savings Goal (Monthly)</label>
                <input type="number" value={savingsGoal} onChange={e => setSavingsGoal(e.target.value)} placeholder="e.g. 10000" />
              </div>
            </div>

            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        )}

        {activeTab === 'preferences' && (
          <form onSubmit={handleSaveProfile} className="settings-form">
            <div className="settings-card">
              <h3>Display Preferences</h3>
              <div className="form-group">
                <label>Default Page</label>
                <select value={defaultView} onChange={e => setDefaultView(e.target.value)}>
                  <option value="dashboard">Dashboard</option>
                  <option value="transactions">Transactions</option>
                  <option value="performance">Performance</option>
                  <option value="pnl-calendar">PNL Calendar</option>
                </select>
              </div>
              <div className="form-group">
                <label>Date Format</label>
                <select value={dateFormat} onChange={e => setDateFormat(e.target.value)}>
                  <option value="YYYY-MM-DD">2025-01-15</option>
                  <option value="DD/MM/YYYY">15/01/2025</option>
                  <option value="MM/DD/YYYY">01/15/2025</option>
                  <option value="DD MMM YYYY">15 Jan 2025</option>
                </select>
              </div>
              <div className="form-group">
                <label className="toggle-label">
                  <span>Show Decimal Places</span>
                  <div className={`toggle-switch ${showDecimals ? 'on' : ''}`} onClick={() => setShowDecimals(!showDecimals)}>
                    <div className="toggle-knob" />
                  </div>
                </label>
              </div>
            </div>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Preferences'}
            </button>
          </form>
        )}

        {activeTab === 'security' && (
          <form onSubmit={handleChangePassword} className="settings-form">
            <div className="settings-card">
              <h3>Change Password</h3>
              <div className="form-group">
                <label>Current Password</label>
                <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="Enter current password" required />
              </div>
              <div className="form-group">
                <label>New Password</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Enter new password" required />
              </div>
              <div className="form-group">
                <label>Confirm New Password</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm new password" required />
              </div>
            </div>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Updating...' : 'Change Password'}
            </button>
          </form>
        )}

        {activeTab === 'account' && (
          <form onSubmit={handleChangeEmail} className="settings-form">
            <div className="settings-card">
              <h3>Change Email</h3>
              <div className="form-group">
                <label>Current Email</label>
                <input type="email" value={user?.email || ''} disabled className="input-disabled" />
              </div>
              <div className="form-group">
                <label>New Email</label>
                <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="Enter new email" required />
              </div>
              <div className="form-group">
                <label>Password (to confirm)</label>
                <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="Enter your password" required />
              </div>
            </div>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Updating...' : 'Update Email'}
            </button>

            <div className="settings-card danger-zone">
              <h3><i className="fas fa-exclamation-triangle"></i> Danger Zone</h3>
              <p>Account created: {user?.metadata?.creationTime}</p>
              <p>Last sign in: {user?.metadata?.lastSignInTime}</p>
              <p>UID: <code>{user?.uid}</code></p>
              <button className="btn-danger" onClick={async () => {
                if (!window.confirm('Are you sure? This will delete ALL your transaction data. This cannot be undone.')) return
                if (!window.confirm('REALLY sure? All data will be gone forever.')) return
                setSaving(true)
                try {
                  const snap = await getDocs(collection(db, 'transactions'))
                  const userDocs = snap.docs.filter(d => d.data().userId === user.uid)
                  for (let i = 0; i < userDocs.length; i += 400) {
                    const batch = writeBatch(db)
                    userDocs.slice(i, i + 400).forEach(d => batch.delete(d.ref))
                    await batch.commit()
                  }
                  showMessage('success', `Deleted ${userDocs.length} transactions`)
                } catch (err) {
                  showMessage('error', err.message)
                }
                setSaving(false)
              }} disabled={saving}>
                <i className="fas fa-trash-alt"></i> {saving ? 'Deleting...' : 'Clear All Transaction Data'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
