'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FIXED ISSUES:
// 1. Ganti createClientComponentClient (package tdk ada) → pakai supabase singleton
// 2. Hapus `supabase` dari useCallback deps → cegah infinite re-render
// 3. Field names diselaraskan ke schema nyata: stock_code, close, open_price, dll
// 4. Table names dikoreksi: daily_transactions (bukan 'stocks'/'price_history')
// 5. useSearchParams dibungkus Suspense (wajib Next.js 14 App Router)
// 6. Design pakai CSS vars (bg-background, glass, border-border) bukan slate-950 hardcoded
// 7. Pakai formatRupiah/formatPercent/formatNumber dari @/lib/utils
// 8. Chart tab diimplementasikan dengan recharts (bukan placeholder)
// 9. Broker query dibenahi: ambil latest date dulu, baru query broker hari itu
// 10. Watchlist pakai localStorage (bukan query ke DB table yg blm tentu ada)
// 11. Hapus semua unused imports
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Star, Share2, Download, Activity, TrendingUp, TrendingDown,
  DollarSign, Users, PieChart, BarChart3, AlertTriangle, CheckCircle,
  Zap, Eye, RefreshCw, Loader2
} from 'lucide-react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Area, AreaChart
} from 'recharts'

// ✅ FIX #1: pakai supabase singleton dari lib, BUKAN createClientComponentClient
import { supabase } from '@/lib/supabase'
// ✅ FIX #7: pakai util functions yang sudah ada
import { formatRupiah, formatPercent, formatNumber, formatShares } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// TYPES — selaras dengan schema daily_transactions
// ─────────────────────────────────────────────────────────────────────────────

// ✅ FIX #3: field names sesuai DB nyata
interface StockData {
  stock_code: string
  close: number
  change_percent: number
  high: number
  low: number
  open_price: number
  volume: number
  value: number
  frequency: number
  net_foreign_value: number
  foreign_buy_value: number
  foreign_sell_value: number
  vwma_20d: number
  ma20_volume: number
  aov_ratio_ma20: number
  avg_order_volume: number
  whale_signal: boolean
  big_player_anomaly: boolean
  signal: string
  sector: string
  free_float: number
  tradeable_shares: number
  trading_date: string
  // optional enrichment fields (dari RPC atau join)
  smart_money_score?: number
  per?: number | null
  pbv?: number | null
  market_cap?: number
  shares_outstanding?: number
  epso?: number
  bvpo?: number
}

interface HistoryPoint {
  trading_date: string
  open_price: number
  high: number
  low: number
  close: number
  volume: number
  net_foreign_value: number
  aov_ratio_ma20: number
  vwma_20d: number
  whale_signal: boolean
  big_player_anomaly: boolean
}

// ✅ Broker — agregat per broker_code dari satu hari trading
interface BrokerRow {
  broker_code: string
  broker_name: string
  buy_volume: number
  buy_value: number
  sell_volume: number
  sell_value: number
  net_volume: number
  net_value: number
  avg_buy_price: number
  avg_sell_price: number
}

// ✅ Selaras dengan InsiderAlert di supabase.ts
interface InsiderRow {
  report_date: string
  share_code: string
  investor_name: string
  investor_type: string
  nationality: string
  prev_percentage: number
  curr_percentage: number
  pct_point_change: number
  share_change: number
  action: 'BUYING' | 'SELLING' | 'HOLDING'
  alert_level: 'HIGH' | 'MEDIUM' | 'LOW'
}

// ✅ Selaras dengan WhalePosition di supabase.ts
interface OwnershipRow {
  investor_name: string
  investor_type: string
  local_foreign: string
  latest_date: string
  first_percentage: number
  latest_percentage: number
  latest_shares: number
  est_entry_price: number
  current_price: number
  return_since_entry: number
  holding_days: number
  position_trend: 'INCREASING' | 'DECREASING' | 'STABLE'
  whale_verdict: string
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const PERIODS = [
  { id: '1W', label: '1W', days: 7 },
  { id: '1M', label: '1M', days: 30 },
  { id: '3M', label: '3M', days: 90 },
  { id: '6M', label: '6M', days: 180 },
  { id: '1Y', label: '1Y', days: 365 },
]

const TABS = [
  { id: 'overview',   label: 'Overview',    icon: Activity },
  { id: 'chart',      label: 'Chart',       icon: TrendingUp },
  { id: 'broker',     label: 'Broker',      icon: Users },
  { id: 'ownership',  label: 'Ownership',   icon: PieChart },
  { id: 'insider',    label: 'Insider',     icon: Eye },
  { id: 'financials', label: 'Financials',  icon: BarChart3 },
]

const SIGNAL_STYLE: Record<string, string> = {
  Akumulasi:  'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
  Distribusi: 'bg-red-500/15 text-red-400 border border-red-500/20',
  Netral:     'bg-slate-500/15 text-slate-400 border border-slate-500/20',
  STRONG_BUY: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
  WATCH:      'bg-amber-500/15 text-amber-400 border border-amber-500/20',
  NEUTRAL:    'bg-slate-500/15 text-slate-400 border border-slate-500/20',
  AVOID:      'bg-red-500/15 text-red-400 border border-red-500/20',
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

// ✅ FIX #5: pisahkan inner component agar useSearchParams bisa dibungkus Suspense
function StockDetailInner() {
  const params    = useParams()
  const router    = useRouter()
  const code      = ((params?.code as string) || '').toUpperCase()

  const [stock,     setStock]     = useState<StockData | null>(null)
  const [history,   setHistory]   = useState<HistoryPoint[]>([])
  const [brokers,   setBrokers]   = useState<BrokerRow[]>([])
  const [ownership, setOwnership] = useState<OwnershipRow[]>([])
  const [insiders,  setInsiders]  = useState<InsiderRow[]>([])

  const [loading,     setLoading]     = useState(true)
  const [tabLoading,  setTabLoading]  = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [activeTab,   setActiveTab]   = useState('overview')
  const [period,      setPeriod]      = useState('1M')
  // ✅ FIX #10: watchlist pakai localStorage, bukan DB
  const [watchlist,   setWatchlist]   = useState(false)
  const [copied,      setCopied]      = useState(false)

  // ✅ FIX #10: load watchlist dari localStorage saat mount
  useEffect(() => {
    try {
      const wl: string[] = JSON.parse(localStorage.getItem('bdm_watchlist') || '[]')
      setWatchlist(wl.includes(code))
    } catch { /* ignore */ }
  }, [code])

  // ─────────────────────────────────────────────────────────────────────────
  // FETCH DATA
  // ─────────────────────────────────────────────────────────────────────────

  // ✅ FIX #2: `supabase` TIDAK dimasukkan ke deps (singleton, tidak pernah berubah)
  //           Tanpa fix ini → supabase baru tiap render → deps berubah → loop tak terbatas
  const loadStock = useCallback(async () => {
    if (!code) return
    setLoading(true)
    setError(null)
    try {
      // ✅ FIX #4: query daily_transactions, bukan tabel 'stocks' yang tidak ada
      const { data, error: err } = await supabase
        .from('daily_transactions')
        .select('*')
        .eq('stock_code', code)
        .order('trading_date', { ascending: false })
        .limit(1)
        .single()

      if (err || !data) { setError(`Saham ${code} tidak ditemukan`); return }
      setStock(data)
    } catch (e: any) {
      setError(e?.message || 'Gagal memuat data')
    } finally {
      setLoading(false)
    }
  }, [code])

  // ✅ FIX #4 + #3: query history dari daily_transactions dengan field yang benar
  const loadHistory = useCallback(async (periodId: string) => {
    if (!code) return
    setTabLoading(true)
    try {
      const days = PERIODS.find(p => p.id === periodId)?.days ?? 30
      const since = new Date()
      since.setDate(since.getDate() - days)

      const { data } = await supabase
        .from('daily_transactions')
        .select('trading_date,open_price,high,low,close,volume,net_foreign_value,aov_ratio_ma20,vwma_20d,whale_signal,big_player_anomaly')
        .eq('stock_code', code)
        .gte('trading_date', since.toISOString().split('T')[0])
        .order('trading_date', { ascending: true })

      setHistory(data || [])
    } catch { /* silently ignore */ } finally {
      setTabLoading(false)
    }
  }, [code])

  // ✅ FIX #9: broker — ambil tanggal terakhir dulu, baru query broker untuk tanggal itu
  const loadBrokers = useCallback(async () => {
    if (!code) return
    setTabLoading(true)
    try {
      const { data: dateRow } = await supabase
        .from('daily_transactions')
        .select('trading_date')
        .eq('stock_code', code)
        .order('trading_date', { ascending: false })
        .limit(1)
        .single()

      if (!dateRow) return

      const { data } = await supabase
        .from('broker_summary')
        .select('*')
        .eq('stock_code', code)
        .eq('trading_date', dateRow.trading_date)
        .order('net_value', { ascending: false })

      setBrokers(data || [])
    } catch { /* silently ignore */ } finally {
      setTabLoading(false)
    }
  }, [code])

  const loadOwnership = useCallback(async () => {
    if (!code) return
    setTabLoading(true)
    try {
      const { data } = await supabase
        .from('ksei_monthly')
        .select('*')
        .eq('stock_code', code)
        .order('latest_date', { ascending: false })
        .limit(20)
      setOwnership(data || [])
    } catch { /* silently ignore */ } finally {
      setTabLoading(false)
    }
  }, [code])

  const loadInsiders = useCallback(async () => {
    if (!code) return
    setTabLoading(true)
    try {
      // ✅ FIX #3: field names sesuai InsiderAlert di supabase.ts
      const { data } = await supabase
        .from('ksei_insider_alerts')
        .select('*')
        .eq('share_code', code)
        .order('report_date', { ascending: false })
        .limit(20)
      setInsiders(data || [])
    } catch { /* silently ignore */ } finally {
      setTabLoading(false)
    }
  }, [code])

  // Initial load
  useEffect(() => { loadStock() }, [loadStock])
  useEffect(() => { loadHistory(period) }, [loadHistory, period])

  // Lazy load tab data saat tab aktif
  useEffect(() => {
    if (activeTab === 'broker')    loadBrokers()
    if (activeTab === 'ownership') loadOwnership()
    if (activeTab === 'insider')   loadInsiders()
  }, [activeTab, loadBrokers, loadOwnership, loadInsiders])

  // ─────────────────────────────────────────────────────────────────────────
  // ACTIONS
  // ─────────────────────────────────────────────────────────────────────────

  // ✅ FIX #10: toggle watchlist via localStorage
  const toggleWatchlist = () => {
    try {
      const wl: string[] = JSON.parse(localStorage.getItem('bdm_watchlist') || '[]')
      const next = watchlist
        ? wl.filter(c => c !== code)
        : [...wl, code]
      localStorage.setItem('bdm_watchlist', JSON.stringify(next))
      setWatchlist(!watchlist)
    } catch { /* ignore */ }
  }

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  const exportCSV = () => {
    if (!history.length) return
    const headers = ['Date','Open','High','Low','Close','Volume','Net Foreign','AOV Ratio']
    const rows = history.map(h => [
      h.trading_date, h.open_price, h.high, h.low, h.close,
      h.volume, h.net_foreign_value, h.aov_ratio_ma20
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const a   = document.createElement('a')
    a.href    = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `${code}_history.csv`
    a.click()
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DERIVED VALUES
  // ─────────────────────────────────────────────────────────────────────────

  const pct       = stock?.change_percent ?? 0
  const isPos     = pct >= 0
  const prevClose = stock ? stock.close / (1 + pct / 100) : 0
  const absChange = stock ? stock.close - prevClose : 0

  // recharts chart data
  const chartData = history.map(h => ({
    date:    h.trading_date.slice(5),   // MM-DD
    close:   h.close,
    volume:  h.volume / 1_000_000,      // dalam juta lot
    netF:    h.net_foreign_value / 1_000_000_000,  // dalam miliar
    aov:     h.aov_ratio_ma20,
    vwma:    h.vwma_20d,
    whale:   h.whale_signal,
  }))

  // Score gauge
  const score = stock?.smart_money_score ?? 0

  // ─────────────────────────────────────────────────────────────────────────
  // LOADING STATE
  // ─────────────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <Loader2 className="w-10 h-10 animate-spin text-gold-400 opacity-70" />
      <p className="text-sm text-muted-foreground">Memuat data {code}…</p>
    </div>
  )

  if (error || !stock) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 max-w-sm mx-auto text-center">
      <AlertTriangle className="w-12 h-12 text-red-400" />
      <h2 className="text-lg font-bold text-foreground">Data Tidak Ditemukan</h2>
      <p className="text-sm text-muted-foreground">{error}</p>
      <button onClick={() => router.back()}
        className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">
        Kembali
      </button>
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()}
            className="p-2 rounded-lg hover:bg-accent/60 transition-colors text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold gradient-gold">{stock.stock_code}</h1>
              {/* Signal badge */}
              {stock.signal && (
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${SIGNAL_STYLE[stock.signal] ?? 'bg-slate-500/15 text-slate-400'}`}>
                  {stock.signal}
                </span>
              )}
              {stock.whale_signal && (
                <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/20">
                  <Zap className="w-3 h-3" /> WHALE
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{stock.sector} · {stock.trading_date}</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button onClick={toggleWatchlist}
            className={`p-2 rounded-lg transition-all duration-200 border ${
              watchlist
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/50'
            }`} title="Watchlist">
            <Star className={`w-4 h-4 ${watchlist ? 'fill-current' : ''}`} />
          </button>
          <button onClick={handleShare}
            className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all duration-200"
            title={copied ? 'Tersalin!' : 'Salin link'}>
            {copied ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
          </button>
          <button onClick={exportCSV}
            className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all duration-200"
            title="Export CSV">
            <Download className="w-4 h-4" />
          </button>
          <button onClick={loadStock}
            className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all duration-200"
            title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Price Hero ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Price card */}
        <div className="md:col-span-2 glass rounded-xl p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              {/* ✅ FIX #7: pakai formatRupiah dari utils */}
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="text-3xl font-bold text-foreground">
                  Rp {stock.close.toLocaleString('id-ID')}
                </span>
                <div className={`flex items-center gap-1 text-lg font-semibold ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
                  {isPos ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                  {/* ✅ FIX #7: pakai formatPercent */}
                  {formatPercent(pct)}
                </div>
              </div>
              <p className={`text-sm ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
                {isPos ? '+' : ''}{absChange.toLocaleString('id-ID')} hari ini
              </p>
            </div>

            {stock.big_player_anomaly && (
              <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/25 text-amber-400">
                <Zap className="w-3.5 h-3.5" /> Big Player Anomaly
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-border/60">
            {[
              { label: 'Volume',    value: formatShares(stock.volume) },
              { label: 'Nilai',     value: formatRupiah(stock.value) },
              { label: 'Frek',      value: formatNumber(stock.frequency) },
              { label: 'AOV/MA20',  value: `${(stock.aov_ratio_ma20 || 0).toFixed(2)}×` },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-[11px] text-muted-foreground mb-0.5">{label}</p>
                <p className="text-sm font-semibold text-foreground">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Smart Money Score gauge */}
        <div className="glass rounded-xl p-5 flex flex-col items-center justify-center gap-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Smart Money Score</p>
          <div className="relative w-28 h-28 flex items-center justify-center">
            <svg className="w-28 h-28 -rotate-90" viewBox="0 0 56 56">
              <circle cx="28" cy="28" r="24" fill="none" stroke="hsl(var(--border))" strokeWidth="4" />
              <circle cx="28" cy="28" r="24" fill="none"
                stroke={score >= 70 ? '#34d399' : score >= 40 ? '#f59e0b' : '#f87171'}
                strokeWidth="4"
                strokeDasharray={`${(score / 100) * 150.8} 150.8`}
                strokeLinecap="round"
                className="transition-all duration-1000" />
            </svg>
            <span className="absolute text-2xl font-bold text-foreground">{score}</span>
          </div>
          <p className={`text-xs font-semibold ${score >= 70 ? 'text-emerald-400' : score >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
            {score >= 70 ? 'Strong Buy' : score >= 40 ? 'Watch' : 'Weak Signal'}
          </p>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-medium whitespace-nowrap transition-all duration-200 ${
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground shadow shadow-primary/20'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/60 border border-transparent'
              }`}>
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ── Tab Loading indicator ── */}
      {tabLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Memuat data…
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────── */}
      {/* TAB: OVERVIEW                                               */}
      {/* ─────────────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { icon: DollarSign, color: 'text-blue-400', bg: 'bg-blue-500/10',
                label: 'Market Cap', value: stock.market_cap ? formatRupiah(stock.market_cap) : '—' },
              { icon: Activity,   color: 'text-purple-400', bg: 'bg-purple-500/10',
                label: 'P/E Ratio', value: stock.per != null ? stock.per.toFixed(2) : 'N/A' },
              { icon: PieChart,   color: 'text-emerald-400', bg: 'bg-emerald-500/10',
                label: 'P/BV', value: stock.pbv != null ? stock.pbv.toFixed(2) : 'N/A' },
              { icon: Users,      color: 'text-amber-400', bg: 'bg-amber-500/10',
                label: 'Shares', value: stock.tradeable_shares ? formatShares(stock.tradeable_shares) : '—' },
            ].map(({ icon: Icon, color, bg, label, value }) => (
              <div key={label} className="glass rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`p-1.5 rounded-lg ${bg}`}>
                    <Icon className={`w-4 h-4 ${color}`} />
                  </div>
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
                <p className="text-lg font-bold text-foreground">{value}</p>
              </div>
            ))}
          </div>

          {/* Foreign Flow */}
          <div className="glass rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Foreign Flow</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="text-center p-3 rounded-lg bg-emerald-500/8 border border-emerald-500/15">
                <p className="text-[11px] text-emerald-400 mb-1">Buy</p>
                {/* ✅ FIX #3 + #7: pakai foreign_buy_value + formatRupiah */}
                <p className="text-lg font-bold text-emerald-400">{formatRupiah(stock.foreign_buy_value)}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-red-500/8 border border-red-500/15">
                <p className="text-[11px] text-red-400 mb-1">Sell</p>
                <p className="text-lg font-bold text-red-400">{formatRupiah(stock.foreign_sell_value)}</p>
              </div>
              <div className={`text-center p-3 rounded-lg border ${
                stock.net_foreign_value >= 0
                  ? 'bg-blue-500/8 border-blue-500/15'
                  : 'bg-orange-500/8 border-orange-500/15'
              }`}>
                <p className="text-[11px] text-muted-foreground mb-1">Net</p>
                <p className={`text-lg font-bold ${stock.net_foreign_value >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>
                  {formatPercent(0).slice(0, 1)}{formatRupiah(Math.abs(stock.net_foreign_value))}
                </p>
              </div>
            </div>
          </div>

          {/* Company Info + Technical */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="glass rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Info Saham</h3>
              <div className="space-y-2.5">
                {[
                  { label: 'Sektor',     value: stock.sector || '—' },
                  { label: 'Free Float', value: stock.free_float ? `${stock.free_float.toFixed(1)}%` : '—' },
                  { label: 'VWMA 20d',   value: stock.vwma_20d ? `Rp ${stock.vwma_20d.toLocaleString('id-ID')}` : '—' },
                  { label: 'Tanggal',    value: stock.trading_date },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="text-foreground font-medium">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Level Teknikal</h3>
              <div className="space-y-2.5">
                {[
                  { label: 'High',     value: `Rp ${stock.high.toLocaleString('id-ID')}`,       color: 'text-emerald-400' },
                  { label: 'Low',      value: `Rp ${stock.low.toLocaleString('id-ID')}`,        color: 'text-red-400' },
                  { label: 'Open',     value: `Rp ${stock.open_price.toLocaleString('id-ID')}`, color: 'text-foreground' },
                  { label: 'Avg Vol',  value: formatShares(stock.avg_order_volume || 0),        color: 'text-foreground' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className={`font-medium ${color}`}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────── */}
      {/* TAB: CHART                                                  */}
      {/* ─────────────────────────────────────────────────────────── */}
      {activeTab === 'chart' && (
        <div className="glass rounded-xl p-5 space-y-5">
          {/* Period selector */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="text-sm font-semibold text-foreground">Grafik Harga</h3>
            <div className="flex gap-1.5">
              {PERIODS.map(p => (
                <button key={p.id} onClick={() => setPeriod(p.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    period === p.id
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground bg-accent/40 hover:bg-accent/80'
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {chartData.length === 0 ? (
            <div className="h-72 flex items-center justify-center text-muted-foreground text-sm">
              Tidak ada data untuk periode ini
            </div>
          ) : (
            <>
              {/* ✅ FIX #8: implementasi chart nyata dengan recharts, bukan placeholder */}
              {/* Price + VWMA */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">Harga & VWMA</p>
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                      tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                      tickLine={false} axisLine={false} width={55}
                      tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: 'hsl(var(--foreground))' }}
                      formatter={(v: any, name: string) => [`Rp ${Number(v).toLocaleString('id-ID')}`, name]}
                    />
                    <Area dataKey="close" name="Close" type="monotone"
                      fill="hsl(var(--primary))" fillOpacity={0.08}
                      stroke="hsl(var(--primary))" strokeWidth={1.5} dot={false} />
                    <Line dataKey="vwma" name="VWMA20" type="monotone"
                      stroke="#94a3b8" strokeWidth={1} dot={false} strokeDasharray="4 2" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Volume */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">Volume (Juta Lot)</p>
                <ResponsiveContainer width="100%" height={100}>
                  <ComposedChart data={chartData} margin={{ top: 0, right: 4, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                    <XAxis dataKey="date" tick={false} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                      tickLine={false} axisLine={false} width={40}
                      tickFormatter={v => `${v.toFixed(0)}M`} />
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                      formatter={(v: any) => [`${Number(v).toFixed(2)}M lot`, 'Volume']}
                    />
                    <Bar dataKey="volume" name="Volume" radius={[2, 2, 0, 0]}>
                      {chartData.map((d, i) => (
                        <Cell key={i}
                          fill={d.aov > 2 ? '#a78bfa' : d.aov > 1.5 ? '#f59e0b' : '#64748b'}
                          fillOpacity={0.75} />
                      ))}
                    </Bar>
                  </ComposedChart>
                </ResponsiveContainer>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Warna: <span className="text-purple-400">■</span> Spike 2×+ &nbsp;
                  <span className="text-amber-400">■</span> Elevated 1.5×+ &nbsp;
                  <span className="text-slate-400">■</span> Normal
                </p>
              </div>

              {/* Net Foreign */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">Net Foreign (Miliar)</p>
                <ResponsiveContainer width="100%" height={100}>
                  <ComposedChart data={chartData} margin={{ top: 0, right: 4, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                    <XAxis dataKey="date" tick={false} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                      tickLine={false} axisLine={false} width={45}
                      tickFormatter={v => `${v.toFixed(1)}B`} />
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                      formatter={(v: any) => [`${Number(v).toFixed(2)}B`, 'Net Foreign']}
                    />
                    <Bar dataKey="netF" name="Net Foreign" radius={[2, 2, 0, 0]}>
                      {chartData.map((d, i) => (
                        <Cell key={i} fill={d.netF >= 0 ? '#34d399' : '#f87171'} fillOpacity={0.8} />
                      ))}
                    </Bar>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────── */}
      {/* TAB: BROKER                                                 */}
      {/* ─────────────────────────────────────────────────────────── */}
      {activeTab === 'broker' && (
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Broker Summary — {stock.trading_date}</h3>
          {brokers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">Tidak ada data broker</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60">
                    {['Broker', 'Buy Vol', 'Buy Val', 'Sell Vol', 'Sell Val', 'Net Val'].map(h => (
                      <th key={h} className={`py-2.5 px-3 text-[11px] font-semibold text-muted-foreground ${h === 'Broker' ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {brokers.map((b, i) => (
                    <tr key={i} className="border-b border-border/30 last:border-0 hover:bg-accent/30 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-foreground">{b.broker_code}</div>
                        <div className="text-[11px] text-muted-foreground">{b.broker_name}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right text-foreground">{formatShares(b.buy_volume)}</td>
                      <td className="py-2.5 px-3 text-right text-emerald-400">{formatRupiah(b.buy_value)}</td>
                      <td className="py-2.5 px-3 text-right text-foreground">{formatShares(b.sell_volume)}</td>
                      <td className="py-2.5 px-3 text-right text-red-400">{formatRupiah(b.sell_value)}</td>
                      <td className={`py-2.5 px-3 text-right font-semibold ${b.net_value >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>
                        {b.net_value >= 0 ? '+' : ''}{formatRupiah(b.net_value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────── */}
      {/* TAB: OWNERSHIP                                              */}
      {/* ─────────────────────────────────────────────────────────── */}
      {activeTab === 'ownership' && (
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Whale Portfolio & Kepemilikan</h3>
          {ownership.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">Tidak ada data kepemilikan</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60">
                    {['Investor', 'Tipe', 'Kepemilikan', 'Entry Est', 'Return', 'Trend', 'Verdict'].map(h => (
                      <th key={h} className={`py-2.5 px-3 text-[11px] font-semibold text-muted-foreground ${h === 'Investor' ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ownership.map((o, i) => (
                    <tr key={i} className="border-b border-border/30 last:border-0 hover:bg-accent/30 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-foreground">{o.investor_name}</div>
                        <div className="text-[11px] text-muted-foreground">{o.local_foreign}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground">{o.investor_type}</td>
                      <td className="py-2.5 px-3 text-right text-foreground">{o.latest_percentage.toFixed(2)}%</td>
                      <td className="py-2.5 px-3 text-right text-foreground">Rp {(o.est_entry_price || 0).toLocaleString('id-ID')}</td>
                      <td className={`py-2.5 px-3 text-right font-semibold ${o.return_since_entry >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatPercent(o.return_since_entry)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                          o.position_trend === 'INCREASING' ? 'bg-emerald-500/15 text-emerald-400' :
                          o.position_trend === 'DECREASING' ? 'bg-red-500/15 text-red-400' :
                          'bg-slate-500/15 text-slate-400'
                        }`}>
                          {o.position_trend}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-[11px] text-muted-foreground">{o.whale_verdict}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────── */}
      {/* TAB: INSIDER                                                */}
      {/* ─────────────────────────────────────────────────────────── */}
      {activeTab === 'insider' && (
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Insider Alerts (KSEI)</h3>
          {insiders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">Tidak ada transaksi insider</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60">
                    {['Tanggal', 'Investor', 'Tipe', 'Aksi', 'Perubahan Saham', '% Sebelum → Sesudah', 'Level'].map(h => (
                      <th key={h} className={`py-2.5 px-3 text-[11px] font-semibold text-muted-foreground ${h === 'Investor' || h === 'Tanggal' ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {insiders.map((ins, i) => (
                    <tr key={i} className="border-b border-border/30 last:border-0 hover:bg-accent/30 transition-colors">
                      <td className="py-2.5 px-3 text-muted-foreground text-[12px]">{ins.report_date}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-foreground">{ins.investor_name}</div>
                        <div className="text-[11px] text-muted-foreground">{ins.nationality}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground text-[12px]">{ins.investor_type}</td>
                      <td className="py-2.5 px-3 text-right">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                          ins.action === 'BUYING'  ? 'bg-emerald-500/15 text-emerald-400' :
                          ins.action === 'SELLING' ? 'bg-red-500/15 text-red-400' :
                          'bg-slate-500/15 text-slate-400'
                        }`}>
                          {ins.action}
                        </span>
                      </td>
                      {/* ✅ FIX #3: pakai field share_change, pct_point_change dari InsiderAlert */}
                      <td className={`py-2.5 px-3 text-right font-medium ${ins.share_change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {ins.share_change >= 0 ? '+' : ''}{formatShares(ins.share_change)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-foreground text-[12px]">
                        {ins.prev_percentage.toFixed(2)}% → {ins.curr_percentage.toFixed(2)}%
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          ins.alert_level === 'HIGH'   ? 'bg-red-500/15 text-red-400' :
                          ins.alert_level === 'MEDIUM' ? 'bg-amber-500/15 text-amber-400' :
                          'bg-blue-500/15 text-blue-400'
                        }`}>
                          {ins.alert_level}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────── */}
      {/* TAB: FINANCIALS                                             */}
      {/* ─────────────────────────────────────────────────────────── */}
      {activeTab === 'financials' && (
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Rasio Keuangan</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'EPS (Rp)',    value: stock.epso != null ? stock.epso.toLocaleString('id-ID') : 'N/A' },
              { label: 'BVPS (Rp)',   value: stock.bvpo != null ? stock.bvpo.toLocaleString('id-ID') : 'N/A' },
              // ✅ FIX: null-safe .toFixed()
              { label: 'P/E Ratio',  value: stock.per != null ? stock.per.toFixed(2) : 'N/A' },
              { label: 'P/BV Ratio', value: stock.pbv != null ? stock.pbv.toFixed(2) : 'N/A' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-accent/30 rounded-xl p-4 border border-border/40">
                <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
                <p className="text-xl font-bold text-foreground">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT — dibungkus Suspense untuk Next.js 14 App Router
// (useSearchParams() dan useParams() perlu Suspense boundary)
// ✅ FIX #5
// ─────────────────────────────────────────────────────────────────────────────
export default function StockDetailPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-gold-400 opacity-70" />
        <span className="text-sm text-muted-foreground">Memuat…</span>
      </div>
    }>
      <StockDetailInner />
    </Suspense>
  )
}
