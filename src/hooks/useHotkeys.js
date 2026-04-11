import { useEffect } from 'react'

export function useHotkeys(hotkeys) {
  useEffect(() => {
    function handleKeyDown(e) {
      const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform)
      const modKey = isMac ? e.metaKey : e.ctrlKey

      for (const { key, modifiers = [], callback } of hotkeys) {
        // Normalize key names
        let keyToMatch = key.toLowerCase()
        if (key === '+' || key === '=') keyToMatch = e.key === '+' || e.key === '=' || (e.shiftKey && e.key === '=') ? e.key : null
        
        const keyMatches = e.key.toLowerCase() === keyToMatch || 
                          (key === '+' && e.shiftKey && e.key === '=') ||
                          (key === '+' && e.key === '+')
        
        const modifiersMatch = 
          modifiers.includes('ctrl') === e.ctrlKey &&
          modifiers.includes('shift') === e.shiftKey &&
          modifiers.includes('alt') === e.altKey &&
          modifiers.includes('cmd') === e.metaKey

        // For single-key hotkeys (just key, no modifiers)
        if (key && !modifiers.length && keyMatches && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
          callback(e)
          e.preventDefault()
        }
        // For modifier + key hotkeys
        else if (modifiers.length && keyMatches && modifiersMatch) {
          callback(e)
          e.preventDefault()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hotkeys])
}
