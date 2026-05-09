'use client'

import React, { useState, useEffect } from 'react'
import {
  Activity, TrendingUp, TrendingDown, DollarSign, BarChart3,
  ShieldCheck, Zap, Building2, Globe, Target, Clock, ArrowRightLeft,
  AlertTriangle, CheckCircle2, MinusCircle, XCircle,
  BarChart2, Layers, Bell, ChevronUp, ChevronDown
} from 'lucide-react'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend
} from 'recharts'
import { supabase } from '@/lib/supabase'

// ─── HELPER FUNCTIONS & CONFIGS ──────────────────────────────────────────────

const COLORS = ['#22c55e', '#8b5cf6', '#ef4444', '#e7b733', '#64748b', '#06b6d4', '#ec4899']

function fmtRp(v: number): string {
  if (!v) return 'Rp 0'
  const absV = Math.abs(v)
  if (absV >= 1e12) return `Rp ${(v / 1e12).toFixed(2)}T`
  if (absV >= 1e9) return `Rp ${(v / 1e9).toFixed(2)}M`
  if (absV >= 1e6) return `Rp ${(v / 1e6).toFixed(0)}Jt`
  return `Rp ${v.toLocaleString('id-ID')}`
}

function fmtNum(v: number): string {
  if (!v) return '0'
  const absV = Math.abs(v)
  if (absV >= 1e9) return `${(v / 1e9).toFixed(2)}B`
  if (absV >= 1e6) return `${(v / 1e6).toFixed(2)}M`
  if (absV >= 1e3) return `${(v / 1e3).toFixed(0)}K`
  return v.toLocaleString('id-ID')
}

const MOMENTUM_CFG: Record<string, { bg: string; border: string; text: string; badge: string; icon: React.ReactNode }> = {
  STRONG_BUY:  { bg: 'bg-emerald-500/10', border: 'border-emerald-500/40', text: 'text-emerald-400', badge: 'bg-emerald-500/20 text-emerald-300', icon: <ChevronUp className="w-3 h-3" /> },
  BUY:         { bg: 'bg-green-500/10',   border: 'border-green-500/30',   text: 'text-green-400',   badge: 'bg-green-500/20 text-green-300',   icon: <ChevronUp className="w-3 h-3" /> },
  NEUTRAL:     { bg: 'bg-slate-500/10',   border: 'border-slate-500/30',   text: 'text-slate-400',   badge: 'bg-slate-500/20 text-slate-300',   icon: <MinusCircle className="w-3 h-3" /> },
  SELL:        { bg: 'bg-red-500/10',     border: 'border-red-500/30',     text: 'text-red-400',     badge: 'bg-red-500/20 text-red-300',       icon: <ChevronDown className="w-3 h-3" /> },
  STRONG_SELL: { bg: 'bg-rose-500/10',    border: 'border-rose-500/40',    text: 'text-rose-400',    badge: 'bg-rose-500/20 text-rose-300',     icon: <ChevronDown className="w-3 h-3" /> },
}
function getMomentumCfg(m: string) { return MOMENTUM_CFG[m?.toUpperCase()] ?? MOMENTUM_CFG.NEUTRAL }

const SIGNAL_CFG: Record<string, { cls: string; icon: React.ReactNode }> = {
  STRONG_BUY: { cls: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40', icon: <CheckCircle2 className="w-3 h-3" /> },
  WATCH:      { cls: 'bg-amber-500/20 text-amber-300 border border-amber-500/40',       icon: <AlertTriangle className="w-3 h-3" /> },
  NEUTRAL:    { cls: 'bg-slate-500/20 text-slate-300 border border-slate-500/30',       icon: <MinusCircle className="w-3 h-3" /> },
  AVOID:      { cls: 'bg-red-500/20 text-red-300 border border-red-500/40',             icon: <XCircle className="w-3 h-3" /> },
}
function getSignalCfg(s: string) { return SIGNAL_CFG[s] ?? SIGNAL_CFG.NEUTRAL }

const ALERT_CFG: Record<string, { cls: string; dot: string }> = {
  HIGH:   { cls: 'bg-red-500/20 text-red-300 border border-red-500/40',       dot: 'bg-red-400' },
  MEDIUM: { cls: 'bg-amber-500/20 text-amber-300 border border-amber-500/40', dot: 'bg-amber-400' },
  LOW:    { cls: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',    dot: 'bg-blue-400' },
}
function getAlertCfg(a: string) { return ALERT_CFG[a] ?? ALERT_CFG.LOW }

// ─── RECHARTS CUSTOM TOOLTIP ───────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-navy-900/90 border border-border/50 backdrop-blur-md p-3 rounded-xl shadow-xl">
        <p className="text-foreground font-bold mb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-sm font-medium" style={{ color: entry.color }}>
            {entry.name}: {entry.name.toLowerCase().includes('ownership') || entry.name.toLowerCase().includes('pct') 
              ? `${entry.value.toFixed(2)}%` 
              : fmtRp(entry.value)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

type TabType = 'market' | 'ksei5' | 'ksei1'

export default function MarketOverview() {
  const [activeTab, setActiveTab]             = useState<TabType>('market')
  const [loading, setLoading]                 = useState(true)
  const [latestTxDate, setLatestTxDate]       = useState('')
  const [latestKsei5Date, setLatestKsei5Date] = useState('')
  const [latestKsei1Date, setLatestKsei1Date] = useState('')

  const [marketData, setMarketData]           = useState<any>(null)
  const [sectorData, setSectorData]           = useState<any[]>([])
  const [convictionData, setConvictionData]   = useState<any[]>([])
  const [kseiAlerts, setKseiAlerts]           = useState<any[]>([])
  const [ksei5Data, setKsei5Data]             = useState<any>(null)
  const [ksei1Data, setKsei1Data]             = useState<any>(null)

  useEffect(() => { fetchAllData() }, [])

  async function fetchAllData() {
    setLoading(true)
    await Promise.all([
      fetchMarketPulse(),
      fetchSectorRotation(),
      fetchHighConviction(),
      fetchKseiMovementAlert(),
      fetchKsei5(),
      fetchKsei1(),
    ])
    setLoading(false)
  }

  // Fetch Functions (Kept exactly as original for logic, optimized assignments)
  async function fetchMarketPulse() {
    try {
      const { data: dateData } = await supabase.from('daily_transactions').select('trading_date').order('trading_date', { ascending: false }).limit(1)
      const date = dateData?.[0]?.trading_date
      if (!date) return
      setLatestTxDate(date)

      const { data } = await supabase.from('daily_transactions')
        .select('stock_code,close,change_percent,volume,value,net_foreign_value,aov_ratio_ma20,whale_signal,signal')
        .eq('trading_date', date).gt('volume', 0).limit(2000)
      if (!data) return

      let totalForeign = 0, totalValue = 0
      const gainers: any[] = [], losers: any[] = []
      const foreignBuy: any[] = [], foreignSell: any[] = [], spikes: any[] = []
      const topVolList: any[] = [], topValList: any[] = []
      let up = 0, down = 0

      data.forEach((r: any) => {
        const netF = Number(r.net_foreign_value) || 0
        const vol  = Number(r.volume) || 0
        const val  = Number(r.value) || 0
        const pct  = Number(r.change_percent) || 0
        totalForeign += netF; totalValue += val
        if (pct > 0) up++; else if (pct < 0) down++
        if (pct > 0) gainers.push({ code: r.stock_code, close: Number(r.close), change: pct, value: val })
        if (pct < 0) losers.push({ code: r.stock_code, close: Number(r.close), change: pct, value: val })
        if (netF > 0) foreignBuy.push({ code: r.stock_code, close: Number(r.close), netForeign: netF })
        if (netF < 0) foreignSell.push({ code: r.stock_code, close: Number(r.close), netForeign: Math.abs(netF) })
        if ((Number(r.aov_ratio_ma20) || 0) >= 1.5) spikes.push({ code: r.stock_code, close: Number(r.close), aov: Number(r.aov_ratio_ma20), change: pct })
        topVolList.push({ code: r.stock_code, close: Number(r.close), volume: vol, change: pct })
        topValList.push({ code: r.stock_code, close: Number(r.close), value: val, change: pct })
      })

      setMarketData({
        totalForeign, totalValue, up, down,
        gainers:    gainers.sort((a, b) => b.change - a.change).slice(0, 10),
        losers:     losers.sort((a, b) => a.change - b.change).slice(0, 10),
        foreignBuy: foreignBuy.sort((a, b) => b.netForeign - a.netForeign).slice(0, 10),
        foreignSell:foreignSell.sort((a, b) => b.netForeign - a.netForeign).slice(0, 10),
        spikes:     spikes.sort((a, b) => b.aov - a.aov).slice(0, 7),
        topVolume:  topVolList.sort((a, b) => b.volume - a.volume).slice(0, 10),
        topValue:   topValList.sort((a, b) => b.value - a.value).slice(0, 10),
      })
    } catch (e) { console.error('fetchMarketPulse', e) }
  }

  async function fetchSectorRotation() {
    try {
      const { data } = await supabase.rpc('get_sector_rotation')
      setSectorData(data ?? [])
    } catch (e) { console.error('fetchSectorRotation', e) }
  }

  async function fetchHighConviction() {
    try {
      const { data } = await supabase.rpc('scan_high_conviction')
      const sorted = (data ?? []).sort((a: any, b: any) => (Number(b.conviction_score) || 0) - (Number(a.conviction_score) || 0)).slice(0, 10)
      setConvictionData(sorted)
    } catch (e) { console.error('fetchHighConviction', e) }
  }

  async function fetchKseiMovementAlert() {
    try {
      const { data } = await supabase.rpc('get_ksei_movement_alert')
      setKseiAlerts(data ?? [])
    } catch (e) { console.error('fetchKseiMovementAlert', e) }
  }

  async function fetchKsei5() {
    try {
      const { data: dateData } = await supabase.from('ksei_data5_mutasi').select('tanggal_data').order('tanggal_data', { ascending: false }).limit(1)
      const date = dateData?.[0]?.tanggal_data
      if (!date) return
      setLatestKsei5Date(date)

      const { data } = await supabase.from('ksei_data5_mutasi').select('kode_efek,aksi,transaction_value,konglomerasi').eq('tanggal_data', date).limit(3000)
      if (!data) return

      let totalBuy = 0, totalSell = 0
      const stockMap = new Map<string, number>()
      const actionCount: any = {}
      const kongloMap  = new Map<string, number>()

      data.forEach((r: any) => {
        const tv = Number(r.transaction_value) || 0
        if (r.aksi === 'Buying' || r.aksi === 'Accumulation') {
          totalBuy += tv; stockMap.set(r.kode_efek, (stockMap.get(r.kode_efek) || 0) + tv)
        } else if (r.aksi === 'Reduction') {
          totalSell += tv; stockMap.set(r.kode_efek, (stockMap.get(r.kode_efek) || 0) - tv)
        }
        if (r.aksi !== 'Holding' && r.aksi !== 'Skip') actionCount[r.aksi] = (actionCount[r.aksi] || 0) + 1
        if (r.konglomerasi && r.konglomerasi !== '-' && tv > 0) kongloMap.set(r.konglomerasi, (kongloMap.get(r.konglomerasi) || 0) + tv)
      })

      setKsei5Data({
        totalBuy, totalSell, netFlow: totalBuy - totalSell,
        activeStocks: new Set(data.map((r: any) => r.kode_efek)).size,
        actionBreakdown: Object.entries(actionCount).map(([name, value]) => ({ name, value })),
        topAcc:   Array.from(stockMap.entries()).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([s, v]) => ({ stock: s, value: v })),
        topDist:  Array.from(stockMap.entries()).filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]).slice(0, 10).map(([s, v]) => ({ stock: s, value: Math.abs(v) })),
        topKonglo:Array.from(kongloMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n, v]) => ({ name: n, value: v })),
      })
    } catch (e) { console.error('fetchKsei5', e) }
  }

  async function fetchKsei1() {
    try {
      const { data: dateData } = await supabase.from('ksei_data1persen_mutasi').select('date').order('date', { ascending: false }).limit(1)
      const date = dateData?.[0]?.date
      if (!date) return
      setLatestKsei1Date(date)

      const { data } = await supabase.from('ksei_data1persen_mutasi').select('share_code,investor_name,investor_type,local_foreign,total_holding_shares,percentage').eq('date', date).limit(5000)
      if (!data) return

      let foreignPct = 0, localPct = 0, totalShares = 0
      const stockMap    = new Map<string, { code: string; foreign: number; local: number; total: number }>()
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
        topForeign:       Array.from(stockMap.values()).sort((a, b) => b.foreign - a.foreign).slice(0, 10),
        topConcentration: Array.from(stockMap.values()).sort((a, b) => b.total - a.total).slice(0, 10),
        topInvestors:     Array.from(investorMap.values()).sort((a, b) => b.emiten - a.emiten).slice(0, 10),
      })
    } catch (e) { console.error('fetchKsei1', e) }
  }

  const tabs = [
    { id: 'market' as TabType, label: 'Market Pulse', icon: Activity,  date: latestTxDate },
    { id: 'ksei5'  as TabType, label: 'KSEI 5% Flow', icon: Building2, date: latestKsei5Date },
    { id: 'ksei1'  as TabType, label: '1% Ownership', icon: Globe,     date: latestKsei1Date },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 border-4 border-gold-400/20 rounded-full" />
            <div className="absolute inset-0 border-4 border-gold-400 border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-gold-400 font-medium animate-pulse">Loading Market Intelligence...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-10 animate-fade-in">

      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative">
        <div className="absolute -top-20 -left-20 w-64 h-64 bg-gold-500/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute -top-20 right-20 w-64 h-64 bg-blue-500/10 rounded-full blur-[100px] pointer-events-none" />
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

      {/* TABS NAVIGATION */}
      <div className="glass rounded-2xl p-1.5 flex gap-1 overflow-x-auto border border-border/40 shadow-lg scrollbar-hide">
        {tabs.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2.5 px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-300 whitespace-nowrap relative flex-1 justify-center md:flex-none ${
                isActive ? 'bg-gradient-to-r from-gold-400 to-yellow-500 text-navy-900 shadow-lg shadow-gold-400/20'
                         : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              }`}>
              <Icon className={`w-4 h-4 ${isActive ? 'text-navy-900' : ''}`} />
              {tab.label}
              {isActive && <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-10 h-1 bg-gold-400 rounded-full hidden md:block" />}
            </button>
          )
        })}
      </div>

      {/* DATE INDICATOR */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-accent/20 w-fit px-3 py-1.5 rounded-lg border border-border/30">
        <Clock className="w-3.5 h-3.5" />
        <span className="font-medium">
          {activeTab === 'market' && `Latest Trading: ${latestTxDate}`}
          {activeTab === 'ksei5'  && `Latest KSEI 5%: ${latestKsei5Date}`}
          {activeTab === 'ksei1'  && `Latest KSEI 1%: ${latestKsei1Date}`}
        </span>
      </div>

      {/* ── RENDERING SUB-VIEWS ── */}
      {activeTab === 'market' && marketData && (
        <MarketPulseView 
          marketData={marketData} 
          sectorData={sectorData} 
          convictionData={convictionData} 
          kseiAlerts={kseiAlerts} 
        />
      )}

      {activeTab === 'ksei5' && ksei5Data && (
        <Ksei5View ksei5Data={ksei5Data} />
      )}

      {activeTab === 'ksei1' && ksei1Data && (
        <Ksei1View ksei1Data={ksei1Data} />
      )}

    </div>
  )
}

// ─── SUB-COMPONENTS (Tujuannya agar file lebih rapi dan modular) ─────────────

function MarketPulseView({ marketData, sectorData, convictionData, kseiAlerts }: any) {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Row 1: Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { title: 'Market Breadth', value: `${marketData.up}↑  ${marketData.down}↓`, icon: BarChart3,    color: 'text-blue-400',   sub: 'Advancers vs Decliners' },
          { title: 'Total Turnover', value: fmtRp(marketData.totalValue),              icon: DollarSign,  color: 'text-gold-400',   sub: 'Daily value traded' },
          { title: 'Net Foreign',    value: fmtRp(marketData.totalForeign),            icon: Globe,       color: marketData.totalForeign >= 0 ? 'text-green-400' : 'text-red-400', sub: marketData.totalForeign >= 0 ? 'Inflow' : 'Outflow' },
          { title: 'AOV Spikes',     value: marketData.spikes.length,                  icon: Zap,         color: 'text-purple-400', sub: 'Whale signals today' },
        ].map((m, i) => {
          const Icon = m.icon
          return (
            <div key={i} className="glass rounded-2xl p-5 border border-border/40 hover:border-gold-400/30 transition-all duration-300 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                 <Icon className="w-16 h-16" />
              </div>
              <div className="flex items-center justify-between mb-3 relative z-10">
                <div className={`p-2 rounded-lg bg-accent/30 ${m.color}`}><Icon className="w-4 h-4" /></div>
                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{m.sub}</span>
              </div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider relative z-10">{m.title}</p>
              <p className={`text-2xl font-black mt-1 relative z-10 ${m.color}`}>{m.value}</p>
            </div>
          )
        })}
      </div>

      {/* Row 2: Top Volume & Top Value */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {[
          { title: '📊 Top Volume', icon: BarChart2, iconColor: 'text-cyan-400', border: 'border-cyan-500/20', bg: 'bg-cyan-500/5', data: marketData.topVolume, valKey: 'volume', valFmt: (v: number) => fmtNum(v), valColor: 'text-cyan-400', barColor: 'bg-cyan-400', label: 'lot' },
          { title: '💰 Top Value',  icon: DollarSign,iconColor: 'text-gold-400', border: 'border-gold-500/20', bg: 'bg-gold-500/5', data: marketData.topValue,  valKey: 'value',  valFmt: (v: number) => fmtRp(v),   valColor: 'text-gold-400', barColor: 'bg-gold-400', label: '' },
        ].map((sec, si) => {
          const Icon = sec.icon
          const maxVal = sec.data[0]?.[sec.valKey] || 1
          return (
            <div key={si} className={`glass rounded-2xl overflow-hidden border ${sec.border} hover:border-gold-400/30 transition-all duration-300`}>
              <div className={`${sec.bg} px-5 py-3.5 border-b ${sec.border} flex items-center gap-2`}>
                <Icon className={`w-4 h-4 ${sec.iconColor}`} />
                <h3 className={`font-bold text-sm ${sec.iconColor}`}>{sec.title}</h3>
              </div>
              <div className="divide-y divide-border/20">
                {sec.data.map((s: any, i: number) => (
                  <Link key={i} href={`/stock/${s.code}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-accent/20 transition-colors group">
                    <span className="text-xs text-muted-foreground w-4 font-mono text-center">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="font-mono font-black text-sm text-foreground group-hover:text-gold-400 transition-colors">{s.code}</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-accent/40 ${s.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {s.change > 0 ? '+' : ''}{s.change?.toFixed(2)}%
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-1.5 bg-accent/50 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${sec.barColor} transition-all duration-500`} style={{ width: `${(s[sec.valKey] / maxVal) * 100}%` }} />
                        </div>
                        <span className={`text-xs font-bold ${sec.valColor} whitespace-nowrap min-w-[70px] text-right`}>
                          {sec.valFmt(s[sec.valKey])} <span className="text-[10px] text-muted-foreground">{sec.label}</span>
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Row 3: Sector Rotation */}
      {sectorData.length > 0 && (
        <div className="glass rounded-2xl overflow-hidden border border-purple-500/20 hover:border-gold-400/30 transition-all duration-300">
          <div className="bg-purple-500/5 px-5 py-4 border-b border-purple-500/20 flex items-center gap-2">
            <Layers className="w-4 h-4 text-purple-400" />
            <h3 className="font-bold text-sm text-purple-400">🌀 Sector Rotation</h3>
            <span className="ml-auto text-[10px] text-muted-foreground uppercase font-bold tracking-widest hidden sm:inline-block">Color-coded by momentum</span>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {sectorData.map((sec: any, i: number) => {
                const momentum = sec.momentum ?? sec.label ?? sec.trend ?? 'NEUTRAL'
                const cfg = getMomentumCfg(momentum)
                const chg = Number(sec.avg_change_pct ?? sec.avg_return ?? sec.avg_change ?? sec.return_pct ?? 0)
                const sectorName = sec.sector ?? sec.sector_name ?? sec.name ?? '—'
                return (
                  <div key={i} className={`${cfg.bg} border ${cfg.border} rounded-xl p-3.5 flex flex-col gap-2 hover:scale-[1.02] transition-all duration-200 cursor-default shadow-sm`}>
                    <div className="flex items-start justify-between gap-1 mb-1">
                      <p className="text-xs font-bold text-foreground leading-tight line-clamp-2" title={sectorName}>{sectorName}</p>
                      <span className={`flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${cfg.badge}`}>
                        {cfg.icon}{momentum.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex items-end justify-between mt-auto">
                      <div>
                        <p className={`text-lg font-black leading-none ${chg >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
                        </p>
                      </div>
                      {sec.total_value && (
                        <p className="text-[10px] text-muted-foreground text-right">{fmtRp(Number(sec.total_value))}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Row 4: Gainers / Losers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[
          { title: '🔥 Top 10 Gainers', data: marketData.gainers, color: 'text-green-400', bg: 'bg-green-500/5', border: 'border-green-500/20' },
          { title: '❄️ Top 10 Losers',  data: marketData.losers,  color: 'text-red-400',   bg: 'bg-red-500/5',   border: 'border-red-500/20' },
        ].map((sec, si) => (
          <div key={si} className={`glass rounded-2xl overflow-hidden border ${sec.border} hover:border-gold-400/30 transition-all duration-300`}>
            <div className={`${sec.bg} px-5 py-3 border-b ${sec.border}`}>
              <h3 className={`font-bold text-sm ${sec.color}`}>{sec.title}</h3>
            </div>
            <div className="divide-y divide-border/20">
              {sec.data.map((s: any, i: number) => (
                <Link key={i} href={`/stock/${s.code}`} className="flex items-center justify-between p-4 hover:bg-accent/20 transition-colors group">
                  <div>
                    <span className="font-mono font-black text-foreground group-hover:text-gold-400 transition-colors">{s.code}</span>
                    <span className="text-xs text-muted-foreground ml-3 bg-accent/30 px-2 py-0.5 rounded">Rp {s.close?.toLocaleString('id-ID')}</span>
                  </div>
                  <span className={`font-bold ${sec.color}`}>{s.change > 0 ? '+' : ''}{s.change?.toFixed(2)}%</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Row 5: High Conviction Table */}
      {convictionData.length > 0 && (
        <div className="glass rounded-2xl overflow-hidden border border-amber-500/20 hover:border-gold-400/30 transition-all duration-300">
          <div className="bg-amber-500/5 px-5 py-4 border-b border-amber-500/20 flex items-center gap-2">
            <Target className="w-4 h-4 text-amber-400" />
            <h3 className="font-bold text-sm text-amber-400">🎯 High Conviction Picks</h3>
          </div>
          <div className="overflow-x-auto scrollbar-hide">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border/20 bg-accent/10">
                  {['Stock', 'Sector', 'Price', 'Chg%', 'Conviction', 'Smart$', 'Signal', 'Flags'].map(h => (
                    <th key={h} className="px-5 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/10">
                {convictionData.map((s: any, i: number) => {
                  const sig   = getSignalCfg(s.signal)
                  const score = Number(s.conviction_score) || 0
                  return (
                    <tr key={i} className="hover:bg-accent/20 transition-colors group">
                      <td className="px-5 py-4">
                        <Link href={`/stock/${s.stock_code}`} className="font-mono font-black text-foreground group-hover:text-gold-400 transition-colors">
                          {s.stock_code}
                        </Link>
                      </td>
                      <td className="px-5 py-4 text-xs text-muted-foreground max-w-[130px] truncate" title={s.sector}>{s.sector ?? '—'}</td>
                      <td className="px-5 py-4 text-sm font-semibold text-foreground whitespace-nowrap">
                        Rp {Number(s.current_price)?.toLocaleString('id-ID')}
                      </td>
                      <td className={`px-5 py-4 text-sm font-bold whitespace-nowrap ${Number(s.price_chg_pct) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {Number(s.price_chg_pct) > 0 ? '+' : ''}{Number(s.price_chg_pct)?.toFixed(2)}%
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-accent rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full" style={{ width: `${Math.min(score * 10, 100)}%` }} />
                          </div>
                          <span className="text-xs font-black text-amber-400">{score.toFixed(1)}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-xs font-bold text-purple-400 bg-purple-500/10 px-2 py-1 rounded-md">{Number(s.smart_money_score)?.toFixed(1)}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${sig.cls}`}>
                          {sig.icon}{s.signal}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex gap-1.5 flex-wrap">
                          {s.whale_signal     && <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30">🐋</span>}
                          {s.is_stealth       && <span className="text-[10px] px-2 py-0.5 rounded bg-slate-500/20 text-slate-300 font-bold border border-slate-500/30">STEALTH</span>}
                          {s.big_player_anomaly&& <span className="text-[10px] px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 font-bold border border-orange-500/30">BIG</span>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function Ksei5View({ ksei5Data }: any) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { title: 'Total Buy',     value: fmtRp(ksei5Data.totalBuy),   icon: TrendingUp,    color: 'text-green-400' },
          { title: 'Total Sell',    value: fmtRp(ksei5Data.totalSell),  icon: TrendingDown,  color: 'text-red-400' },
          { title: 'Net Flow',      value: fmtRp(ksei5Data.netFlow),    icon: ArrowRightLeft,color: ksei5Data.netFlow >= 0 ? 'text-green-400' : 'text-red-400' },
          { title: 'Active Stocks', value: ksei5Data.activeStocks,      icon: Target,        color: 'text-blue-400' },
        ].map((m, i) => { 
          const Icon = m.icon; 
          return (
          <div key={i} className="glass rounded-2xl p-5 border border-border/40 hover:border-gold-400/30 transition-all duration-300 relative overflow-hidden group">
            <div className={`p-2 rounded-lg bg-accent/30 w-fit mb-4 ${m.color}`}><Icon className="w-5 h-5" /></div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{m.title}</p>
            <p className={`text-2xl font-black mt-1 ${m.color}`}>{m.value}</p>
          </div>
        )})}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass rounded-2xl p-6 border border-border/40 hover:border-gold-400/30 transition-all duration-300">
          <h3 className="font-bold text-foreground mb-6 flex items-center gap-2">
            <PieChart className="w-4 h-4 text-blue-400" /> Action Breakdown
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={ksei5Data.actionBreakdown} cx="50%" cy="50%" innerRadius={70} outerRadius={100} paddingAngle={4} dataKey="value" stroke="none">
                {ksei5Data.actionBreakdown.map((_: any, idx: number) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} opacity={0.8} />)}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend verticalAlign="bottom" height={36} iconType="circle" />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="glass rounded-2xl p-6 border border-border/40 hover:border-gold-400/30 transition-all duration-300">
          <h3 className="font-bold text-foreground mb-6 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-purple-400" /> Top Konglomerasi
          </h3>
          <div className="space-y-4">
            {ksei5Data.topKonglo.map((item: any, i: number) => {
              const maxVal = ksei5Data.topKonglo[0]?.value || 1
              return (
                <div key={i} className="group">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold text-foreground truncate group-hover:text-gold-400 transition-colors flex items-center gap-2">
                      <span className="text-xs text-muted-foreground font-mono bg-accent/40 px-1.5 py-0.5 rounded">#{i + 1}</span> {item.name}
                    </span>
                    <span className="text-sm font-bold text-gold-400">{fmtRp(item.value)}</span>
                  </div>
                  <div className="w-full h-1.5 bg-accent/50 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-500"
                      style={{ width: `${(item.value / maxVal) * 100}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      
      {/* Accumulation & Distribution Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[
          { title: '🔥 Top Accumulation', data: ksei5Data.topAcc,  color: 'text-green-400', barColor: 'bg-green-400', border: 'border-green-500/20', bg: 'bg-green-500/5' },
          { title: '❄️ Top Distribution', data: ksei5Data.topDist, color: 'text-red-400',   barColor: 'bg-red-400',   border: 'border-red-500/20',   bg: 'bg-red-500/5' },
        ].map((sec, si) => (
          <div key={si} className={`glass rounded-2xl overflow-hidden border ${sec.border} hover:border-gold-400/30 transition-all duration-300`}>
             <div className={`${sec.bg} px-5 py-4 border-b ${sec.border}`}>
              <h3 className={`font-bold text-sm ${sec.color}`}>{sec.title}</h3>
            </div>
            <div className="divide-y divide-border/20">
              {sec.data.map((item: any, i: number) => {
                const maxVal = sec.data[0]?.value || 1
                return (
                  <Link key={i} href={`/stocks?q=${item.stock}`} className="flex justify-between items-center px-5 py-3.5 hover:bg-accent/20 transition-colors group">
                    <span className="font-mono font-black text-foreground group-hover:text-gold-400">{item.stock}</span>
                    <div className="flex items-center gap-4">
                      <div className="w-24 h-1.5 bg-accent/50 rounded-full overflow-hidden hidden sm:block">
                        <div className={`h-full rounded-full ${sec.barColor}`} style={{ width: `${(item.value / maxVal) * 100}%` }} />
                      </div>
                      <span className={`text-sm font-bold min-w-[80px] text-right ${sec.color}`}>{fmtRp(item.value)}</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Ksei1View({ ksei1Data }: any) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { title: 'Total Emiten',      value: ksei1Data.totalEmiten,                 icon: Building2,   color: 'text-blue-400' },
          { title: 'Foreign Ownership', value: `${ksei1Data.foreignPct.toFixed(1)}%`, icon: Globe,       color: 'text-cyan-400' },
          { title: 'Local Ownership',   value: `${ksei1Data.localPct.toFixed(1)}%`,   icon: ShieldCheck, color: 'text-gold-400' },
          { title: 'Total Shares',      value: fmtNum(ksei1Data.totalShares),         icon: BarChart3,   color: 'text-purple-400' },
        ].map((m, i) => { 
          const Icon = m.icon; 
          return (
          <div key={i} className="glass rounded-2xl p-5 border border-border/40 hover:border-gold-400/30 transition-all duration-300 relative group overflow-hidden">
            <div className={`p-2 rounded-lg bg-accent/30 w-fit mb-4 ${m.color}`}><Icon className="w-5 h-5" /></div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{m.title}</p>
            <p className={`text-2xl font-black mt-1 ${m.color}`}>{m.value}</p>
          </div>
        )})}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[
          { title: 'Top 10 Foreign Ownership (%)', data: ksei1Data.topForeign,       key: 'foreign', color: '#06b6d4', icon: <Globe className="w-4 h-4 text-cyan-400"/> },
          { title: 'Top 10 Concentration (%)',     data: ksei1Data.topConcentration, key: 'total',   color: '#ef4444', icon: <Target className="w-4 h-4 text-red-400"/> },
        ].map((chart, ci) => (
          <div key={ci} className="glass rounded-2xl p-6 border border-border/40 hover:border-gold-400/30 transition-all duration-300">
            <h3 className="font-bold text-foreground mb-6 flex items-center gap-2">
              {chart.icon} {chart.title}
            </h3>
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart.data} layout="vertical" margin={{ left: -20, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke="#334155" opacity={0.4} />
                  <XAxis type="number" hide />
                  <YAxis dataKey="code" type="category" tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 'bold' }} width={80} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: '#334155', opacity: 0.2 }} content={<CustomTooltip />} />
                  <Bar dataKey={chart.key} fill={chart.color} radius={[0, 4, 4, 0]} barSize={20}>
                    {chart.data.map((entry:any, index:number) => (
                       <Cell key={`cell-${index}`} fill={chart.color} opacity={0.8 + (index * 0.02)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>

      <div className="glass rounded-2xl p-6 border border-border/40 hover:border-gold-400/30 transition-all duration-300">
        <h3 className="font-bold text-foreground mb-6 flex items-center gap-2">
          <Target className="w-5 h-5 text-gold-400" /> Top Institutional Investors
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {ksei1Data.topInvestors.slice(0, 5).map((inv: any, i: number) => (
            <div key={i} className="p-5 rounded-xl bg-accent/20 border border-border/40 hover:border-gold-400/40 hover:bg-accent/30 transition-all group">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gold-400 to-yellow-600 text-navy-900 flex items-center justify-center font-black text-sm mb-4 shadow-lg shadow-gold-500/20">#{i + 1}</div>
              <p className="text-sm font-bold text-foreground truncate group-hover:text-gold-400 transition-colors" title={inv.name}>{inv.name}</p>
              <p className="text-[10px] text-muted-foreground mt-1 tracking-wider uppercase">{inv.type}</p>
              <div className="mt-4 pt-4 border-t border-border/30">
                <p className="text-2xl font-black text-gold-400 leading-none">{inv.emiten} <span className="text-xs font-medium text-muted-foreground">emitens</span></p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
