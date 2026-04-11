import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { updateProfile, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth'
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
  const [displayName, setDisplayName] = useState('')
  const [photoURL, setPhotoURL] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [startingBalance, setStartingBalance] = useState(0)
  const [message, setMessage] = useState({ type: '', text: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '')
      setPhotoURL(user.photoURL || '')
      loadStartingBalance()
    }
  }, [user])

  async function loadStartingBalance() {
    try {
      const snap = await getDoc(doc(db, 'userSettings', user.uid))
      if (snap.exists()) {
        setStartingBalance(snap.data().startingBalance || 0)
      }
    } catch (err) {
      console.error('Error loading starting balance:', err.message)
    }
  }

  function showMessage(type, text) {
    setMessage({ type, text })
    setTimeout(() => setMessage({ type: '', text: '' }), 3000)
  }

  async function handleUpdateProfile(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await updateProfile(user, { displayName, photoURL })
      showMessage('success', 'Profile updated successfully!')
    } catch (err) {
      showMessage('error', err.message)
    }
    setSaving(false)
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
    { id: 'profile', label: 'Profile', icon: 'fas fa-user' },
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

      {activeTab === 'profile' && (
        <form className="settings-form" onSubmit={handleUpdateProfile}>
          <div className="settings-card">
            <h3><i className="fas fa-user-circle"></i> Profile Information</h3>
            
            <div className="form-group">
              <label>Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your display name"
              />
            </div>

            <div className="form-group">
              <label>Photo URL</label>
              <input
                type="url"
                value={photoURL}
                onChange={(e) => setPhotoURL(e.target.value)}
                placeholder="https://example.com/photo.jpg"
              />
            </div>

            <button type="submit" disabled={saving}>
              <i className="fas fa-save"></i> {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      )}

      {activeTab === 'account' && (
        <form className="settings-form">
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
        </form>
      )}

      {activeTab === 'hotkeys' && (
        <HotkeysForm />
      )}
    </div>
  )
}
