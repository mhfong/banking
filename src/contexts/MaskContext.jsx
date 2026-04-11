import { createContext, useContext, useState, useEffect } from 'react'

const MaskContext = createContext()

export function useMask() {
  return useContext(MaskContext)
}

export function MaskProvider({ children }) {
  const [masked, setMasked] = useState(() => localStorage.getItem('masked') === 'true')
  const toggle = () => setMasked(m => !m)
  const mask = (v) => masked ? '***' : v

  useEffect(() => {
    localStorage.setItem('masked', masked)
  }, [masked])

  return (
    <MaskContext.Provider value={{ masked, toggle, mask }}>
      {children}
    </MaskContext.Provider>
  )
}
