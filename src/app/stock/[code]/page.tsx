'use client'

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { formatRupiah, formatPercent, formatNumber, formatShares } from '@/lib/utils'
import { 
  Search, TrendingUp, TrendingDown, Activity, AlertTriangle, Clock, 
  Zap, Target, DollarSign, PieChart as PieChartIcon, ArrowRightLeft, Building2, 
  Flame, Scale, Globe, Eye, Shield, ArrowUp, ArrowDown, RefreshCw,
  Loader2, Maximize2, Minimize2, ExternalLink, BarChart3, Users
} from 'lucide-react'
import { 
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line,
  ComposedChart, Area
} from 'recharts'
import Link from 'next/link'

// ─── Constants ────────────────────────────────────────────────────────────────
const PERIOD_OPTIONS = [
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
]

const OWNERSHIP_COLORS = {
  'Institusi Lokal': '#10b981',
  'Individu Lokal': '#3b82f6',
  'Institusi Asing': '#f59e0b',
  'Individu Asing': '#ef4444',
  'Lainnya': '#6b7280',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtLarge = (v: number) => {
  const a = Math.abs(v)
  if (a >= 1e12) return `${(v / 1e12).toFixed(1)}T`
  if (a >= 1e9) return `${(v / 1e9).toFixed(1)}B`
  if (a >= 1e6) return `${(v / 1e6).toFixed(0)}M`
  return v.toLocaleString('id-ID')
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface StockData {
  stock_code: string; close: number; change_percent: number
  high: number; low: number; open_price: number
  volume: number; value: number; frequency: number
  net_foreign_value: number; vwma_20d: number
  aov_ratio_ma20: number; whale_signal: boolean
  big_player_anomaly: boolean; signal: string; sector: string
  free_float: number; tradeable_shares: number; trading_date: string
}

interface HistoryPoint {
  time: string; open: number; high: number; low: number; close: number
  volume: number; net_foreign: number; aov_ratio: number; vwma: number
  whale_signal: boolean; big_player_anomaly: boolean
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function StockDetailPage() {
  const params = useParams()
  const router = useRouter()
  const stockCode = (params?.code as string)?.toUpperCase() || ''

  // States
  const [period, setPeriod] = useState(90)
  const [stockData, setStockData] = useState<StockData | null>(null)
  const [historyData, setHistoryData] = useState<HistoryPoint[]>([])
  const [smartMoneyIndex, setSmartMoneyIndex] = useState<any>(null)
  const [leadIndicator, setLeadIndicator] = useState<any[]>([])
  const [volumeSpikes, setVolumeSpikes] = useState<any[]>([])
  const [brokerData, setBrokerData] = useState<any[]>([])
  const [ownershipData, setOwnershipData] = useState<any[]>([])
  const [whaleMovement, setWhaleMovement] = useState<any[]>([])
  const [foreignDivergence, setForeignDivergence] = useState<any>(null)
  const [convictionData, setConvictionData] = useState<any>(null)
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
    return () => { script.remove() }
  }, [])

  // ─── Fullscreen handler ─────────────────────────────────────────────────────
  const toggleFullscreen = () => {
    if (!chartWrapRef.current) return
    if (!isFullscreen) {
      chartWrapRef.current.requestFullscreen?.().catch(() => {})
    } else {
      document.exitFullscreen?.().catch(() => {})
    }
    setIsFullscreen(f => !f)
  }

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  // ─── Fetch All Data ─────────────────────────────────────────────────────────
  const fetchAllData = useCallback(async (code: string, days: number) => {
    if (!code) return
    setIsLoading(true)
    setErrorMsg('')

    try {
      const [
        latestRes, historyRes, smiRes, leadRes, spikeRes,
        brokerRes, ownerRes, whaleRes, foreignRes, convictionRes
      ] = await Promise.all([
        supabase.from('daily_transactions').select('*').eq('stock_code', code)
          .order('trading_date', { ascending: false }).limit(1).single(),
        supabase.from('daily_transactions')
          .select('trading_date,open_price,high,low,close,volume,net_foreign_value,vwma_20d,aov_ratio_ma20,whale_signal,big_player_anomaly,previous')
          .eq('stock_code', code).order('trading_date', { ascending: false }).limit(days),
        supabase.rpc('get_smart_money_index', { p_stock_code: code, p_window: 30 }),
        supabase.rpc('get_smart_money_lead_indicator', { p_stock_code: code, p_months: 6 }),
        supabase.rpc('get_volume_spike', { p_stock_code: code, p_window: 30 }),
        supabase.rpc('get_broker_divergence', { p_stock_code: code, p_start_date: '2026-01-01' }),
        supabase.rpc('get_ownership_structure', { p_stock_code: code }),
        supabase.rpc('get_whale_timing_analysis', { p_stock_code: code }),
        supabase.rpc('get_stealth_vs_foreign_divergence', { p_stock_code: code, p_window: 30 }),
        supabase.rpc('get_conviction_score', { p_stock_code: code, p_window: 5 }),
      ])

      if (latestRes.error || !latestRes.data) {
        setErrorMsg(`Stock ${code} not found`)
        setIsLoading(false)
        return
      }
      setStockData(latestRes.data)

      if (historyRes.data) {
        setHistoryData(historyRes.data.reverse().map((d: any) => ({
          time: d.trading_date,
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
      }

      if (smiRes.data?.[0]) setSmartMoneyIndex(smiRes.data[0])
      if (leadRes.data) setLeadIndicator(leadRes.data)
      if (spikeRes.data) setVolumeSpikes(spikeRes.data.filter((d: any) => d.spike_type !== 'NORMAL').slice(0, 5))
      if (brokerRes.data) setBrokerData(brokerRes.data.slice(0, 6))
      if (ownerRes.data) setOwnershipData(ownerRes.data)
      if (whaleRes.data) setWhaleMovement(whaleRes.data)
      if (foreignRes.data?.[0]) setForeignDivergence(foreignRes.data[0])
      if (convictionRes.data?.[0]) setConvictionData(convictionRes.data[0])
    } catch (err: any) {
      console.error(err)
      setErrorMsg(err.message || 'Failed to fetch data')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (stockCode) fetchAllData(stockCode, period)
  }, [stockCode, period, fetchAllData])

  // ─── Render Chart ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chartReady || !chartContainerRef.current || historyData.length === 0) return

    const lwc = window.LightweightCharts
    if (!lwc) return

    chartContainerRef.current.innerHTML = ''

    const chart = lwc.createChart(chartContainerRef.current, {
      height: isFullscreen ? window.innerHeight - 50 : 500,
      autoSize: true,
      layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#94a3b8' },
      grid: { vertLines: { color: 'rgba(51,65,85,0.15)' }, horzLines: { color: 'rgba(51,65,85,0.15)' } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: 'rgba(51,65,85,0.5)' },
      timeScale: { borderColor: 'rgba(51,65,85,0.5)', timeVisible: true },
    })

    // Candle series
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e', downColor: '#ef4444', borderVisible: false,
      wickUpColor: '#22c55e', wickDownColor: '#ef4444',
    })
    candleSeries.setData(historyData.map(d => ({
      time: d.time, open: d.open, high: d.high, low: d.low, close: d.close,
    })))

    // VWMA
    const vwmaSeries = chart.addLineSeries({
      color: '#3b82f6', lineWidth: 2, lineStyle: 2,
      crosshairMarkerVisible: false, lastValueVisible: true, priceLineVisible: false,
    })
    vwmaSeries.setData(historyData.filter(d => d.vwma > 0).map(d => ({ time: d.time, value: d.vwma })))

    // Volume
    const volSeries = chart.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' } })
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.65, bottom: 0.15 } })
    volSeries.setData(historyData.map(d => ({
      time: d.time, value: d.volume,
      color: d.close >= d.open ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)',
    })))

    // Net Foreign
    const foreignSeries = chart.addHistogramSeries({ priceScaleId: 'foreign' })
    chart.priceScale('foreign').applyOptions({ scaleMargins: { top: 0.88, bottom: 0 } })
    foreignSeries.setData(historyData.map(d => ({
      time: d.time, value: d.net_foreign,
      color: d.net_foreign >= 0 ? 'rgba(34,197,94,0.7)' : 'rgba(239,68,68,0.7)',
    })))

    // Markers
    const markers: any[] = []
    historyData.forEach(d => {
      if (d.whale_signal || d.aov_ratio >= 1.5) {
        markers.push({ time: d.time, position: 'aboveBar', color: '#10b981', shape: 'circle', size: 1.5, text: '★' })
      }
      if (d.aov_ratio <= 0.6 && d.aov_ratio > 0) {
        markers.push({ time: d.time, position: 'belowBar', color: '#ef4444', shape: 'circle', size: 1.5, text: '⚡' })
      }
    })
    markers.sort((a, b) => (a.time < b.time ? -1 : 1))
    candleSeries.setMarkers(markers)

    chart.timeScale().fitContent()

    return () => { chart.remove() }
  }, [historyData, chartReady, isFullscreen])

  // ─── Derived Data ───────────────────────────────────────────────────────────
  const foreignCorrelationData = useMemo(() => {
    let cum = 0
    return historyData.map(d => { cum += d.net_foreign; return { ...d, cumulative_foreign: cum } })
  }, [historyData])

  const ownershipPieData = useMemo(() => {
    if (!ownershipData.length) return []
    return ownershipData.map((cat: any) => ({
      name: cat.category,
      value: Number(cat.total_percentage),
      shares: Number(cat.total_shares),
      investors: cat.investor_count,
    }))
  }, [ownershipData])

  const smiScore = smartMoneyIndex?.smart_money_score || 0
  const convictionScore = convictionData?.score || 0

  // Verdict synthesis
  const verdict = useMemo(() => {
    let score = 0
    let reasons: string[] = []
    if (convictionScore >= 80) { score += 3; reasons.push('Conviction tinggi') }
    else if (convictionScore >= 60) { score += 1.5; reasons.push('Conviction moderat') }
    else { reasons.push('Conviction rendah') }

    if (smiScore >= 60) { score += 2; reasons.push('Smart Money positif') }
    else if (smiScore < 30) { score -= 1; reasons.push('Smart Money negatif') }

    const netF = stockData?.net_foreign_value || 0
    if (netF > 1e9) { score += 1.5; reasons.push('Foreign net buy besar') }
    else if (netF < -1e9) { score -= 1; reasons.push('Foreign net sell besar') }

    const aov = stockData?.aov_ratio_ma20 || 1
    if (aov >= 1.5) { score += 1; reasons.push('AOV spike (whale aktif)') }

    if (score >= 5) return { label: 'STRONG BUY', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', reasons }
    if (score >= 3) return { label: 'WATCH / ACCUMULATE', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', reasons }
    if (score >= 1) return { label: 'HOLD / MONITOR', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30', reasons }
    return { label: 'AVOID / REDUCE', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', reasons }
  }, [convictionScore, smiScore, stockData])

  // ─── Render ─────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-gold-400 animate-spin" />
          <p className="text-gold-400 font-medium animate-pulse">Loading {stockCode}...</p>
        </div>
      </div>
    )
  }

  if (errorMsg) {
    return (
      <div className="glass rounded-xl p-12 text-center">
        <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <p className="text-red-400 font-medium">{errorMsg}</p>
      </div>
    )
  }

  if (!stockData) return null

  const publicShares = (stockData.tradeable_shares || 0) * ((stockData.free_float || 0) / 100)
  const floatCap = publicShares * stockData.close
  const dailyTurnover = publicShares > 0 ? ((stockData.volume || 0) / publicShares) * 100 : 0

  return (
    <div className="space-y-5 pb-12 animate-fade-in">

      {/* ════════════════════════════════════════════════════════════
          HEADER + VERDICT BOX
      ════════════════════════════════════════════════════════════ */}
      <div className="glass rounded-2xl p-5 border border-white/[0.08] shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          {/* Left: Identity & Price */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-3xl font-black text-white tracking-tight">{stockCode}</h1>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-black uppercase">
                {stockData.sector || 'Stock'}
              </span>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-black text-white">{formatRupiah(stockData.close)}</span>
              <span className={`flex items-center gap-1 px-3 py-1 rounded-xl font-black text-sm ${
                stockData.change_percent >= 0 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}>
                {stockData.change_percent >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {Math.abs(stockData.change_percent).toFixed(2)}%
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              H: {formatNumber(stockData.high)} · L: {formatNumber(stockData.low)} · O: {formatNumber(stockData.open_price)} · {stockData.trading_date}
            </p>
          </div>

          {/* Right: Verdict Box */}
          <div className={`rounded-2xl p-4 ${verdict.bg} border ${verdict.border} min-w-[200px]`}>
            <div className="flex items-center gap-2 mb-2">
              <Shield className={`w-5 h-5 ${verdict.color}`} />
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Verdict</span>
            </div>
            <p className={`text-xl font-black ${verdict.color} mb-2`}>{verdict.label}</p>
            <div className="space-y-0.5">
              {verdict.reasons.map((r, i) => (
                <p key={i} className="text-[9px] text-muted-foreground">• {r}</p>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Stats Row */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mt-4 pt-4 border-t border-white/[0.05]">
          {[
            { label: 'Conviction', value: `${convictionScore}`, icon: Shield, color: convictionScore >= 80 ? 'text-emerald-400' : convictionScore >= 60 ? 'text-amber-400' : 'text-red-400' },
            { label: 'Smart Money', value: `${Math.round(smiScore)}`, icon: Target, color: smiScore >= 60 ? 'text-emerald-400' : smiScore >= 30 ? 'text-amber-400' : 'text-red-400' },
            { label: 'Foreign Flow', value: formatRupiah(stockData.net_foreign_value), icon: Globe, color: stockData.net_foreign_value >= 0 ? 'text-emerald-400' : 'text-red-400' },
            { label: 'AOV Ratio', value: `${(stockData.aov_ratio_ma20 || 1).toFixed(2)}x`, icon: Zap, color: stockData.aov_ratio_ma20 >= 1.5 ? 'text-purple-400' : 'text-muted-foreground' },
            { label: 'Turnover', value: `${dailyTurnover.toFixed(2)}%`, icon: ArrowRightLeft, color: dailyTurnover > 5 ? 'text-emerald-400' : dailyTurnover < 1 ? 'text-red-400' : 'text-amber-400' },
            { label: 'Free Float', value: `${stockData.free_float?.toFixed(1) || '--'}%`, icon: PieChartIcon, color: 'text-blue-400' },
          ].map((m, i) => {
            const Icon = m.icon
            return (
              <div key={i} className="p-2 rounded-xl bg-white/[0.02] border border-white/[0.04] text-center">
                <p className="text-[8px] text-muted-foreground uppercase tracking-wider mb-0.5">{m.label}</p>
                <p className={`text-sm font-black ${m.color}`}>{m.value}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          CHART + PERIOD TOGGLE
      ════════════════════════════════════════════════════════════ */}
      <div ref={chartWrapRef} className={`glass rounded-2xl p-4 border border-white/[0.06] relative group ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none bg-[#0b1221] flex flex-col' : ''
      }`}>
        {/* Controls */}
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-1 bg-white/[0.04] rounded-lg p-0.5">
            {PERIOD_OPTIONS.map(opt => (
              <button key={opt.days} onClick={() => setPeriod(opt.days)}
                className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${
                  period === opt.days ? 'bg-gold-400/20 text-gold-400' : 'text-muted-foreground hover:text-white'
                }`}>{opt.label}</button>
            ))}
          </div>
          <button onClick={toggleFullscreen} className="p-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-muted-foreground hover:text-gold-400 transition-colors">
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-4 text-[9px] text-muted-foreground mb-2 flex-wrap">
          <span>🕯️ Candle</span>
          <span className="text-blue-400">── VWMA 20</span>
          <span>📊 Volume</span>
          <span>🌏 Net Foreign</span>
          <span className="text-emerald-400">★ Whale</span>
        </div>
        <div ref={chartContainerRef} className={`w-full ${isFullscreen ? 'flex-1' : 'h-[500px]'}`} />
      </div>

      {/* ════════════════════════════════════════════════════════════
          3 KOLOM SINYAL: Smart Money | Broker | Foreign
      ════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Smart Money */}
        <div className="glass rounded-xl p-4 border border-white/[0.06]">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-gold-400" />
            <h3 className="text-[10px] font-black text-gold-400 uppercase tracking-widest">Smart Money Index</h3>
          </div>
          {smartMoneyIndex ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { l: 'Score', v: Math.round(smiScore), c: 'text-emerald-400' },
                  { l: 'Conviction', v: smartMoneyIndex.conviction_score?.toFixed(0) || '--', c: 'text-blue-400' },
                  { l: 'Stealth', v: smartMoneyIndex.is_stealth ? '🕵️ YES' : 'NO', c: smartMoneyIndex.is_stealth ? 'text-purple-400' : '' },
                  { l: 'Foreign 30D', v: formatRupiah(smartMoneyIndex.net_foreign_30d || 0), c: (smartMoneyIndex.net_foreign_30d || 0) >= 0 ? 'text-emerald-400' : 'text-red-400' },
                ].map((m, i) => (
                  <div key={i} className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                    <p className="text-[8px] text-muted-foreground uppercase">{m.l}</p>
                    <p className={`text-xs font-black ${m.c}`}>{m.v}</p>
                  </div>
                ))}
              </div>
              <p className="text-[9px] text-muted-foreground font-mono leading-relaxed">{smartMoneyIndex.score_breakdown}</p>
            </div>
          ) : <p className="text-xs text-muted-foreground text-center py-4">No data</p>}
        </div>

        {/* Broker Summary (Compact) + Tombol ke Bandarmologi */}
        <div className="glass rounded-xl p-4 border border-white/[0.06]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-400" />
              <h3 className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Broker Activity</h3>
            </div>
            <Link
              href={`/bandarmologi?code=${stockCode}`}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[9px] font-bold hover:bg-blue-500/20 transition-all"
            >
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
                  <span className={`text-[10px] font-black shrink-0 ml-2 ${b.net_value >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatRupiah(b.net_value)}
                  </span>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-muted-foreground text-center py-4">No broker data</p>}
        </div>

        {/* Foreign Flow Divergence */}
        <div className="glass rounded-xl p-4 border border-white/[0.06]">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-emerald-400" />
            <h3 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Foreign Flow</h3>
          </div>
          {foreignDivergence ? (
            <div className="space-y-2">
              <div className={`px-3 py-2 rounded-lg text-[10px] font-black ${
                foreignDivergence.divergence_type?.includes('STEALTH') || foreignDivergence.divergence_type?.includes('BULLISH')
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : foreignDivergence.divergence_type?.includes('BEARISH') || foreignDivergence.divergence_type?.includes('DISTRIBUTION')
                  ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                  : 'bg-white/[0.02] text-muted-foreground border border-white/[0.04]'
              }`}>
                {foreignDivergence.divergence_type || 'NEUTRAL'}
              </div>
              <div className="grid grid-cols-2 gap-2 text-[9px]">
                <div><span className="text-muted-foreground">Price Chg: </span><span className={foreignDivergence.price_chg_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}>{Number(foreignDivergence.price_chg_pct).toFixed(2)}%</span></div>
                <div><span className="text-muted-foreground">Signal: </span><span className="text-gold-400">{foreignDivergence.signal_strength || 'WEAK'}</span></div>
              </div>
              {foreignDivergence.interpretation && (
                <p className="text-[9px] text-muted-foreground leading-relaxed">💡 {foreignDivergence.interpretation}</p>
              )}
            </div>
          ) : <p className="text-xs text-muted-foreground text-center py-4">No data</p>}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          OWNERSHIP PIE CHART + TABLE + MOVEMENT
      ════════════════════════════════════════════════════════════ */}
      <div className="glass rounded-2xl p-5 border border-white/[0.06]">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <PieChartIcon className="w-4 h-4 text-gold-400" />
            <h2 className="text-sm font-black text-white uppercase tracking-widest">Ownership Structure</h2>
            <span className="text-[9px] text-muted-foreground/40 hidden sm:inline">· KSEI Scripless</span>
          </div>
          <Link
            href={`/ownership?code=${stockCode}`}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gold-400/10 border border-gold-400/20 text-gold-400 text-[9px] font-bold hover:bg-gold-400/20 transition-all"
          >
            <ExternalLink className="w-3 h-3" /> Full Ownership
          </Link>
        </div>

        {ownershipPieData.length > 0 ? (
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Pie Chart */}
            <div className="w-full lg:w-2/5 flex flex-col items-center">
              <div className="w-64 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={ownershipPieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={3}
                      stroke="none"
                    >
                      {ownershipPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={OWNERSHIP_COLORS[entry.name as keyof typeof OWNERSHIP_COLORS] || '#6b7280'} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '11px' }}
                      formatter={(value: any, name: any) => [`${value.toFixed(1)}%`, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-3 mt-2 justify-center">
                {ownershipPieData.map((entry, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[9px]">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: OWNERSHIP_COLORS[entry.name as keyof typeof OWNERSHIP_COLORS] || '#6b7280' }} />
                    <span className="text-muted-foreground">{entry.name}</span>
                    <span className="font-bold text-foreground">{entry.value.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Detail Table */}
            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[9px] text-muted-foreground uppercase border-b border-white/[0.05]">
                    <th className="p-2 text-left">Category</th>
                    <th className="p-2 text-right">%</th>
                    <th className="p-2 text-right">Shares</th>
                    <th className="p-2 text-right">Investors</th>
                    <th className="p-2 text-left hidden md:table-cell">Top Holder</th>
                  </tr>
                </thead>
                <tbody>
                  {ownershipData.map((cat: any, i: number) => (
                    <tr key={i} className="border-b border-white/[0.02] hover:bg-white/[0.02]">
                      <td className="p-2 font-bold text-foreground">{cat.category}</td>
                      <td className="p-2 text-right font-black">{Number(cat.total_percentage).toFixed(2)}%</td>
                      <td className="p-2 text-right text-muted-foreground">{formatShares(cat.total_shares)}</td>
                      <td className="p-2 text-right">{cat.investor_count}</td>
                      <td className="p-2 text-[9px] text-muted-foreground hidden md:table-cell truncate max-w-[150px]">{cat.top1_investor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="text-center py-8 text-xs text-muted-foreground">No ownership data available</p>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════
          WHALE MOVEMENT (Perubahan dari periode ke periode)
      ════════════════════════════════════════════════════════════ */}
      {whaleMovement.length > 0 && (
        <div className="glass rounded-2xl p-5 border border-white/[0.06]">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-purple-400" />
            <h2 className="text-sm font-black text-white uppercase tracking-widest">Whale Position Tracking</h2>
            <span className="text-[9px] text-muted-foreground/40 hidden sm:inline">· Movement Detection</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[9px] text-muted-foreground uppercase border-b border-white/[0.05]">
                  <th className="p-2 text-left">Investor</th>
                  <th className="p-2 text-center">Type</th>
                  <th className="p-2 text-right">%</th>
                  <th className="p-2 text-right">Shares</th>
                  <th className="p-2 text-right">Entry Price</th>
                  <th className="p-2 text-right">Return</th>
                  <th className="p-2 text-center">Trend</th>
                  <th className="p-2 text-center">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {whaleMovement.map((w: any, i: number) => (
                  <tr key={i} className="border-b border-white/[0.02] hover:bg-white/[0.02]">
                    <td className="p-2 font-bold text-foreground text-[10px]">{w.investor_name}</td>
                    <td className="p-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                        w.local_foreign === 'F' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      }`}>{w.local_foreign === 'F' ? 'FOREIGN' : 'LOCAL'}</span>
                    </td>
                    <td className="p-2 text-right font-black">{Number(w.latest_percentage).toFixed(2)}%</td>
                    <td className="p-2 text-right text-muted-foreground">{formatShares(w.latest_shares)}</td>
                    <td className="p-2 text-right">{formatNumber(w.est_entry_price)}</td>
                    <td className={`p-2 text-right font-black ${w.return_since_entry >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {w.return_since_entry > 0 ? '+' : ''}{Number(w.return_since_entry).toFixed(2)}%
                    </td>
                    <td className="p-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                        w.position_trend === 'INCREASING' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : w.position_trend === 'DECREASING' ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                        : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                      }`}>{w.position_trend}</span>
                    </td>
                    <td className="p-2 text-center text-[9px] font-bold text-gold-400">{w.whale_verdict}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          BROKER SUMMARY BUTTON (Direct to Bandarmologi)
      ════════════════════════════════════════════════════════════ */}
      <div className="flex justify-center">
        <Link
          href={`/bandarmologi?code=${stockCode}`}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/30 text-white font-bold text-sm hover:from-blue-500/30 hover:to-purple-500/30 transition-all shadow-lg hover:shadow-xl group"
        >
          <BarChart3 className="w-5 h-5 text-blue-400 group-hover:text-gold-400 transition-colors" />
          Open Full Broker Summary for {stockCode}
          <ExternalLink className="w-4 h-4 ml-1 opacity-50" />
        </Link>
      </div>

      {/* ════════════════════════════════════════════════════════════
          VOLUME SPIKE TERBARU
      ════════════════════════════════════════════════════════════ */}
      {volumeSpikes.length > 0 && (
        <div className="glass rounded-2xl p-5 border border-white/[0.06]">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-purple-400" />
            <h2 className="text-sm font-black text-white uppercase tracking-widest">Recent Volume Spikes</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {volumeSpikes.map((s: any, i: number) => (
              <div key={i} className={`p-3 rounded-xl border ${
                s.spike_type?.includes('BULLISH') || s.spike_type?.includes('UP') ? 'border-emerald-500/20 bg-emerald-500/[0.02]'
                : s.spike_type?.includes('BEARISH') || s.spike_type?.includes('DOWN') ? 'border-red-500/20 bg-red-500/[0.02]'
                : 'border-white/[0.04] bg-white/[0.01]'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground">{s.trading_date}</span>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                    s.spike_type?.includes('BULLISH') ? 'bg-emerald-500/20 text-emerald-400'
                    : s.spike_type?.includes('BEARISH') || s.spike_type?.includes('DOWN') ? 'bg-red-500/20 text-red-400'
                    : 'bg-purple-500/20 text-purple-400'
                  }`}>{s.spike_type}</span>
                </div>
                <div className="flex items-center gap-4 text-[10px]">
                  <span className="font-black">{formatNumber(s.close)}</span>
                  <span className="text-purple-400 font-bold">{s.volume_ratio}x</span>
                  <span className={s.change_percent >= 0 ? 'text-emerald-400' : 'text-red-400'}>{formatPercent(s.change_percent)}</span>
                </div>
                <p className="text-[9px] text-muted-foreground mt-1">💡 {s.interpretation}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          KPI BAWAH
      ════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Float Cap', value: formatRupiah(floatCap), icon: DollarSign, color: 'text-gold-400' },
          { label: 'Public Shares', value: formatShares(publicShares), icon: PieChartIcon, color: 'text-cyan-400' },
          { label: 'Volume', value: formatShares(stockData.volume), icon: Flame, color: 'text-orange-400' },
          { label: 'Value', value: formatRupiah(stockData.value), icon: Activity, color: 'text-blue-400' },
        ].map((m, i) => {
          const Icon = m.icon
          return (
            <div key={i} className="glass rounded-xl p-3 border border-white/[0.06]">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-3.5 h-3.5 ${m.color}`} />
                <span className="text-[9px] text-muted-foreground uppercase">{m.label}</span>
              </div>
              <p className={`text-lg font-black ${m.color}`}>{m.value}</p>
            </div>
          )
        })}
      </div>

      {/* Lead Indicator Table */}
      {leadIndicator.length > 0 && (
        <div className="glass rounded-2xl p-5 border border-white/[0.06]">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-black text-white uppercase tracking-widest">KSEI Lead Indicator</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[9px] text-muted-foreground uppercase border-b border-white/[0.05]">
                  <th className="p-2 text-left">KSEI Date</th>
                  <th className="p-2 text-left">Action</th>
                  <th className="p-2 text-right">Price @KSEI</th>
                  <th className="p-2 text-right">1M Later</th>
                  <th className="p-2 text-right">Return 1M</th>
                  <th className="p-2 text-center">Signal</th>
                </tr>
              </thead>
              <tbody>
                {leadIndicator.map((d: any, i: number) => (
                  <tr key={i} className="border-b border-white/[0.02]">
                    <td className="p-2">{d.ksei_date}</td>
                    <td className="p-2">
                      <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-bold ${
                        d.inst_action === 'ACCUMULATING' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'
                      }`}>{d.inst_action}</span>
                    </td>
                    <td className="p-2 text-right">{formatNumber(d.price_at_ksei)}</td>
                    <td className="p-2 text-right">{d.price_1m_after ? formatNumber(d.price_1m_after) : '-'}</td>
                    <td className={`p-2 text-right font-bold ${d.return_1m_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {d.return_1m_pct ? formatPercent(d.return_1m_pct) : '-'}
                    </td>
                    <td className="p-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-bold ${
                        d.lead_signal === 'LEAD_CONFIRMED' ? 'bg-emerald-500/20 text-emerald-400'
                        : d.lead_signal === 'LEAD_FAILED' ? 'bg-red-500/20 text-red-400'
                        : 'bg-slate-500/20 text-slate-400'
                      }`}>{d.lead_signal}</span>
                    </td>
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
