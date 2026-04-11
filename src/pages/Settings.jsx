import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useHotkeysConfig } from '../contexts/HotkeysContext'
import '../styles/settings.css'

function HotkeysForm() {
  const { hotkeys, updateHotkey } = useHotkeysConfig()
  const [editingHotkey, setEditingHotkey] = useState(null)
  const [listeningFor, setListeningFor] = useState(null)
  const [recordedKey, setRecordedKey] = useState(null)
  const [recordedModifiers, setRecordedModifiers] = useState([])

  const hotkeysList = [
    { id: 'addTransaction', label: 'Add Transaction', current: hotkeys.addTransaction },
    { id: 'addGoal', label: 'Add Goal', current: hotkeys.addGoal },
    { id: 'closeForm', label: 'Close Form', current: hotkeys.closeForm }
  ]

  useEffect(() => {
    if (!listeningFor) return

    const handleKeyDown = (e) => {
      e.preventDefault()
      const mods = []
      if (e.ctrlKey) mods.push('ctrl')
      if (e.shiftKey) mods.push('shift')
      if (e.altKey) mods.push('alt')
      if (e.metaKey) mods.push('cmd')

      setRecordedKey(e.key === '+' ? '+' : e.key.toLowerCase())
      setRecordedModifiers(mods)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [listeningFor])

  const confirmHotkey = (hotkeyId) => {
    if (recordedKey) {
      updateHotkey(hotkeyId, recordedKey, recordedModifiers)
      setListeningFor(null)
      setRecordedKey(null)
      setRecordedModifiers([])
    }
  }

  return (
    <form className="settings-form">
      <div className="settings-card">
        <h3><i className="fas fa-keyboard"></i> Customize Hotkeys</h3>
        <p className="settings-desc">Click "Listen" to set a new hotkey combination.</p>
        
        <div className="hotkeys-customizer">
          {hotkeysList.map(({ id, label, current }) => (
            <div key={id} className="hotkey-row">
              <div className="hotkey-label">
                <span>{label}</span>
                <span className="hotkey-current">
                  {current.modifiers.map(m => <kbd key={m}>{m === 'cmd' ? '⌘' : m === 'ctrl' ? 'Ctrl' : m}</kbd>)}
                  <kbd>{current.key === '+' ? '+' : current.key.charAt(0).toUpperCase() + current.key.slice(1)}</kbd>
                </span>
              </div>
              <button
                type="button"
                className="hotkey-btn"
                onClick={() => setListeningFor(listeningFor === id ? null : id)}
              >
                {listeningFor === id ? <><i className="fas fa-microphone"></i> Listening...</> : <><i className="fas fa-sliders-h"></i> Listen</>}
              </button>
              {listeningFor === id && recordedKey && (
                <button
                  type="button"
                  className="hotkey-confirm"
                  onClick={() => confirmHotkey(id)}
                >
                  <i className="fas fa-check"></i> Confirm
                </button>
              )}
            </div>
          ))}
        </div>
        
        <p className="settings-desc" style={{ marginTop: 16, fontSize: '0.85rem', color: '#768390' }}>
          <i className="fas fa-lightbulb" style={{ marginRight: '6px', color: '#c69026' }}></i> Tip: Click "Listen", then press your desired key combination.
        </p>
      </div>
    </form>
  )
}

export default function Settings() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('profile')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [startingBalance, setStartingBalance] = useState(0)
  const [monthlyTarget, setMonthlyTarget] = useState(3)
  const [maxMonthlyLoss, setMaxMonthlyLoss] = useState(5)
  const [perTradeRisk, setPerTradeRisk] = useState(1)
  const [message, setMessage] = useState({ type: '', text: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (user) {
      loadStartingBalance()
    }
  }, [user])

  async function loadStartingBalance() {
    try {
      const snap = await getDoc(doc(db, 'userSettings', user.uid))
      if (snap.exists()) {
        const data = snap.data()
        setStartingBalance(data.startingBalance || 0)
        setMonthlyTarget(data.monthlyTarget ?? 3)
        setMaxMonthlyLoss(data.maxMonthlyLoss ?? 5)
        setPerTradeRisk(data.perTradeRisk ?? 1)
      }
    } catch (err) {
      console.error('Error loading starting balance:', err.message)
    }
  }

  function showMessage(type, text) {
    setMessage({ type, text })
    setTimeout(() => setMessage({ type: '', text: '' }), 3000)
  }

  async function handleUpdateStartingBalance(e) {
    e.preventDefault()
    if (isNaN(parseFloat(startingBalance)) || parseFloat(startingBalance) < 0) {
      showMessage('error', 'Starting balance must be a valid positive number')
      return
    }
    setSaving(true)
    try {
      await setDoc(doc(db, 'userSettings', user.uid), { startingBalance: parseFloat(startingBalance) }, { merge: true })
      showMessage('success', 'Starting balance updated successfully!')
    } catch (err) {
      showMessage('error', err.message)
    }
    setSaving(false)
  }

  async function handleUpdateInvestmentTargets(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await setDoc(doc(db, 'userSettings', user.uid), {
        monthlyTarget: parseFloat(monthlyTarget),
        maxMonthlyLoss: parseFloat(maxMonthlyLoss),
        perTradeRisk: parseFloat(perTradeRisk)
      }, { merge: true })
      showMessage('success', 'Investment targets updated successfully!')
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

  const tabs = [
    { id: 'account', label: 'Account', icon: 'fas fa-lock' },
    { id: 'hotkeys', label: 'Hotkeys', icon: 'fas fa-keyboard' },
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

      {activeTab === 'account' && (
        <div className="settings-form">
          <div className="settings-card">
            <h3><i className="fas fa-wallet"></i> Starting Balance</h3>
            <p className="settings-desc">Set your initial account balance for reference.</p>
            
            <form onSubmit={handleUpdateStartingBalance}>
              <div className="form-group">
                <label>Starting Balance (HKD)</label>
                <input
                  type="number"
                  value={startingBalance}
                  onChange={(e) => setStartingBalance(e.target.value)}
                  required
                  step="0.01"
                  min="0"
                  placeholder="Enter starting balance"
                />
              </div>

              <button type="submit" disabled={saving}>
                <i className="fas fa-save"></i> {saving ? 'Saving...' : 'Update Starting Balance'}
              </button>
            </form>
          </div>

          <div className="settings-card">
            <h3><i className="fas fa-chart-line"></i> Investment Monthly Targets</h3>
            <p className="settings-desc">Set your GDX trading performance targets.</p>

            <form onSubmit={handleUpdateInvestmentTargets}>
              <div className="form-group">
                <label>Monthly Target (%)</label>
                <input
                  type="number"
                  value={monthlyTarget}
                  onChange={(e) => setMonthlyTarget(e.target.value)}
                  step="0.1"
                  min="0"
                  max="100"
                  placeholder="e.g. 3"
                />
              </div>

              <div className="form-group">
                <label>Max Monthly Loss (%)</label>
                <input
                  type="number"
                  value={maxMonthlyLoss}
                  onChange={(e) => setMaxMonthlyLoss(e.target.value)}
                  step="0.1"
                  min="0"
                  max="100"
                  placeholder="e.g. 5"
                />
              </div>

              <div className="form-group">
                <label>Per Trade Risk (%)</label>
                <input
                  type="number"
                  value={perTradeRisk}
                  onChange={(e) => setPerTradeRisk(e.target.value)}
                  step="0.1"
                  min="0"
                  max="100"
                  placeholder="e.g. 1"
                />
              </div>

              <button type="submit" disabled={saving}>
                <i className="fas fa-save"></i> {saving ? 'Saving...' : 'Update Targets'}
              </button>
            </form>
          </div>

          <div className="settings-card">
            <h3><i className="fas fa-lock"></i> Change Password</h3>
            
            <form onSubmit={handleChangePassword}>
              <div className="form-group">
                <label>Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  placeholder="Enter your current password"
                />
              </div>

              <div className="form-group">
                <label>New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  placeholder="Enter new password (min 6 chars)"
                />
              </div>

              <div className="form-group">
                <label>Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Confirm new password"
                />
              </div>

              <button type="submit" disabled={saving}>
                <i className="fas fa-key"></i> {saving ? 'Updating...' : 'Change Password'}
              </button>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'hotkeys' && (
        <HotkeysForm />
      )}
    </div>
  )
}
