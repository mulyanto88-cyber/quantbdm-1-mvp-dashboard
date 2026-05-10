import type { Metadata } from 'next'
import { Inter, Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'
import Sidebar from '../../components/sidebar'
import TickerTape from '../../components/ticker-tape'
import GlobalSearch from '../../components/global-search'
import ThemeToggle from '../../components/theme-toggle'

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'BDMFlow — IDX Flow Intelligence',
  description: 'Track Smart Money, Whale Positions & Institutional Flow on IDX. Daily precision. Institutional grade.',
  keywords: ['saham', 'IDX', 'KSEI', 'bandarmologi', 'smart money', 'whale', 'screener', 'BDMFlow', 'flow analysis'],
  icons: { icon: '/favicon.ico' },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="id" className="dark" suppressHydrationWarning>
      <body className={`${jakarta.variable} ${inter.variable} font-sans`}>

        {/* ── Sidebar ── */}
        <Sidebar />

        {/* ── Main area: offset by sidebar (68px collapsed) ── */}
        <div className="md:pl-[68px] flex flex-col min-h-screen transition-all duration-300">

          {/* ── Top Bar ── */}
          <header className="app-header sticky top-0 z-30 h-16 flex items-center px-6 gap-4 shadow-sm">

            {/* Logo / Brand — visible on mobile (sidebar hidden) */}
            <div className="flex items-center gap-2.5 md:hidden">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shadow-lg shadow-amber-500/20 flex-shrink-0"
                style={{ background: "linear-gradient(135deg,#e7b733,#c49a1a)", color: "#0a122c" }}>
                <span className="font-bold text-xs" style={{ fontFamily: "monospace" }}>B</span>
              </div>
              <div>
                <p className="text-sm font-black gradient-gold leading-none">BDMFlow</p>
                <p className="text-[8px] uppercase tracking-widest text-muted-foreground">IDX Flow Intelligence</p>
              </div>
            </div>

            {/* Desktop: spacer so search sits center-right */}
            <div className="hidden md:block flex-1" />

            {/* Global Quick Search */}
            <GlobalSearch />

            {/* Right badges */}
            <div className="flex items-center gap-2.5 flex-shrink-0">
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="pulse-dot" />
                <span className="text-[11px]">T+1</span>
              </div>
              <ThemeToggle />
              <span className="badge-pro">PRO</span>
            </div>
          </header>

          {/* ── Ticker Tape ── */}
          <TickerTape />

          {/* ── Page Content ── */}
          <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6">
            {children}
          </main>

          {/* ── Footer ── */}
          <footer className="border-t border-border/30 py-4 px-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <p>© 2026 <span className="font-bold text-foreground">BDMFlow</span> · IDX Flow Intelligence · Data sourced from KSEI &amp; IDX.</p>
              <p className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Not financial advice. DYOR.
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  )
}
