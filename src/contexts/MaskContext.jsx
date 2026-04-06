import { createContext, useContext, useState } from 'react'

const MaskContext = createContext()

export function useMask() {
  return useContext(MaskContext)
}

export function MaskProvider({ children }) {
  const [masked, setMasked] = useState(false)
  const toggle = () => setMasked(m => !m)
  const mask = (v) => masked ? '***' : v

  return (
    <MaskContext.Provider value={{ masked, toggle, mask }}>
      {children}
    </MaskContext.Provider>
  )
}
