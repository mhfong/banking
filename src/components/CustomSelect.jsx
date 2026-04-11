import { useState, useRef, useEffect } from 'react'

export default function CustomSelect({ value, options, onChange, className }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Scroll to selected item when opened
  useEffect(() => {
    if (open && listRef.current) {
      const selected = listRef.current.querySelector('.selected')
      if (selected) selected.scrollIntoView({ block: 'center' })
    }
  }, [open])

  const selectedLabel = options.find(o => o.value === value)?.label || ''

  return (
    <div className={`custom-select ${className || ''}`} ref={ref}>
      <button className="custom-select-btn" onClick={() => setOpen(!open)}>
        <span>{selectedLabel}</span>
        <i className={`fas fa-chevron-${open ? 'up' : 'down'}`}></i>
      </button>
      {open && (
        <div className="custom-select-dropdown" ref={listRef}>
          {options.map(o => (
            <div
              key={o.value}
              className={`custom-select-option ${o.value === value ? 'selected' : ''}`}
              onClick={() => { onChange(o.value); setOpen(false) }}
            >
              {o.value === value && <i className="fas fa-check"></i>}
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
