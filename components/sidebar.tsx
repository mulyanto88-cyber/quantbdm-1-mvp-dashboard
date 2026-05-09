'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  Menu, X, Sun, Moon, LayoutDashboard, LineChart, Target, 
  Users, Activity, Briefcase, Zap, Shield, Radar, BarChart3, 
  PieChart, Building2, Eye
} from 'lucide-react'

// ======================== NAV ITEMS ========================
const navItems = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/ksei1', label: '1% Ownership', icon: PieChart, badge: 'HOT' },
  { href: '/ownership', label: 'Smart Money Tracker', icon: Radar, badge: 'PRO' },
  { href: '/stocks', label: 'Stock Deep Dive', icon: Activity },
  { href: '/flow', label: '5% Flow Matrix', icon: BarChart3 },
  { href: '/screener', label: 'Whale Screener', icon: Eye },
  { href: '/konlo', label: 'Konglomerasi', icon: Target },
  { href: '/players', label: 'Entity Tracker', icon: Users },
  { href: '/backtest', label: 'Backtest Engine', icon: Zap, badge: 'NEW' },
  { href: '/pricing', label: 'Pricing & Pro', icon: Shield },
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
        className="fixed top-3 left-3 z-50 p-2 rounded-xl bg-[#0f172a]/80 backdrop-blur-md border border-white/[0.05] shadow-lg md:hidden">
        {mobileOpen ? <X size={20} className="text-white" /> : <Menu size={20} className="text-white" />}
      </button>

      {mobileOpen && <div className="fixed inset-0 z-30 bg-black/80 backdrop-blur-sm md:hidden" onClick={() => setMobileOpen(false)} />}

      <aside
        onMouseEnter={() => setExpanded(true)} onMouseLeave={() => setExpanded(false)}
        className={`fixed top-0 left-0 z-40 h-full flex flex-col transition-all duration-300 ease-out border-r border-white/[0.05] bg-[#0b1120]/95 backdrop-blur-xl shadow-2xl
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 ${expanded ? 'w-64' : 'w-[68px]'}`}>
        
        {/* Logo */}
        <div className="flex items-center h-[72px] px-4 border-b border-white/[0.05] flex-shrink-0">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shadow-lg shadow-gold-500/20"
            style={{ background: 'linear-gradient(135deg, #e7b733, #f5d061)', color: '#0f172a' }}>
            QB
          </div>
          {(expanded || mobileOpen) && (
            <div className="ml-3 overflow-hidden whitespace-nowrap animate-in fade-in slide-in-from-left-2">
              <p className="text-[15px] font-black tracking-tight text-white">Quant<span className="text-gold-400">BDM</span></p>
              <p className="text-[9px] uppercase tracking-[0.2em] text-slate-500 font-bold">Institutional Grade</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-6 overflow-x-hidden scrollbar-hide">
          {(expanded || mobileOpen) && (
            <p className="px-5 pb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600 animate-in fade-in">Analytics Core</p>
          )}
          
          <div className="space-y-1.5 px-2">
            {navItems.map((item) => {
              const active = isActive(item.href)
              const Icon = item.icon
              return (
                <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
                  title={!expanded && !mobileOpen ? item.label : undefined}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 relative group
                    ${active ? 'bg-gradient-to-r from-gold-400/10 to-transparent' : 'hover:bg-white/[0.03]'}`}>
                  
                  {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-gold-400 rounded-r-full shadow-[0_0_10px_rgba(231,183,51,0.5)]" />}
                  
                  <div className={`flex items-center justify-center transition-colors ${active ? 'text-gold-400' : 'text-slate-400 group-hover:text-white'}`}>
                    <Icon strokeWidth={active ? 2.5 : 2} className="w-[18px] h-[18px]" />
                  </div>
                  
                  {(expanded || mobileOpen) && (
                    <div className="flex-1 flex items-center justify-between overflow-hidden whitespace-nowrap animate-in fade-in">
                      <span className={`text-[13px] font-medium ${active ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`}>
                        {item.label}
                      </span>
                      {item.badge && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md tracking-wider
                          ${item.badge === 'PRO' ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30' : 
                            item.badge === 'HOT' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 
                            'bg-blue-500/20 text-blue-400 border border-blue-500/30'}`}>
                          {item.badge}
                        </span>
                      )}
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        </nav>

        {/* Footer actions */}
        <div className="p-3 border-t border-white/[0.05] flex-shrink-0">
          <button onClick={toggleTheme}
            className={`flex items-center gap-3 w-full p-3 rounded-xl transition-colors hover:bg-white/[0.03] text-slate-400 hover:text-white
              ${!expanded && !mobileOpen ? 'justify-center' : ''}`}>
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
            {(expanded || mobileOpen) && <span className="text-[13px] font-medium">Light Mode</span>}
          </button>
          
          {(expanded || mobileOpen) && (
            <div className="mt-3 px-3 py-3 rounded-xl bg-gradient-to-br from-[#1e293b] to-[#0f172a] border border-white/[0.05] flex items-center gap-3 animate-in fade-in">
               <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center">
                 <Users size={14} className="text-slate-300" />
               </div>
               <div className="flex-1 overflow-hidden">
                 <p className="text-[11px] font-bold text-white truncate">Mulyanto</p>
                 <p className="text-[9px] text-gold-400 truncate">Pro Member</p>
               </div>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
