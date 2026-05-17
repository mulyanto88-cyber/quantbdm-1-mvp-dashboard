'use client'

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { formatRupiah, formatPercent, formatNumber, formatShares } from '@/lib/utils'
import {
  TrendingUp, TrendingDown, Activity, Clock,
  Zap, Target, DollarSign, PieChart as PieChartIcon, ArrowRightLeft, Building2,
  Flame, Globe, Eye, Shield, Maximize2, Minimize2, ExternalLink, BarChart3,
  Users, Loader2, AlertTriangle
} from 'lucide-react'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'
import Link from 'next/link'

// ─── API ─────────────────────────────────────────────────────────────────────
async function mdQuery(query: string, params?: any[]): Promise<any[]> {
  const res = await fetch('/api/motherduck', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, params }),
  })
  const json = await res.json()
  if (json.error) throw new Error(json.error)
  return json.data || []
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PERIOD_OPTIONS = [
  { label: '1M', days: 30 }, { label: '3M', days: 90 }, { label: '6M', days: 180 },
  { label: '1Y', days: 365 }, { label: '2Y', days: 730 }, { label: '3Y', days: 1095 },
]

const INVESTOR_TYPE_COLORS: Record<string, string> = {
  'Corporate': '#10b981', 'Individual': '#3b82f6', 'Fund Manager': '#f59e0b',
  'Financial Institutional': '#8b5cf6', 'Insurance': '#ec4899',
  'Pension Fund': '#06b6d4', 'Securities': '#f97316', 'Others': '#6b7280',
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function StockDetailPage() {
  const params = useParams()
  const stockCode = (params?.code as string)?.toUpperCase() || ''

  const [period, setPeriod] = useState(90)
  const [stockData, setStockData] = useState<any>(null)
  const [historyData, setHistoryData] = useState<any[]>([])
  const [smartMoneyIndex, setSmartMoneyIndex] = useState<any>(null)
  const [brokerData, setBrokerData] = useState<any[]>([])
  const [ownershipDetails, setOwnershipDetails] = useState<any[]>([])
  const [whaleMovement, setWhaleMovement] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)

  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartWrapRef = useRef<HTMLDivElement>(null)
  const [chartReady, setChartReady] = useState(false)

  // ─── Load Lightweight Charts ────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.LightweightCharts) { setChartReady(true); return }
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js'
    script.async = true
    script.onload = () => setChartReady(true)
    document.body.appendChild(script)
  }, [])

  // ─── Fetch All Data ─────────────────────────────────────────────────────────
  const fetchAllData = useCallback(async (code: string, days: number) => {
    if (!code) return
    setIsLoading(true)
    setErrorMsg('')

    try {
      // 1. Latest stock data
      const latestRes = await mdQuery(
        `SELECT * FROM market.vw_stock_detail WHERE stock_code = $1 ORDER BY trading_date DESC LIMIT 1`,
        [code]
      )
      if (!latestRes.length) { setErrorMsg(`Stock ${code} not found`); setIsLoading(false); return }
      setStockData(latestRes[0])

      // 2. Smart Money Score
      const smRes = await mdQuery(`SELECT * FROM market.vw_smart_money_score WHERE stock_code = $1`, [code])
      if (smRes.length) setSmartMoneyIndex(smRes[0])

      // 3. Chart history
      const histRes = await mdQuery(`
        SELECT trading_date, open_price, high, low, close, volume,
               net_foreign_value, vwma_20d, aov_ratio_ma20, whale_signal, big_player_anomaly, previous
        FROM market.daily_transactions WHERE stock_code = $1
        AND trading_date >= (SELECT MAX(trading_date) FROM market.daily_transactions) - INTERVAL '${days} days'
        ORDER BY trading_date ASC
      `, [code])
      
      setHistoryData(histRes.map((d: any) => ({
        time: String(d.trading_date).split('T')[0],
        open: Number(d.open_price) || Number(d.previous) || Number(d.close) || 0,
        high: Number(d.high) || Number(d.close) || 0,
        low: Number(d.low) || Number(d.close) || 0,
        close: Number(d.close) || 0,
        volume: Number(d.volume) || 0,
        net_foreign: Number(d.net_foreign_value) || 0,
        aov_ratio: Number(d.aov_ratio_ma20) || 1,
        vwma: Number(d.vwma_20d) || 0,
        whale_signal: d.whale_signal || false,
        big_player_anomaly: d.big_player_anomaly || false,
      })))

      // 4. Broker Activity
      const brokerRes = await mdQuery(`
        SELECT broker_code AS kode_broker, MAX(broker_name) AS nama_broker,
               SUM(CASE WHEN side='BUY' THEN value ELSE -value END) AS net_value
        FROM broker_activity WHERE stock_code = $1
        GROUP BY broker_code ORDER BY ABS(SUM(CASE WHEN side='BUY' THEN value ELSE -value END)) DESC LIMIT 6
      `, [code])
      setBrokerData(brokerRes)

      // 5. Ownership Details
      const ownerRes = await mdQuery(`
        SELECT investor_name, investor_type, local_foreign, percentage, total_holding_shares
        FROM ksei.ownership_1pct WHERE share_code = $1
        AND date = (SELECT MAX(date) FROM ksei.ownership_1pct) ORDER BY percentage DESC LIMIT 100
      `, [code])
      setOwnershipDetails(ownerRes.map((d: any) => ({
        investor_name: d.investor_name,
        investor_type: d.investor_type,
        local_foreign: d.local_foreign,
        percentage: Number(d.percentage),
        shares: Number(d.total_holding_shares),
      })))

      // 6. Whale Movement
      const whaleRes = await mdQuery(`SELECT * FROM ksei.vw_whale_timing WHERE share_code = $1`, [code])
      setWhaleMovement(whaleRes)

    } catch (err: any) { setErrorMsg(err.message || 'Failed') }
    finally { setIsLoading(false) }
  }, [])

  useEffect(() => { if (stockCode) fetchAllData(stockCode, period) }, [stockCode, period, fetchAllData])

  // ─── Render Chart ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chartReady || !chartContainerRef.current || historyData.length === 0) return
    const lwc = window.LightweightCharts; if (!lwc) return
    
    chartContainerRef.current.innerHTML = ''

    const chart = lwc.createChart(chartContainerRef.current, {
      height: 600,
      layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#94a3b8' },
      grid: { vertLines: { color: 'rgba(51,65,85,0.15)' }, horzLines: { color: 'rgba(51,65,85,0.15)' } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: 'rgba(51,65,85,0.5)' },
      timeScale: { borderColor: 'rgba(51,65,85,0.5)', timeVisible: true },
    })

    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.05, bottom: 0.35 } })
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e', downColor: '#ef4444', borderVisible: false,
      wickUpColor: '#22c55e', wickDownColor: '#ef4444',
    })
    candleSeries.setData(historyData.map(d => ({ time: d.time, open: d.open, high: d.high, low: d.low, close: d.close })))

    const markers: any[] = []
    historyData.forEach(d => {
      if (d.whale_signal || d.aov_ratio >= 1.5) markers.push({ time: d.time, position: 'aboveBar', color: '#10b981', shape: 'circle', size: 1.5, text: '★' })
      if (d.big_player_anomaly) markers.push({ time: d.time, position: 'belowBar', color: '#ec4899', shape: 'circle', size: 1.5, text: '◆' })
    })
    markers.sort((a, b) => (a.time < b.time ? -1 : 1))
    candleSeries.setMarkers(markers)

    const vwmaSeries = chart.addLineSeries({ color: '#3b82f6', lineWidth: 2, lineStyle: 2, crosshairMarkerVisible: false, lastValueVisible: true, priceLineVisible: false })
    vwmaSeries.setData(historyData.filter(d => d.vwma > 0).map(d => ({ time: d.time, value: d.vwma })))

    const aovSeries = chart.addLineSeries({ color: '#8b5cf6', lineWidth: 2, priceScaleId: 'left' })
    chart.priceScale('left').applyOptions({ scaleMargins: { top: 0.60, bottom: 0.20 } })
    aovSeries.setData(historyData.map(d => ({ time: d.time, value: d.aov_ratio })))
    aovSeries.createPriceLine({ price: 1.5, color: '#22c55e', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '🐋 1.5x' })

    const volSeries = chart.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' } })
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.65, bottom: 0.15 } })
    volSeries.setData(historyData.map(d => ({ time: d.time, value: d.volume, color: d.close >= d.open ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)' })))

    const foreignSeries = chart.addHistogramSeries({ priceScaleId: 'foreign' })
    chart.priceScale('foreign').applyOptions({ scaleMargins: { top: 0.88, bottom: 0 } })
    foreignSeries.setData(historyData.map(d => ({ time: d.time, value: d.net_foreign, color: d.net_foreign >= 0 ? 'rgba(34,197,94,0.8)' : 'rgba(239,68,68,0.8)' })))

    chart.timeScale().fitContent()
    return () => chart.remove()
  }, [historyData, chartReady])

  // ─── Derived ────────────────────────────────────────────────────────────────
  const smiScore = smartMoneyIndex?.smart_money_score || 0
  const convictionScore = smartMoneyIndex?.conviction_score || smiScore

  const verdict = useMemo(() => {
    if (smiScore >= 70) return { label: 'STRONG BUY', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' }
    if (smiScore >= 45) return { label: 'WATCH / ACCUMULATE', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' }
    return { label: 'HOLD / MONITOR', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' }
  }, [smiScore])

  const ownershipPieData = useMemo(() => {
    if (!ownershipDetails.length) return []
    const groupMap: Record<string, { totalPct: number; totalShares: number; count: number }> = {}
    ownershipDetails.forEach((d: any) => {
      const type = d.investor_type || 'Others'
      if (!groupMap[type]) groupMap[type] = { totalPct: 0, totalShares: 0, count: 0 }
      groupMap[type].totalPct += d.percentage
      groupMap[type].totalShares += d.shares
      groupMap[type].count += 1
    })
    return Object.entries(groupMap).map(([name, data]) => ({ name, value: data.totalPct, shares: data.totalShares, count: data.count }))
  }, [ownershipDetails])

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 text-gold-400 animate-spin" /></div>
  if (errorMsg) return <div className="glass rounded-xl p-12 text-center"><AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" /><p className="text-red-400">{errorMsg}</p></div>
  if (!stockData) return null

  const publicShares = (stockData.tradeable_shares || 0) * ((stockData.free_float || 0) / 100)
  const floatCap = publicShares * stockData.close
  const dailyTurnover = publicShares > 0 ? ((stockData.volume || 0) / publicShares) * 100 : 0
  const marketCap = (stockData.tradeable_shares || 0) * stockData.close

  return (
    <div className="space-y-4 pb-12 animate-fade-in">
      {/* ═══ HEADER ═══ */}
      <div className="glass rounded-3xl p-5 lg:p-7 border border-white/[0.08] shadow-2xl">
        <div className="flex flex-col xl:flex-row gap-6 justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl lg:text-4xl font-black text-white">{stockCode}</h1>
              <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-black uppercase">{stockData.sector || 'Stock'}</span>
            </div>
            <div className="flex items-baseline gap-4 mt-2">
              <span className="text-4xl lg:text-5xl font-black text-white">{formatRupiah(stockData.close)}</span>
              <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-black text-base ${stockData.change_percent >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                {stockData.change_percent >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                {Math.abs(stockData.change_percent).toFixed(2)}%
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-4 flex gap-3 bg-white/[0.02] p-2 rounded-lg w-fit">
              <span>H: {formatNumber(stockData.high)}</span><span>L: {formatNumber(stockData.low)}</span><span>O: {formatNumber(stockData.open_price)}</span>
              <span className="opacity-30">|</span><span><Clock className="w-3 h-3 inline" /> {String(stockData.trading_date).split('T')[0]}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 flex-1 xl:max-w-[440px]">
            {[
              { l: 'Market Cap', v: formatRupiah(marketCap), c: 'text-gold-400' },
              { l: 'Float Cap', v: formatRupiah(floatCap), c: 'text-gold-400' },
              { l: 'Public Shares', v: formatShares(publicShares), c: 'text-cyan-400' },
              { l: 'Volume', v: formatShares(stockData.volume), c: 'text-orange-400' },
              { l: 'Value', v: formatRupiah(stockData.value), c: 'text-blue-400' },
            ].map((m, i) => (
              <div key={i} className="p-3 rounded-2xl bg-white/[0.02] border border-white/[0.04]">
                <p className="text-[10px] text-muted-foreground uppercase mb-2">{m.l}</p>
                <p className={`text-base font-black ${m.c}`}>{m.v}</p>
              </div>
            ))}
          </div>
          <div className={`rounded-3xl p-5 ${verdict.bg} border ${verdict.border} xl:min-w-[260px] flex flex-col justify-center`}>
            <Shield className={`w-5 h-5 ${verdict.color} mb-2`} />
            <p className={`text-xl font-black ${verdict.color}`}>{verdict.label}</p>
            <p className="text-xs text-muted-foreground">Score: {Math.round(smiScore)}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mt-6 pt-5 border-t border-white/[0.05]">
          {[
            { l: 'Conviction', v: `${Math.round(convictionScore)}`, c: convictionScore >= 70 ? 'text-emerald-400' : convictionScore >= 45 ? 'text-amber-400' : 'text-red-400' },
            { l: 'Smart Money', v: `${Math.round(smiScore)}`, c: smiScore >= 70 ? 'text-emerald-400' : smiScore >= 45 ? 'text-amber-400' : 'text-red-400' },
            { l: 'Foreign Flow', v: formatRupiah(stockData.net_foreign_value), c: stockData.net_foreign_value >= 0 ? 'text-emerald-400' : 'text-red-400' },
            { l: 'AOV Ratio', v: `${(stockData.aov_ratio_ma20||1).toFixed(2)}x`, c: stockData.aov_ratio_ma20 >= 1.5 ? 'text-purple-400' : '' },
            { l: 'Turnover', v: `${dailyTurnover.toFixed(2)}%`, c: dailyTurnover > 5 ? 'text-emerald-400' : 'text-amber-400' },
            { l: 'Free Float', v: `${stockData.free_float?.toFixed(1)||'--'}%`, c: 'text-blue-400' },
          ].map((m, i) => (
            <div key={i} className="p-2 rounded-xl bg-white/[0.01] border border-white/[0.03] text-center">
              <p className="text-[9px] text-muted-foreground uppercase mb-1">{m.l}</p>
              <p className={`text-sm font-black ${m.c}`}>{m.v}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ CHART ═══ */}
      <div ref={chartWrapRef} className="glass rounded-2xl p-4 border border-white/[0.06]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1 bg-white/[0.04] rounded-lg p-0.5">
            {PERIOD_OPTIONS.map(opt => (
              <button key={opt.days} onClick={() => setPeriod(opt.days)}
                className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${period === opt.days ? 'bg-gold-400/20 text-gold-400' : 'text-muted-foreground hover:text-white'}`}>{opt.label}</button>
            ))}
          </div>
          <button onClick={() => {
            if (!chartWrapRef.current) return
            if (!isFullscreen) chartWrapRef.current.requestFullscreen?.().catch(() => {})
            else document.exitFullscreen?.().catch(() => {})
            setIsFullscreen(f => !f)
          }} className="p-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-muted-foreground hover:text-gold-400">
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
        <div ref={chartContainerRef} style={{ width: '100%', minHeight: '600px' }} />
      </div>

      {/* ═══ 3 KOLOM ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass rounded-xl p-4 border border-white/[0.06]">
          <div className="flex items-center gap-2 mb-3"><Target className="w-4 h-4 text-gold-400" /><h3 className="text-[10px] font-black text-gold-400 uppercase">Smart Money Index</h3></div>
          {smartMoneyIndex ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { l: 'Score', v: Math.round(smiScore), c: 'text-emerald-400' },
                  { l: 'Foreign 30D', v: formatRupiah(smartMoneyIndex.foreign_30d || 0), c: (smartMoneyIndex.foreign_30d || 0) >= 0 ? 'text-emerald-400' : 'text-red-400' },
                  { l: 'Broker Net', v: formatRupiah(smartMoneyIndex.broker_net || 0), c: (smartMoneyIndex.broker_net || 0) >= 0 ? 'text-emerald-400' : 'text-red-400' },
                  { l: 'AOV', v: `${(smartMoneyIndex.aov_ratio_ma20 || 1).toFixed(2)}x`, c: (smartMoneyIndex.aov_ratio_ma20 || 0) >= 1.5 ? 'text-purple-400' : '' },
                ].map((m, i) => (
                  <div key={i} className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                    <p className="text-[8px] text-muted-foreground uppercase">{m.l}</p><p className={`text-xs font-black ${m.c}`}>{m.v}</p>
                  </div>
                ))}
              </div>
              {smartMoneyIndex.score_breakdown && <p className="text-[9px] text-muted-foreground font-mono">{smartMoneyIndex.score_breakdown}</p>}
            </div>
          ) : <p className="text-xs text-muted-foreground text-center py-4">No data</p>}
        </div>

        <div className="glass rounded-xl p-4 border border-white/[0.06]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-blue-400" /><h3 className="text-[10px] font-black text-blue-400 uppercase">Broker Activity</h3></div>
            <Link href={`/bandarmologi?code=${stockCode}`} className="text-[9px] text-blue-400 font-bold">Full →</Link>
          </div>
          {brokerData.length > 0 ? (
            <div className="space-y-1.5">
              {brokerData.map((b, i) => (
                <div key={i} className="flex justify-between py-1.5 border-b border-white/[0.03] last:border-0">
                  <div><p className="text-[10px] font-bold">{b.kode_broker}</p><p className="text-[8px] text-muted-foreground/50 truncate max-w-[100px]">{b.nama_broker}</p></div>
                  <span className={`text-[10px] font-black ${Number(b.net_value) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatRupiah(Number(b.net_value))}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-muted-foreground text-center py-8">No Broker Data</p>}
        </div>

        <div className="glass rounded-xl p-4 border border-white/[0.06]">
          <div className="flex items-center gap-2 mb-3"><Globe className="w-4 h-4 text-emerald-400" /><h3 className="text-[10px] font-black text-emerald-400 uppercase">Foreign Flow</h3></div>
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
            <span className={`text-sm font-black ${stockData.net_foreign_value >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {stockData.net_foreign_value >= 0 ? '+' : ''}{formatRupiah(stockData.net_foreign_value)}
            </span>
            <p className="text-[8px] text-muted-foreground mt-1">Latest trading day</p>
          </div>
        </div>
      </div>

      {/* ═══ OWNERSHIP ═══ */}
      <div className="glass rounded-2xl p-5 border border-white/[0.06]">
        <div className="flex items-center gap-2 mb-4"><PieChartIcon className="w-4 h-4 text-gold-400" /><h2 className="text-sm font-black text-white uppercase">Ownership Structure</h2></div>
        {ownershipPieData.length > 0 ? (
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="w-64 h-64 mx-auto">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={ownershipPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} stroke="none">
                    {ownershipPieData.map((_, i) => <Cell key={i} fill={INVESTOR_TYPE_COLORS[ownershipPieData[i].name] || '#6b7280'} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }} formatter={(v: any) => [`${Number(v).toFixed(1)}%`]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-[9px] text-muted-foreground uppercase border-b border-white/[0.05]">
                  <th className="p-2 text-left">Investor</th><th className="p-2 text-left">Type</th><th className="p-2 text-center">L/F</th><th className="p-2 text-right">%</th><th className="p-2 text-right">Shares</th>
                </tr></thead>
                <tbody>
                  {ownershipDetails.slice(0, 10).map((d: any, i: number) => (
                    <tr key={i} className="border-b border-white/[0.02]">
                      <td className="p-2 font-bold text-[10px] truncate max-w-[120px]">{d.investor_name}</td>
                      <td className="p-2 text-[10px] text-muted-foreground">{d.investor_type}</td>
                      <td className="p-2 text-center"><span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${d.local_foreign === 'F' ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-400'}`}>{d.local_foreign === 'F' ? 'F' : 'L'}</span></td>
                      <td className="p-2 text-right font-black">{d.percentage.toFixed(2)}%</td>
                      <td className="p-2 text-right">{formatShares(d.shares)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : <p className="text-center py-8 text-muted-foreground text-sm">No ownership data</p>}
      </div>

      {/* ═══ WHALE ═══ */}
      {whaleMovement.length > 0 && (
        <div className="glass rounded-2xl p-5 border border-white/[0.06]">
          <div className="flex items-center gap-2 mb-4"><Users className="w-4 h-4 text-purple-400" /><h2 className="text-sm font-black text-white uppercase">Whale Position Tracking</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-[9px] text-muted-foreground uppercase border-b border-white/[0.05]">
                <th className="p-2 text-left">Investor</th><th className="p-2 text-center">Type</th><th className="p-2 text-right">%</th>
                <th className="p-2 text-right">Shares</th><th className="p-2 text-right">Entry</th><th className="p-2 text-right">Return</th>
                <th className="p-2 text-center">Trend</th><th className="p-2 text-center">Verdict</th>
              </tr></thead>
              <tbody>
                {whaleMovement.slice(0, 10).map((w: any, i: number) => (
                  <tr key={i} className="border-b border-white/[0.02]">
                    <td className="p-2 font-bold text-[10px]">{w.investor_name?.slice(0, 30)}</td>
                    <td className="p-2 text-center"><span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${w.local_foreign === 'F' ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-400'}`}>{w.local_foreign === 'F' ? 'F' : 'L'}</span></td>
                    <td className="p-2 text-right font-black">{Number(w.latest_percentage).toFixed(2)}%</td>
                    <td className="p-2 text-right text-muted-foreground">{formatShares(w.latest_shares)}</td>
                    <td className="p-2 text-right">{formatNumber(w.est_entry_price)}</td>
                    <td className={`p-2 text-right font-black ${w.return_since_entry >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{Number(w.return_since_entry).toFixed(2)}%</td>
                    <td className="p-2 text-center">{w.position_trend}</td>
                    <td className="p-2 text-center text-[9px] font-bold text-gold-400">{w.whale_verdict}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
