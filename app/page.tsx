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

  useEffect(() => { fetchAllData() }, [])

  async function fetchAllData() {
    setLoading(true)
    await Promise.all([fetchMarketPulse(), fetchKsei5(), fetchKsei1()])
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
        .select('stock_code,close,change_percent,value,net_foreign_value,aov_ratio_ma20,whale_signal,signal')
        .eq('trading_date', date)
        .gt('volume', 0)
        .limit(2000)

      if (!data) return

      let totalForeign = 0, totalValue = 0
      const gainers: any[] = [], losers: any[] = [], foreignBuy: any[] = [], foreignSell: any[] = [], spikes: any[] = []
      let up = 0, down = 0

      data.forEach((r: any) => {
        const netF = Number(r.net_foreign_value) || 0
        totalForeign += netF
        totalValue += Number(r.value) || 0
        const pct = Number(r.change_percent) || 0
        if (pct > 0) up++; else if (pct < 0) down++
        if (pct > 0) gainers.push({ code: r.stock_code, close: Number(r.close), change: pct, value: Number(r.value) })
        if (pct < 0) losers.push({ code: r.stock_code, close: Number(r.close), change: pct, value: Number(r.value) })
        if (netF > 0) foreignBuy.push({ code: r.stock_code, close: Number(r.close), netForeign: netF })
        if (netF < 0) foreignSell.push({ code: r.stock_code, close: Number(r.close), netForeign: Math.abs(netF) })
        if ((Number(r.aov_ratio_ma20) || 0) >= 1.5) spikes.push({ code: r.stock_code, close: Number(r.close), aov: Number(r.aov_ratio_ma20), change: pct })
      })

      setMarketData({
        totalForeign, totalValue, up, down,
        gainers: gainers.sort((a, b) => b.change - a.change).slice(0, 10),
        losers: losers.sort((a, b) => a.change - b.change).slice(0, 10),
        foreignBuy: foreignBuy.sort((a, b) => b.netForeign - a.netForeign).slice(0, 10),
        foreignSell: foreignSell.sort((a, b) => b.netForeign - a.netForeign).slice(0, 10),
        spikes: spikes.sort((a, b) => b.aov - a.aov).slice(0, 7)
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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-foreground tracking-tight">
            Market <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-400 to-yellow-200">Overview</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">Multi-source market intelligence hub</p>
        </div>
        <div className="flex items-center gap-3 px-4 py-2 glass rounded-full border border-green-500/30">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse shadow-lg shadow-green-400/50" />
          <span className="text-xs font-bold text-green-400 uppercase tracking-wider">Live Market</span>
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
        <div className="space-y-6 animate-fade-in">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { title: 'Market Breadth', value: `${marketData.up}↑ ${marketData.down}↓`, icon: BarChart3, color: 'text-blue-400', sub: 'Advancers vs Decliners' },
              { title: 'Total Turnover', value: fmtRp(marketData.totalValue), icon: DollarSign, color: 'text-gold-400', sub: 'Daily value traded' },
              { title: 'Net Foreign', value: fmtRp(marketData.totalForeign), icon: Globe, color: marketData.totalForeign >= 0 ? 'text-green-400' : 'text-red-400', sub: marketData.totalForeign >= 0 ? 'Inflow' : 'Outflow' },
              { title: 'AOV Spikes', value: marketData.spikes.length, icon: Zap, color: 'text-purple-400', sub: 'Whale signals today' },
            ].map((m, i) => {
              const Icon = m.icon
              return (
                <div key={i} className="glass rounded-2xl p-5 card-hover border border-border/30 hover:border-gold-400/30 transition-all duration-300">
                  <div className="flex items-center justify-between mb-3">
                    <Icon className={`w-5 h-5 ${m.color}`} />
                    <span className="text-[10px] text-muted-foreground uppercase font-bold">{m.sub}</span>
                  </div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">{m.title}</p>
                  <p className={`text-2xl font-black mt-1 ${m.color}`}>{m.value}</p>
                </div>
              )
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[
              { title: '🔥 Top 10 Gainers', data: marketData.gainers, color: 'text-green-400', bg: 'bg-green-500/5', border: 'border-green-500/20' },
              { title: '❄️ Top 10 Losers', data: marketData.losers, color: 'text-red-400', bg: 'bg-red-500/5', border: 'border-red-500/20' },
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
                        <span className="text-xs text-muted-foreground ml-2">Rp {s.close?.toLocaleString('id-ID')}</span>
                      </div>
                      <span className={`font-bold ${sec.color}`}>{s.change > 0 ? '+' : ''}{s.change?.toFixed(2)}%</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 glass rounded-2xl p-6 border border-border/30 hover:border-gold-400/30 transition-all duration-300">
              <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
                <Globe className="w-5 h-5 text-blue-400" /> Net Foreign Flow
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { title: 'Top Buy', data: marketData.foreignBuy, color: 'text-green-400' },
                  { title: 'Top Sell', data: marketData.foreignSell, color: 'text-red-400' },
                ].map((sec, i) => (
                  <div key={i}>
                    <p className={`text-xs font-bold ${sec.color} mb-2 uppercase`}>{sec.title}</p>
                    <div className="space-y-2">
                      {sec.data.slice(0, 8).map((s: any, j: number) => (
                        <Link key={j} href={`/stock/${s.code}`} className="flex justify-between text-sm hover:bg-accent/20 p-2 rounded-lg transition-colors group">
                          <span className="font-mono font-bold text-foreground group-hover:text-gold-400">{s.code}</span>
                          <span className={sec.color}>{fmtRp(Math.abs(s.netForeign))}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass rounded-2xl p-6 border border-border/30 hover:border-gold-400/30 transition-all duration-300">
              <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
                <Zap className="w-5 h-5 text-gold-400" /> Top AOV Spikes
              </h3>
              <div className="space-y-3">
                {marketData.spikes.map((s: any, i: number) => (
                  <Link key={i} href={`/stock/${s.code}`} className="flex justify-between items-center p-3 rounded-xl bg-accent/20 hover:bg-accent/40 transition-all group">
                    <div>
                      <span className="font-mono font-bold text-foreground group-hover:text-gold-400">{s.code}</span>
                      <span className="text-[10px] text-muted-foreground ml-2">Rp {s.close?.toLocaleString('id-ID')}</span>
                    </div>
                    <div className="text-right">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${s.aov >= 2 ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>{s.aov.toFixed(1)}x</span>
                      <p className={`text-xs mt-1 ${s.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>{s.change > 0 ? '+' : ''}{s.change.toFixed(1)}%</p>
                    </div>
                  </Link>
                ))}
              </div>
              <Link href="/radar" className="block w-full mt-4 py-2.5 text-center text-xs font-bold text-gold-400 hover:text-foreground bg-gold-500/10 hover:bg-gold-500/20 rounded-xl border border-gold-500/30 transition-all">
                Full Screener →
              </Link>
            </div>
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
