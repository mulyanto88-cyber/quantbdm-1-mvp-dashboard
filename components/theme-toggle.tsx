'use client'

import { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'

export function ThemeToggle() {
  const [dark, setDark] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('theme')
    if (stored === 'light') {
      setDark(false)
      document.documentElement.classList.remove('dark')
    }
  }, [])

  function toggle() {
    if (dark) {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
      setDark(false)
    } else {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
      setDark(true)
    }
  }

  return (
    <button
      onClick={toggle}
      className="p-2 rounded-lg transition-colors hover:bg-accent"
      title={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
    >
      {dark ? (
        <Sun size={18} className="text-gold-400" />
      ) : (
        <Moon size={18} className="text-navy-600" />
      )}
    </button>
  )
}
