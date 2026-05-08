'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { formatRupiah, formatPercent, formatNumber, formatShares } from '@/lib/utils'
import type { SmartMoneyStock } from '@/lib/supabase'
import { 
  Search, TrendingUp, TrendingDown, Activity, AlertTriangle, Clock, 
  Zap, Target, DollarSign, PieChart, ArrowRightLeft, Building2, 
  Flame, Scale, Globe, Eye, Shield, ArrowUp, ArrowDown, RefreshCw,
  Loader2, ChevronRight, Radar
} from 'lucide-react'
import Link from 'next/link'

// ============================================================
// TYPES
// ============================================================
interface StockData {
  stock_code: string
  close: number
  change_percent: number
  high: number
  low: number
  open_price: number
  volume: number
  value: number
  frequency: number
  net_foreign_value: number
  foreign_buy_value: number
  foreign_sell_value: number
  vwma_20d: number
  ma20_volume: number
  aov_ratio_ma20: number
  avg_order_volume: number
  whale_signal: boolean
  big_player_anomaly: boolean
  signal: string
  sector: string
  free_float: number
  tradeable_shares: number
  trading_date: string
}

interface HistoryPoint {
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  net_foreign: number
  aov_ratio: number
  vwma: number
  whale_signal: boolean
  big_player_anomaly: boolean
}

type DetailTab = 'technical' | 'smart-money' | 'whale' | 'volume' | 'broker' | 'ownership' | 'foreign-flow'

declare global {
  interface Window {
    LightweightCharts: any
  }
}

// ============================================================
// COMPONENT
// ============================================================
export default function StockDetailPage() {
  const params = useParams()
  const stockCode = (params?.code as string)?.toUpperCase() || ''

  // States
  const [searchQuery, setSearchQuery] = useState(stockCode)
  const [activeTab, setActiveTab] = useState<DetailTab>('technical')
  const [periodFilter, setPeriodFilter] = useState(120)
  
  // Data States
  const [stockData, setStockData] = useState<StockData | null>(null)
  const [historyData, setHistoryData] = useState<HistoryPoint[]>([])
  const [smartMoneyIndex, setSmartMoneyIndex] = useState<any>(null)
  const [whaleData, setWhaleData] = useState<any[]>([])
  const [leadIndicator, setLeadIndicator] = useState<any[]>([])
  const [volumeSpikes, setVolumeSpikes] = useState<any[]>([])
  const [aovProfile, setAovProfile] = useState<any[]>([])
  const [brokerData, setBrokerData] = useState<any[]>([])
  const [ownershipData, setOwnershipData] = useState<any[]>([])
  const [foreignFlowData, setForeignFlowData] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const [chartReady, setChartReady] = useState(false)

  // ============================================================
  // LOAD LIGHTWEIGHT CHARTS
  // ============================================================
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.LightweightCharts) {
      setChartReady(true)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js'
    script.async = true
    script.onload = () => setChartReady(true)
    document.body.appendChild(script)
    return () => { script.remove() }
  }, [])

  // ============================================================
  // FETCH ALL DATA
  // ============================================================
  const fetchAllData = useCallback(async (code: string) => {
    if (!code || code.length < 4) return
    
    setIsLoading(true)
    setErrorMsg('')

    try {
      // 1. Latest stock data
      const { data: latestData, error: latestErr } = await supabase
        .from('daily_transactions')
        .select('*')
        .eq('stock_code', code)
        .order('trading_date', { ascending: false })
        .limit(1)
        .single()

      if (latestErr || !latestData) {
        setErrorMsg(`Stock ${code} not found`)
        setIsLoading(false)
        return
      }
      setStockData(latestData)

      // 2. History data
      const { data: historyRaw, error: historyErr } = await supabase
        .from('daily_transactions')
        .select('trading_date,open_price,high,low,close,volume,net_foreign_value,vwma_20d,aov_ratio_ma20,whale_signal,big_player_anomaly')
        .eq('stock_code', code)
        .order('trading_date', { ascending: false })
        .limit(periodFilter)

      if (!historyErr && historyRaw) {
        setHistoryData(historyRaw.reverse().map((d: any) => ({
          time: d.trading_date,
          open: Number(d.open_price) || Number(d.close) || 0,
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

      // 3. Smart Money Index (RPC)
      const { data: smiData } = await supabase.rpc('get_smart_money_index', {
        p_stock_code: code,
        p_window: 30,
      })
      if (smiData?.length) setSmartMoneyIndex(smiData[0])

      // 4. Whale Timing Analysis (RPC)
      const { data: whaleRes } = await supabase.rpc('get_whale_timing_analysis', {
        p_stock_code: code,
      })
      if (whaleRes) setWhaleData(whaleRes)

      // 5. Lead Indicator (RPC)
      const { data: leadRes } = await supabase.rpc('get_smart_money_lead_indicator', {
        p_stock_code: code,
        p_months: 6,
      })
      if (leadRes) setLeadIndicator(leadRes)

      // 6. Volume Spike (RPC)
      const { data: spikeRes } = await supabase.rpc('get_volume_spike', {
        p_stock_code: code,
        p_window: 30,
        p_threshold: null, // auto
      })
      if (spikeRes) setVolumeSpikes(spikeRes.filter((d: any) => d.spike_type !== 'NORMAL'))

      // 7. AOV Profile (RPC)
      const { data: aovRes } = await supabase.rpc('get_aov_profile', {
        p_stock_code: code,
        p_window: 60,
      })
      if (aovRes) setAovProfile(aovRes)

      // 8. Broker Divergence (RPC)
      const { data: brokerRes } = await supabase.rpc('get_broker_divergence', {
        p_stock_code: code,
        p_start_date: '2026-01-01',
      })
      if (brokerRes) setBrokerData(brokerRes.slice(0, 10))

      // 9. Ownership Structure (RPC) — from ksei_data1persen_mutasi
      const { data: ownershipRes } = await supabase.rpc('get_ownership_structure', {
        p_stock_code: code,
        p_date: null,
      })
      if (ownershipRes) setOwnershipData(ownershipRes)

      // 10. Stealth vs Foreign Divergence (RPC)
      const { data: ffRes } = await supabase.rpc('get_stealth_vs_foreign_divergence', {
        p_stock_code: code,
        p_window: 30,
      })
      if (ffRes?.length) setForeignFlowData(ffRes)

    } catch (err: any) {
      console.error(err)
      setErrorMsg(err.message || 'Failed to fetch data')
    } finally {
      setIsLoading(false)
    }
  }, [periodFilter])

  // Initial fetch
  useEffect(() => {
    if (stockCode) fetchAllData(stockCode)
  }, [stockCode, fetchAllData])

  // ============================================================
  // RENDER CHART
  // ============================================================
  useEffect(() => {
    if (!chartReady || !chartContainerRef.current || historyData.length === 0) return

    const lwc = window.LightweightCharts
    if (!lwc) return

    chartContainerRef.current.innerHTML = ''

    try {
      const chart = lwc.createChart(chartContainerRef.current, {
      height: 550,
      layout: {
        background: { type: 'solid', color: 'transparent' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: 'rgba(51,65,85,0.15)' },
        horzLines: { color: 'rgba(51,65,85,0.15)' },
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: 'rgba(51,65,85,0.5)' },
      timeScale: { 
        borderColor: 'rgba(51,65,85,0.5)',
        timeVisible: true,
        secondsVisible: false,
      },
    })

    // === CANDLE SERIES ===
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.05, bottom: 0.55 } })
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    })
    candleSeries.setData(historyData.map(d => ({
      time: d.time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    })))

    // === MARKERS ===
    const markers: any[] = []
    historyData.forEach(d => {
      if (d.whale_signal || d.aov_ratio >= 1.5) {
        markers.push({ time: d.time, position: 'aboveBar', color: '#10b981', shape: 'arrowDown', text: '🐋', size: 2 })
      }
      if (d.aov_ratio <= 0.6 && d.aov_ratio > 0) {
        markers.push({ time: d.time, position: 'belowBar', color: '#ef4444', shape: 'arrowUp', text: '🩸', size: 2 })
      }
      if (d.big_player_anomaly) {
        markers.push({ time: d.time, position: 'belowBar', color: '#ec4899', shape: 'circle', text: '⚠️', size: 2 })
      }
    })
    candleSeries.setMarkers(markers)

    // === VWMA LINE ===
    const vwmaSeries = chart.addLineSeries({
      color: '#3b82f6',
      lineWidth: 2,
      lineStyle: 2,
      crosshairMarkerVisible: false,
      lastValueVisible: true,
      priceLineVisible: false,
    })
    vwmaSeries.setData(historyData.filter(d => d.vwma > 0).map(d => ({ time: d.time, value: d.vwma })))

    // === VOLUME ===
    const volSeries = chart.addHistogramSeries({
      priceScaleId: 'vol',
      priceFormat: { type: 'volume' },
    })
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.68, bottom: 0.15 } })
    volSeries.setData(historyData.map(d => ({
      time: d.time,
      value: d.volume,
      color: d.close >= d.open ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)',
    })))

    // === NET FOREIGN ===
    const foreignSeries = chart.addHistogramSeries({
      priceScaleId: 'foreign',
    })
    chart.priceScale('foreign').applyOptions({ scaleMargins: { top: 0.88, bottom: 0.02 } })
    foreignSeries.setData(historyData.map(d => ({
      time: d.time,
      value: d.net_foreign,
      color: d.net_foreign >= 0 ? 'rgba(34,197,94,0.7)' : 'rgba(239,68,68,0.7)',
    })))

      chart.timeScale().fitContent()

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
    } catch (e) {
      console.error('Failed to render lightweight chart:', e)
    }
  }, [historyData, chartReady, activeTab])

  // ============================================================
  // DERIVED DATA
  // ============================================================
  const publicShares = (stockData?.tradeable_shares || 0) * ((stockData?.free_float || 0) / 100)
  const floatCap = publicShares * (stockData?.close || 0)
  const dailyTurnover = publicShares > 0 ? ((stockData?.volume || 0) / publicShares) * 100 : 0
  const isPositive = (stockData?.change_percent || 0) > 0
  const isNegative = (stockData?.change_percent || 0) < 0
  const smiScore = smartMoneyIndex?.smart_money_score || 0
  const smiSignal = smartMoneyIndex?.signal || 'NEUTRAL'

  const signalBubbles = volumeSpikes.filter((s: any) => s.spike_type.includes('BULLISH')).length
  const signalDistributions = volumeSpikes.filter((s: any) => s.spike_type.includes('BEARISH') || s.spike_type.includes('DOWN')).length

  // ============================================================
  // RENDER
  // ============================================================
  if (!stockCode) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Search className="w-16 h-16 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium text-muted-foreground">Search for a stock to analyze</p>
          <div className="mt-4 relative max-w-xs mx-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Enter stock code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter' && searchQuery.length >= 4) window.location.href = `/stock/${searchQuery}` }}
              className="w-full pl-10 pr-4 py-3 bg-white/[0.03] border border-white/[0.08] rounded-xl text-sm uppercase focus:outline-none focus:border-gold-400/30"
              maxLength={4}
            />
          </div>
        </div>
      </div>
    )
  }

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
        <Link href="/radar" className="inline-block mt-4 text-gold-400 hover:underline">← Back to Radar</Link>
      </div>
    )
  }

  if (!stockData) return null

  const tabs = [
    { id: 'technical' as DetailTab, label: 'Chart', icon: Activity, count: historyData.length },
    { id: 'smart-money' as DetailTab, label: 'Smart Money', icon: Radar, count: smiScore > 0 ? 1 : 0 },
    { id: 'ownership' as DetailTab, label: 'Ownership', icon: PieChart, count: ownershipData.length },
    { id: 'foreign-flow' as DetailTab, label: 'Foreign Flow', icon: Globe, count: foreignFlowData.length },
    { id: 'whale' as DetailTab, label: 'Whale', icon: Eye, count: whaleData.length },
    { id: 'volume' as DetailTab, label: 'Volume Spike', icon: Zap, count: signalBubbles + signalDistributions },
    { id: 'broker' as DetailTab, label: 'Broker Intel', icon: Building2, count: brokerData.length },
  ]

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <Link href="/radar" className="text-xs text-gold-400 hover:underline mb-2 inline-block">← Back to Radar</Link>
          <h1 className="text-3xl font-black text-foreground">{stockData.stock_code}</h1>
          <p className="text-sm text-muted-foreground">{stockData.sector || 'Unknown Sector'}</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={periodFilter} onChange={(e) => setPeriodFilter(Number(e.target.value))}
            className="bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-sm">
            <option value={60}>3 Months</option>
            <option value={120}>6 Months</option>
            <option value={240}>1 Year</option>
          </select>
          <div className="relative w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input type="text" placeholder="Search..." value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter' && searchQuery.length >= 4) window.location.href = `/stock/${searchQuery}` }}
              className="w-full pl-10 pr-4 py-2 bg-white/[0.03] border border-white/[0.08] rounded-xl text-sm uppercase focus:outline-none focus:border-gold-400/30"
              maxLength={4} />
          </div>
        </div>
      </div>

      {/* Stock Header Card */}
      <div className="glass rounded-2xl p-6 border-t-4 border-t-gold-500">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-4xl font-black">{formatNumber(stockData.close)}</span>
              <span className={`flex items-center text-lg font-bold ${isPositive ? 'text-emerald-400' : isNegative ? 'text-red-400' : 'text-muted-foreground'}`}>
                {isPositive ? <TrendingUp className="w-5 h-5" /> : isNegative ? <TrendingDown className="w-5 h-5" /> : null}
                {formatPercent(stockData.change_percent)}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>H: {formatNumber(stockData.high)}</span>
              <span>L: {formatNumber(stockData.low)}</span>
              <span>O: {formatNumber(stockData.open_price)}</span>
              <Clock className="w-3 h-3" />
              <span>{stockData.trading_date}</span>
            </div>
          </div>
          {smartMoneyIndex && (
            <div className="flex items-center gap-3">
              <div className="text-center px-4 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                <p className="text-[10px] text-muted-foreground uppercase">Smart Money Score</p>
                <p className={`text-2xl font-black ${
                  smiSignal === 'STRONG_BUY' ? 'text-emerald-400' : smiSignal === 'WATCH' ? 'text-amber-400' : 'text-slate-400'
                }`}>{Math.round(smiScore)}</p>
              </div>
              <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${
                smiSignal === 'STRONG_BUY' ? 'signal-strong-buy' : smiSignal === 'WATCH' ? 'signal-watch' : 'signal-neutral'
              }`}>{smiSignal}</span>
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 stagger">
        {[
          { label: 'Public Shares', value: formatShares(publicShares), sub: `${(stockData?.free_float || 0).toFixed(1)}% Float`, icon: <PieChart className="w-4 h-4 text-cyan-400" /> },
          { label: 'Float Cap', value: formatRupiah(floatCap), icon: <DollarSign className="w-4 h-4 text-gold-400" /> },
          { label: 'Turnover', value: `${dailyTurnover.toFixed(2)}%`, icon: <ArrowRightLeft className="w-4 h-4 text-purple-400" />, color: dailyTurnover > 5 ? 'text-emerald-400' : dailyTurnover < 1 ? 'text-red-400' : 'text-amber-400' },
          { label: 'AOV Ratio', value: `${(stockData.aov_ratio_ma20 || 1).toFixed(2)}x`, icon: <Scale className="w-4 h-4 text-pink-400" /> },
          { label: 'Foreign Flow', value: formatRupiah(stockData.net_foreign_value), icon: <Globe className="w-4 h-4 text-blue-400" />, color: stockData.net_foreign_value >= 0 ? 'text-emerald-400' : 'text-red-400' },
          { label: 'Volume', value: formatShares(stockData.volume), icon: <Flame className="w-4 h-4 text-orange-400" /> },
        ].map((m, i) => (
          <div key={i} className="glass rounded-xl p-4 border border-border/30 card-hover">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] text-muted-foreground uppercase font-bold">{m.label}</p>
              {m.icon}
            </div>
            <p className={`text-lg font-black ${m.color || 'text-foreground'}`}>{m.value}</p>
            {m.sub && <p className="text-[10px] text-muted-foreground mt-0.5">{m.sub}</p>}
          </div>
        ))}
      </div>

      {/* Tab Navigation */}
      <div className="glass rounded-xl p-1.5 flex gap-1 overflow-x-auto border border-border/30">
        {tabs.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                isActive ? 'bg-gradient-to-r from-gold-400 to-yellow-500 text-navy-900 shadow-lg' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              }`}>
              <Icon className="w-3.5 h-3.5" /> {tab.label}
              {tab.count > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-navy-900/20' : 'bg-gold-400/20 text-gold-400'}`}>{tab.count}</span>}
            </button>
          )
        })}
      </div>

      {/* ============================================================ */}
      {/* TAB 1: TECHNICAL CHART */}
      {/* ============================================================ */}
      {activeTab === 'technical' && (
        <div className="glass rounded-2xl p-4 border border-border/30">
          <div className="absolute top-4 left-6 z-10 space-y-1.5 bg-navy-900/90 p-3 rounded-xl backdrop-blur-md border border-border/50 text-[10px]">
            <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Price</div>
            <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-sm bg-blue-500" /> VWMA 20</div>
            <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-sm bg-emerald-500/40" /> Volume (Buy)</div>
            <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-sm bg-red-500/40" /> Volume (Sell)</div>
            <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-sm bg-emerald-500/70" /> Net Foreign +</div>
            <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-sm bg-red-500/70" /> Net Foreign -</div>
            <div className="flex items-center gap-2 mt-1"><span className="text-emerald-400">🐋</span> Whale / AOV ≥1.5x</div>
            <div className="flex items-center gap-2"><span className="text-red-400">🩸</span> AOV ≤0.6x</div>
            <div className="flex items-center gap-2"><span className="text-pink-400">⚠️</span> Big Player Anomaly</div>
          </div>
          <div ref={chartContainerRef} className="w-full min-h-[550px]" />
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 2: SMART MONEY */}
      {/* ============================================================ */}
      {activeTab === 'smart-money' && (
        <div className="space-y-6">
          {smartMoneyIndex ? (
            <>
              {/* Score Breakdown */}
              <div className="glass rounded-2xl p-6 border border-border/30">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <Radar className="w-5 h-5 text-gold-400" /> Smart Money Index
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                  {[
                    { label: 'Score', value: Math.round(smiScore), color: 'text-emerald-400' },
                    { label: 'Conviction', value: smartMoneyIndex.conviction_score?.toFixed(0), color: 'text-blue-400' },
                    { label: 'Stealth', value: smartMoneyIndex.is_stealth ? '🕵️ YES' : 'NO', color: smartMoneyIndex.is_stealth ? 'text-purple-400' : 'text-muted-foreground' },
                    { label: 'Foreign 30D', value: formatRupiah(smartMoneyIndex.net_foreign_30d), color: smartMoneyIndex.net_foreign_30d >= 0 ? 'text-emerald-400' : 'text-red-400' },
                    { label: 'Broker Net', value: formatShares(smartMoneyIndex.broker_net_change), color: smartMoneyIndex.broker_net_change > 0 ? 'text-emerald-400' : 'text-red-400' },
                  ].map((m, i) => (
                    <div key={i} className="text-center p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                      <p className="text-[10px] text-muted-foreground uppercase mb-1">{m.label}</p>
                      <p className={`text-xl font-black ${m.color}`}>{m.value}</p>
                    </div>
                  ))}
                </div>
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                  <p className="text-xs text-muted-foreground font-mono">{smartMoneyIndex.score_breakdown}</p>
                </div>
              </div>

              {/* Lead Indicator */}
              {leadIndicator.length > 0 && (
                <div className="glass rounded-2xl p-6 border border-border/30">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <Target className="w-5 h-5 text-cyan-400" /> KSEI Lead Indicator
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[10px] text-muted-foreground uppercase border-b border-white/[0.05]">
                          <th className="p-3 text-left">KSEI Date</th>
                          <th className="p-3 text-left">Action</th>
                          <th className="p-3 text-right">Price @KSEI</th>
                          <th className="p-3 text-right">1M Later</th>
                          <th className="p-3 text-right">Return 1M</th>
                          <th className="p-3 text-center">Signal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leadIndicator.map((d: any, i: number) => (
                          <tr key={i} className="border-b border-white/[0.02]">
                            <td className="p-3 text-xs">{d.ksei_date}</td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                d.inst_action === 'ACCUMULATING' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'
                              }`}>{d.inst_action}</span>
                            </td>
                            <td className="p-3 text-right">{formatNumber(d.price_at_ksei)}</td>
                            <td className="p-3 text-right">{d.price_1m_after ? formatNumber(d.price_1m_after) : '-'}</td>
                            <td className={`p-3 text-right font-bold ${d.return_1m_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {d.return_1m_pct ? formatPercent(d.return_1m_pct) : '-'}
                            </td>
                            <td className="p-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                d.lead_signal === 'LEAD_CONFIRMED' ? 'signal-strong-buy' :
                                d.lead_signal === 'LEAD_FAILED' ? 'signal-avoid' : 'bg-slate-500/20 text-slate-400'
                              }`}>{d.lead_signal}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="glass rounded-xl p-12 text-center text-muted-foreground">
              <Radar className="w-12 h-12 mx-auto mb-4 opacity-30" />
              No Smart Money data available
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 3: WHALE TRACKER */}
      {/* ============================================================ */}
      {activeTab === 'whale' && (
        <div className="glass rounded-2xl overflow-hidden border border-border/30">
          {whaleData.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/[0.02] border-b border-white/[0.05] text-[10px] text-muted-foreground uppercase">
                    <th className="p-4 text-left">Investor</th>
                    <th className="p-4 text-center">Type</th>
                    <th className="p-4 text-right">Entry Price</th>
                    <th className="p-4 text-right">Current</th>
                    <th className="p-4 text-right">Return</th>
                    <th className="p-4 text-right">Holding %</th>
                    <th className="p-4 text-center">Trend</th>
                    <th className="p-4 text-center">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {whaleData.map((w: any, i: number) => (
                    <tr key={i} className="tr-hover border-b border-white/[0.02]">
                      <td className="p-4">
                       <p className="font-bold text-foreground">{w.investor_name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {w.local_foreign === 'F' ? '🌏 Foreign' : '🇮🇩 Local'} • {w.investor_type}
                        </p>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          w.investor_type === 'Individual' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'
                        }`}>{w.investor_type}</span>
                      </td>
                      <td className="p-4 text-right font-semibold">{formatNumber(w.est_entry_price)}</td>
                      <td className="p-4 text-right font-semibold">{formatNumber(w.current_price)}</td>
                      <td className={`p-4 text-right font-bold ${w.return_since_entry >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {w.return_since_entry ? formatPercent(w.return_since_entry) : '-'}
                      </td>
                      <td className="p-4 text-right">
                        <span className="font-bold">{w.latest_percentage}%</span>
                        <p className="text-[10px] text-muted-foreground">{formatShares(w.latest_shares)} shares</p>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          w.position_trend === 'INCREASING' ? 'bg-emerald-500/20 text-emerald-400' :
                          w.position_trend === 'DECREASING' ? 'bg-red-500/20 text-red-400' : 'bg-slate-500/20 text-slate-400'
                        }`}>{w.position_trend}</span>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          w.whale_verdict === 'ADDING_POSITION' || w.whale_verdict === 'AVERAGING_DOWN' ? 'bg-emerald-500/20 text-emerald-400' :
                          w.whale_verdict === 'TRIMMING' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'
                        }`}>{w.whale_verdict}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center text-muted-foreground">
              <Eye className="w-12 h-12 mx-auto mb-4 opacity-30" />
              No whale data available (KSEI 1% required)
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 4: VOLUME SPIKES */}
      {/* ============================================================ */}
      {activeTab === 'volume' && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold">
              <ArrowUp className="w-3 h-3" /> {signalBubbles} Breakouts
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 text-red-400 text-xs font-bold">
              <ArrowDown className="w-3 h-3" /> {signalDistributions} Distributions
            </div>
          </div>
          {volumeSpikes.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger">
              {volumeSpikes.map((s: any, i: number) => (
                <div key={i} className={`glass rounded-xl p-5 border ${
                  s.spike_type.includes('BULLISH') || s.spike_type.includes('UP') ? 'border-emerald-500/30' :
                  s.spike_type.includes('BEARISH') || s.spike_type.includes('DOWN') ? 'border-red-500/30' : 'border-border/30'
                } card-hover`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-muted-foreground">{s.trading_date}</span>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                      s.spike_type.includes('BULLISH') ? 'signal-strong-buy' :
                      s.spike_type.includes('BEARISH') || s.spike_type.includes('DOWN') ? 'signal-avoid' :
                      'bg-purple-500/20 text-purple-400'
                    }`}>{s.spike_type}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Close</p>
                      <p className="text-lg font-black">{formatNumber(s.close)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Ratio</p>
                      <p className="text-lg font-black text-purple-400">{s.volume_ratio}x</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Change</p>
                      <p className={`text-lg font-black ${s.change_percent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatPercent(s.change_percent)}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3 italic border-t border-white/[0.05] pt-3">
                    💡 {s.interpretation}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="glass rounded-xl p-12 text-center text-muted-foreground">
              <Zap className="w-12 h-12 mx-auto mb-4 opacity-30" />
              No volume spikes detected (auto-threshold active)
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 5: BROKER INTEL */}
      {/* ============================================================ */}
      {activeTab === 'broker' && (
        <div className="glass rounded-2xl overflow-hidden border border-border/30">
          {brokerData.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/[0.02] border-b border-white/[0.05] text-[10px] text-muted-foreground uppercase">
                    <th className="p-4 text-left">Broker</th>
                    <th className="p-4 text-right">Total Buy</th>
                    <th className="p-4 text-right">Total Sell</th>
                    <th className="p-4 text-right">Net Change</th>
                    <th className="p-4 text-right">Net Value</th>
                    <th className="p-4 text-center">Buy Ratio</th>
                    <th className="p-4 text-center">Strength</th>
                  </tr>
                </thead>
                <tbody>
                  {brokerData.map((b: any, i: number) => (
                    <tr key={i} className="tr-hover border-b border-white/[0.02]">
                      <td className="p-4">
                        <p className="font-bold text-foreground text-xs">{b.kode_broker}</p>
                        <p className="text-[10px] text-muted-foreground truncate max-w-[180px]">{b.nama_broker}</p>
                      </td>
                      <td className="p-4 text-right text-emerald-400">{formatShares(b.total_buy)}</td>
                      <td className="p-4 text-right text-red-400">{formatShares(b.total_sell)}</td>
                      <td className={`p-4 text-right font-bold ${b.net_change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {b.net_change >= 0 ? '+' : ''}{formatShares(b.net_change)}
                      </td>
                      <td className={`p-4 text-right font-bold ${b.net_value >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatRupiah(b.net_value)}
                      </td>
                      <td className="p-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          b.buy_ratio >= 80 ? 'signal-strong-buy' : b.buy_ratio >= 60 ? 'signal-watch' : 'signal-neutral'
                        }`}>{b.buy_ratio}%</span>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          b.strength === 'STRONG_BUY' ? 'signal-strong-buy' :
                          b.strength === 'STRONG_SELL' ? 'signal-avoid' : 'bg-slate-500/20 text-slate-400'
                        }`}>{b.strength}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center text-muted-foreground">
              <Building2 className="w-12 h-12 mx-auto mb-4 opacity-30" />
              No broker data available (KSEI 5% required)
            </div>
          )}
        </div>
      )}
      {/* ============================================================ */}
      {/* TAB 6: OWNERSHIP STRUCTURE */}
      {/* ============================================================ */}
      {activeTab === 'ownership' && (
        <div className="space-y-6">
          {ownershipData.length > 0 ? (
            <>
              {/* Category Breakdown Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {ownershipData.map((cat: any, i: number) => {
                  const totalPct = ownershipData.reduce((s: number, c: any) => s + Number(c.total_percentage || 0), 0)
                  const barWidth = totalPct > 0 ? (Number(cat.total_percentage) / totalPct) * 100 : 0
                  const catColor = 
                    cat.category === 'Institusi Lokal' ? 'from-amber-500 to-yellow-500' :
                    cat.category === 'Individu Lokal'  ? 'from-emerald-500 to-green-500' :
                    cat.category === 'Institusi Asing' ? 'from-blue-500 to-cyan-500' :
                    'from-purple-500 to-violet-500'
                  const borderColor =
                    cat.category === 'Institusi Lokal' ? 'border-amber-500/30' :
                    cat.category === 'Individu Lokal'  ? 'border-emerald-500/30' :
                    cat.category === 'Institusi Asing' ? 'border-blue-500/30' : 'border-purple-500/30'
                  return (
                    <div key={i} className={`glass rounded-2xl p-5 border ${borderColor} card-hover`}>
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${catColor} flex items-center justify-center mb-3 shadow-lg`}>
                        <PieChart className="w-5 h-5 text-white" />
                      </div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{cat.category}</p>
                      <p className="text-3xl font-black text-foreground mt-1">{Number(cat.total_percentage).toFixed(1)}%</p>
                      <div className="mt-3 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                        <div className={`h-full rounded-full bg-gradient-to-r ${catColor} transition-all duration-700`} style={{ width: `${barWidth}%` }} />
                      </div>
                      <div className="flex items-center justify-between mt-3">
                        <span className="text-[10px] text-muted-foreground">{cat.investor_count} investor</span>
                        <span className="text-[10px] text-gold-400 font-semibold truncate max-w-[120px] text-right">{cat.top1_investor}</span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Donut chart — visual via CSS */}
              <div className="glass rounded-2xl p-6 border border-border/30">
                <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
                  <Target className="w-5 h-5 text-gold-400" /> Top Pemegang Saham ≥1%
                  <span className="ml-auto text-xs text-muted-foreground font-normal">As of {ownershipData[0]?.report_date}</span>
                </h3>
                <div className="space-y-2">
                  {ownershipData.map((cat: any, i: number) => {
                    const bgColor =
                      cat.category === 'Institusi Lokal' ? 'bg-amber-500' :
                      cat.category === 'Individu Lokal'  ? 'bg-emerald-500' :
                      cat.category === 'Institusi Asing' ? 'bg-blue-500' : 'bg-purple-500'
                    return (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                        <span className={`w-2.5 h-2.5 rounded-full ${bgColor} flex-shrink-0`} />
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-bold text-foreground">{cat.top1_investor}</span>
                            <span className="text-sm font-bold text-gold-400">{Number(cat.top1_percentage).toFixed(2)}%</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground">{cat.category}</span>
                            <span className="text-[10px] text-muted-foreground">{formatShares(Number(cat.total_shares))} shares</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="glass rounded-xl p-16 text-center text-muted-foreground">
              <PieChart className="w-16 h-16 mx-auto mb-4 opacity-20" />
              <p className="font-bold">No KSEI ownership data for {stockCode}</p>
              <p className="text-xs mt-1">Data requires ≥1% holding threshold (KSEI C01)</p>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 7: FOREIGN FLOW DIVERGENCE */}
      {/* ============================================================ */}
      {activeTab === 'foreign-flow' && (
        <div className="space-y-6">
          {foreignFlowData.length > 0 ? (
            <>
              {foreignFlowData.map((d: any, i: number) => {
                const divergenceType = d.divergence_type || 'NEUTRAL'
                const isBullish = divergenceType.includes('BULLISH') || divergenceType.includes('STEALTH')
                const isBearish = divergenceType.includes('BEARISH') || divergenceType.includes('DISTRIBUTION')
                return (
                  <div key={i} className={`glass rounded-2xl p-6 border ${
                    isBullish ? 'border-emerald-500/30' : isBearish ? 'border-red-500/30' : 'border-border/30'
                  }`}>
                    {/* Divergence Header */}
                    <div className="flex items-center justify-between mb-5">
                      <div>
                        <h3 className="text-xl font-black text-foreground">
                          {isBullish ? '🕵️ Stealth Accumulation' : isBearish ? '⚠️ Smart Distribution' : '📊 Normal Flow'}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">30-hari terakhir · Window analisis</p>
                      </div>
                      <span className={`px-4 py-2 rounded-xl text-sm font-bold ${
                        isBullish ? 'signal-strong-buy' : isBearish ? 'signal-avoid' : 'signal-neutral'
                      }`}>{divergenceType}</span>
                    </div>

                    {/* Metrics Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
                      {[
                        { label: 'Net Foreign 30D', value: formatRupiah(Number(d.net_foreign_30d || 0)), color: Number(d.net_foreign_30d) >= 0 ? 'text-emerald-400' : 'text-red-400', icon: Globe },
                        { label: 'Broker Net', value: formatShares(Number(d.broker_net_change || 0)), color: Number(d.broker_net_change) >= 0 ? 'text-emerald-400' : 'text-red-400', icon: Building2 },
                        { label: 'Price Change', value: `${Number(d.price_chg_pct || 0).toFixed(2)}%`, color: Number(d.price_chg_pct) >= 0 ? 'text-emerald-400' : 'text-red-400', icon: TrendingUp },
                        { label: 'Divergence Score', value: `${Number(d.divergence_score || 0).toFixed(0)}/100`, color: 'text-gold-400', icon: Scale },
                      ].map((m, j) => {
                        const Icon = m.icon
                        return (
                          <div key={j} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                            <div className="flex items-center gap-2 mb-2">
                              <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                              <p className="text-[10px] text-muted-foreground uppercase">{m.label}</p>
                            </div>
                            <p className={`text-xl font-black ${m.color}`}>{m.value}</p>
                          </div>
                        )
                      })}
                    </div>

                    {/* Interpretation */}
                    {d.interpretation && (
                      <div className={`p-4 rounded-xl ${
                        isBullish ? 'bg-emerald-500/10 border border-emerald-500/20' :
                        isBearish ? 'bg-red-500/10 border border-red-500/20' : 'bg-white/[0.02] border border-white/[0.04]'
                      }`}>
                        <p className="text-sm font-medium">💡 {d.interpretation}</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          ) : (
            <div className="glass rounded-xl p-16 text-center text-muted-foreground">
              <Globe className="w-16 h-16 mx-auto mb-4 opacity-20" />
              <p className="font-bold">Tidak ada data Foreign Flow untuk {stockCode}</p>
              <p className="text-xs mt-1">Minimal 30 hari data transaksi diperlukan</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
