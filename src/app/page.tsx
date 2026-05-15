import React from 'react'
import { Activity, DollarSign, BarChart3, ShieldCheck, Zap, Globe, Target, Clock, ArrowRightLeft } from 'lucide-react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { formatRupiah, formatNumber } from '@/lib/utils'
import SectorHeatmap from './_components/SectorHeatmap'

export const revalidate = 60 // Cache & revalidate every 60 seconds

async function getMarketData() {
  const { data: dateData } = await supabase
    .from('daily_transactions')
    .select('trading_date')
    .order('trading_date', { ascending: false })
    .limit(1)
  const date = dateData?.[0]?.trading_date
  if (!date) return null

  const { data } = await supabase
    .from('daily_transactions')
    .select('stock_code,close,change_percent,value,volume,net_foreign_value,aov_ratio_ma20,whale_signal,signal,sector')
    .eq('trading_date', date)
    .gt('volume', 0)
    .limit(2000)

  if (!data) return null

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

  return {
    date,
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
  }
}

async function getKseiAlerts() {
  const { data } = await supabase.rpc('get_ksei_movement_alert')
  return data ? data.slice(0, 15) : []
}

async function getHighConviction() {
  const { data } = await supabase.rpc('scan_high_conviction', {
    p_min_score: 60,
    p_min_flow: 0,
  })
  if (!data) return []
  return data.map((s: any) => ({
    ...s,
    price:             Number(s.price),
    price_chg_pct:     Number(s.price_chg_pct),
    conviction_score:  Number(s.conviction_score),
    institutional_flow: Number(s.institutional_flow),
  })).sort((a: any, b: any) => b.conviction_score - a.conviction_score).slice(0, 10)
}

export default async function MarketOverview() {
  const [marketData, kseiAlerts, highConviction] = await Promise.all([
    getMarketData(),
    getKseiAlerts(),
    getHighConviction(),
  ])

  if (!marketData) {
    return <div className="p-10 text-center text-muted-foreground">Failed to load market data.</div>
  }

  const { date, totalForeign, totalValue, up, down, gainers, losers, foreignBuy, foreignSell, topVolume, topValue, spikes, sectorHeatmap, allStocks } = marketData

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
                    strokeDashoffset={490 - (490 * (totalForeign > 0 ? 75 : 45)) / 100}
                    strokeLinecap="round"
                    className={`${totalForeign > 0 ? 'text-emerald-400' : 'text-gold-400'} transition-all duration-1000 shadow-[0_0_15px_rgba(34,197,94,0.3)]`} 
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-5xl font-black text-white tracking-tighter">
                    {totalForeign > 0 ? 'BULL' : 'NEUT'}
                  </span>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Verdict</span>
                </div>
              </div>
              <div className="mt-6 flex flex-col items-center gap-1">
                 <span className={`text-xs font-black ${totalForeign > 0 ? 'text-emerald-400' : 'text-gold-400'}`}>
                   {totalForeign > 0 ? 'Institutional Accumulation' : 'Wait & See Mode'}
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
                  { label: 'Turnover', value: formatRupiah(totalValue), icon: DollarSign, color: 'text-gold-400' },
                  { label: 'Foreign Net', value: formatRupiah(totalForeign), icon: Globe, color: totalForeign >= 0 ? 'text-emerald-400' : 'text-red-400' },
                  { label: 'Market Breadth', value: `${up}↑ / ${down}↓`, icon: Activity, color: 'text-blue-400' },
                  { label: 'Whale Alerts', value: spikes?.length || 0, icon: Zap, color: 'text-purple-400' },
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

      {/* Date Indicator & Verdict Flash */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
        <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">
          <div className="flex items-center gap-2">
            <Clock className="w-3 h-3" />
            <span>Last Sync: {date}</span>
          </div>
          <div className="w-1 h-1 rounded-full bg-white/20" />
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>System Status: Optimal</span>
          </div>
        </div>

        <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-white/[0.03] border border-white/5">
            <Target className="w-3.5 h-3.5 text-gold-400" />
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest leading-none">
              Market Verdict: <span className="text-emerald-400">Institutional Accumulation Mode</span>
            </span>
        </div>
      </div>

      {/* ==================== MARKET PULSE ==================== */}
      <div className="space-y-4 animate-fade-in">

        {/* ── Row 1: Metric Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { title: 'Market Breadth', value: `${up}↑ ${down}↓`, icon: BarChart3, color: 'text-blue-400', sub: 'Advancers vs Decliners' },
            { title: 'Total Turnover',  value: formatRupiah(totalValue),   icon: DollarSign, color: 'text-gold-400',  sub: 'Daily value traded' },
            { title: 'Net Foreign',     value: formatRupiah(totalForeign), icon: Globe,      color: totalForeign >= 0 ? 'text-emerald-400' : 'text-red-400', sub: totalForeign >= 0 ? '▲ Inflow' : '▼ Outflow' },
            { title: 'AOV Spikes',      value: spikes.length,       icon: Zap,        color: 'text-purple-400', sub: 'Whale signals today' },
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
              <span className="text-[9px] text-muted-foreground">{gainers.length} stocks</span>
            </div>
            <div className="divide-y divide-border/10">
              {gainers.map((s: any, i: number) => (
                <Link key={i} href={`/stock/${s.code}`} className="flex items-center justify-between px-4 py-2 hover:bg-green-500/5 transition-colors group">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[9px] text-muted-foreground w-4 shrink-0">{i+1}</span>
                    <div className="min-w-0">
                      <span className="font-mono font-black text-sm text-foreground group-hover:text-green-400 transition-colors">{s.code}</span>
                      <span className="text-[9px] text-muted-foreground ml-1.5 hidden sm:inline">{formatRupiah(s.close)}</span>
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
              <span className="text-[9px] text-muted-foreground">{losers.length} stocks</span>
            </div>
            <div className="divide-y divide-border/10">
              {losers.map((s: any, i: number) => (
                <Link key={i} href={`/stock/${s.code}`} className="flex items-center justify-between px-4 py-2 hover:bg-red-500/5 transition-colors group">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[9px] text-muted-foreground w-4 shrink-0">{i+1}</span>
                    <div className="min-w-0">
                      <span className="font-mono font-black text-sm text-foreground group-hover:text-red-400 transition-colors">{s.code}</span>
                      <span className="text-[9px] text-muted-foreground ml-1.5 hidden sm:inline">{formatRupiah(s.close)}</span>
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
              {foreignBuy.slice(0, 5).map((s: any, i: number) => (
                <Link key={i} href={`/stock/${s.code}`} className="flex items-center justify-between px-2 py-1.5 hover:bg-emerald-500/5 rounded-lg transition-colors group">
                  <span className="font-mono font-black text-sm text-foreground group-hover:text-emerald-400">{s.code}</span>
                  <span className="text-xs font-bold text-emerald-400">{formatRupiah(s.netForeign)}</span>
                </Link>
              ))}
              <div className="border-t border-border/20 mt-1 pt-1">
                <p className="text-[9px] font-black text-red-400 uppercase tracking-wider px-2 py-1">▼ Top Sell</p>
                {foreignSell.slice(0, 5).map((s: any, i: number) => (
                  <Link key={i} href={`/stock/${s.code}`} className="flex items-center justify-between px-2 py-1.5 hover:bg-red-500/5 rounded-lg transition-colors group">
                    <span className="font-mono font-black text-sm text-foreground group-hover:text-red-400">{s.code}</span>
                    <span className="text-xs font-bold text-red-400">-{formatRupiah(s.netForeign)}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Row 3: Top Volume | Top Value | AOV Spikes — 3 kolom sejajar ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {[
            { title: '📊 Top Volume', data: topVolume, valKey: 'volume', color: 'text-blue-400', border: 'border-blue-500/20', hover: 'hover:border-blue-400/40', fmt: (v: number) => formatNumber(v) },
            { title: '💰 Top Value',  data: topValue,  valKey: 'value',  color: 'text-gold-400', border: 'border-yellow-500/20', hover: 'hover:border-yellow-400/40', fmt: (v: number) => formatRupiah(v) },
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
                        <span className="text-[9px] text-muted-foreground ml-1.5">{formatRupiah(s.close)}</span>
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
              {spikes.slice(0, 10).map((s: any, i: number) => (
                <Link key={i} href={`/stock/${s.code}`} className="flex items-center justify-between px-4 py-2 hover:bg-purple-500/5 transition-colors group">
                  <div>
                    <span className="font-mono font-black text-sm text-foreground group-hover:text-purple-400 transition-colors">{s.code}</span>
                    <span className="text-[9px] text-muted-foreground ml-1.5">{formatRupiah(s.close)}</span>
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
        <SectorHeatmap sectorHeatmap={sectorHeatmap} allStocks={allStocks} />

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
                            <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" /> {formatRupiah(s.price)}</span>
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
                             {isAccum ? '+' : ''}{formatNumber(Math.abs(Number(a.scripless_diff)))}
                           </p>
                           <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-2">Shares Delta</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
                <Link href="/flow" className="block p-4 text-center text-[10px] font-black text-gold-400 hover:text-white hover:bg-white/5 transition-all uppercase tracking-widest">
                  View Full KSEI Intelligence →
                </Link>
             </div>
          </div>
        </div>
      </div>
    </div>
  )
}
