'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X, Sun, Moon } from 'lucide-react'

// ======================== SVG ICONS ========================
const icons = {
  dashboard: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  ),
  search: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M11 11L14.5 14.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
  flow: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 12L6 8L9 10L14 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M11 3H14V6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  building: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="12" height="14" rx="1" stroke="currentColor" strokeWidth="1.4"/>
      <line x1="6" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="6" y1="8" x2="10" y2="8" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  ),
  crosshair: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4"/>
      <circle cx="8" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.4"/>
      <circle cx="8" cy="8" r="1" fill="currentColor"/>
    </svg>
  ),
  users: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
      <circle cx="11" cy="7" r="2" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M1.5 14C1.5 11.5 3.5 9.5 6 9.5C8.5 9.5 10.5 11.5 10.5 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
  target: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4"/>
      <circle cx="8" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.4"/>
      <circle cx="8" cy="8" r="1" fill="currentColor"/>
    </svg>
  ),
  crown: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 12L2 14H14L13 12H3Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M4 12L2 5L5.5 8L8 3L10.5 8L14 5L12 12H4Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
    </svg>
  ),
  lab: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M5.5 1.5V6L2 13.5H14L10.5 6V1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M5.5 1.5H10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
  radar: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/>
      <circle cx="8" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.4"/>
      <circle cx="8" cy="8" r="1" fill="currentColor"/>
      <path d="M8 8L12.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M8 1.5V3M8 13V14.5M1.5 8H3M13 8H14.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  eye: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M1.5 8C1.5 8 4 3 8 3C12 3 14.5 8 14.5 8C14.5 8 12 13 8 13C4 13 1.5 8 1.5 8Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  ),
  sector: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="9" y="1" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="9" y="7" width="6" height="8" rx="1" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  ),
}

// ======================== NAV ITEMS ========================
const navItems = [
  { href: '/',          label: 'Market Overview',    icon: icons.dashboard },
  { href: '/stocks',    label: 'Stock Intelligence', icon: icons.search },
  { href: '/screener',  label: 'Screener Pro',       icon: icons.crosshair,  badge: 'PRO' },
  { href: '/radar',     label: 'Smart Money Radar',  icon: icons.radar,      badge: 'NEW' },
  { href: '/insider',   label: 'Insider Alerts',     icon: icons.eye },
  { href: '/sector',    label: 'Sector Heatmap',     icon: icons.sector },
  { href: '/players',   label: 'Big Player Radar',   icon: icons.users,      badge: 'HOT' },
  { href: '/konlo',     label: 'Konglomerasi',       icon: icons.target },
  { href: '/flow',      label: '5% Flow',            icon: icons.flow,       badge: '5%' },
  { href: '/ksei1',     label: '1% Tracker',         icon: icons.building,   badge: '1%' },
  { href: '/ownership', label: 'Whale Portfolio',    icon: icons.building },
  { href: '/backtest',  label: 'Backtest Lab',       icon: icons.lab,        badge: 'NEW' },
  { href: '/pricing',   label: 'Pricing',            icon: icons.crown },
]
// ======================== COMPONENT ========================
export default function Sidebar() {
  const pathname = usePathname()
  const [expanded, setExpanded] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('theme')
    if (stored === 'light') {
      document.documentElement.classList.remove('dark')
      setIsDark(false)
    }
  }, [])

  const toggleTheme = () => {
    if (isDark) {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    } else {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    }
    setIsDark(!isDark)
  }

  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <>
      <button onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-3 left-3 z-50 p-2 rounded-lg bg-navy-800 border border-navy-700 md:hidden">
        {mobileOpen ? <X size={20} className="text-white" /> : <Menu size={20} className="text-white" />}
      </button>

      {mobileOpen && <div className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={() => setMobileOpen(false)} />}

      <aside
        onMouseEnter={() => setExpanded(true)} onMouseLeave={() => setExpanded(false)}
        className={`fixed top-0 left-0 z-40 h-full flex flex-col transition-all duration-200 border-r bg-background
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 ${expanded ? 'w-52' : 'w-[56px]'}`}>
        
        {/* Logo */}
        <div className="flex items-center h-[52px] px-3.5 border-b border-border flex-shrink-0">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs"
            style={{ background: 'linear-gradient(135deg, #e7b733, #c49a1a)', color: '#0a122c', fontFamily: 'JetBrains Mono' }}>K</div>
          {(expanded || mobileOpen) && (
            <div className="ml-2.5 overflow-hidden whitespace-nowrap animate-fade-in">
              <p className="text-sm font-bold gradient-gold">KSEI</p>
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Bandarmology</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 overflow-x-hidden">
          {(expanded || mobileOpen) && (
            <p className="px-3.5 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground animate-fade-in">Menu</p>
          )}
          {navItems.map((item) => {
            const active = isActive(item.href)
            return (
              <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
                title={!expanded && !mobileOpen ? item.label : undefined}
                className={`flex items-center gap-2.5 mx-1.5 my-0.5 rounded-lg transition-all duration-150 relative
                  ${active ? 'text-gold-400 bg-gold-400/10 border border-gold-400/20' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50 border border-transparent'}`}
                style={{ padding: (expanded || mobileOpen) ? '8px 12px' : '10px 12px' }}>
                <span style={{ opacity: active ? 1 : 0.65 }}>{item.icon}</span>
                {(expanded || mobileOpen) && <span className="animate-fade-in flex-1 whitespace-nowrap text-[13px] font-medium">{item.label}</span>}
                {(expanded || mobileOpen) && item.badge && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gold-400/10 text-gold-400 animate-fade-in">{item.badge}</span>
                )}
                {!expanded && !mobileOpen && active && <span className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-l bg-gold-400" />}
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-border p-3 flex-shrink-0">
          {(expanded || mobileOpen) ? (
            <div className="space-y-3">
              <button onClick={toggleTheme} className="w-full flex items-center justify-center gap-2 text-xs py-2 rounded-lg bg-accent/50 border border-border/50 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                {isDark ? <><Sun size={14} /> Light</> : <><Moon size={14} /> Dark</>}
              </button>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
                <span>v2.5</span>
                <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live</div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <button onClick={toggleTheme} className="w-8 h-8 rounded-lg bg-accent/50 border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                {isDark ? <Sun size={14} /> : <Moon size={14} />}
              </button>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
