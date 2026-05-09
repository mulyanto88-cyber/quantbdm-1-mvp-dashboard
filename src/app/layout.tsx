import type { Metadata } from 'next'
import { Inter, Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'
import Sidebar from '../../components/sidebar'
import TickerTape from '../../components/ticker-tape'
import GlobalSearch from '../../components/global-search'

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
  title: 'Bandarmology — Smart Money Radar',
  description: 'Track Smart Money, Whale Positions & Insider Alerts in Real-Time',
  keywords: ['saham', 'IDX', 'KSEI', 'bandarmology', 'smart money', 'whale', 'screener'],
  icons: { icon: '/favicon.ico' },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="id" className="dark">
      <body className={`${jakarta.variable} ${inter.variable} font-sans bg-background text-foreground`}>

        {/* ── Sidebar ── */}
        <Sidebar />

        {/* ── Main area: offset by sidebar (68px collapsed) ── */}
        <div className="md:pl-[68px] flex flex-col min-h-screen transition-all duration-300">

          {/* ── Top Bar ── */}
          <header className="sticky top-0 z-30 h-16 bg-[#0f172a]/80 backdrop-blur-xl border-b border-white/[0.05] flex items-center px-6 gap-4 shadow-sm">

            {/* Logo / Brand — visible on mobile (sidebar hidden) */}
            <div className="flex items-center gap-2.5 md:hidden">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-yellow-600 flex items-center justify-center shadow-lg shadow-amber-500/20 flex-shrink-0">
                <span className="text-black font-bold text-xs">B</span>
              </div>
              <span className="text-sm font-bold gradient-gold">Bandarmology</span>
            </div>

            {/* Desktop: spacer so search sits center-right */}
            <div className="hidden md:block flex-1" />

            {/* Global Quick Search */}
            <GlobalSearch />

            {/* Right badges */}
            <div className="flex items-center gap-2.5 flex-shrink-0">
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="pulse-dot" />
                <span className="text-[11px]">Live</span>
              </div>
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
          <footer className="border-t border-white/[0.03] py-4 px-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <p>© 2026 Bandarmology. Data sourced from KSEI &amp; IDX.</p>
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
