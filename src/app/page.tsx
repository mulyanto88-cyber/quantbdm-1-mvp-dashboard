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
        // Sector aggregation
        const sec = r.sector || 'Other'
        allStocks.push({ code: r.stock_code, close: Number(r.close), change: pct, value: val, volume: vol, netForeign: netF, sector: sec })
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
    <div className="space-y-10 pb-12 animate-fade-in">
      {/* ── PREMIUM INTELLIGENCE HERO ── */}
      <div className="relative group">
        <div className="absolute -inset-1 bg-gradient-to-r from-gold-500/20 via-emerald-500/10 to-blue-500/20 rounded-[2.5rem] blur-2xl opacity-30"></div>
        <div className="glass rounded-[2.5rem] p-8 md:p-10 border border-white/[0.08] shadow-2xl relative overflow-hidden">
          {/* Animated Background Elements */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-gold-500/5 rounded-full blur-[100px] -mr-32 -mt-32 animate-pulse" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/5 rounded-full blur-[80px] -ml-20 -mb-20" />
          
          <div className="relative z-10 flex flex-col lg:flex-row gap-12 items-center">
            {/* 1. Market Verdict Gauge */}
            <div className="flex flex-col items-center justify-center p-8 rounded-[2.5rem] bg-white/[0.02] border border-white/5 relative group/score w-full lg:w-72 shrink-0">
              <div className="flex items-center gap-2 mb-6">
                <ShieldCheck className="w-4 h-4 text-gold-400" />
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Market Sentiment</span>
              </div>
              <div className="relative">
                <svg className="w-44 h-44 transform -rotate-90">
                  <circle cx="88" cy="88" r="78" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-white/5" />
                  <circle cx="88" cy="88" r="78" stroke="currentColor" strokeWidth="12" fill="transparent" 
                    strokeDasharray={490} 
                    strokeDashoffset={490 - (490 * (marketData?.totalForeign > 0 ? 75 : 45)) / 100}
                    strokeLinecap="round"
                    className={`${marketData?.totalForeign > 0 ? 'text-emerald-400' : 'text-gold-400'} transition-all duration-1000 shadow-[0_0_15px_rgba(34,197,94,0.3)]`} 
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-5xl font-black text-white tracking-tighter">
                    {marketData?.totalForeign > 0 ? 'BULL' : 'NEUT'}
                  </span>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Verdict</span>
                </div>
              </div>
              <div className="mt-6 flex flex-col items-center gap-1">
                 <span className={`text-xs font-black ${marketData?.totalForeign > 0 ? 'text-emerald-400' : 'text-gold-400'}`}>
                   {marketData?.totalForeign > 0 ? 'Institutional Accumulation' : 'Wait & See Mode'}
                 </span>
                 <span className="text-[9px] text-muted-foreground">Based on aggregate flow DNA</span>
              </div>
            </div>

            {/* 2. Main Title & Quick Stats */}
            <div className="flex-1 space-y-8">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="px-3 py-1 rounded-full bg-gold-400/10 border border-gold-400/20 text-[10px] font-black text-gold-400 uppercase tracking-widest">
                    Institutional Terminal v2.0
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Live Flow Sync</span>
                  </div>
                </div>
                <h1 className="text-5xl md:text-7xl font-black text-white tracking-tighter leading-none">
                  Market <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-200 via-yellow-500 to-gold-500 drop-shadow-2xl">Intelligence</span>
                </h1>
                <p className="text-slate-400 mt-4 text-lg font-medium tracking-wide max-w-2xl leading-relaxed">
                  Real-time cross-analysis of daily transactions, institutional ownership patterns, and strategic Whale movements.
                </p>
              </div>

              {/* Market Pulse Mini Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Turnover', value: fmtRp(marketData?.totalValue), icon: DollarSign, color: 'text-gold-400' },
                  { label: 'Foreign Net', value: fmtRp(marketData?.totalForeign), icon: Globe, color: marketData?.totalForeign >= 0 ? 'text-emerald-400' : 'text-red-400' },
                  { label: 'Market Breadth', value: `${marketData?.up}↑ / ${marketData?.down}↓`, icon: Activity, color: 'text-blue-400' },
                  { label: 'Whale Alerts', value: marketData?.spikes?.length || 0, icon: Zap, color: 'text-purple-400' },
                ].map((stat, i) => (
                  <div key={i} className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-white/10 transition-all group/stat">
                    <div className="flex items-center gap-2 mb-1.5">
                      <stat.icon className={`w-3.5 h-3.5 ${stat.color} opacity-60 group-hover/stat:opacity-100 transition-opacity`} />
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{stat.label}</span>
                    </div>
                    <p className={`text-lg font-black text-white truncate`}>{stat.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── PREMIUM TABS NAVIGATION ── */}
      <div className="sticky top-4 z-40 px-2 py-2">
        <div className="max-w-4xl mx-auto glass rounded-2xl p-1.5 flex gap-1 border border-white/10 shadow-2xl backdrop-blur-2xl">
          {tabs.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl text-sm font-black transition-all duration-500 relative overflow-hidden group ${
                  isActive 
                    ? 'bg-gradient-to-r from-gold-400 via-yellow-500 to-gold-400 text-navy-900 shadow-xl shadow-gold-400/20' 
                    : 'text-muted-foreground hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'animate-pulse' : 'opacity-50 group-hover:opacity-100'}`} />
                <span className="hidden md:inline tracking-tight uppercase">{tab.label}</span>
                <span className="md:hidden tracking-tight">{tab.label.split(' ')[0]}</span>
                {isActive && (
                  <div className="absolute inset-0 bg-white/10 animate-shine" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Date Indicator & Verdict Flash */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
        <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">
          <div className="flex items-center gap-2">
            <Clock className="w-3 h-3" />
            <span>Last Sync: {
              activeTab === 'market' ? latestTxDate : 
              activeTab === 'ksei5' ? latestKsei5Date : latestKsei1Date
            }</span>
          </div>
          <div className="w-1 h-1 rounded-full bg-white/20" />
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>System Status: Optimal</span>
          </div>
        </div>

        {activeTab === 'market' && (
          <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-white/[0.03] border border-white/5">
             <Target className="w-3.5 h-3.5 text-gold-400" />
             <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest leading-none">
               Market Verdict: <span className="text-emerald-400">Institutional Accumulation Mode</span>
             </span>
          </div>
        )}
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

          {/* ── Row 4: Sector Heatmap (Premium Tree-grid) ── */}
          {marketData.sectorHeatmap?.length > 0 && (
            <div className="glass rounded-3xl p-6 border border-white/10 shadow-2xl relative overflow-hidden group/heatmap">
              <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 rounded-full blur-[80px] -mr-20 -mt-20" />
              
              <div className="flex items-center justify-between mb-6 relative z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                    <Activity className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="font-black text-lg text-white tracking-tight">Sector Intelligence Map</h3>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Institutional Flow Velocity</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                   <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-400/60" /> Accumulation</div>
                   <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-400/60" /> Distribution</div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 relative z-10">
                {marketData.sectorHeatmap.map((sec: any, i: number) => {
                  const netF = sec.netForeign
                  const avg  = sec.avgChange
                  const upRatio = sec.count > 0 ? sec.up / sec.count : 0
                  const isPos = avg >= 0
                  const isWhaleActive = Math.abs(netF) > 5e9 // > 5B
                  
                  const isSelected = selectedSector === sec.sector
                  return (
                    <div
                      key={i}
                      onClick={() => setSelectedSector(isSelected ? null : sec.sector)}
                      className={`relative rounded-2xl p-4 border transition-all duration-500 cursor-pointer group/sec ${
                        isSelected 
                          ? 'ring-2 ring-gold-400/50 bg-white/[0.08] border-gold-400/30' 
                          : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.06] hover:border-white/10'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest truncate max-w-[80%]">{sec.sector}</p>
                        {isWhaleActive && (
                          <div className="w-2 h-2 rounded-full bg-gold-400 shadow-[0_0_8px_rgba(231,183,51,0.6)] animate-pulse" title="Whale Activity Detected" />
                        )}
                      </div>
                      
                      <div className="flex items-baseline gap-1">
                        <span className={`text-2xl font-black tracking-tighter ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
                          {avg > 0 ? '+' : ''}{avg.toFixed(2)}%
                        </span>
                      </div>

                      <div className="mt-4 space-y-2">
                        <div className="flex justify-between items-center text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest">
                          <span>Breadth</span>
                          <span>{Math.round(upRatio * 100)}%</span>
                        </div>
                        <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-1000 ${isPos ? 'bg-emerald-400' : 'bg-red-400'}`} 
                            style={{ width: `${upRatio * 100}%`, opacity: isSelected ? 1 : 0.4 }} 
                          />
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
                        <span className="text-[10px] font-bold text-muted-foreground">{sec.count} STK</span>
                        <span className={`text-[10px] font-black ${netF >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {netF >= 0 ? '▲' : '▼'} {fmtRp(Math.abs(netF))}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* ── Sector Drill-down (Premium Panel) ── */}
              {selectedSector && (() => {
                const stocks = (marketData.allStocks || [])
                  .filter((s: any) => s.sector === selectedSector)
                  .sort((a: any, b: any) => b.value - a.value)
                const sectorInfo = marketData.sectorHeatmap.find((s: any) => s.sector === selectedSector)
                const netF = sectorInfo?.netForeign || 0
                const avg  = sectorInfo?.avgChange  || 0
                const isPos = avg >= 0
                return (
                  <div className="mt-6 rounded-3xl border border-gold-400/20 bg-gold-400/[0.02] overflow-hidden animate-in slide-in-from-top-4 duration-500 shadow-2xl relative z-10">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between px-6 py-4 bg-white/[0.02] border-b border-white/5 gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-gold-400/10 border border-gold-400/20 flex items-center justify-center">
                          <Building2 className="w-6 h-6 text-gold-400" />
                        </div>
                        <div>
                          <h4 className="font-black text-xl text-white tracking-tight">{selectedSector} Intelligence</h4>
                          <div className="flex items-center gap-3 mt-0.5">
                             <span className={`text-xs font-black ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
                               {isPos ? 'Bullish' : 'Bearish'} Momentum: {avg > 0 ? '+' : ''}{avg.toFixed(2)}%
                             </span>
                             <span className="w-1 h-1 rounded-full bg-white/20" />
                             <span className={`text-xs font-black ${netF >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                               Flow: {netF >= 0 ? 'Accumulation' : 'Distribution'} ({fmtRp(netF)})
                             </span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedSector(null)}
                        className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-white transition-all"
                      >Close Panel</button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 p-2 gap-2">
                      {stocks.map((s: any, i: number) => (
                        <Link
                          key={i}
                          href={`/stock/${s.code}`}
                          className="flex flex-col p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-white/10 transition-all group/stock"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <span className="font-mono font-black text-lg text-white group-hover/stock:text-gold-400 transition-colors leading-none">{s.code}</span>
                            <span className={`text-xs font-black ${s.change > 0 ? 'text-emerald-400' : s.change < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                              {s.change > 0 ? '+' : ''}{s.change.toFixed(2)}%
                            </span>
                          </div>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Price: {fmtRp(s.close)}</p>
                          <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
                             <span className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest">Val: {fmtNum(s.value)}</span>
                             {s.netForeign !== 0 && (
                               <span className={`text-[9px] font-black ${s.netForeign > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                 {s.netForeign > 0 ? '▲' : '▼'} {fmtNum(Math.abs(s.netForeign))}
                               </span>
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

          {/* ── Row 5: Institutional High-Conviction Feed ── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* High Conviction Feed */}
            <div className="lg:col-span-7 space-y-4">
               <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-emerald-400" />
                    <h3 className="font-black text-white uppercase tracking-widest text-xs">High Conviction Alpha</h3>
                  </div>
                  <Link href="/screener" className="text-[10px] font-black text-gold-400 hover:text-white transition-colors uppercase tracking-widest">View Strategy Radar →</Link>
               </div>
               
               <div className="grid grid-cols-1 gap-3">
                 {highConviction.map((s: any, i: number) => (
                   <Link key={i} href={`/stock/${s.stock_code}`} className="group relative overflow-hidden">
                     <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/10 to-gold-500/10 rounded-2xl blur opacity-0 group-hover:opacity-100 transition duration-500" />
                     <div className="glass rounded-2xl p-5 border border-white/5 group-hover:border-white/10 relative transition-all flex items-center gap-6">
                        <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col items-center justify-center shrink-0">
                           <span className="text-xl font-black text-white leading-none">{Math.round(s.conviction_score)}</span>
                           <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Score</span>
                        </div>
                        
                        <div className="flex-1 min-w-0">
                           <div className="flex items-center gap-3 mb-1">
                              <h4 className="text-xl font-black text-white group-hover:text-gold-400 transition-colors leading-none">{s.stock_code}</h4>
                              <span className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-[0.2em]">{s.sector}</span>
                              {s.is_stealth && <span className="text-[9px] bg-gold-400/10 text-gold-400 border border-gold-400/20 px-2 py-0.5 rounded-lg font-black tracking-widest uppercase">Stealth Accumulation</span>}
                           </div>
                           <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
                              <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" /> {fmtRp(s.price)}</span>
                              <span className="w-1 h-1 rounded-full bg-white/10" />
                              <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> Flow Velocity: {s.institutional_flow?.toFixed(1)}</span>
                           </div>
                        </div>

                        <div className="text-right shrink-0">
                           <div className={`text-lg font-black ${s.price_chg_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                             {s.price_chg_pct > 0 ? '+' : ''}{s.price_chg_pct.toFixed(2)}%
                           </div>
                           <ArrowRightLeft className="w-4 h-4 text-white/10 ml-auto mt-2 group-hover:text-gold-400 transition-colors" />
                        </div>
                     </div>
                   </Link>
                 ))}
               </div>
            </div>

            {/* KSEI Alerts Sidebar */}
            <div className="lg:col-span-5 space-y-4">
               <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-gold-400" />
                    <h3 className="font-black text-white uppercase tracking-widest text-xs">Real-Time Whale Tracker</h3>
                  </div>
               </div>
               
               <div className="glass rounded-3xl border border-white/5 divide-y divide-white/5 overflow-hidden">
                  {kseiAlerts.map((a: any, i: number) => {
                    const isAccum = Number(a.scripless_diff) > 0
                    return (
                      <div key={i} className="p-5 hover:bg-white/[0.02] transition-colors group/alert">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2.5 mb-2">
                              <Link href={`/stock/${a.share_code}`} className="text-lg font-black text-white hover:text-gold-400 transition-colors leading-none">{a.share_code}</Link>
                              <div className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                                isAccum ? 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20' : 'bg-red-400/10 text-red-400 border-red-400/20'
                              }`}>
                                {isAccum ? 'Strategic Accum' : 'Position Reduction'}
                              </div>
                            </div>
                            <h5 className="text-xs font-bold text-slate-200 truncate">{a.investor_name}</h5>
                            <div className="flex items-center gap-2 mt-1.5 opacity-60">
                               <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{a.investor_type}</span>
                               <span className="w-1 h-1 rounded-full bg-white/20" />
                               <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{a.new_date}</span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                             <p className={`text-lg font-black leading-none ${isAccum ? 'text-emerald-400' : 'text-red-400'}`}>
                               {isAccum ? '+' : ''}{fmtNum(Math.abs(Number(a.scripless_diff)))}
                             </p>
                             <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-2">Shares Delta</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <Link href="/flow" className="block p-4 text-center text-[10px] font-black text-gold-400 hover:text-white hover:bg-white/5 transition-all uppercase tracking-widest">
                    Access Complete Flow Intelligence →
                  </Link>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 2: KSEI 5% FLOW ==================== */}
      {activeTab === 'ksei5' && ksei5Data && (
        <div className="space-y-8 animate-fade-in">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { title: 'Whale Accumulation', value: fmtRp(ksei5Data.totalBuy), icon: TrendingUp, color: 'text-emerald-400', desc: 'Total Buy >5%' },
              { title: 'Whale Distribution', value: fmtRp(ksei5Data.totalSell), icon: TrendingDown, color: 'text-red-400', desc: 'Total Sell >5%' },
              { title: 'Net Institutional Flow', value: fmtRp(ksei5Data.netFlow), icon: ArrowRightLeft, color: ksei5Data.netFlow >= 0 ? 'text-emerald-400' : 'text-red-400', desc: 'Net Strategic Move' },
              { title: 'Strategic Emitens', value: ksei5Data.activeStocks, icon: Target, color: 'text-blue-400', desc: 'Active stock coverage' },
            ].map((m, i) => {
              const Icon = m.icon
              return (
                <div key={i} className="glass rounded-3xl p-6 border border-white/5 hover:border-gold-400/30 transition-all duration-500 group">
                  <div className="flex items-center justify-between mb-4">
                    <div className={`w-10 h-10 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-center`}>
                       <Icon className={`w-5 h-5 ${m.color}`} />
                    </div>
                    <span className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">{m.desc}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">{m.title}</p>
                  <p className={`text-2xl font-black mt-1 ${m.color}`}>{m.value}</p>
                </div>
              )
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Konglomerat Intelligence */}
            <div className="lg:col-span-7 glass rounded-[2.5rem] p-8 border border-white/10 relative overflow-hidden group/konglo">
              <div className="absolute top-0 right-0 w-64 h-64 bg-gold-500/5 rounded-full blur-[80px] -mr-20 -mt-20" />
              <div className="flex items-center justify-between mb-8 relative z-10">
                <div>
                   <h3 className="font-black text-xl text-white tracking-tight">Konglomerat Power Map</h3>
                   <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Strategic Value Concentration</p>
                </div>
                <Link href="/flow?tab=konglo" className="text-[10px] font-black text-gold-400 hover:text-white transition-colors uppercase tracking-widest">Full Network Analysis →</Link>
              </div>
              
              <div className="space-y-5 relative z-10">
                {ksei5Data.topKonglo.map((item: any, i: number) => {
                  const maxVal = ksei5Data.topKonglo[0]?.value || 1
                  const pct = (item.value / maxVal) * 100
                  return (
                    <div key={i} className="group/item">
                      <div className="flex justify-between items-end mb-2">
                        <div className="flex items-center gap-3">
                           <span className="text-xs font-black text-white/20 group-hover/item:text-gold-400/40 transition-colors w-4">{i+1}</span>
                           <span className="text-sm font-black text-slate-200 group-hover/item:text-white transition-colors uppercase tracking-tight">{item.name}</span>
                        </div>
                        <span className="text-sm font-black text-gold-400">{fmtRp(item.value)}</span>
                      </div>
                      <div className="w-full h-2.5 bg-white/[0.03] rounded-full overflow-hidden border border-white/5">
                        <div className="h-full bg-gradient-to-r from-gold-500 to-yellow-600 rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(231,183,51,0.2)]" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Action Distribution */}
            <div className="lg:col-span-5 glass rounded-[2.5rem] p-8 border border-white/10 flex flex-col group/actions">
               <h3 className="font-black text-xl text-white tracking-tight mb-2">Strategic Action Pulse</h3>
               <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-8">Whale Sentiment Breakdown</p>
               
               <div className="flex-1 min-h-[300px] relative">
                 <ResponsiveContainer width="100%" height="100%">
                   <PieChart>
                     <Pie 
                       data={ksei5Data.actionBreakdown} 
                       cx="50%" cy="45%" 
                       innerRadius={70} 
                       outerRadius={100} 
                       paddingAngle={8} 
                       dataKey="value"
                       stroke="none"
                     >
                       {ksei5Data.actionBreakdown.map((_: any, idx: number) => (
                         <Cell key={idx} fill={COLORS[idx % COLORS.length]} className="hover:opacity-80 transition-opacity cursor-pointer outline-none" />
                       ))}
                     </Pie>
                     <Tooltip 
                        contentStyle={{ background: 'rgba(11,15,25,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px' }}
                        itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                     />
                   </PieChart>
                 </ResponsiveContainer>
                 
                 {/* Legend Custom */}
                 <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4">
                    {ksei5Data.actionBreakdown.map((item: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{item.name}</span>
                        <span className="text-[10px] font-black text-white ml-auto">{item.value}</span>
                      </div>
                    ))}
                 </div>
               </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[
              { title: 'Institutional Accumulation', data: ksei5Data.topAcc, color: 'text-emerald-400', icon: TrendingUp },
              { title: 'Institutional Reduction', data: ksei5Data.topDist, color: 'text-red-400', icon: TrendingDown },
            ].map((sec, si) => (
              <div key={si} className="glass rounded-[2.5rem] p-8 border border-white/5 hover:border-white/10 transition-all group/list">
                <div className="flex items-center gap-3 mb-8">
                  <div className={`w-10 h-10 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-center`}>
                     <sec.icon className={`w-5 h-5 ${sec.color}`} />
                  </div>
                  <h3 className={`font-black text-lg text-white tracking-tight`}>{sec.title}</h3>
                </div>
                
                <div className="space-y-4">
                  {sec.data.map((item: any, i: number) => {
                    const maxVal = sec.data[0]?.value || 1
                    return (
                      <Link key={i} href={`/stock/${item.stock}`} className="flex flex-col group/row">
                        <div className="flex justify-between items-center mb-2 px-1">
                          <span className="font-mono font-black text-base text-slate-200 group-hover/row:text-gold-400 transition-colors">{item.stock}</span>
                          <span className={`text-sm font-black ${sec.color}`}>{fmtRp(item.value)}</span>
                        </div>
                        <div className="w-full h-1.5 bg-white/[0.03] rounded-full overflow-hidden">
                          <div className={`h-full transition-all duration-1000 ${si === 0 ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${(item.value/maxVal)*100}%`, opacity: 0.6 }} />
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==================== TAB 3: KSEI 1% OWNERSHIP ==================== */}
      {activeTab === 'ksei1' && ksei1Data && (
        <div className="space-y-8 animate-fade-in">
          {/* Macro Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { title: 'Coverage Monitor', value: ksei1Data.totalEmiten, icon: Building2, color: 'text-blue-400', desc: 'Strategic Emitens' },
              { title: 'Foreign Appetite', value: `${ksei1Data.foreignPct.toFixed(1)}%`, icon: Globe, color: 'text-cyan-400', desc: 'Aggregated F-Ownership' },
              { title: 'Local Dominance', value: `${ksei1Data.localPct.toFixed(1)}%`, icon: ShieldCheck, color: 'text-gold-400', desc: 'Aggregated L-Ownership' },
              { title: 'Managed Liquidity', value: fmtNum(ksei1Data.totalShares), icon: Activity, color: 'text-purple-400', desc: 'Strategic Share Count' },
            ].map((m, i) => (
              <div key={i} className="glass rounded-3xl p-6 border border-white/5 group">
                <div className="flex items-center justify-between mb-4">
                    <div className={`w-10 h-10 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-center`}>
                       <m.icon className={`w-5 h-5 ${m.color}`} />
                    </div>
                    <span className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">{m.desc}</span>
                </div>
                <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">{m.title}</p>
                <p className={`text-2xl font-black mt-1 ${m.color}`}>{m.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Foreign Strongholds */}
            <div className="glass rounded-[2.5rem] p-8 border border-white/10 hover:border-cyan-500/20 transition-all group/foreign">
              <div className="flex items-center justify-between mb-8">
                 <div>
                    <h3 className="font-black text-xl text-white tracking-tight">Foreign Strongholds</h3>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Highest Foreign Concentration</p>
                 </div>
                 <Globe className="w-6 h-6 text-cyan-400 opacity-20 group-hover/foreign:opacity-100 transition-opacity" />
              </div>
              <div className="h-[350px] relative z-10">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ksei1Data.topForeign} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis type="number" hide />
                    <YAxis dataKey="code" type="category" tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: '900' }} width={60} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ background: '#0B0F19', border: '1px solid #1E293B', borderRadius: '12px' }} />
                    <Bar dataKey="foreign" fill="#06b6d4" radius={[0, 8, 8, 0]} barSize={24} animationDuration={1500} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Strategic Concentration */}
            <div className="glass rounded-[2.5rem] p-8 border border-white/10 hover:border-red-500/20 transition-all group/conc">
              <div className="flex items-center justify-between mb-8">
                 <div>
                    <h3 className="font-black text-xl text-white tracking-tight">Strategic Concentration</h3>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Total Institutional Density</p>
                 </div>
                 <Target className="w-6 h-6 text-red-400 opacity-20 group-hover/conc:opacity-100 transition-opacity" />
              </div>
              <div className="h-[350px] relative z-10">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ksei1Data.topConcentration} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis type="number" hide />
                    <YAxis dataKey="code" type="category" tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: '900' }} width={60} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ background: '#0B0F19', border: '1px solid #1E293B', borderRadius: '12px' }} />
                    <Bar dataKey="total" fill="#ef4444" radius={[0, 8, 8, 0]} barSize={24} animationDuration={1500} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Top Institutional Investors */}
          <div className="glass rounded-[2.5rem] p-8 border border-white/10 relative overflow-hidden group/investors">
             <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/5 rounded-full blur-[100px] -mr-48 -mt-48" />
             <div className="flex items-center justify-between mb-8 relative z-10">
                <div>
                   <h3 className="font-black text-xl text-white tracking-tight">Institutional Power Players</h3>
                   <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Investors with widest portfolio coverage</p>
                </div>
                <ShieldCheck className="w-6 h-6 text-purple-400 opacity-20 group-hover/investors:opacity-100 transition-opacity" />
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 relative z-10">
                {ksei1Data.topInvestors.map((inv: any, i: number) => (
                  <div key={i} className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-gold-400/20 transition-all group/inv">
                    <div className="flex items-start justify-between mb-3">
                       <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">#{i+1} RANK</span>
                       <div className="px-2 py-0.5 rounded bg-white/[0.05] text-[8px] font-black text-muted-foreground uppercase">{inv.type}</div>
                    </div>
                    <h5 className="font-black text-slate-200 group-hover/inv:text-white transition-colors leading-snug line-clamp-1">{inv.name}</h5>
                    <div className="mt-4 flex items-center justify-between">
                       <span className="text-[10px] font-bold text-muted-foreground uppercase">Portfolio Scope</span>
                       <span className="text-sm font-black text-gold-400">{inv.emiten} Stocks</span>
                    </div>
                  </div>
                ))}
             </div>
          </div>
        </div>
      )}
    </div>
  )
}
