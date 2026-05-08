'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatNumber, formatPercent, formatShares } from '@/lib/utils'
import type { InsiderAlert } from '@/lib/supabase'
import { 
  Eye, Search, AlertTriangle, ArrowUp, ArrowDown, Filter,
  User, Building2, Globe, TrendingUp, TrendingDown, Clock,
  Shield, X, RefreshCw, ArrowRight
} from 'lucide-react'
import Link from 'next/link'

export default function InsiderAlertsPage() {
  const [insiders, setInsiders] = useState<InsiderAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [alertFilter, setAlertFilter] = useState<'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL')
  const [actionFilter, setActionFilter] = useState<'ALL' | 'BUYING' | 'SELLING'>('ALL')
  const [searchTerm, setSearchTerm] = useState('')
  const [months, setMonths] = useState(3)

  const fetchInsiders = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: rpcError } = await supabase.rpc('get_insider_alert', {
        p_stock_code: null,
        p_months: months,
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
  }, [months])

  useEffect(() => {
    fetchInsiders()
  }, [fetchInsiders])

  // Filter data
  const filteredInsiders = insiders.filter(item => {
    if (alertFilter !== 'ALL' && item.alert_level !== alertFilter) return false
    if (actionFilter !== 'ALL' && item.action !== actionFilter) return false
    if (searchTerm && !item.share_code.toLowerCase().includes(searchTerm.toLowerCase()) && 
        !item.investor_name.toLowerCase().includes(searchTerm.toLowerCase())) return false
    return true
  })

  // Stats
  const stats = {
    total: insiders.length,
    high: insiders.filter(i => i.alert_level === 'HIGH').length,
    medium: insiders.filter(i => i.alert_level === 'MEDIUM').length,
    low: insiders.filter(i => i.alert_level === 'LOW').length,
    buying: insiders.filter(i => i.action === 'BUYING').length,
    selling: insiders.filter(i => i.action === 'SELLING').length,
    uniqueStocks: new Set(insiders.map(i => i.share_code)).size,
    uniqueInvestors: new Set(insiders.map(i => i.investor_name)).size,
  }

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-foreground tracking-tight">
            <Eye className="w-8 h-8 text-red-400 inline mr-2" />
            <span className="bg-gradient-to-r from-red-400 to-amber-400 bg-clip-text text-transparent">Insider Alerts</span>
            <span className="badge-hot ml-3">LIVE</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Track director & major shareholder trades — Follow the smart money
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select value={months} onChange={(e) => setMonths(Number(e.target.value))}
            className="bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-sm">
            <option value={1}>1 Month</option>
            <option value={3}>3 Months</option>
            <option value={6}>6 Months</option>
          </select>
          <button onClick={fetchInsiders} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] text-sm font-medium transition-all">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 stagger">
        {[
          { label: 'TOTAL', value: stats.total, color: 'text-foreground', icon: Eye },
          { label: 'HIGH', value: stats.high, color: 'text-red-400', icon: AlertTriangle },
          { label: 'MEDIUM', value: stats.medium, color: 'text-amber-400', icon: Shield },
          { label: 'LOW', value: stats.low, color: 'text-blue-400', icon: Filter },
          { label: 'BUYING', value: stats.buying, color: 'text-emerald-400', icon: TrendingUp },
          { label: 'SELLING', value: stats.selling, color: 'text-red-400', icon: TrendingDown },
          { label: 'STOCKS', value: stats.uniqueStocks, color: 'text-purple-400', icon: Building2 },
          { label: 'INVESTORS', value: stats.uniqueInvestors, color: 'text-cyan-400', icon: User },
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

      {/* Filters */}
      <div className="glass rounded-xl p-4 border border-border/30">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search stock or investor name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-xl text-sm placeholder:text-muted-foreground focus:outline-none focus:border-red-400/30 focus:ring-1 focus:ring-red-400/20 transition-all"
            />
          </div>
          <div className="flex gap-2">
            {['ALL', 'HIGH', 'MEDIUM', 'LOW'].map(level => (
              <button key={level} onClick={() => setAlertFilter(level as any)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                  alertFilter === level
                    ? level === 'HIGH' ? 'alert-high' 
                    : level === 'MEDIUM' ? 'alert-medium' 
                    : level === 'LOW' ? 'alert-low'
                    : 'bg-gold-400/20 text-gold-400 border border-gold-400/30'
                    : 'bg-white/[0.03] text-muted-foreground border border-white/[0.06]'
                }`}>
                {level}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {['ALL', 'BUYING', 'SELLING'].map(action => (
              <button key={action} onClick={() => setActionFilter(action as any)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                  actionFilter === action
                    ? action === 'BUYING' ? 'signal-strong-buy'
                    : action === 'SELLING' ? 'signal-avoid'
                    : 'bg-gold-400/20 text-gold-400 border border-gold-400/30'
                    : 'bg-white/[0.03] text-muted-foreground border border-white/[0.06]'
                }`}>
                {action === 'ALL' ? 'All Actions' : action}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Table */}
      <div className="glass rounded-2xl overflow-hidden border border-border/30">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-white/[0.02] border-b border-white/[0.05]">
                <th className="text-left text-[10px] text-muted-foreground font-bold uppercase tracking-widest p-4 pl-6">Date</th>
                <th className="text-left text-[10px] text-muted-foreground font-bold uppercase tracking-widest p-4">Stock</th>
                <th className="text-left text-[10px] text-muted-foreground font-bold uppercase tracking-widest p-4 hidden lg:table-cell">Investor</th>
                <th className="text-right text-[10px] text-muted-foreground font-bold uppercase tracking-widest p-4">% Change</th>
                <th className="text-right text-[10px] text-muted-foreground font-bold uppercase tracking-widest p-4 hidden md:table-cell">Shares</th>
                <th className="text-center text-[10px] text-muted-foreground font-bold uppercase tracking-widest p-4">Action</th>
                <th className="text-center text-[10px] text-muted-foreground font-bold uppercase tracking-widest p-4">Level</th>
                <th className="text-left text-[10px] text-muted-foreground font-bold uppercase tracking-widest p-4 pr-6 hidden xl:table-cell">Detail</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/[0.02]">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="p-4"><div className="shimmer h-5 rounded-lg mx-auto" style={{ width: j < 3 ? '70px' : '50px' }} /></td>
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
                    
                    {/* Date */}
                    <td className="p-4 pl-6">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{item.report_date}</span>
                      </div>
                    </td>

                    {/* Stock */}
                    <td className="p-4">
                      <Link href={`/stock/${item.share_code}`} 
                        className="font-bold text-foreground hover:text-gold-400 transition-colors">
                        {item.share_code}
                      </Link>
                    </td>

                    {/* Investor */}
                    <td className="p-4 hidden lg:table-cell">
                      <div>
                        <p className="text-sm font-medium text-foreground">{item.investor_name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-muted-foreground">{item.nationality || '-'}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.03] text-muted-foreground">
                            {item.investor_type}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* % Change */}
                    <td className="p-4 text-right">
                      <div>
                        <span className={`text-sm font-bold ${item.pct_point_change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {item.pct_point_change >= 0 ? '+' : ''}{item.pct_point_change.toFixed(2)}%
                        </span>
                        <p className="text-[10px] text-muted-foreground">
                          {item.prev_percentage.toFixed(1)}% → {item.curr_percentage.toFixed(1)}%
                        </p>
                      </div>
                    </td>

                    {/* Shares */}
                    <td className="p-4 text-right hidden md:table-cell">
                      <span className={`text-sm font-semibold ${item.share_change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {item.share_change >= 0 ? '+' : ''}{formatShares(item.share_change)}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="p-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
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

                    {/* Level */}
                    <td className="p-4 text-center">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        item.alert_level === 'HIGH' ? 'alert-high' : 
                        item.alert_level === 'MEDIUM' ? 'alert-medium' : 'alert-low'
                      }`}>
                        {item.alert_level}
                      </span>
                    </td>

                    {/* Detail Link */}
                    <td className="p-4 pr-6 hidden xl:table-cell">
                      <Link href={`/stock/${item.share_code}`}
                        className="flex items-center gap-1 text-xs text-gold-400 hover:text-gold-300 transition-colors">
                        Analyze <ArrowRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {!loading && filteredInsiders.length > 0 && (
          <div className="p-4 border-t border-white/[0.05] bg-white/[0.01] flex items-center justify-between text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
            <span>{filteredInsiders.length} alerts</span>
            <span>Sorted by significance ↓</span>
          </div>
        )}
      </div>

      {/* Mobile Cards (visible only on small screens) */}
      <div className="lg:hidden space-y-3">
        {!loading && filteredInsiders.slice(0, 20).map((item, i) => (
          <Link key={i} href={`/stock/${item.share_code}`}
            className="glass rounded-xl p-4 border border-border/30 card-hover block">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-bold text-foreground">{item.share_code}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  item.alert_level === 'HIGH' ? 'alert-high' : 
                  item.alert_level === 'MEDIUM' ? 'alert-medium' : 'alert-low'
                }`}>{item.alert_level}</span>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                item.action === 'BUYING' ? 'signal-strong-buy' : 'signal-avoid'
              }`}>{item.action}</span>
            </div>
            <p className="text-sm text-foreground font-medium">{item.investor_name}</p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-muted-foreground">{item.report_date}</span>
              <span className={`text-sm font-bold ${item.pct_point_change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {item.pct_point_change >= 0 ? '+' : ''}{item.pct_point_change.toFixed(2)}%
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
