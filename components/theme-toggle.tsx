'use client'

import { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(true)

  // On mount — read saved preference
  useEffect(() => {
    const saved = localStorage.getItem('bdmflow-theme')
    const dark  = saved ? saved === 'dark' : true // default dark
    setIsDark(dark)
    document.documentElement.classList.toggle('dark', dark)
  }, [])

  const toggle = () => {
    const next = !isDark
    setIsDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('bdmflow-theme', next ? 'dark' : 'light')
  }

  return (
    <button
      onClick={toggle}
      title={isDark ? 'Switch to Silver Light' : 'Switch to Dark Navy'}
      className="
        flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl
        border transition-all duration-300 text-xs font-semibold
        hover:scale-105 active:scale-95
        border-border/50 hover:border-gold-400/40
        bg-accent/30 hover:bg-accent/60
        text-muted-foreground hover:text-foreground
      "
    >
      {isDark
        ? <><Sun  className="w-3.5 h-3.5 text-amber-400" /><span className="hidden sm:inline">Light</span></>
        : <><Moon className="w-3.5 h-3.5 text-blue-400"  /><span className="hidden sm:inline">Dark</span></>
      }
    </button>
  )
}
