'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { formatNumber, formatPercent, formatShares } from '@/lib/utils'
import { 
  Eye, AlertTriangle, ArrowUp, ArrowDown, Filter,
  Building2, TrendingUp, TrendingDown, Clock,
  Shield, X, RefreshCw, ArrowRight, User
} from 'lucide-react'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────
interface InsiderAlert {
  report_date: string
  share_code: string
  investor_name: string
  investor_type: string
  nationality: string
  prev_percentage: number
  curr_percentage: number
  pct_point_change: number
  share_change: number
  action: string
  alert_level: string
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PERIOD_OPTIONS = [
  { label: '1D',  days: 1 },
  { label: '7D',  days: 7 },
  { label: '14D', days: 14 },
  { label: '1M',  days: 30 },
  { label: '3M',  days: 90 },
]

// ─── Component ────────────────────────────────────────────────────────────────
export default function InsiderAlertsPage() {
  const [insiders, setInsiders] = useState<InsiderAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [alertFilter, setAlertFilter] = useState<'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL')
  const [actionFilter, setActionFilter] = useState<'ALL' | 'BUYING' | 'SELLING'>('ALL')
  const [period, setPeriod] = useState(7)

  // ─── Fetch Data ──────────────────────────────────────────────────────────────
  const fetchInsiders = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: rpcError } = await supabase.rpc('get_insider_alert', {
        p_stock_code: null,
        p_months: period <= 14 ? 1 : period <= 30 ? 3 : 6, // mapping period ke months
        p_min_pct_chg: 0.3,
      })
      if (rpcError) throw rpcError
      setInsiders(data || [])
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Failed to fetch insider data')
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    fetchInsiders()
  }, [fetchInsiders])

  // ─── Filter & Aggregate ──────────────────────────────────────────────────────
  const filteredInsiders = useMemo(() => insiders.filter(item => {
    if (alertFilter !== 'ALL' && item.alert_level !== alertFilter) return false
    if (actionFilter !== 'ALL' && item.action !== actionFilter) return false
    return true
  }), [insiders, alertFilter, actionFilter])

  // Top 5 Stocks with Insider Buying
  const topBuyStocks = useMemo(() => {
    const buying = filteredInsiders.filter(i => i.action === 'BUYING')
    const grouped: Record<string, { count: number; totalChange: number; totalShares: number }> = {}
    buying.forEach(i => {
      if (!grouped[i.share_code]) grouped[i.share_code] = { count: 0, totalChange: 0, totalShares: 0 }
      grouped[i.share_code].count++
      grouped[i.share_code].totalChange += i.pct_point_change
      grouped[i.share_code].totalShares += Math.abs(i.share_change)
    })
    return Object.entries(grouped)
      .sort((a, b) => b[1].totalChange - a[1].totalChange)
      .slice(0, 5)
      .map(([code, data]) => ({ code, ...data }))
  }, [filteredInsiders])

  // Top 5 Stocks with Insider Selling
  const topSellStocks = useMemo(() => {
    const selling = filteredInsiders.filter(i => i.action === 'SELLING')
    const grouped: Record<string, { count: number; totalChange: number; totalShares: number }> = {}
    selling.forEach(i => {
      if (!grouped[i.share_code]) grouped[i.share_code] = { count: 0, totalChange: 0, totalShares: 0 }
      grouped[i.share_code].count++
      grouped[i.share_code].totalChange += Math.abs(i.pct_point_change)
      grouped[i.share_code].totalShares += Math.abs(i.share_change)
    })
    return Object.entries(grouped)
      .sort((a, b) => b[1].totalChange - a[1].totalChange)
      .slice(0, 5)
      .map(([code, data]) => ({ code, ...data }))
  }, [filteredInsiders])

  // Stats
  const stats = useMemo(() => ({
    total: filteredInsiders.length,
    high: filteredInsiders.filter(i => i.alert_level === 'HIGH').length,
    buying: filteredInsiders.filter(i => i.action === 'BUYING').length,
    selling: filteredInsiders.filter(i => i.action === 'SELLING').length,
    uniqueStocks: new Set(filteredInsiders.map(i => i.share_code)).size,
  }), [filteredInsiders])

  return (
    <div className="space-y-5 animate-fade-in pb-10">

      {/* ════════════════════════════════════════════════════════════
          HEADER
      ════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-foreground tracking-tight">
            <Eye className="w-8 h-8 text-red-400 inline mr-2" />
            <span className="bg-gradient-to-r from-red-400 to-amber-400 bg-clip-text text-transparent">KSEI &gt;5%</span>
            <span className="text-foreground"> Insider Alerts</span>
            <span className="badge-hot ml-3">DAILY</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Daily ownership changes from KSEI &gt;5% reports · Confirm accumulation & detect distribution
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchInsiders} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] text-sm font-medium transition-all">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          INFO BOX
      ════════════════════════════════════════════════════════════ */}
      <div className="glass rounded-xl p-3 border border-blue-500/20 bg-blue-500/[0.03] flex items-start gap-2">
        <Shield className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
        <p className="text-[11px] text-blue-300/80 leading-relaxed">
          Data dari laporan KSEI &gt;5% (daily). Transaksi mungkin sedikit tapi setiap pergerakan signifikan.
          Gunakan sebagai <strong>konfirmasi</strong> sinyal dari Screener & Smart Money Radar.
        </p>
      </div>

      {/* ════════════════════════════════════════════════════════════
          PERIOD TOGGLE + FILTERS
      ════════════════════════════════════════════════════════════ */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-white/[0.03] rounded-lg p-0.5 border border-white/[0.06]">
          <Clock className="w-3.5 h-3.5 text-muted-foreground ml-2" />
          {PERIOD_OPTIONS.map(opt => (
            <button key={opt.days} onClick={() => setPeriod(opt.days)}
              className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition-all ${
                period === opt.days ? 'bg-red-400/20 text-red-400' : 'text-muted-foreground hover:text-white'
              }`}>{opt.label}</button>
          ))}
        </div>

        <div className="w-px h-6 bg-white/[0.08]" />

        <div className="flex gap-2">
          {['ALL', 'HIGH', 'MEDIUM', 'LOW'].map(level => (
            <button key={level} onClick={() => setAlertFilter(level as any)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                alertFilter === level
                  ? level === 'HIGH' ? 'alert-high' 
                  : level === 'MEDIUM' ? 'alert-medium' 
                  : level === 'LOW' ? 'alert-low'
                  : 'bg-red-400/20 text-red-400 border border-red-400/30'
                  : 'bg-white/[0.03] text-muted-foreground border border-white/[0.06] hover:border-white/[0.12]'
              }`}>
              {level === 'ALL' ? 'All Levels' : level}
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-white/[0.08]" />

        <div className="flex gap-2">
          {['ALL', 'BUYING', 'SELLING'].map(action => (
            <button key={action} onClick={() => setActionFilter(action as any)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                actionFilter === action
                  ? action === 'BUYING' ? 'signal-strong-buy'
                  : action === 'SELLING' ? 'signal-avoid'
                  : 'bg-red-400/20 text-red-400 border border-red-400/30'
                  : 'bg-white/[0.03] text-muted-foreground border border-white/[0.06] hover:border-white/[0.12]'
              }`}>
              {action === 'ALL' ? 'All Actions' : action}
            </button>
          ))}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          STATS CARDS (5)
      ════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total Alerts', value: stats.total, color: 'text-foreground', icon: Eye },
          { label: 'HIGH Level', value: stats.high, color: 'text-red-400', icon: AlertTriangle },
          { label: 'Buying', value: stats.buying, color: 'text-emerald-400', icon: TrendingUp },
          { label: 'Selling', value: stats.selling, color: 'text-red-400', icon: TrendingDown },
          { label: 'Stocks', value: stats.uniqueStocks, color: 'text-purple-400', icon: Building2 },
        ].map((item, i) => {
          const Icon = item.icon
          return (
            <div key={i} className="glass rounded-xl p-3 border border-border/30 card-hover">
              <div className="flex items-center justify-between mb-1">
                <Icon className={`w-3.5 h-3.5 ${item.color}`} />
              </div>
              <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold">{item.label}</p>
              <p className={`text-xl font-black mt-0.5 ${item.color}`}>{item.value}</p>
            </div>
          )
        })}
      </div>

      {/* ════════════════════════════════════════════════════════════
          TOP STOCKS HEATMAP (Buy vs Sell)
      ════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Insider Buying */}
        <div className="glass rounded-2xl p-4 border border-emerald-500/20">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-black text-emerald-400 uppercase tracking-widest">Top Insider Buying</h3>
          </div>
          {topBuyStocks.length > 0 ? (
            <div className="space-y-2">
              {topBuyStocks.map((s, i) => (
                <Link key={s.code} href={`/stock/${s.code}`}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-emerald-500/[0.05] border border-transparent hover:border-emerald-500/10 transition-all group">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground w-4">{i+1}</span>
                    <span className="font-mono font-black text-sm text-foreground group-hover:text-emerald-400 transition-colors">{s.code}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px]">
                    <span className="text-emerald-400 font-bold">+{s.totalChange.toFixed(2)}%</span>
                    <span className="text-muted-foreground">{formatShares(s.totalShares)}</span>
                    <span className="text-muted-foreground/50">{s.count}×</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-center py-6 text-xs text-muted-foreground">No insider buying detected</p>
          )}
        </div>

        {/* Top Insider Selling */}
        <div className="glass rounded-2xl p-4 border border-red-500/20">
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown className="w-4 h-4 text-red-400" />
            <h3 className="text-xs font-black text-red-400 uppercase tracking-widest">Top Insider Selling</h3>
          </div>
          {topSellStocks.length > 0 ? (
            <div className="space-y-2">
              {topSellStocks.map((s, i) => (
                <Link key={s.code} href={`/stock/${s.code}`}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-red-500/[0.05] border border-transparent hover:border-red-500/10 transition-all group">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground w-4">{i+1}</span>
                    <span className="font-mono font-black text-sm text-foreground group-hover:text-red-400 transition-colors">{s.code}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px]">
                    <span className="text-red-400 font-bold">-{s.totalChange.toFixed(2)}%</span>
                    <span className="text-muted-foreground">{formatShares(s.totalShares)}</span>
                    <span className="text-muted-foreground/50">{s.count}×</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-center py-6 text-xs text-muted-foreground">No insider selling detected</p>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          ERROR
      ════════════════════════════════════════════════════════════ */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          TABLE
      ════════════════════════════════════════════════════════════ */}
      <div className="glass rounded-2xl overflow-hidden border border-border/30">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-white/[0.02] border-b border-white/[0.05]">
                <th className="text-left text-[10px] text-muted-foreground font-bold uppercase tracking-widest p-3 pl-4">Date</th>
                <th className="text-left text-[10px] text-muted-foreground font-bold uppercase tracking-widest p-3">Stock</th>
                <th className="text-left text-[10px] text-muted-foreground font-bold uppercase tracking-widest p-3 hidden lg:table-cell">Investor</th>
                <th className="text-center text-[10px] text-muted-foreground font-bold uppercase tracking-widest p-3 hidden sm:table-cell">Type</th>
                <th className="text-right text-[10px] text-muted-foreground font-bold uppercase tracking-widest p-3">% Change</th>
                <th className="text-right text-[10px] text-muted-foreground font-bold uppercase tracking-widest p-3 hidden md:table-cell">Shares</th>
                <th className="text-center text-[10px] text-muted-foreground font-bold uppercase tracking-widest p-3">Action</th>
                <th className="text-center text-[10px] text-muted-foreground font-bold uppercase tracking-widest p-3 pr-4">Level</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/[0.02]">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="p-3"><div className="shimmer h-5 rounded-lg mx-auto" style={{ width: j < 2 ? '60px' : '40px' }} /></td>
                    ))}
                  </tr>
                ))
              ) : filteredInsiders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-16 text-center">
                    <Eye className="w-16 h-16 mx-auto mb-4 opacity-20" />
                    <p className="text-muted-foreground font-medium">No insider alerts found</p>
                    <p className="text-xs text-muted-foreground mt-1">Try adjusting filters or expanding time range</p>
                  </td>
                </tr>
              ) : (
                filteredInsiders.map((item, i) => (
                  <tr key={`${item.share_code}-${item.investor_name}-${i}`} 
                    className="tr-hover border-b border-white/[0.02]"
                    style={{ animationDelay: `${i * 0.02}s` }}>
                    
                    <td className="p-3 pl-4">
                      <span className="text-xs text-muted-foreground">{item.report_date}</span>
                    </td>

                    <td className="p-3">
                      <Link href={`/stock/${item.share_code}`} 
                        className="font-mono font-black text-sm text-foreground hover:text-gold-400 transition-colors">
                        {item.share_code}
                      </Link>
                    </td>

                    <td className="p-3 hidden lg:table-cell">
                      <div>
                        <p className="text-sm font-medium text-foreground">{item.investor_name}</p>
                        <p className="text-[10px] text-muted-foreground">{item.nationality || '-'}</p>
                      </div>
                    </td>

                    <td className="p-3 text-center hidden sm:table-cell">
                      <span className="text-[10px] px-2 py-0.5 rounded bg-white/[0.03] text-muted-foreground">
                        {item.investor_type}
                      </span>
                    </td>

                    <td className="p-3 text-right">
                      <div>
                        <span className={`text-sm font-bold ${item.pct_point_change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {item.pct_point_change >= 0 ? '+' : ''}{item.pct_point_change.toFixed(2)}%
                        </span>
                        <p className="text-[9px] text-muted-foreground">
                          {Number(item.prev_percentage).toFixed(1)}% → {Number(item.curr_percentage).toFixed(1)}%
                        </p>
                      </div>
                    </td>

                    <td className="p-3 text-right hidden md:table-cell">
                      <span className={`text-sm font-semibold ${item.share_change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {item.share_change >= 0 ? '+' : ''}{formatShares(item.share_change)}
                      </span>
                    </td>

                    <td className="p-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        item.action === 'BUYING' 
                          ? 'signal-strong-buy' 
                          : item.action === 'SELLING' 
                            ? 'signal-avoid' 
                            : 'signal-neutral'
                      }`}>
                        {item.action === 'BUYING' ? <ArrowUp className="w-3 h-3" /> : 
                         item.action === 'SELLING' ? <ArrowDown className="w-3 h-3" /> : null}
                        {item.action}
                      </span>
                    </td>

                    <td className="p-3 text-center pr-4">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        item.alert_level === 'HIGH' ? 'alert-high' : 
                        item.alert_level === 'MEDIUM' ? 'alert-medium' : 'alert-low'
                      }`}>
                        {item.alert_level}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && filteredInsiders.length > 0 && (
          <div className="p-3 border-t border-white/[0.05] bg-white/[0.01] flex items-center justify-between text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
            <span>{filteredInsiders.length} alerts</span>
            <span>{period}D window</span>
          </div>
        )}
      </div>
    </div>
  )
}
