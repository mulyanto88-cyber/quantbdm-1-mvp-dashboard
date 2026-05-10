'use client'

import React, { useState, useEffect } from 'react'
import { Activity, TrendingUp, TrendingDown, DollarSign, BarChart3, ShieldCheck, Zap, Building2, Globe, Target, Clock, ArrowRightLeft } from 'lucide-react'
import Link from 'next/link'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts'
import { supabase } from '@/lib/supabase'

const COLORS = ['#22c55e', '#8b5cf6', '#ef4444', '#e7b733', '#64748b', '#06b6d4', '#ec4899']

function fmtRp(v: number): string {
  if (!v) return 'Rp 0'
  const absV = Math.abs(v)
  if (absV >= 1e12) return `Rp ${(v/1e12).toFixed(2)}T`
  if (absV >= 1e9) return `Rp ${(v/1e9).toFixed(2)}M`
  if (absV >= 1e6) return `Rp ${(v/1e6).toFixed(0)}Jt`
  return `Rp ${v.toLocaleString('id-ID')}`
}

function fmtNum(v: number): string {
  if (!v) return '0'
  const absV = Math.abs(v)
  if (absV >= 1e9) return `${(v/1e9).toFixed(2)}B`
  if (absV >= 1e6) return `${(v/1e6).toFixed(2)}M`
  return v.toLocaleString('id-ID')
}

type TabType = 'market' | 'ksei5' | 'ksei1'

export default function MarketOverview() {
  const [activeTab, setActiveTab] = useState<TabType>('market')
  const [loading, setLoading] = useState(true)
  const [latestTxDate, setLatestTxDate] = useState('')
  const [latestKsei5Date, setLatestKsei5Date] = useState('')
  const [latestKsei1Date, setLatestKsei1Date] = useState('')

  const [marketData, setMarketData] = useState<any>(null)
  const [ksei5Data, setKsei5Data] = useState<any>(null)
  const [ksei1Data, setKsei1Data] = useState<any>(null)
  const [kseiAlerts, setKseiAlerts] = useState<any[]>([])
  const [highConviction, setHighConviction] = useState<any[]>([])
  const [selectedSector, setSelectedSector] = useState<string | null>(null)

  useEffect(() => { fetchAllData() }, [])

  async function fetchAllData() {
    setLoading(true)
    await Promise.all([
      fetchMarketPulse(),
      fetchKsei5(),
      fetchKsei1(),
      fetchKseiAlerts(),
      fetchHighConviction(),
    ])
    setLoading(false)
  }

  // ==================== MARKET PULSE ====================
  async function fetchMarketPulse() {
    try {
      // Get latest trading date
      const { data: dateData } = await supabase
        .from('daily_transactions')
        .select('trading_date')
        .order('trading_date', { ascending: false })
        .limit(1)
      const date = dateData?.[0]?.trading_date
      if (!date) return
      setLatestTxDate(date)

      // Get all transactions for that date
      const { data } = await supabase
        .from('daily_transactions')
        .select('stock_code,close,change_percent,value,volume,net_foreign_value,aov_ratio_ma20,whale_signal,signal,sector')
        .eq('trading_date', date)
        .gt('volume', 0)
        .limit(2000)

      if (!data) return

      let totalForeign = 0, totalValue = 0
      const gainers: any[] = [], losers: any[] = [], foreignBuy: any[] = [], foreignSell: any[] = [], spikes: any[] = [], topVol: any[] = [], topVal: any[] = []
      let up = 0, down = 0

      const allStocks: any[] = []
      const sectorMap: Record<string, any> = {}
      data.forEach((r: any) => {
        const netF = Number(r.net_foreign_value) || 0
        const val  = Number(r.value) || 0
        const pct  = Number(r.change_percent) || 0
        const vol  = Number(r.volume) || 0
        totalForeign += netF
        totalValue += val
        if (pct > 0) up++; else if (pct < 0) down++
        if (pct > 0) gainers.push({ code: r.stock_code, close: Number(r.close), change: pct, value: val })
        if (pct < 0) losers.push({ code: r.stock_code, close: Number(r.close), change: pct, value: val })
        if (netF > 0) foreignBuy.push({ code: r.stock_code, close: Number(r.close), netForeign: netF })
        if (netF < 0) foreignSell.push({ code: r.stock_code, close: Number(r.close), netForeign: Math.abs(netF) })
        if ((Number(r.aov_ratio_ma20) || 0) >= 1.5) spikes.push({ code: r.stock_code, close: Number(r.close), aov: Number(r.aov_ratio_ma20), change: pct })
        topVol.push({ code: r.stock_code, close: Number(r.close), volume: vol, change: pct })
        topVal.push({ code: r.stock_code, close: Number(r.close), value: val, change: pct })
        allStocks.push({ code: r.stock_code, close: Number(r.close), change: pct, value: val, volume: vol, netForeign: netF, sector: sec })
        // Sector aggregation
        const sec = r.sector || 'Other'
        if (!sectorMap[sec]) sectorMap[sec] = { sector: sec, count: 0, up: 0, down: 0, totalValue: 0, netForeign: 0, changeSum: 0 }
        sectorMap[sec].count++
        if (pct > 0) sectorMap[sec].up++
        if (pct < 0) sectorMap[sec].down++
        sectorMap[sec].totalValue += val
        sectorMap[sec].netForeign += netF
        sectorMap[sec].changeSum  += pct
      })
      const sectorHeatmap = Object.values(sectorMap)
        .map((s: any) => ({ ...s, avgChange: s.count > 0 ? s.changeSum / s.count : 0 }))
        .sort((a: any, b: any) => b.totalValue - a.totalValue)
        .slice(0, 12)

      setMarketData({
        totalForeign, totalValue, up, down,
        gainers: gainers.sort((a, b) => b.change - a.change).slice(0, 10),
        topVolume: topVol.sort((a, b) => b.volume - a.volume).slice(0, 10),
        topValue: topVal.sort((a, b) => b.value - a.value).slice(0, 10),
        losers: losers.sort((a, b) => a.change - b.change).slice(0, 10),
        foreignBuy: foreignBuy.sort((a, b) => b.netForeign - a.netForeign).slice(0, 10),
        foreignSell: foreignSell.sort((a, b) => b.netForeign - a.netForeign).slice(0, 10),
        spikes: spikes.sort((a, b) => b.aov - a.aov).slice(0, 7),
        sectorHeatmap,
        allStocks,
      })
    } catch (e) { console.error(e) }
  }

  // ==================== KSEI 5% ====================
  async function fetchKsei5() {
    try {
      const { data: dateData } = await supabase
        .from('ksei_data5_mutasi')
        .select('tanggal_data')
        .order('tanggal_data', { ascending: false })
        .limit(1)
      const date = dateData?.[0]?.tanggal_data
      if (!date) return
      setLatestKsei5Date(date)

      const { data } = await supabase
        .from('ksei_data5_mutasi')
        .select('kode_efek,aksi,transaction_value,konglomerasi')
        .eq('tanggal_data', date)
        .limit(3000)

      if (!data) return

      let totalBuy = 0, totalSell = 0
      const stockMap = new Map<string, number>()
      const actionCount: any = {}
      const kongloMap = new Map<string, number>()

      data.forEach((r: any) => {
        const tv = Number(r.transaction_value) || 0
        if (r.aksi === 'Buying' || r.aksi === 'Accumulation') {
          totalBuy += tv
          stockMap.set(r.kode_efek, (stockMap.get(r.kode_efek) || 0) + tv)
        } else if (r.aksi === 'Reduction') {
          totalSell += tv
          stockMap.set(r.kode_efek, (stockMap.get(r.kode_efek) || 0) - tv)
        }
        if (r.aksi !== 'Holding' && r.aksi !== 'Skip') {
          actionCount[r.aksi] = (actionCount[r.aksi] || 0) + 1
        }
        if (r.konglomerasi && r.konglomerasi !== '-' && tv > 0) {
          kongloMap.set(r.konglomerasi, (kongloMap.get(r.konglomerasi) || 0) + tv)
        }
      })

      setKsei5Data({
        totalBuy, totalSell, netFlow: totalBuy - totalSell,
        activeStocks: new Set(data.map((r: any) => r.kode_efek)).size,
        actionBreakdown: Object.entries(actionCount).map(([name, value]) => ({ name, value })),
        topAcc: Array.from(stockMap.entries()).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([s, v]) => ({ stock: s, value: v })),
        topDist: Array.from(stockMap.entries()).filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]).slice(0, 10).map(([s, v]) => ({ stock: s, value: Math.abs(v) })),
        topKonglo: Array.from(kongloMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n, v]) => ({ name: n, value: v }))
      })
    } catch (e) { console.error(e) }
  }

  // ==================== KSEI 1% ====================
  async function fetchKsei1() {
    try {
      const { data: dateData } = await supabase
        .from('ksei_data1persen_mutasi')
        .select('date')
        .order('date', { ascending: false })
        .limit(1)
      const date = dateData?.[0]?.date
      if (!date) return
      setLatestKsei1Date(date)

      const { data } = await supabase
        .from('ksei_data1persen_mutasi')
        .select('share_code,investor_name,investor_type,local_foreign,total_holding_shares,percentage')
        .eq('date', date)
        .limit(5000)

      if (!data) return

      let foreignPct = 0, localPct = 0, totalShares = 0
      const stockMap = new Map<string, { code: string; foreign: number; local: number; total: number }>()
      const investorMap = new Map<string, { name: string; type: string; emiten: number }>()

      data.forEach((r: any) => {
        const pct = Number(r.percentage) || 0
        const isForeign = r.local_foreign === 'F'
        if (isForeign) foreignPct += pct; else localPct += pct
        totalShares += Number(r.total_holding_shares) || 0
        if (!stockMap.has(r.share_code)) stockMap.set(r.share_code, { code: r.share_code, foreign: 0, local: 0, total: 0 })
        const s = stockMap.get(r.share_code)!
        if (isForeign) s.foreign += pct; else s.local += pct
        s.total += pct
        if (!investorMap.has(r.investor_name)) investorMap.set(r.investor_name, { name: r.investor_name, type: r.investor_type || '-', emiten: 0 })
        investorMap.get(r.investor_name)!.emiten++
      })

      setKsei1Data({
        totalEmiten: stockMap.size,
        foreignPct, localPct, totalShares,
        topForeign: Array.from(stockMap.values()).sort((a, b) => b.foreign - a.foreign).slice(0, 10),
        topConcentration: Array.from(stockMap.values()).sort((a, b) => b.total - a.total).slice(0, 10),
        topInvestors: Array.from(investorMap.values()).sort((a, b) => b.emiten - a.emiten).slice(0, 10)
      })
    } catch (e) { console.error(e) }
  }

  // ==================== KSEI MOVEMENT ALERT ====================
  async function fetchKseiAlerts() {
    try {
      const { data } = await supabase.rpc('get_ksei_movement_alert')
      if (data) setKseiAlerts(data.slice(0, 15))
    } catch (e) { console.error(e) }
  }

  // ==================== HIGH CONVICTION ====================
  async function fetchHighConviction() {
    try {
      const { data } = await supabase.rpc('scan_high_conviction', {
        p_min_score: 60,
        p_min_flow: 0,
      })
      if (data) setHighConviction(data.map((s: any) => ({
        ...s,
        price:             Number(s.price),
        price_chg_pct:     Number(s.price_chg_pct),
        conviction_score:  Number(s.conviction_score),
        institutional_flow: Number(s.institutional_flow),
      })).sort((a: any, b: any) => b.conviction_score - a.conviction_score).slice(0, 10))
    } catch (e) { console.error(e) }
  }

  const tabs = [
    { id: 'market' as TabType, label: 'Market Pulse', icon: Activity, desc: 'Daily Transaction Flow', date: latestTxDate },
    { id: 'ksei5' as TabType, label: 'KSEI 5% Flow', icon: Building2, desc: 'Whale Movements >5%', date: latestKsei5Date },
    { id: 'ksei1' as TabType, label: '1% Ownership', icon: Globe, desc: 'Institutional Holdings', date: latestKsei1Date },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 border-4 border-gold-400/20 rounded-full" />
            <div className="absolute inset-0 border-4 border-gold-400 border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-gold-400 font-medium animate-pulse">Loading Market Overview...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-10 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative">
        <div className="absolute -top-20 -left-20 w-64 h-64 bg-gold-500/20 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute -top-20 right-20 w-64 h-64 bg-blue-500/20 rounded-full blur-[100px] pointer-events-none" />
        <div className="relative z-10">
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">
            Market <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-300 via-yellow-500 to-gold-400 drop-shadow-[0_0_15px_rgba(231,183,51,0.3)]">Intelligence</span>
          </h1>
          <p className="text-slate-400 mt-2 text-sm md:text-base font-medium tracking-wide">Institutional grade flow analysis & KSEI tracker</p>
        </div>
        <div className="flex items-center gap-3 px-5 py-2.5 bg-green-500/10 rounded-full border border-green-500/20 backdrop-blur-md relative z-10">
          <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.8)]" />
          <span className="text-xs font-black text-green-400 uppercase tracking-widest">Live Connect</span>
        </div>
      </div>

      {/* Premium Tab Navigation */}
      <div className="glass rounded-2xl p-1.5 flex gap-1 overflow-x-auto border border-border/50 shadow-lg shadow-black/10">
        {tabs.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2.5 px-5 py-3 rounded-xl text-sm font-semibold transition-all duration-300 whitespace-nowrap relative ${
                isActive 
                  ? 'bg-gradient-to-r from-gold-400 to-yellow-500 text-navy-900 shadow-lg shadow-gold-400/20' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-navy-900' : ''}`} />
              {tab.label}
              {isActive && (
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-8 h-1 bg-gold-400 rounded-full hidden md:block" />
              )}
            </button>
          )
        })}
      </div>

      {/* Date Indicator */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Clock className="w-3 h-3" />
        <span>
          {activeTab === 'market' && `Latest Trading: ${latestTxDate}`}
          {activeTab === 'ksei5' && `Latest KSEI 5%: ${latestKsei5Date}`}
          {activeTab === 'ksei1' && `Latest KSEI 1%: ${latestKsei1Date}`}
        </span>
      </div>

      {/* ==================== TAB 1: MARKET PULSE ==================== */}
      {activeTab === 'market' && marketData && (
        <div className="space-y-4 animate-fade-in">

          {/* ── Row 1: Metric Cards ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { title: 'Market Breadth', value: `${marketData.up}↑ ${marketData.down}↓`, icon: BarChart3, color: 'text-blue-400', sub: 'Advancers vs Decliners' },
              { title: 'Total Turnover',  value: fmtRp(marketData.totalValue),   icon: DollarSign, color: 'text-gold-400',  sub: 'Daily value traded' },
              { title: 'Net Foreign',     value: fmtRp(marketData.totalForeign), icon: Globe,      color: marketData.totalForeign >= 0 ? 'text-emerald-400' : 'text-red-400', sub: marketData.totalForeign >= 0 ? '▲ Inflow' : '▼ Outflow' },
              { title: 'AOV Spikes',      value: marketData.spikes.length,       icon: Zap,        color: 'text-purple-400', sub: 'Whale signals today' },
            ].map((m, i) => {
              const Icon = m.icon
              return (
                <div key={i} className="glass rounded-xl p-4 border border-border/30 hover:border-gold-400/30 transition-all duration-300">
                  <div className="flex items-center justify-between mb-2">
                    <Icon className={`w-4 h-4 ${m.color}`} />
                    <span className="text-[9px] text-muted-foreground uppercase font-bold tracking-wide">{m.sub}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{m.title}</p>
                  <p className={`text-xl font-black mt-0.5 ${m.color}`}>{m.value}</p>
                </div>
              )
            })}
          </div>

          {/* ── Row 2: Gainers | Losers | Net Foreign — 3 kolom sejajar ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {/* Gainers */}
            <div className="glass rounded-xl overflow-hidden border border-green-500/20 hover:border-green-400/40 transition-all">
              <div className="px-4 py-2.5 bg-green-500/5 border-b border-green-500/15 flex items-center justify-between">
                <h3 className="font-bold text-xs text-green-400">🔥 Top 10 Gainers</h3>
                <span className="text-[9px] text-muted-foreground">{marketData.gainers.length} stocks</span>
              </div>
              <div className="divide-y divide-border/10">
                {marketData.gainers.map((s: any, i: number) => (
                  <Link key={i} href={`/stock/${s.code}`} className="flex items-center justify-between px-4 py-2 hover:bg-green-500/5 transition-colors group">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[9px] text-muted-foreground w-4 shrink-0">{i+1}</span>
                      <div className="min-w-0">
                        <span className="font-mono font-black text-sm text-foreground group-hover:text-green-400 transition-colors">{s.code}</span>
                        <span className="text-[9px] text-muted-foreground ml-1.5 hidden sm:inline">{fmtRp(s.close)}</span>
                      </div>
                    </div>
                    <span className="font-bold text-xs text-green-400 shrink-0 ml-2">+{s.change?.toFixed(2)}%</span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Losers */}
            <div className="glass rounded-xl overflow-hidden border border-red-500/20 hover:border-red-400/40 transition-all">
              <div className="px-4 py-2.5 bg-red-500/5 border-b border-red-500/15 flex items-center justify-between">
                <h3 className="font-bold text-xs text-red-400">❄️ Top 10 Losers</h3>
                <span className="text-[9px] text-muted-foreground">{marketData.losers.length} stocks</span>
              </div>
              <div className="divide-y divide-border/10">
                {marketData.losers.map((s: any, i: number) => (
                  <Link key={i} href={`/stock/${s.code}`} className="flex items-center justify-between px-4 py-2 hover:bg-red-500/5 transition-colors group">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[9px] text-muted-foreground w-4 shrink-0">{i+1}</span>
                      <div className="min-w-0">
                        <span className="font-mono font-black text-sm text-foreground group-hover:text-red-400 transition-colors">{s.code}</span>
                        <span className="text-[9px] text-muted-foreground ml-1.5 hidden sm:inline">{fmtRp(s.close)}</span>
                      </div>
                    </div>
                    <span className="font-bold text-xs text-red-400 shrink-0 ml-2">{s.change?.toFixed(2)}%</span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Net Foreign Flow */}
            <div className="glass rounded-xl overflow-hidden border border-blue-500/20 hover:border-blue-400/40 transition-all">
              <div className="px-4 py-2.5 bg-blue-500/5 border-b border-blue-500/15 flex items-center gap-2">
                <Globe className="w-3 h-3 text-blue-400" />
                <h3 className="font-bold text-xs text-blue-400">Net Foreign Flow</h3>
              </div>
              <div className="p-2">
                <p className="text-[9px] font-black text-emerald-400 uppercase tracking-wider px-2 py-1">▲ Top Buy</p>
                {marketData.foreignBuy.slice(0, 5).map((s: any, i: number) => (
                  <Link key={i} href={`/stock/${s.code}`} className="flex items-center justify-between px-2 py-1.5 hover:bg-emerald-500/5 rounded-lg transition-colors group">
                    <span className="font-mono font-black text-sm text-foreground group-hover:text-emerald-400">{s.code}</span>
                    <span className="text-xs font-bold text-emerald-400">{fmtRp(s.netForeign)}</span>
                  </Link>
                ))}
                <div className="border-t border-border/20 mt-1 pt-1">
                  <p className="text-[9px] font-black text-red-400 uppercase tracking-wider px-2 py-1">▼ Top Sell</p>
                  {marketData.foreignSell.slice(0, 5).map((s: any, i: number) => (
                    <Link key={i} href={`/stock/${s.code}`} className="flex items-center justify-between px-2 py-1.5 hover:bg-red-500/5 rounded-lg transition-colors group">
                      <span className="font-mono font-black text-sm text-foreground group-hover:text-red-400">{s.code}</span>
                      <span className="text-xs font-bold text-red-400">-{fmtRp(s.netForeign)}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Row 3: Top Volume | Top Value | AOV Spikes — 3 kolom sejajar ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {[
              { title: '📊 Top Volume', data: marketData.topVolume, valKey: 'volume', color: 'text-blue-400', border: 'border-blue-500/20', hover: 'hover:border-blue-400/40', fmt: (v: number) => fmtNum(v) },
              { title: '💰 Top Value',  data: marketData.topValue,  valKey: 'value',  color: 'text-gold-400', border: 'border-yellow-500/20', hover: 'hover:border-yellow-400/40', fmt: (v: number) => fmtRp(v) },
            ].map((sec, si) => (
              <div key={si} className={`glass rounded-xl overflow-hidden border ${sec.border} ${sec.hover} transition-all`}>
                <div className="px-4 py-2.5 border-b border-border/15 bg-white/[0.01]">
                  <h3 className={`font-bold text-xs ${sec.color}`}>{sec.title}</h3>
                </div>
                <div className="divide-y divide-border/10">
                  {sec.data?.map((s: any, i: number) => (
                    <Link key={i} href={`/stock/${s.code}`} className="flex items-center justify-between px-4 py-2 hover:bg-accent/10 transition-colors group">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-muted-foreground w-4">{i+1}</span>
                        <div>
                          <span className={`font-mono font-black text-sm text-foreground group-hover:${sec.color} transition-colors`}>{s.code}</span>
                          <span className="text-[9px] text-muted-foreground ml-1.5">{fmtRp(s.close)}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold text-xs ${sec.color}`}>{sec.fmt(s[sec.valKey])}</p>
                        <p className={`text-[9px] ${s.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>{s.change > 0 ? '+' : ''}{s.change?.toFixed(1)}%</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}

            {/* AOV Spikes */}
            <div className="glass rounded-xl overflow-hidden border border-purple-500/20 hover:border-purple-400/40 transition-all">
              <div className="px-4 py-2.5 border-b border-border/15 bg-white/[0.01] flex items-center justify-between">
                <h3 className="font-bold text-xs text-purple-400 flex items-center gap-1.5"><Zap className="w-3 h-3" /> AOV Spikes</h3>
                <Link href="/radar" className="text-[9px] text-gold-400 hover:underline">Radar →</Link>
              </div>
              <div className="divide-y divide-border/10">
                {marketData.spikes.slice(0, 10).map((s: any, i: number) => (
                  <Link key={i} href={`/stock/${s.code}`} className="flex items-center justify-between px-4 py-2 hover:bg-purple-500/5 transition-colors group">
                    <div>
                      <span className="font-mono font-black text-sm text-foreground group-hover:text-purple-400 transition-colors">{s.code}</span>
                      <span className="text-[9px] text-muted-foreground ml-1.5">{fmtRp(s.close)}</span>
                    </div>
                    <div className="text-right">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${s.aov >= 2 ? 'bg-purple-500/20 text-purple-300' : 'bg-blue-500/15 text-blue-400'}`}>{s.aov.toFixed(1)}x</span>
                      <p className={`text-[9px] mt-0.5 ${s.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>{s.change > 0 ? '+' : ''}{s.change.toFixed(1)}%</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* ── Row 4: Sector Heatmap (from daily_transactions) ── */}
          {marketData.sectorHeatmap?.length > 0 && (
            <div className="glass rounded-xl p-4 border border-border/30 hover:border-gold-400/30 transition-all">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                  <Activity className="w-4 h-4 text-purple-400" /> Sector Heatmap
                </h3>
                <span className="text-[9px] text-muted-foreground">by daily_transactions · top 12 by value</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
                {marketData.sectorHeatmap.map((sec: any, i: number) => {
                  const netF = sec.netForeign
                  const avg  = sec.avgChange
                  const upRatio = sec.count > 0 ? sec.up / sec.count : 0
                  const isPos = avg >= 0
                  const intensity = Math.min(Math.abs(avg) / 3, 1)
                  const bg = isPos
                    ? `rgba(34,197,94,${0.05 + intensity * 0.18})`
                    : `rgba(239,68,68,${0.05 + intensity * 0.18})`
                  const borderColor = isPos ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'
                  const textColor = isPos ? '#4ade80' : '#f87171'
                  const isSelected = selectedSector === sec.sector
                  return (
                    <div
                      key={i}
                      onClick={() => setSelectedSector(isSelected ? null : sec.sector)}
                      style={{ background: isSelected ? (isPos ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)') : bg, borderColor: isSelected ? textColor : borderColor }}
                      className="rounded-xl p-3 border cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all select-none"
                    >
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wide truncate leading-tight">{sec.sector}</p>
                        {isSelected && <span style={{ color: textColor }} className="text-[8px] shrink-0">▼</span>}
                      </div>
                      <p style={{ color: textColor }} className="text-base font-black leading-none">
                        {avg > 0 ? '+' : ''}{avg.toFixed(2)}%
                      </p>
                      <div className="mt-2 h-1 rounded-full bg-white/5 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${upRatio * 100}%`, background: textColor, opacity: 0.6 }} />
                      </div>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[8px] text-muted-foreground">{sec.count} stk</span>
                        <span style={{ color: netF >= 0 ? '#34d399' : '#f87171' }} className="text-[8px] font-bold">
                          {netF >= 0 ? '▲' : '▼'} {fmtRp(Math.abs(netF))}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* ── Sector Drill-down Panel ── */}
              {selectedSector && (() => {
                const stocks = (marketData.allStocks || [])
                  .filter((s: any) => s.sector === selectedSector)
                  .sort((a: any, b: any) => b.value - a.value)
                const sectorInfo = marketData.sectorHeatmap.find((s: any) => s.sector === selectedSector)
                const netF = sectorInfo?.netForeign || 0
                const avg  = sectorInfo?.avgChange  || 0
                const isPos = avg >= 0
                return (
                  <div className="mt-3 rounded-xl border border-border/30 overflow-hidden animate-fade-in">
                    {/* Panel header */}
                    <div className="flex items-center justify-between px-4 py-2.5 bg-accent/20 border-b border-border/20">
                      <div className="flex items-center gap-3">
                        <h4 className="font-bold text-sm text-foreground">{selectedSector}</h4>
                        <span className={`text-xs font-black ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
                          {avg > 0 ? '+' : ''}{avg.toFixed(2)}% avg
                        </span>
                        <span className="text-[10px] text-muted-foreground">{stocks.length} stocks</span>
                        <span className={`text-[10px] font-bold ${netF >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          Asing: {netF >= 0 ? '+' : ''}{fmtRp(netF)}
                        </span>
                      </div>
                      <button
                        onClick={() => setSelectedSector(null)}
                        className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-accent/40 transition-colors"
                      >✕ Tutup</button>
                    </div>

                    {/* Stock list — 4 columns on large screen */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 divide-x divide-y divide-border/10">
                      {stocks.map((s: any, i: number) => (
                        <Link
                          key={i}
                          href={`/stock/${s.code}`}
                          className="flex items-center justify-between px-3.5 py-2.5 hover:bg-accent/20 transition-colors group"
                        >
                          <div className="min-w-0">
                            <p className="font-mono font-black text-sm text-foreground group-hover:text-gold-400 transition-colors truncate">{s.code}</p>
                            <p className="text-[9px] text-muted-foreground">{fmtRp(s.close)} · Val {fmtRp(s.value)}</p>
                          </div>
                          <div className="text-right ml-2 shrink-0">
                            <p className={`text-xs font-bold ${s.change > 0 ? 'text-emerald-400' : s.change < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                              {s.change > 0 ? '+' : ''}{s.change.toFixed(2)}%
                            </p>
                            {s.netForeign !== 0 && (
                              <p className={`text-[8px] ${s.netForeign > 0 ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
                                {s.netForeign > 0 ? '▲' : '▼'} {fmtRp(Math.abs(s.netForeign))}
                              </p>
                            )}
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {/* ── High Conviction & KSEI Alert ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* High Conviction */}
            {highConviction.length > 0 && (
              <div className="glass rounded-2xl overflow-hidden border border-border/30 hover:border-gold-400/30 transition-all duration-300">
                <div className="px-5 py-3 border-b border-border/20 bg-white/[0.01] flex items-center justify-between">
                  <h3 className="font-bold text-sm text-purple-400">🎯 High Conviction Stocks</h3>
                  <Link href="/screener" className="text-[10px] text-gold-400 hover:underline">See all →</Link>
                </div>
                <div className="divide-y divide-border/20">
                  {highConviction.map((s: any, i: number) => (
                    <Link key={i} href={`/stock/${s.stock_code}`} className="flex items-center justify-between p-3.5 hover:bg-accent/20 transition-colors group">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                          <span className="text-[10px] font-black text-purple-400">{Math.round(s.conviction_score)}</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-black text-foreground group-hover:text-gold-400 transition-colors">{s.stock_code}</span>
                            {s.is_stealth && <span className="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 rounded">STEALTH</span>}
                          </div>
                          <span className="text-[10px] text-muted-foreground">{s.sector}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-foreground">Rp {s.price?.toLocaleString('id-ID')}</p>
                        <p className="text-[10px] text-muted-foreground">Flow: {s.institutional_flow?.toFixed(1)}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* KSEI Movement Alert */}
            {kseiAlerts.length > 0 && (
              <div className="glass rounded-2xl overflow-hidden border border-border/30 hover:border-gold-400/30 transition-all duration-300">
                <div className="px-5 py-3 border-b border-border/20 bg-white/[0.01] flex items-center justify-between">
                  <h3 className="font-bold text-sm text-amber-400">🚨 KSEI Movement Alert</h3>
                  <Link href="/flow" className="text-[10px] text-gold-400 hover:underline">See all →</Link>
                </div>
                <div className="divide-y divide-border/20">
                  {kseiAlerts.map((a: any, i: number) => {
                    const isAccum = Number(a.scripless_diff) > 0
                    return (
                      <div key={i} className="p-3.5 hover:bg-accent/20 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Link href={`/stock/${a.share_code}`} className="font-mono font-black text-foreground hover:text-gold-400 transition-colors">{a.share_code}</Link>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${isAccum ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                                {isAccum ? '▲ ACCUM' : '▼ REDUC'}
                              </span>
                            </div>
                            <p className="text-[10px] text-muted-foreground truncate mt-0.5">{a.investor_name}</p>
                            <p className="text-[9px] text-muted-foreground/60">{a.investor_type} · {a.new_date}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className={`text-sm font-bold ${isAccum ? 'text-emerald-400' : 'text-red-400'}`}>
                              {isAccum ? '+' : ''}{fmtNum(Math.abs(Number(a.scripless_diff)))}
                            </p>
                            <p className="text-[9px] text-muted-foreground">shares</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== TAB 2: KSEI 5% FLOW ==================== */}
      {activeTab === 'ksei5' && ksei5Data && (
        <div className="space-y-6 animate-fade-in">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { title: 'Total Buy', value: fmtRp(ksei5Data.totalBuy), icon: TrendingUp, color: 'text-green-400' },
              { title: 'Total Sell', value: fmtRp(ksei5Data.totalSell), icon: TrendingDown, color: 'text-red-400' },
              { title: 'Net Flow', value: fmtRp(ksei5Data.netFlow), icon: ArrowRightLeft, color: ksei5Data.netFlow >= 0 ? 'text-green-400' : 'text-red-400' },
              { title: 'Active Stocks', value: ksei5Data.activeStocks, icon: Target, color: 'text-blue-400' },
            ].map((m, i) => {
              const Icon = m.icon
              return (
                <div key={i} className="glass rounded-2xl p-5 card-hover border border-border/30 hover:border-gold-400/30 transition-all duration-300">
                  <Icon className={`w-5 h-5 ${m.color} mb-3`} />
                  <p className="text-xs text-muted-foreground uppercase">{m.title}</p>
                  <p className={`text-2xl font-black mt-1 ${m.color}`}>{m.value}</p>
                </div>
              )
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass rounded-2xl p-6 border border-border/30 hover:border-gold-400/30 transition-all duration-300">
              <h3 className="font-bold text-foreground mb-4">Action Breakdown</h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={ksei5Data.actionBreakdown} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value">
                    {ksei5Data.actionBreakdown.map((_: any, idx: number) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} opacity={0.9} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="glass rounded-2xl p-6 border border-border/30 hover:border-gold-400/30 transition-all duration-300">
              <h3 className="font-bold text-foreground mb-4">Top Konglomerasi</h3>
              <div className="space-y-3">
                {ksei5Data.topKonglo.map((item: any, i: number) => {
                  const maxVal = ksei5Data.topKonglo[0]?.value || 1
                  return (
                    <div key={i} className="group">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-sm font-medium text-foreground truncate group-hover:text-gold-400 transition-colors">#{i+1} {item.name}</span>
                        <span className="text-sm font-bold text-gold-400">{fmtRp(item.value)}</span>
                      </div>
                      <div className="w-full h-2 bg-accent rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-purple-400 to-purple-600 rounded-full transition-all duration-500" style={{ width: `${(item.value/maxVal)*100}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[
              { title: '🔥 Top Accumulation', data: ksei5Data.topAcc, color: 'text-green-400' },
              { title: '❄️ Top Distribution', data: ksei5Data.topDist, color: 'text-red-400' },
            ].map((sec, si) => (
              <div key={si} className="glass rounded-2xl p-6 border border-border/30 hover:border-gold-400/30 transition-all duration-300">
                <h3 className={`font-bold ${sec.color} mb-4`}>{sec.title}</h3>
                <div className="space-y-2.5">
                  {sec.data.map((item: any, i: number) => {
                    const maxVal = sec.data[0]?.value || 1
                    return (
                      <Link key={i} href={`/stocks?q=${item.stock}`} className="flex justify-between items-center p-2.5 rounded-lg hover:bg-accent/20 transition-colors group">
                        <span className="font-mono font-bold text-foreground group-hover:text-gold-400">{item.stock}</span>
                        <div className="flex items-center gap-3">
                          <div className="w-20 h-1.5 bg-accent rounded-full overflow-hidden hidden md:block">
                            <div className={`h-full rounded-full ${si === 0 ? 'bg-green-400' : 'bg-red-400'}`} style={{ width: `${(item.value/maxVal)*100}%` }} />
                          </div>
                          <span className={`text-sm font-bold ${sec.color}`}>{fmtRp(item.value)}</span>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <Link href="/radar?tab=ksei5" className="block w-full py-3 text-center text-sm font-bold text-gold-400 hover:text-foreground bg-gold-500/5 hover:bg-gold-500/10 rounded-xl border border-gold-500/20 transition-all">
            View Full KSEI 5% Analysis →
          </Link>
        </div>
      )}

      {/* ==================== TAB 3: KSEI 1% OWNERSHIP ==================== */}
      {activeTab === 'ksei1' && ksei1Data && (
        <div className="space-y-6 animate-fade-in">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { title: 'Total Emiten', value: ksei1Data.totalEmiten, icon: Building2, color: 'text-blue-400' },
              { title: 'Foreign Ownership', value: `${ksei1Data.foreignPct.toFixed(1)}%`, icon: Globe, color: 'text-cyan-400' },
              { title: 'Local Ownership', value: `${ksei1Data.localPct.toFixed(1)}%`, icon: ShieldCheck, color: 'text-gold-400' },
              { title: 'Total Shares', value: fmtNum(ksei1Data.totalShares), color: 'text-purple-400' },
            ].map((m, i) => (
              <div key={i} className="glass rounded-2xl p-5 card-hover border border-border/30 hover:border-gold-400/30 transition-all duration-300">
                <p className="text-xs text-muted-foreground uppercase">{m.title}</p>
                <p className={`text-2xl font-black mt-1 ${m.color}`}>{m.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass rounded-2xl p-6 border border-border/30 hover:border-gold-400/30 transition-all duration-300">
              <h3 className="font-bold text-foreground mb-4">Top 10 Foreign Ownership</h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ksei1Data.topForeign} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} opacity={0.1} />
                    <XAxis type="number" hide />
                    <YAxis dataKey="code" type="category" tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 'bold' }} width={55} />
                    <Tooltip />
                    <Bar dataKey="foreign" fill="#06b6d4" radius={[0, 4, 4, 0]} barSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="glass rounded-2xl p-6 border border-border/30 hover:border-gold-400/30 transition-all duration-300">
              <h3 className="font-bold text-foreground mb-4">Top 10 Concentration</h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ksei1Data.topConcentration} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} opacity={0.1} />
                    <XAxis type="number" hide />
                    <YAxis dataKey="code" type="category" tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 'bold' }} width={55} />
                    <Tooltip />
                    <Bar dataKey="total" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="glass rounded-2xl p-6 border border-border/30 hover:border-gold-400/30 transition-all duration-300">
            <h3 className="font-bold text-foreground mb-4">🏆 Top Institutional Investors</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {ksei1Data.topInvestors.slice(0, 5).map((inv: any, i: number) => (
                <div key={i} className="p-4 rounded-xl bg-accent/20 border border-border/30 hover:border-gold-400/30 transition-all">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gold-400 to-yellow-600 text-navy-900 flex items-center justify-center font-black text-sm mb-3">#{i+1}</div>
                  <p className="text-sm font-bold text-foreground truncate">{inv.name}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{inv.type}</p>
                  <p className="text-lg font-black text-gold-400 mt-2">{inv.emiten} <span className="text-xs text-muted-foreground">emitens</span></p>
                </div>
              ))}
            </div>
          </div>

          <Link href="/ownership" className="block w-full py-3 text-center text-sm font-bold text-gold-400 hover:text-foreground bg-gold-500/5 hover:bg-gold-500/10 rounded-xl border border-gold-500/20 transition-all">
            View Full 1% Ownership Analysis →
          </Link>
        </div>
      )}
    </div>
  )
}
