import { useMask } from '../contexts/MaskContext'

export default function MaskToggle() {
  const { masked, toggle } = useMask()

  return (
    <button className="mask-eye-btn" onClick={toggle} title={masked ? 'Show values' : 'Hide values'}>
      {masked ? (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 17C10.5 17 9.2 16.4 8.2 15.5" stroke="#539bf5" strokeWidth="2" strokeLinecap="round"/>
          <path d="M15.8 15.5C14.8 16.4 13.5 17 12 17" stroke="#539bf5" strokeWidth="2" strokeLinecap="round"/>
          <path d="M7 14.5L5.5 17" stroke="#539bf5" strokeWidth="2" strokeLinecap="round"/>
          <path d="M9.5 16L9 18.5" stroke="#539bf5" strokeWidth="2" strokeLinecap="round"/>
          <path d="M14.5 16L15 18.5" stroke="#539bf5" strokeWidth="2" strokeLinecap="round"/>
          <path d="M17 14.5L18.5 17" stroke="#539bf5" strokeWidth="2" strokeLinecap="round"/>
          <path d="M4 13C5.5 15.5 8.5 17 12 17C15.5 17 18.5 15.5 20 13" stroke="#539bf5" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      ) : (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 5C7.5 5 3.7 7.6 2 12C3.7 16.4 7.5 19 12 19C16.5 19 20.3 16.4 22 12C20.3 7.6 16.5 5 12 5Z" stroke="#768390" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="12" cy="12" r="3.5" stroke="#768390" strokeWidth="1.8"/>
          <circle cx="12" cy="12" r="1.2" fill="#768390"/>
        </svg>
      )}
    </button>
  )
}
