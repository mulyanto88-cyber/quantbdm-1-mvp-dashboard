'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { 
  Radar, Search, RefreshCw, TrendingUp, TrendingDown, Zap, Eye, Shield, 
  AlertTriangle, X, Filter, Building2, Globe, Target, ArrowUpDown,
  DollarSign, BarChart3, Clock, ArrowRight, ChevronRight
} from 'lucide-react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { formatRupiah, formatPercent, formatNumber, getSignalTextColor } from '@/lib/utils'
import type { SmartMoneyStock, InsiderAlert } from '@/lib/supabase'

type TabType = 'radar' | 'insider' | 'broker' | 'spike'

const SECTORS = [
  'All Sectors', 'Energy', 'Financials', 'Basic Materials', 'Consumer Cyclicals',
  'Consumer Non-Cyclicals', 'Healthcare', 'Industrials', 'Infrastructures',
  'Properties & Real Estate', 'Technology', 'Transportation & Logistics',
]

export default function ScreenerProV2() {
  // Tab State
  const [activeTab, setActiveTab] = useState<TabType>('radar')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Radar States
  const [stocks, setStocks] = useState<SmartMoneyStock[]>([])
  const [sector, setSector] = useState('All Sectors')
  const [minScore, setMinScore] = useState(40)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<'score' | 'change' | 'foreign' | 'stealth'>('score')

  // Insider States
  const [insiders, setInsiders] = useState<InsiderAlert[]>([])
  const [insiderLevel, setInsiderLevel] = useState<'ALL' | 'HIGH' | 'MEDIUM'>('ALL')

  // Broker States
  const [brokerStocks, setBrokerStocks] = useState<any[]>([])
  const [selectedStock, setSelectedStock] = useState('ITMA')

  // Spike States
  const [spikeStocks, setSpikeStocks] = useState<any[]>([])
  const [spikeStock, setSpikeStock] = useState('AADI')

  // ==================== INITIAL LOAD ====================
  useEffect(() => {
    fetchRadarData()
    fetchInsiderData()
    fetchTopBrokers()
    fetchSpikeData()
  }, [])

  // ==================== RADAR: Smart Money Universe ====================
  const fetchRadarData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const sectorParam = sector === 'All Sectors' ? null : sector
      const { data, error: rpcError } = await supabase.rpc('scan_smart_money_universe', {
        p_min_score: minScore,
        p_min_flow: 100000000,
        p_sector: sectorParam,
        p_exclude_stealth: false,
      })
      if (rpcError) throw rpcError
      setStocks(data || [])
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Failed to fetch')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [sector, minScore])

  useEffect(() => { fetchRadarData() }, [fetchRadarData])

  // ==================== INSIDER: Insider Alerts ====================
  const fetchInsiderData = async () => {
    try {
      const { data, error: rpcError } = await supabase.rpc('get_insider_alert', {
        p_stock_code: null,
        p_months: 3,
        p_min_pct_chg: 0.5,
      })
      if (rpcError) throw rpcError
      setInsiders(data || [])
    } catch (err) { console.error(err) }
  }

  // ==================== BROKER: Top Movers ====================
  const fetchTopBrokers = async () => {
    try {
      const { data, error: rpcError } = await supabase.rpc('get_broker_top_mover', {
        p_start_date: '2026-04-01',
        p_end_date: '2026-05-06',
        p_limit: 30,
      })
      if (rpcError) throw rpcError
      setBrokerStocks(data || [])
    } catch (err) { console.error(err) }
  }

  // ==================== SPIKE: Volume Spike Detection ====================
  const fetchSpikeData = async () => {
    try {
      const { data, error: rpcError } = await supabase.rpc('get_volume_spike', {
        p_stock_code: spikeStock,
        p_window: 30,
        p_threshold: null, // auto-threshold
      })
      if (rpcError) throw rpcError
      setSpikeStocks((data || []).filter((d: any) => d.spike_type !== 'NORMAL'))
    } catch (err) { console.error(err) }
  }

  useEffect(() => { fetchSpikeData() }, [spikeStock])

  // ==================== DERIVED DATA ====================
  const filteredStocks = stocks
    .filter(s => s.stock_code.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'score') return b.smart_money_score - a.smart_money_score
      if (sortBy === 'change') return b.price_chg_pct - a.price_chg_pct
      if (sortBy === 'foreign') return b.net_foreign_30d - a.net_foreign_30d
      return (b.is_stealth ? 1 : 0) - (a.is_stealth ? 1 : 0)
    })

  const filteredInsiders = insiders.filter(i => 
    insiderLevel === 'ALL' ? true : i.alert_level === insiderLevel
  ).slice(0, 30)

  const radarStats = {
    total: stocks.length,
    strongBuy: stocks.filter(s => s.signal === 'STRONG_BUY').length,
    watch: stocks.filter(s => s.signal === 'WATCH').length,
    stealth: stocks.filter(s => s.is_stealth).length,
    avgScore: stocks.length > 0 ? Math.round(stocks.reduce((sum, s) => sum + s.smart_money_score, 0) / stocks.length) : 0,
  }

  // ==================== TABS ====================
  const tabs = [
    { id: 'radar' as TabType, label: 'Smart Money Radar', icon: Radar, desc: 'Multi-factor scan', count: radarStats.total },
    { id: 'insider' as TabType, label: 'Insider Alerts', icon: Eye, desc: 'Director trades', count: insiders.length },
    { id: 'broker' as TabType, label: 'Broker Intel', icon: Building2, desc: 'Top broker moves', count: brokerStocks.length },
    { id: 'spike' as TabType, label: 'Volume Spike', icon: Zap, desc: 'Anomaly detection', count: spikeStocks.length },
  ]

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-foreground tracking-tight">
            <Radar className="w-8 h-8 text-gold-400 inline mr-2" />
            <span className="gradient-gold">Screener Pro</span>
            <span className="badge-new ml-3">V2</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">18 RPC Engine — Multi-source Smart Money Intelligence</p>
        </div>
        <div className="flex items-center gap-3 px-4 py-2 glass rounded-full border border-green-500/30">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse shadow-lg shadow-green-400/50" />
          <span className="text-xs font-bold text-green-400 uppercase tracking-wider">Live Data</span>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="glass rounded-2xl p-1.5 flex gap-1 overflow-x-auto border border-border/30">
        {tabs.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 whitespace-nowrap ${
                isActive 
                  ? 'bg-gradient-to-r from-gold-400 to-yellow-500 text-navy-900 shadow-lg shadow-gold-400/20' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              }`}>
              <Icon className={`w-4 h-4 ${isActive ? 'text-navy-900' : ''}`} />
              {tab.label}
              {tab.count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${
                  isActive ? 'bg-navy-900/20 text-navy-900' : 'bg-gold-400/20 text-gold-400'
                }`}>{tab.count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ================================================================ */}
      {/* TAB 1: SMART MONEY RADAR */}
      {/* ================================================================ */}
      {activeTab === 'radar' && (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 stagger">
            {[
              { label: 'STRONG BUY', value: radarStats.strongBuy, color: 'text-emerald-400', icon: TrendingUp },
              { label: 'WATCH', value: radarStats.watch, color: 'text-amber-400', icon: Eye },
              { label: 'STEALTH', value: radarStats.stealth, color: 'text-purple-400', icon: Shield },
              { label: 'AVG SCORE', value: radarStats.avgScore, color: 'text-blue-400', icon: Target },
              { label: 'TOTAL', value: radarStats.total, color: 'text-foreground', icon: BarChart3 },
            ].map((item, i) => {
              const Icon = item.icon
              return (
                <div key={i} className="glass rounded-xl p-4 border border-border/30 card-hover">
                  <div className="flex items-center justify-between mb-2">
                    <Icon className={`w-4 h-4 ${item.color}`} />
                  </div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">{item.label}</p>
                  <p className={`text-2xl font-black mt-1 ${item.color} counter`}>{item.value}</p>
                </div>
              )
            })}
          </div>

          {/* Filters */}
          <div className="glass rounded-xl p-4 border border-border/30">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="text" placeholder="Search stock..." value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-xl text-sm placeholder:text-muted-foreground focus:outline-none focus:border-gold-400/30 focus:ring-1 focus:ring-gold-400/20 transition-all" />
              </div>
              <select value={sector} onChange={e => setSector(e.target.value)}
                className="px-4 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-xl text-sm">
                {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={minScore} onChange={e => setMinScore(Number(e.target.value))}
                className="px-4 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-xl text-sm">
                {[30,40,50,60,70,80].map(s => <option key={s} value={s}>Score {s}+</option>)}
              </select>
              <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
                className="px-4 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-xl text-sm">
                <option value="score">Sort: Score</option>
                <option value="change">Sort: Change %</option>
                <option value="foreign">Sort: Foreign</option>
                <option value="stealth">Sort: Stealth</option>
              </select>
              <button onClick={() => fetchRadarData()} disabled={loading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gold-400/10 border border-gold-400/30 text-gold-400 hover:bg-gold-400/20 text-sm font-bold transition-all">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Scan
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="glass rounded-2xl overflow-hidden border border-border/30">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-white/[0.02] border-b border-white/[0.05]">
                    <th className="text-left text-[10px] text-muted-foreground font-bold uppercase tracking-widest p-4 pl-6">Stock</th>
                    <th className="text-right text-[10px] text-muted-foreground font-bold uppercase tracking-widest p-4">Price</th>
                    <th className="text-right text-[10px] text-muted-foreground font-bold uppercase tracking-widest p-4 hidden sm:table-cell">Chg%</th>
                    <th className="text-center text-[10px] text-muted-foreground font-bold uppercase tracking-widest p-4">Score</th>
                    <th className="text-center text-[10px] text-muted-foreground font-bold uppercase tracking-widest p-4">Signal</th>
                    <th className="text-right text-[10px] text-muted-foreground font-bold uppercase tracking-widest p-4 hidden md:table-cell">Foreign</th>
                    <th className="text-center text-[10px] text-muted-foreground font-bold uppercase tracking-widest p-4">Conviction</th>
                    <th className="text-center text-[10px] text-muted-foreground font-bold uppercase tracking-widest p-4 pr-6">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-white/[0.02]">
                        {Array.from({ length: 8 }).map((_, j) => (
                          <td key={j} className="p-4"><div className="shimmer h-5 rounded-lg mx-auto" style={{ width: j === 0 ? '60px' : '40px' }} /></td>
                        ))}
                      </tr>
                    ))
                  ) : filteredStocks.length === 0 ? (
                    <tr><td colSpan={8} className="p-16 text-center text-muted-foreground">No stocks found. Try lowering score threshold.</td></tr>
                  ) : (
                    filteredStocks.map((stock, i) => (
                      <tr key={stock.stock_code} className="tr-hover border-b border-white/[0.02]"
                        style={{ animationDelay: `${i * 0.02}s` }}>
                        <td className="p-4 pl-6">
                          <Link href={`/stock/${stock.stock_code}`} className="font-bold text-foreground hover:text-gold-400 transition-colors">
                            {stock.stock_code}
                          </Link>
                          <p className="text-[10px] text-muted-foreground">{stock.sector}</p>
                        </td>
                        <td className="p-4 text-right font-semibold counter">{formatNumber(stock.current_price)}</td>
                        <td className="p-4 text-right hidden sm:table-cell">
                          <span className={`text-sm font-bold ${stock.price_chg_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {formatPercent(stock.price_chg_pct)}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <span className={`text-lg font-black ${getSignalTextColor(stock.signal)}`}>
                            {Math.round(stock.smart_money_score)}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            stock.signal === 'STRONG_BUY' ? 'signal-strong-buy' :
                            stock.signal === 'WATCH' ? 'signal-watch' : 'signal-neutral'
                          }`}>
                            {stock.signal === 'STRONG_BUY' ? '🚀 BUY' : stock.signal === 'WATCH' ? '👀 WATCH' : '➖ NEUTRAL'}
                          </span>
                        </td>
                        <td className="p-4 text-right hidden md:table-cell">
                          <span className={`text-sm font-semibold ${stock.net_foreign_30d >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {stock.net_foreign_30d >= 0 ? '+' : ''}{formatRupiah(stock.net_foreign_30d)}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <span className={`text-sm font-bold ${stock.conviction_score >= 70 ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {stock.conviction_score?.toFixed(0)}
                          </span>
                        </td>
                        <td className="p-4 pr-6">
                          <div className="flex items-center justify-center gap-1.5">
                            {stock.is_stealth && <span className="stealth-dot" title="Stealth" />}
                            {stock.whale_signal && <span className="whale-badge">🐋</span>}
                            {stock.big_player_anomaly && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-3 border-t border-white/[0.05] bg-white/[0.01] flex justify-between text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
              <span>{filteredStocks.length} stocks</span>
              <span>Smart Money Score ↓</span>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* TAB 2: INSIDER ALERTS */}
      {/* ================================================================ */}
      {activeTab === 'insider' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {['ALL', 'HIGH', 'MEDIUM'].map(level => (
              <button key={level} onClick={() => setInsiderLevel(level as any)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  insiderLevel === level 
                    ? level === 'HIGH' ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                    : level === 'MEDIUM' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-gold-400/20 text-gold-400 border border-gold-400/30'
                    : 'bg-white/[0.03] text-muted-foreground border border-white/[0.06]'
                }`}>
                {level === 'ALL' ? '🔄 All' : level === 'HIGH' ? '🔴 HIGH' : '🟡 MEDIUM'}
              </button>
            ))}
          </div>
          <div className="glass rounded-2xl overflow-hidden border border-border/30">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-white/[0.02] border-b border-white/[0.05]">
                    <th className="text-left text-[10px] text-muted-foreground font-bold uppercase p-4">Date</th>
                    <th className="text-left text-[10px] text-muted-foreground font-bold uppercase p-4">Stock</th>
                    <th className="text-left text-[10px] text-muted-foreground font-bold uppercase p-4 hidden md:table-cell">Investor</th>
                    <th className="text-right text-[10px] text-muted-foreground font-bold uppercase p-4">Change</th>
                    <th className="text-center text-[10px] text-muted-foreground font-bold uppercase p-4">Action</th>
                    <th className="text-center text-[10px] text-muted-foreground font-bold uppercase p-4">Level</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInsiders.map((item, i) => (
                    <tr key={i} className="tr-hover border-b border-white/[0.02]">
                      <td className="p-4 text-xs text-muted-foreground">{item.report_date}</td>
                      <td className="p-4">
                        <Link href={`/stock/${item.share_code}`} className="font-bold text-foreground hover:text-gold-400">
                          {item.share_code}
                        </Link>
                      </td>
                      <td className="p-4 text-sm hidden md:table-cell">
                        <p className="font-medium text-foreground">{item.investor_name}</p>
                        <p className="text-[10px] text-muted-foreground">{item.nationality} • {item.investor_type}</p>
                      </td>
                      <td className="p-4 text-right">
                        <span className={`text-sm font-bold ${item.share_change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {item.pct_point_change >= 0 ? '+' : ''}{item.pct_point_change.toFixed(2)}%
                        </span>
                        <p className="text-[10px] text-muted-foreground">{formatNumber(Math.abs(item.share_change))} shares</p>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                          item.action === 'BUYING' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                          {item.action}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                          item.alert_level === 'HIGH' ? 'alert-high' : item.alert_level === 'MEDIUM' ? 'alert-medium' : 'alert-low'
                        }`}>
                          {item.alert_level}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* TAB 3: BROKER INTEL */}
      {/* ================================================================ */}
      {activeTab === 'broker' && (
        <div className="glass rounded-2xl overflow-hidden border border-border/30">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-white/[0.02] border-b border-white/[0.05]">
                  <th className="text-left text-[10px] text-muted-foreground font-bold uppercase p-4">Broker</th>
                  <th className="text-center text-[10px] text-muted-foreground font-bold uppercase p-4">Saham</th>
                  <th className="text-right text-[10px] text-muted-foreground font-bold uppercase p-4">Net Shares</th>
                  <th className="text-right text-[10px] text-muted-foreground font-bold uppercase p-4">Net Value</th>
                  <th className="text-center text-[10px] text-muted-foreground font-bold uppercase p-4">Action</th>
                  <th className="text-left text-[10px] text-muted-foreground font-bold uppercase p-4">Detail</th>
                </tr>
              </thead>
              <tbody>
                {brokerStocks.slice(0, 20).map((b, i) => (
                  <tr key={i} className="tr-hover border-b border-white/[0.02]">
                    <td className="p-4">
                      <p className="font-bold text-foreground text-sm">{b.kode_broker}</p>
                      <p className="text-[10px] text-muted-foreground truncate max-w-[180px]">{b.nama_broker}</p>
                    </td>
                    <td className="p-4 text-center font-bold">{b.saham_count}</td>
                    <td className={`p-4 text-right font-bold ${b.total_net_shares >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {b.total_net_shares >= 0 ? '+' : ''}{formatNumber(b.total_net_shares)}
                    </td>
                    <td className="p-4 text-right text-sm">{formatRupiah(b.total_net_value)}</td>
                    <td className="p-4 text-center">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                        b.dominant_action === 'NET_BUY' ? 'signal-strong-buy' : 'signal-avoid'
                      }`}>
                        {b.dominant_action}
                      </span>
                    </td>
                    <td className="p-4">
                      <Link href={`/stock/ITMA`} className="text-[10px] text-gold-400 hover:underline flex items-center gap-1">
                        View <ChevronRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* TAB 4: VOLUME SPIKE */}
      {/* ================================================================ */}
      {activeTab === 'spike' && (
        <div className="space-y-4">
          <div className="glass rounded-xl p-4 border border-border/30 flex items-center gap-4">
            <span className="text-xs text-muted-foreground font-bold">Stock:</span>
            <div className="flex gap-2">
              {['AADI', 'ITMA', 'ADRO', 'BUMI', 'BRMS'].map(code => (
                <button key={code} onClick={() => setSpikeStock(code)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    spikeStock === code ? 'bg-gold-400/20 text-gold-400 border border-gold-400/30' 
                    : 'bg-white/[0.03] text-muted-foreground border border-white/[0.06]'
                  }`}>{code}</button>
              ))}
            </div>
            <button onClick={fetchSpikeData}
              className="ml-auto px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-xs font-bold hover:bg-white/[0.06]">
              <RefreshCw className="w-3 h-3 inline mr-1" /> Refresh
            </button>
          </div>
          {spikeStocks.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Zap className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="font-bold">No volume spikes detected</p>
              <p className="text-xs mt-1">Auto-threshold active for {spikeStock}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger">
              {spikeStocks.map((s: any, i: number) => (
                <div key={i} className={`glass rounded-xl p-5 border ${
                  s.spike_type.includes('BULLISH') || s.spike_type.includes('UP') ? 'border-emerald-500/30' : 
                  s.spike_type.includes('BEARISH') || s.spike_type.includes('DOWN') ? 'border-red-500/30' : 'border-border/30'
                } card-hover`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-muted-foreground">{s.trading_date}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      s.spike_type.includes('BULLISH') ? 'signal-strong-buy' :
                      s.spike_type.includes('BEARISH') ? 'signal-avoid' :
                      'bg-purple-500/20 text-purple-400'
                    }`}>{s.spike_type}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Close</p>
                      <p className="text-lg font-black">{formatNumber(s.close)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Volume Ratio</p>
                      <p className="text-lg font-black text-purple-400">{s.volume_ratio}x</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Change</p>
                      <p className={`text-sm font-bold ${s.change_percent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatPercent(s.change_percent)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Foreign</p>
                      <p className={`text-sm font-bold ${s.net_foreign_value >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatRupiah(s.net_foreign_value)}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3 italic">💡 {s.interpretation}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
