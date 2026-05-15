import React from 'react'
import { Activity, DollarSign, ShieldCheck, Zap, Globe, Target, ArrowRightLeft } from 'lucide-react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { formatRupiah, formatNumber } from '@/lib/utils'
import SectorHeatmap from './_components/SectorHeatmap'

export const revalidate = 60

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
    totalValue   += val
    if (pct > 0) up++; else if (pct < 0) down++
    if (pct > 0) gainers.push({ code: r.stock_code, close: Number(r.close), change: pct })
    if (pct < 0) losers.push({ code: r.stock_code, close: Number(r.close), change: pct })
    if (netF > 0) foreignBuy.push({ code: r.stock_code, netForeign: netF })
    if (netF < 0) foreignSell.push({ code: r.stock_code, netForeign: Math.abs(netF) })
    if ((Number(r.aov_ratio_ma20) || 0) >= 1.5) spikes.push({ code: r.stock_code, close: Number(r.close), aov: Number(r.aov_ratio_ma20), change: pct })
    topVol.push({ code: r.stock_code, volume: vol, change: pct })
    topVal.push({ code: r.stock_code, value: val, change: pct })

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
    .sort((a: any, b: any) => b.totalValue - a.totalValue).slice(0, 12)

  return {
    date,
    totalForeign, totalValue, up, down,
    gainers: gainers.sort((a, b) => b.change - a.change).slice(0, 10),
    losers:  losers.sort((a, b) => a.change - b.change).slice(0, 10),
    foreignBuy: foreignBuy.sort((a, b) => b.netForeign - a.netForeign).slice(0, 6),
    foreignSell: foreignSell.sort((a, b) => b.netForeign - a.netForeign).slice(0, 6),
    topVolume: topVol.sort((a, b) => b.volume - a.volume).slice(0, 8),
    topValue:  topVal.sort((a, b) => b.value - a.value).slice(0, 8),
    spikes: spikes.sort((a, b) => b.aov - a.aov).slice(0, 7),
    sectorHeatmap, allStocks,
  }
}

async function getKseiAlerts() {
  const { data } = await supabase.rpc('get_ksei_movement_alert')
  return data ? data.slice(0, 8) : []
}

async function getHighConviction() {
  const { data } = await supabase.rpc('scan_high_conviction', { p_min_score: 60, p_min_flow: 0 })
  if (!data) return []
  return data.map((s: any) => ({
    ...s,
    price:              Number(s.price),
    price_chg_pct:      Number(s.price_chg_pct),
    conviction_score:   Number(s.conviction_score),
    institutional_flow: Number(s.institutional_flow),
  })).sort((a: any, b: any) => b.conviction_score - a.conviction_score).slice(0, 10)
}

export default async function MarketOverview() {
  const [marketData, kseiAlerts, highConviction] = await Promise.all([
    getMarketData(), getKseiAlerts(), getHighConviction(),
  ])

  if (!marketData) {
    return <div className="p-10 text-center text-muted-foreground">Failed to load market data.</div>
  }

  const { date, totalForeign, totalValue, up, down, gainers, losers, foreignBuy, foreignSell, topVolume, topValue, spikes, sectorHeatmap, allStocks } = marketData

  return (
    <div className="space-y-3 pb-8 animate-fade-in">

      {/* ════════════════════════════════════════
          COMMAND STRIP — compact hero bar
      ════════════════════════════════════════ */}
      <div className="relative overflow-hidden rounded-xl border border-white/[0.07] bg-gradient-to-r from-[#0d1117] via-[#0f172a] to-[#0d1117] shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-r from-gold-500/5 via-transparent to-emerald-500/5 pointer-events-none" />
        <div className="absolute top-0 left-1/3 w-64 h-px bg-gradient-to-r from-transparent via-gold-400/30 to-transparent" />

        <div className="relative z-10 flex flex-wrap items-stretch divide-x divide-white/[0.05]">

          {/* Verdict gauge */}
          <div className="flex items-center gap-3 px-4 py-3 shrink-0">
            <div className="relative">
              <svg className="w-14 h-14 -rotate-90">
                <circle cx="28" cy="28" r="22" stroke="currentColor" strokeWidth="3.5" fill="transparent" className="text-white/5" />
                <circle cx="28" cy="28" r="22" stroke="currentColor" strokeWidth="3.5" fill="transparent"
                  strokeDasharray={138}
                  strokeDashoffset={138 - (138 * (totalForeign > 0 ? 75 : 45)) / 100}
                  strokeLinecap="round"
                  className={`${totalForeign > 0 ? 'text-emerald-400' : 'text-amber-400'} transition-all duration-1000`}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[9px] font-black text-white tracking-tighter">{totalForeign > 0 ? 'BULL' : 'NEUT'}</span>
              </div>
            </div>
            <div>
              <p className="text-[8px] font-bold text-muted-foreground/50 uppercase tracking-widest">Sentiment</p>
              <p className={`text-[11px] font-black ${totalForeign > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {totalForeign > 0 ? '▲ Accumulation' : '⏸ Wait & See'}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[8px] text-muted-foreground/40 uppercase tracking-widest">Live · {date}</span>
              </div>
            </div>
          </div>

          {/* Brand */}
          <div className="flex flex-col justify-center px-4 py-3 shrink-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="px-1.5 py-0.5 rounded bg-gold-400/10 border border-gold-400/20 text-[8px] font-black text-gold-400 uppercase tracking-widest">Terminal v2</span>
            </div>
            <h1 className="text-xl font-black text-white tracking-tight leading-none whitespace-nowrap">
              Market <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-300 to-gold-500">Intelligence</span>
            </h1>
            <p className="text-[8px] text-muted-foreground/40 mt-0.5 uppercase tracking-widest">IDX Institutional DNA</p>
          </div>

          {/* 4 stat cells */}
          {[
            { label: 'Turnover',     value: formatRupiah(totalValue),   sub: 'daily vol',  color: 'text-gold-400' },
            { label: 'Foreign Net',  value: formatRupiah(totalForeign), sub: totalForeign >= 0 ? '▲ inflow' : '▼ outflow', color: totalForeign >= 0 ? 'text-emerald-400' : 'text-red-400' },
            { label: 'Breadth',      value: `${up}↑  ${down}↓`,        sub: 'adv / dec',  color: 'text-blue-400' },
            { label: 'Whale Signals',value: String(spikes?.length || 0),sub: 'aov spikes', color: 'text-purple-400' },
          ].map((s, i) => (
            <div key={i} className="flex flex-col justify-center px-4 py-3 min-w-[100px]">
              <p className="text-[8px] font-bold text-muted-foreground/40 uppercase tracking-widest">{s.label}</p>
              <p className={`text-lg font-black ${s.color} leading-none mt-0.5 whitespace-nowrap`}>{s.value}</p>
              <p className="text-[8px] text-muted-foreground/30 mt-0.5 uppercase tracking-widest">{s.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ════════════════════════════════════════
          5-COLUMN MARKET DATA GRID
      ════════════════════════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5">

        {/* COL 1: Gainers */}
        <div className="glass rounded-xl overflow-hidden border border-emerald-500/20">
          <div className="px-3 py-2 bg-emerald-500/5 border-b border-emerald-500/10 flex items-center justify-between">
            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-wider">🔥 Gainers</span>
            <span className="text-[8px] text-muted-foreground/50">{gainers.length}stk</span>
          </div>
          {gainers.map((s: any, i: number) => (
            <Link key={i} href={`/stock/${s.code}`}
              className="flex items-center justify-between px-3 py-1.5 hover:bg-emerald-500/5 transition-colors group border-b border-white/[0.03] last:border-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[8px] text-muted-foreground/30 w-3">{i+1}</span>
                <span className="font-mono font-black text-[11px] text-foreground group-hover:text-emerald-400 transition-colors">{s.code}</span>
              </div>
              <span className="font-black text-[10px] text-emerald-400">+{s.change?.toFixed(1)}%</span>
            </Link>
          ))}
        </div>

        {/* COL 2: Losers */}
        <div className="glass rounded-xl overflow-hidden border border-red-500/20">
          <div className="px-3 py-2 bg-red-500/5 border-b border-red-500/10 flex items-center justify-between">
            <span className="text-[10px] font-black text-red-400 uppercase tracking-wider">❄️ Losers</span>
            <span className="text-[8px] text-muted-foreground/50">{losers.length}stk</span>
          </div>
          {losers.map((s: any, i: number) => (
            <Link key={i} href={`/stock/${s.code}`}
              className="flex items-center justify-between px-3 py-1.5 hover:bg-red-500/5 transition-colors group border-b border-white/[0.03] last:border-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[8px] text-muted-foreground/30 w-3">{i+1}</span>
                <span className="font-mono font-black text-[11px] text-foreground group-hover:text-red-400 transition-colors">{s.code}</span>
              </div>
              <span className="font-black text-[10px] text-red-400">{s.change?.toFixed(1)}%</span>
            </Link>
          ))}
        </div>

        {/* COL 3: Net Foreign — buy & sell */}
        <div className="glass rounded-xl overflow-hidden border border-blue-500/20">
          <div className="px-3 py-2 bg-blue-500/5 border-b border-blue-500/10 flex items-center gap-1.5">
            <Globe className="w-2.5 h-2.5 text-blue-400" />
            <span className="text-[10px] font-black text-blue-400 uppercase tracking-wider">Net Foreign</span>
          </div>
          <div className="px-3 py-1.5 border-b border-white/[0.04]">
            <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest mb-1">▲ Buy</p>
            {foreignBuy.slice(0, 5).map((s: any, i: number) => (
              <Link key={i} href={`/stock/${s.code}`}
                className="flex items-center justify-between py-1 hover:opacity-70 group border-b border-white/[0.03] last:border-0">
                <span className="font-mono font-black text-[11px] group-hover:text-emerald-400">{s.code}</span>
                <span className="text-[9px] font-bold text-emerald-400">{formatRupiah(s.netForeign)}</span>
              </Link>
            ))}
          </div>
          <div className="px-3 py-1.5">
            <p className="text-[8px] font-black text-red-400 uppercase tracking-widest mb-1">▼ Sell</p>
            {foreignSell.slice(0, 5).map((s: any, i: number) => (
              <Link key={i} href={`/stock/${s.code}`}
                className="flex items-center justify-between py-1 hover:opacity-70 group border-b border-white/[0.03] last:border-0">
                <span className="font-mono font-black text-[11px] group-hover:text-red-400">{s.code}</span>
                <span className="text-[9px] font-bold text-red-400">-{formatRupiah(s.netForeign)}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* COL 4: Volume + Value stacked */}
        <div className="grid grid-rows-2 gap-2.5">
          <div className="glass rounded-xl overflow-hidden border border-blue-500/15">
            <div className="px-3 py-2 border-b border-blue-500/10">
              <span className="text-[10px] font-black text-blue-400 uppercase tracking-wider">📊 Volume</span>
            </div>
            {topVolume.slice(0, 5).map((s: any, i: number) => (
              <Link key={i} href={`/stock/${s.code}`}
                className="flex items-center justify-between px-3 py-1.5 hover:bg-blue-500/5 group border-b border-white/[0.03] last:border-0 transition-colors">
                <span className="font-mono font-black text-[11px] group-hover:text-blue-400">{s.code}</span>
                <div className="text-right">
                  <p className="text-[9px] font-bold text-blue-400">{formatNumber(s.volume)}</p>
                  <p className={`text-[7px] ${s.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{s.change > 0 ? '+' : ''}{s.change?.toFixed(1)}%</p>
                </div>
              </Link>
            ))}
          </div>
          <div className="glass rounded-xl overflow-hidden border border-yellow-500/15">
            <div className="px-3 py-2 border-b border-yellow-500/10">
              <span className="text-[10px] font-black text-gold-400 uppercase tracking-wider">💰 Value</span>
            </div>
            {topValue.slice(0, 5).map((s: any, i: number) => (
              <Link key={i} href={`/stock/${s.code}`}
                className="flex items-center justify-between px-3 py-1.5 hover:bg-yellow-500/5 group border-b border-white/[0.03] last:border-0 transition-colors">
                <span className="font-mono font-black text-[11px] group-hover:text-gold-400">{s.code}</span>
                <div className="text-right">
                  <p className="text-[9px] font-bold text-gold-400">{formatRupiah(s.value)}</p>
                  <p className={`text-[7px] ${s.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{s.change > 0 ? '+' : ''}{s.change?.toFixed(1)}%</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* COL 5: AOV Spikes + Whale Moves stacked */}
        <div className="grid grid-rows-2 gap-2.5">
          <div className="glass rounded-xl overflow-hidden border border-purple-500/20">
            <div className="px-3 py-2 border-b border-purple-500/10 flex items-center justify-between">
              <span className="text-[10px] font-black text-purple-400 uppercase tracking-wider flex items-center gap-1">
                <Zap className="w-2.5 h-2.5" /> AOV Spikes
              </span>
              <Link href="/radar" className="text-[8px] text-gold-400 hover:text-white transition-colors">Radar →</Link>
            </div>
            {spikes.slice(0, 5).map((s: any, i: number) => (
              <Link key={i} href={`/stock/${s.code}`}
                className="flex items-center justify-between px-3 py-1.5 hover:bg-purple-500/5 group border-b border-white/[0.03] last:border-0 transition-colors">
                <span className="font-mono font-black text-[11px] group-hover:text-purple-400">{s.code}</span>
                <div className="text-right">
                  <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${s.aov >= 2 ? 'bg-purple-500/20 text-purple-300' : 'bg-blue-500/10 text-blue-400'}`}>{s.aov?.toFixed(1)}x</span>
                  <p className={`text-[7px] mt-0.5 ${s.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{s.change > 0 ? '+' : ''}{s.change?.toFixed(1)}%</p>
                </div>
              </Link>
            ))}
          </div>

          {/* Whale mini tracker */}
          <div className="glass rounded-xl overflow-hidden border border-gold-400/20">
            <div className="px-3 py-2 border-b border-gold-400/10 flex items-center justify-between">
              <span className="text-[10px] font-black text-gold-400 uppercase tracking-wider flex items-center gap-1">
                <ShieldCheck className="w-2.5 h-2.5" /> Whale Moves
              </span>
              <Link href="/flow" className="text-[8px] text-gold-400 hover:text-white transition-colors">All →</Link>
            </div>
            {kseiAlerts.slice(0, 5).map((a: any, i: number) => {
              const isAccum = Number(a.scripless_diff) > 0
              return (
                <Link key={i} href={`/stock/${a.share_code}`}
                  className="flex items-center justify-between px-3 py-1.5 hover:bg-gold-400/5 group border-b border-white/[0.03] last:border-0 transition-colors">
                  <div className="min-w-0">
                    <span className="font-mono font-black text-[11px] group-hover:text-gold-400">{a.share_code}</span>
                    <p className="text-[7px] text-muted-foreground/40 truncate">{a.investor_name?.slice(0, 12)}</p>
                  </div>
                  <span className={`text-[9px] font-black shrink-0 ml-1.5 ${isAccum ? 'text-emerald-400' : 'text-red-400'}`}>
                    {isAccum ? '▲' : '▼'} {formatNumber(Math.abs(Number(a.scripless_diff)))}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════
          SECTOR HEATMAP
      ════════════════════════════════════════ */}
      <SectorHeatmap sectorHeatmap={sectorHeatmap} allStocks={allStocks} />

      {/* ════════════════════════════════════════
          HIGH CONVICTION — compact table
      ════════════════════════════════════════ */}
      <div className="glass rounded-xl overflow-hidden border border-white/[0.06]">
        <div className="px-4 py-2.5 border-b border-white/[0.05] flex items-center justify-between bg-white/[0.01]">
          <div className="flex items-center gap-2">
            <Target className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[10px] font-black text-white uppercase tracking-widest">High Conviction Alpha</span>
            <span className="text-[9px] text-muted-foreground/40 hidden sm:inline">· Smart Money picks · Score ≥ 60</span>
          </div>
          <Link href="/screener" className="text-[9px] font-black text-gold-400 hover:text-white transition-colors uppercase tracking-widest">Screener →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.04] text-[8px] text-muted-foreground/40 uppercase tracking-widest">
                <th className="px-4 py-2 text-left">Stock</th>
                <th className="px-3 py-2 text-center">Score</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-right">Chg%</th>
                <th className="px-3 py-2 text-center hidden md:table-cell">Flow</th>
                <th className="px-3 py-2 text-center hidden lg:table-cell">Flags</th>
              </tr>
            </thead>
            <tbody>
              {highConviction.map((s: any, i: number) => (
                <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors group">
                  <td className="px-4 py-2">
                    <Link href={`/stock/${s.stock_code}`} className="flex items-center gap-2">
                      <span className="font-mono font-black text-sm text-foreground group-hover:text-gold-400 transition-colors">{s.stock_code}</span>
                      {s.is_stealth && <span className="text-[7px] bg-gold-400/10 text-gold-400 border border-gold-400/20 px-1 py-0.5 rounded font-black uppercase hidden sm:inline">Stealth</span>}
                      <span className="text-[8px] text-muted-foreground/30 hidden xl:inline">{s.sector}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`text-sm font-black ${s.conviction_score >= 80 ? 'text-emerald-400' : s.conviction_score >= 60 ? 'text-amber-400' : 'text-muted-foreground'}`}>
                      {Math.round(s.conviction_score)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground/70">{formatRupiah(s.price)}</td>
                  <td className={`px-3 py-2 text-right font-black ${s.price_chg_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {s.price_chg_pct > 0 ? '+' : ''}{s.price_chg_pct?.toFixed(2)}%
                  </td>
                  <td className="px-3 py-2 text-center text-muted-foreground/40 hidden md:table-cell text-[10px]">{s.institutional_flow?.toFixed(1)}</td>
                  <td className="px-3 py-2 text-center hidden lg:table-cell text-sm">
                    {s.whale_signal ? '🐋' : ''}{s.big_player_anomaly ? '⚡' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
