'use client'

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { formatRupiah, formatNumber, formatShares } from '@/lib/utils'
import {
  TrendingUp, TrendingDown, Activity, Clock,
  Target, DollarSign, PieChart as PieChartIcon, Building2,
  Globe, Shield, Maximize2, Minimize2, ExternalLink, BarChart3,
  Users, Loader2, AlertTriangle
} from 'lucide-react'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'
import Link from 'next/link'

// ─── Constants ────────────────────────────────────────────────────────────────
const PERIOD_OPTIONS = [
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
  { label: '2Y', days: 730 },
  { label: '3Y', days: 1095 },
]

const INVESTOR_TYPE_COLORS: Record<string, string> = {
  'Corporate': '#10b981',
  'Individual': '#3b82f6',
  'Fund Manager': '#f59e0b',
  'Financial Institutional': '#8b5cf6',
  'Insurance': '#ec4899',
  'Pension Fund': '#06b6d4',
  'Securities': '#f97316',
  'Others': '#6b7280',
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function StockDetailPage() {
  const params = useParams()
  const stockCode = (params?.code as string)?.toUpperCase() || ''

  const [period, setPeriod] = useState(365)
  const [stockData, setStockData] = useState<any>(null)
  const [historyData, setHistoryData] = useState<any[]>([])
  const [smartMoneyIndex, setSmartMoneyIndex] = useState<any>(null)
  const [brokerData, setBrokerData] = useState<any[]>([])
  const [ownershipDetails, setOwnershipDetails] = useState<any[]>([])
  const [whaleMovement, setWhaleMovement] = useState<any[]>([])
  const [foreignDivergence, setForeignDivergence] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)

  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartWrapRef = useRef<HTMLDivElement>(null)
  const [chartReady, setChartReady] = useState(false)

  // ─── Load Lightweight Charts ───────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    if ((window as any).LightweightCharts) { setChartReady(true); return }
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js'
    script.async = true
    script.onload = () => setChartReady(true)
    document.body.appendChild(script)
    return () => { script.remove() }
  }, [])

  // ─── Fullscreen ────────────────────────────────────────────────────────────
  const toggleFullscreen = () => {
    if (!chartWrapRef.current) return
    if (!isFullscreen) chartWrapRef.current.requestFullscreen?.().catch(() => {})
    else document.exitFullscreen?.().catch(() => {})
    setIsFullscreen(f => !f)
  }
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  // ─── Fetch — 1 request, semua data ────────────────────────────────────────
  const fetchAllData = useCallback(async (code: string, days: number) => {
    if (!code) return
    setIsLoading(true)
    setErrorMsg('')

    try {
      const res = await fetch(`/api/stock-detail?code=${code}&days=${days}`)
      const json = await res.json()

      if (!res.ok || json.error) {
        setErrorMsg(json.error || 'Failed to fetch data')
        return
      }

      setStockData(json.stockData)
      setSmartMoneyIndex(json.smartMoneyIndex)
      setForeignDivergence(json.foreignDivergence)
      setBrokerData(json.brokerData || [])
      setOwnershipDetails(
        (json.ownershipDetails || []).map((d: any) => ({
          investor_name: d.investor_name,
          investor_type: d.investor_type,
          local_foreign: d.local_foreign,
          percentage: Number(d.percentage),
          shares: Number(d.total_holding_shares || 0),
        }))
      )
      setWhaleMovement(json.whaleMovement || [])
      setHistoryData(
        (json.historyData || []).map((d: any) => ({
          time: String(d.trading_date).split('T')[0],
          open: Number(d.open_price) || Number(d.previous) || Number(d.close) || 0,
          high: Number(d.high) || Number(d.close) || 0,
          low: Number(d.low) || Number(d.close) || 0,
          close: Number(d.close) || 0,
          volume: Number(d.volume) || 0,
          net_foreign: Number(d.net_foreign_value) || 0,
          aov_ratio: Number(d.aov_ratio_ma20) || 1,
          vwma: Number(d.vwma_20d) || 0,
          whale_signal: !!d.whale_signal,
          big_player_anomaly: !!d.big_player_anomaly,
        }))
      )

    } catch (err: any) {
      setErrorMsg(err.message || 'Failed')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (stockCode) fetchAllData(stockCode, period)
  }, [stockCode, period, fetchAllData])

  // ─── Render Chart ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chartReady || !chartContainerRef.current || !historyData.length) return
    const lwc = (window as any).LightweightCharts
    if (!lwc) return
  
    chartContainerRef.current.innerHTML = ''
    const chart = lwc.createChart(chartContainerRef.current, {
      height: isFullscreen ? window.innerHeight - 50 : 600,
      autoSize: true,
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
  
    // Markers
    const markers: any[] = []
    historyData.forEach(d => {
      if (d.whale_signal || d.aov_ratio >= 1.5)
        markers.push({ time: d.time, position: 'aboveBar', color: '#10b981', shape: 'circle', size: 1.5, text: '★' })
      if (d.aov_ratio <= 0.6 && d.aov_ratio > 0)
        markers.push({ time: d.time, position: 'belowBar', color: '#ef4444', shape: 'circle', size: 1.5, text: '⚡' })
      if (d.big_player_anomaly)
        markers.push({ time: d.time, position: 'belowBar', color: '#ec4899', shape: 'circle', size: 1.5, text: '◆' })
    })
    markers.sort((a, b) => (a.time < b.time ? -1 : 1))
    candleSeries.setMarkers(markers)
  
    // VWMA
    const vwmaSeries = chart.addLineSeries({ color: '#3b82f6', lineWidth: 2, lineStyle: 2, crosshairMarkerVisible: false, lastValueVisible: true, priceLineVisible: false })
    vwmaSeries.setData(historyData.filter(d => d.vwma > 0).map(d => ({ time: d.time, value: d.vwma })))
  
    // AOV
    const aovSeries = chart.addLineSeries({ color: '#8b5cf6', lineWidth: 2, priceScaleId: 'left' })
    chart.priceScale('left').applyOptions({ scaleMargins: { top: 0.60, bottom: 0.20 } })
    aovSeries.setData(historyData.map(d => ({ time: d.time, value: d.aov_ratio })))
    aovSeries.createPriceLine({ price: 1.5, color: '#22c55e', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '🐋 1.5x' })
    aovSeries.createPriceLine({ price: 0.6, color: '#ef4444', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '🩸 0.6x' })
  
    // Volume
    const volSeries = chart.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' } })
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.65, bottom: 0.15 } })
    volSeries.setData(historyData.map(d => ({ time: d.time, value: d.volume, color: d.close >= d.open ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)' })))
  
    // Net Foreign
    const foreignSeries = chart.addHistogramSeries({ priceScaleId: 'foreign' })
    chart.priceScale('foreign').applyOptions({ scaleMargins: { top: 0.88, bottom: 0 } })
    foreignSeries.setData(historyData.map(d => ({ time: d.time, value: d.net_foreign, color: d.net_foreign >= 0 ? 'rgba(34,197,94,0.8)' : 'rgba(239,68,68,0.8)' })))
  
    chart.timeScale().fitContent()
  
    // ⭐ RESIZE HANDLER
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth })
      }
    }
    window.addEventListener('resize', handleResize)
  
    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
    }
  }, [historyData, chartReady, isFullscreen])

  // ─── Derived ───────────────────────────────────────────────────────────────
  const smiScore = smartMoneyIndex?.smart_money_score || 0
  const convictionScore = useMemo(() => {
    let s = smiScore
    if (stockData?.whale_signal) s = Math.min(100, s + 10)
    if ((stockData?.aov_ratio_ma20 || 1) >= 1.5) s = Math.min(100, s + 10)
    return Math.round(s)
  }, [smiScore, stockData])

  const verdict = useMemo(() => {
    let score = 0
    const reasons: string[] = []
    if (convictionScore >= 80) { score += 3; reasons.push('Conviction tinggi') }
    else if (convictionScore >= 60) { score += 1.5; reasons.push('Conviction moderat') }
    else reasons.push('Conviction rendah')
    if (smiScore >= 60) { score += 2; reasons.push('Smart Money positif') }
    else if (smiScore < 30) { score -= 1; reasons.push('Smart Money negatif') }
    const netF = stockData?.net_foreign_value || 0
    if (netF > 1e9) { score += 1.5; reasons.push('Foreign net buy besar') }
    else if (netF < -1e9) { score -= 1; reasons.push('Foreign net sell besar') }
    if ((stockData?.aov_ratio_ma20 || 1) >= 1.5) { score += 1; reasons.push('AOV spike (whale aktif)') }

    if (score >= 5) return { label: 'STRONG BUY', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', reasons }
    if (score >= 3) return { label: 'WATCH / ACCUMULATE', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', reasons }
    if (score >= 1) return { label: 'HOLD / MONITOR', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30', reasons }
    return { label: 'AVOID / REDUCE', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', reasons }
  }, [convictionScore, smiScore, stockData])

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

  // ─── Guards ────────────────────────────────────────────────────────────────
  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="w-12 h-12 text-gold-400 animate-spin" />
      <p className="ml-3 text-gold-400 font-medium">Loading {stockCode}...</p>
    </div>
  )
  if (errorMsg) return (
    <div className="glass rounded-xl p-12 text-center">
      <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
      <p className="text-red-400 font-medium">{errorMsg}</p>
    </div>
  )
  if (!stockData) return null

  const publicShares = (stockData.tradeable_shares || 0) * ((stockData.free_float || 0) / 100)
  const floatCap = publicShares * stockData.close
  const dailyTurnover = publicShares > 0 ? ((stockData.volume || 0) / publicShares) * 100 : 0
  const marketCap = (stockData.tradeable_shares || 0) * stockData.close

  return (
    <div className="space-y-4 pb-12 animate-fade-in">

      {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
      <div className="glass rounded-3xl p-5 lg:p-7 border border-white/[0.08] shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-emerald-500/5 blur-[100px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 bg-blue-500/5 blur-[100px] rounded-full pointer-events-none" />

        <div className="relative z-10 flex flex-col xl:flex-row gap-6 justify-between">
          {/* Title & Price */}
          <div className="flex flex-col justify-center min-w-fit">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl lg:text-4xl font-black text-white tracking-tight">{stockCode}</h1>
              <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-black uppercase tracking-wider">
                {stockData.sector || 'Stock'}
              </span>
            </div>
            <div className="flex items-baseline gap-4 mt-2">
              <span className="text-4xl lg:text-5xl font-black text-white tracking-tighter">{formatRupiah(stockData.close)}</span>
              <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-black text-base lg:text-lg ${
                stockData.change_percent >= 0
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                  : 'bg-red-500/10 text-red-400 border border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.15)]'
              }`}>
                {stockData.change_percent >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                {Math.abs(stockData.change_percent).toFixed(2)}%
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-4 font-medium flex gap-3 lg:gap-4 bg-white/[0.02] p-2 rounded-lg border border-white/[0.04] w-fit">
              <span><span className="opacity-50">H:</span> <span className="text-white/80">{formatNumber(stockData.high)}</span></span>
              <span><span className="opacity-50">L:</span> <span className="text-white/80">{formatNumber(stockData.low)}</span></span>
              <span><span className="opacity-50">O:</span> <span className="text-white/80">{formatNumber(stockData.open_price)}</span></span>
              <span className="opacity-30">|</span>
              <span className="opacity-60 flex items-center gap-1"><Clock className="w-3 h-3" /> {String(stockData.trading_date).split('T')[0]}</span>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 flex-1 xl:max-w-[440px]">
            {[
              { label: 'Market Cap',    value: formatRupiah(marketCap),         color: 'text-gold-400',   icon: <DollarSign className="w-4 h-4 text-gold-400/30" /> },
              { label: 'Float Cap',     value: formatRupiah(floatCap),           color: 'text-gold-400',   icon: <PieChartIcon className="w-4 h-4 text-gold-400/30" /> },
              { label: 'Public Shares', value: formatShares(publicShares),       color: 'text-cyan-400',   icon: <Users className="w-4 h-4 text-cyan-400/30" /> },
              { label: 'Volume',        value: formatShares(stockData.volume),   color: 'text-orange-400', icon: <Activity className="w-4 h-4 text-orange-400/30" /> },
              { label: 'Value',         value: formatRupiah(stockData.value),    color: 'text-blue-400',   icon: <DollarSign className="w-4 h-4 text-blue-400/30" /> },
            ].map((m, i) => (
              <div key={i} className="p-3 rounded-2xl bg-white/[0.02] border border-white/[0.04] flex flex-col justify-center relative overflow-hidden group hover:bg-white/[0.04] transition-colors">
                <div className="absolute right-3 top-3 transition-transform group-hover:scale-110">{m.icon}</div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2 font-medium">{m.label}</p>
                <p className={`text-base font-black ${m.color} tracking-tight`}>{m.value}</p>
              </div>
            ))}
          </div>

          {/* Verdict */}
          <div className={`rounded-3xl p-5 ${verdict.bg} border ${verdict.border} xl:min-w-[260px] flex flex-col justify-center relative overflow-hidden shrink-0 shadow-xl`}>
            <div className={`absolute -right-6 -bottom-6 opacity-[0.03] ${verdict.color}`}><Shield className="w-32 h-32" /></div>
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-3">
                <Shield className={`w-5 h-5 ${verdict.color}`} />
                <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Verdict & Signal</span>
              </div>
              <p className={`text-xl font-black ${verdict.color} mb-3 tracking-tight`}>{verdict.label}</p>
              <div className="space-y-1.5">
                {verdict.reasons.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 bg-black/10 p-1.5 rounded-md">
                    <span className={`mt-0.5 text-[10px] ${verdict.color}`}>✦</span>
                    <p className="text-xs text-foreground/80 font-medium">{r}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Metrics Bar */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mt-6 pt-5 border-t border-white/[0.05]">
          {[
            { label: 'Conviction',   value: `${convictionScore}`,                         color: convictionScore >= 80 ? 'text-emerald-400' : convictionScore >= 60 ? 'text-amber-400' : 'text-red-400' },
            { label: 'Smart Money',  value: `${Math.round(smiScore)}`,                    color: smiScore >= 60 ? 'text-emerald-400' : smiScore >= 30 ? 'text-amber-400' : 'text-red-400' },
            { label: 'Foreign Flow', value: formatRupiah(stockData.net_foreign_value),    color: stockData.net_foreign_value >= 0 ? 'text-emerald-400' : 'text-red-400' },
            { label: 'AOV Ratio',    value: `${(stockData.aov_ratio_ma20||1).toFixed(2)}x`, color: stockData.aov_ratio_ma20 >= 1.5 ? 'text-purple-400' : 'text-muted-foreground' },
            { label: 'Turnover',     value: `${dailyTurnover.toFixed(2)}%`,               color: dailyTurnover > 5 ? 'text-emerald-400' : dailyTurnover < 1 ? 'text-red-400' : 'text-amber-400' },
            { label: 'Free Float',   value: `${stockData.free_float?.toFixed(1)||'--'}%`, color: 'text-blue-400' },
          ].map((m, i) => (
            <div key={i} className="p-2 rounded-xl bg-white/[0.01] hover:bg-white/[0.03] transition-colors border border-white/[0.03] text-center">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">{m.label}</p>
              <p className={`text-sm font-black ${m.color}`}>{m.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ══ CHART ═══════════════════════════════════════════════════════════ */}
      <div ref={chartWrapRef} className={`glass rounded-2xl p-4 border border-white/[0.06] relative group ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none bg-[#0b1221] flex flex-col' : ''
      }`}>
        {isFullscreen && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden">
            <span className="text-[15vw] font-black text-white/[0.04] select-none uppercase tracking-tighter leading-none">{stockCode}</span>
          </div>
        )}
        <div className="relative z-10 flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-1 bg-white/[0.04] rounded-lg p-0.5">
            {PERIOD_OPTIONS.map(opt => (
              <button key={opt.days} onClick={() => setPeriod(opt.days)}
                className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${period === opt.days ? 'bg-gold-400/20 text-gold-400' : 'text-muted-foreground hover:text-white'}`}>
                {opt.label}
              </button>
            ))}
          </div>
          <button onClick={toggleFullscreen} className="p-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-muted-foreground hover:text-gold-400 transition-colors">
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
        <div className="flex items-center gap-4 text-[9px] text-muted-foreground mb-2 flex-wrap relative z-10">
          <span>🕯️ Candle</span><span className="text-blue-400">── VWMA 20</span>
          <span className="text-purple-400">── AOV Ratio</span><span>📊 Volume</span>
          <span>🌏 Net Foreign</span><span className="text-emerald-400">★ Whale</span>
          <span className="text-red-400">⚡ Low AOV</span><span className="text-pink-400">◆ Anomaly</span>
        </div>
        <div ref={chartContainerRef} className={`w-full ${isFullscreen ? 'flex-1' : 'h-[600px]'}`} />
      </div>

      {/* ══ 3 SIGNAL CARDS ══════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Smart Money Index */}
        <div className="glass rounded-xl p-4 border border-white/[0.06]">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-gold-400" />
            <h3 className="text-[10px] font-black text-gold-400 uppercase tracking-widest">Smart Money Index</h3>
          </div>
          {smartMoneyIndex ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { l: 'Score',       v: Math.round(smiScore),                          c: smiScore >= 60 ? 'text-emerald-400' : smiScore >= 30 ? 'text-amber-400' : 'text-red-400' },
                  { l: 'Conviction',  v: convictionScore,                                c: convictionScore >= 60 ? 'text-blue-400' : 'text-muted-foreground' },
                  { l: 'Broker Net',  v: formatRupiah(smartMoneyIndex.broker_net || 0), c: (smartMoneyIndex.broker_net || 0) >= 0 ? 'text-emerald-400' : 'text-red-400' },
                  { l: 'Foreign 30D', v: formatRupiah(smartMoneyIndex.foreign_30d || 0), c: (smartMoneyIndex.foreign_30d || 0) >= 0 ? 'text-emerald-400' : 'text-red-400' },
                ].map((m, i) => (
                  <div key={i} className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                    <p className="text-[8px] text-muted-foreground uppercase">{m.l}</p>
                    <p className={`text-xs font-black ${m.c}`}>{m.v}</p>
                  </div>
                ))}
              </div>
              <p className="text-[9px] text-muted-foreground font-mono leading-relaxed">{smartMoneyIndex.signal || '--'}</p>
            </div>
          ) : <p className="text-xs text-muted-foreground text-center py-4">No data</p>}
        </div>

        {/* Broker Activity */}
        <div className="glass rounded-xl p-4 border border-white/[0.06]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-400" />
              <h3 className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Broker Activity</h3>
            </div>
            <Link href={`/broker-tracker?code=${stockCode}`}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[9px] font-bold hover:bg-blue-500/20 transition-all">
              <ExternalLink className="w-3 h-3" /> Full Summary
            </Link>
          </div>
          {brokerData.length > 0 ? (
            <div className="space-y-1.5">
              {brokerData.map((b: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/[0.03] last:border-0">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-foreground truncate">{b.kode_broker}</p>
                    <p className="text-[8px] text-muted-foreground/50 truncate max-w-[120px]">{b.nama_broker}</p>
                  </div>
                  <span className={`text-[10px] font-black shrink-0 ml-2 ${Number(b.net_value) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatRupiah(Number(b.net_value))}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 opacity-50">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center mb-3">
                <Building2 className="w-5 h-5 text-blue-400" />
              </div>
              <p className="text-xs text-foreground font-medium">No Broker Data</p>
              <p className="text-[10px] text-muted-foreground mt-1 text-center max-w-[180px]">Transaction data is currently unavailable for this period.</p>
            </div>
          )}
        </div>

        {/* Foreign Flow + Divergence */}
        <div className="glass rounded-xl p-4 border border-white/[0.06]">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-emerald-400" />
            <h3 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Foreign Flow</h3>
          </div>
          {foreignDivergence ? (
            <div className="space-y-3">
              <div className={`px-3 py-2.5 rounded-xl text-[11px] font-black text-center border ${
                foreignDivergence.divergence_type?.includes('STEALTH') || foreignDivergence.divergence_type?.includes('BULLISH')
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]'
                  : foreignDivergence.divergence_type?.includes('BEARISH') || foreignDivergence.divergence_type?.includes('DISTRIBUTION')
                  ? 'bg-red-500/10 text-red-400 border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]'
                  : 'bg-white/[0.02] text-muted-foreground border-white/[0.04]'
              }`}>{foreignDivergence.divergence_type || 'NEUTRAL'}</div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest flex items-center gap-1.5"><DollarSign className="w-3 h-3" /> Net Value</span>
                <span className={`text-sm font-black ${stockData.net_foreign_value >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {stockData.net_foreign_value >= 0 ? '+' : ''}{formatRupiah(stockData.net_foreign_value)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="p-2 rounded-lg bg-white/[0.01] border border-white/[0.02]">
                  <span className="text-muted-foreground block mb-0.5">Price Chg (1D)</span>
                  <span className={`font-bold ${(foreignDivergence.price_chg_pct || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {Number(foreignDivergence.price_chg_pct || 0).toFixed(2)}%
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-white/[0.01] border border-white/[0.02]">
                  <span className="text-muted-foreground block mb-0.5">Signal</span>
                  <span className="text-gold-400 font-bold">{foreignDivergence.signal_strength || 'WEAK'}</span>
                </div>
              </div>
              {foreignDivergence.interpretation && (
                <div className="p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/10">
                  <p className="text-[10px] text-blue-200/70 leading-relaxed flex items-start gap-1.5">
                    <span className="shrink-0 mt-0.5">💡</span>
                    <span>{foreignDivergence.interpretation}</span>
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 opacity-50">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3"><Globe className="w-5 h-5 text-emerald-400" /></div>
              <p className="text-xs text-foreground font-medium">No Foreign Data</p>
            </div>
          )}
        </div>
      </div>

      {/* ══ OWNERSHIP ═══════════════════════════════════════════════════════ */}
      <div className="glass rounded-2xl p-5 border border-white/[0.06]">
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <PieChartIcon className="w-4 h-4 text-gold-400" />
          <h2 className="text-sm font-black text-white uppercase tracking-widest">Ownership Structure</h2>
          <span className="text-[9px] text-muted-foreground/40 hidden sm:inline">· KSEI Scripless</span>
        </div>
        {ownershipPieData.length > 0 ? (
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="w-full lg:w-2/5 flex flex-col items-center">
              <div className="w-64 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={ownershipPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} stroke="none">
                      {ownershipPieData.map((entry, i) => <Cell key={i} fill={INVESTOR_TYPE_COLORS[entry.name] || '#6b7280'} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '11px' }}
                      formatter={(value: any, name: any) => [`${Number(value).toFixed(1)}%`, name]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-3 mt-2 justify-center">
                {ownershipPieData.map((entry, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[9px]">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: INVESTOR_TYPE_COLORS[entry.name] || '#6b7280' }} />
                    <span className="text-muted-foreground">{entry.name}</span>
                    <span className="font-bold text-foreground">{entry.value.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-[9px] text-muted-foreground uppercase border-b border-white/[0.05]">
                  <th className="p-2 text-left">Investor</th><th className="p-2 text-left">Type</th>
                  <th className="p-2 text-center">L/F</th><th className="p-2 text-right">%</th><th className="p-2 text-right">Shares</th>
                </tr></thead>
                <tbody>
                  {ownershipDetails.map((d: any, i: number) => (
                    <tr key={i} className="border-b border-white/[0.02] hover:bg-white/[0.02]">
                      <td className="p-2 font-bold text-[10px] text-foreground truncate max-w-[120px]">{d.investor_name}</td>
                      <td className="p-2 text-[10px] text-muted-foreground">{d.investor_type}</td>
                      <td className="p-2 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${d.local_foreign === 'F' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                          {d.local_foreign === 'F' ? 'Foreign' : 'Local'}
                        </span>
                      </td>
                      <td className="p-2 text-right font-black">{d.percentage.toFixed(2)}%</td>
                      <td className="p-2 text-right text-muted-foreground">{formatShares(d.shares)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 opacity-60 bg-white/[0.01] rounded-xl border border-white/[0.02] mt-4">
            <div className="w-16 h-16 rounded-full bg-gold-400/10 flex items-center justify-center mb-4"><PieChartIcon className="w-8 h-8 text-gold-400" /></div>
            <p className="text-sm text-foreground font-bold">No Ownership Data</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm text-center">KSEI scripless ownership data is currently unavailable for {stockCode}.</p>
          </div>
        )}
      </div>

      {/* ══ WHALE ════════════════════════════════════════════════════════════ */}
      {whaleMovement.length > 0 && (
        <div className="glass rounded-2xl p-5 border border-white/[0.06]">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-purple-400" />
            <h2 className="text-sm font-black text-white uppercase tracking-widest">Whale Position Tracking</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-[9px] text-muted-foreground uppercase border-b border-white/[0.05]">
                <th className="p-2 text-left">Investor</th><th className="p-2 text-center">Type</th>
                <th className="p-2 text-right">%</th><th className="p-2 text-right">Shares</th>
                <th className="p-2 text-right">Entry Price</th><th className="p-2 text-right">Return</th>
                <th className="p-2 text-center">Trend</th><th className="p-2 text-center">Verdict</th>
              </tr></thead>
              <tbody>
                {whaleMovement.map((w: any, i: number) => (
                  <tr key={i} className="border-b border-white/[0.02] hover:bg-white/[0.02]">
                    <td className="p-2 font-bold text-[10px] text-foreground">{w.investor_name}</td>
                    <td className="p-2 text-center"><span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${w.local_foreign === 'F' ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-400'}`}>{w.local_foreign === 'F' ? 'FOREIGN' : 'LOCAL'}</span></td>
                    <td className="p-2 text-right font-black">{Number(w.latest_percentage).toFixed(2)}%</td>
                    <td className="p-2 text-right text-muted-foreground">{formatShares(w.latest_shares)}</td>
                    <td className="p-2 text-right">{formatNumber(w.est_entry_price)}</td>
                    <td className={`p-2 text-right font-black ${w.return_since_entry >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{Number(w.return_since_entry).toFixed(2)}%</td>
                    <td className="p-2 text-center"><span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${w.position_trend === 'INCREASING' ? 'bg-emerald-500/10 text-emerald-400' : w.position_trend === 'DECREASING' ? 'bg-red-500/10 text-red-400' : 'bg-blue-500/10 text-blue-400'}`}>{w.position_trend}</span></td>
                    <td className="p-2 text-center text-[9px] font-bold text-gold-400">{w.whale_verdict}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Broker CTA */}
      <div className="flex justify-center">
        <Link href={`/broker-tracker?code=${stockCode}`}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/30 text-white font-bold text-sm hover:from-blue-500/30 hover:to-purple-500/30 transition-all shadow-lg">
          <BarChart3 className="w-5 h-5 text-blue-400" />
          Open Full Broker Summary for {stockCode}
          <ExternalLink className="w-4 h-4 ml-1 opacity-50" />
        </Link>
      </div>
    </div>
  )
}
