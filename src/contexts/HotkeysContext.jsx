import { createContext, useContext, useEffect, useState } from 'react'

const HotkeysContext = createContext()

export function HotkeysProvider({ children }) {
  const [hotkeys, setHotkeys] = useState({
    addTransaction: { key: '+', modifiers: ['ctrl'] },
    addGoal: { key: '+', modifiers: ['ctrl'] },
    closeForm: { key: 'Escape', modifiers: [] }
  })

  useEffect(() => {
    const saved = localStorage.getItem('hotkeys')
    if (saved) {
      setHotkeys(JSON.parse(saved))
    }
  }, [])

  const updateHotkey = (action, key, modifiers = []) => {
    const updated = { ...hotkeys, [action]: { key, modifiers } }
    setHotkeys(updated)
    localStorage.setItem('hotkeys', JSON.stringify(updated))
  }

  return (
    <HotkeysContext.Provider value={{ hotkeys, updateHotkey }}>
      {children}
    </HotkeysContext.Provider>
  )
}

export function useHotkeysConfig() {
  const context = useContext(HotkeysContext)
  if (!context) {
    throw new Error('useHotkeysConfig must be used within HotkeysProvider')
  }
  return context
}
