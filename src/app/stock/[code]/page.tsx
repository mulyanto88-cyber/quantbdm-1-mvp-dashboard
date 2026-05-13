'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { formatRupiah, formatPercent, formatNumber, formatShares } from '@/lib/utils'
import type { SmartMoneyStock } from '@/lib/supabase'
import { 
  Search, TrendingUp, TrendingDown, Activity, AlertTriangle, Clock, 
  Zap, Target, DollarSign, PieChart as PieChartIcon, ArrowRightLeft, Building2, 
  Flame, Scale, Globe, Eye, Shield, ArrowUp, ArrowDown, RefreshCw,
  Loader2, ChevronRight, Radar, Maximize2, Minimize2
} from 'lucide-react'
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  ResponsiveContainer, AreaChart, Area, Legend as RechartsLegend,
  BarChart, Bar, Cell, PieChart, Pie
} from 'recharts'
import Link from 'next/link'

// Helper for formatting large numbers (Billion, Million)
const fmt = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e12) return `${(v / 1e12).toFixed(1)}T`;
  if (a >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
  return v.toLocaleString('id-ID');
};

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

type DetailTab = 'technical' | 'smart-money' | 'volume' | 'broker' | 'ownership' | 'foreign-flow'

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
  const [kseiWhaleData, setKseiWhaleData] = useState<any[]>([])
  const [kseiAnalytics, setKseiAnalytics] = useState<any>(null)
  const [convictionData, setConvictionData] = useState<any>(null)
  const [kseiBrokerSummary, setKseiBrokerSummary] = useState<any[]>([])
  const [leadIndicator, setLeadIndicator] = useState<any[]>([])
  const [volumeSpikes, setVolumeSpikes] = useState<any[]>([])
  const [aovProfile, setAovProfile] = useState<any[]>([])
  const [brokerData, setBrokerData] = useState<any[]>([])
  const [ownershipData, setOwnershipData] = useState<any[]>([])
  const [foreignFlowData, setForeignFlowData] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [tabLoading, setTabLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartWrapRef = useRef<HTMLDivElement>(null)
  const [chartReady, setChartReady] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const loadedTabs = useRef<Set<string>>(new Set())

  const toggleFullscreen = () => {
    if (!chartWrapRef.current) return
    if (!isFullscreen) {
      chartWrapRef.current.requestFullscreen?.().catch(() => {})
    } else {
      document.exitFullscreen?.().catch(() => {})
    }
    setIsFullscreen(f => !f)
  }

  // Sync isFullscreen when user presses Escape
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

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
  // ============================================================
  // FETCH: CRITICAL DATA (parallel, runs immediately)
  // ============================================================
  const fetchCriticalData = useCallback(async (code: string) => {
    if (!code || code.length < 4) return
    setIsLoading(true)
    setErrorMsg('')
    loadedTabs.current = new Set(['technical'])

    try {
      const [latestResult, historyResult, convictionRes, kseiRes] = await Promise.all([
        supabase
          .from('daily_transactions')
          .select('*')
          .eq('stock_code', code)
          .order('trading_date', { ascending: false })
          .limit(1)
          .single(),
        supabase
          .from('daily_transactions')
          .select('trading_date,open_price,high,low,close,volume,net_foreign_value,vwma_20d,aov_ratio_ma20,whale_signal,big_player_anomaly')
          .eq('stock_code', code)
          .order('trading_date', { ascending: false })
          .limit(periodFilter),
        supabase.rpc('get_conviction_score', { p_stock_code: code, p_window: 5 }),
        fetch(`/api/ksei-whale?code=${code}`).then(res => res.json())
      ])

      if (latestResult.error || !latestResult.data) {
        setErrorMsg(`Stock ${code} not found`)
        return
      }
      setStockData(latestResult.data)
      
      // Set Conviction Data
      if (convictionRes.data?.[0]) {
        setConvictionData(convictionRes.data[0])
      }
      
      // Set KSEI Whale Data
      if (kseiRes && !kseiRes.error) {
        setKseiWhaleData(kseiRes.whales || [])
        setKseiAnalytics(kseiRes.holderAnalytics)
      }

      if (!historyResult.error && historyResult.data) {
        setHistoryData(historyResult.data.reverse().map((d: any) => ({
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
    } catch (err: any) {
      console.error(err)
      setErrorMsg(err.message || 'Failed to fetch data')
    } finally {
      setIsLoading(false)
    }
  }, [periodFilter])

  // ============================================================
  // FETCH: TAB DATA (lazy, runs when tab first opened)
  // ============================================================
  const fetchTabData = useCallback(async (tab: DetailTab, code: string) => {
    if (!code || loadedTabs.current.has(tab)) return
    loadedTabs.current.add(tab)
    setTabLoading(true)

    try {
      if (tab === 'smart-money') {
        const [smiRes, leadRes] = await Promise.all([
          supabase.rpc('get_smart_money_index', { p_stock_code: code, p_window: 30 }),
          supabase.rpc('get_smart_money_lead_indicator', { p_stock_code: code, p_months: 6 }),
        ])
        if (smiRes.data?.length) setSmartMoneyIndex(smiRes.data[0])
        if (leadRes.data) setLeadIndicator(leadRes.data)
      }


      if (tab === 'volume') {
        const [spikeRes, aovRes] = await Promise.all([
          supabase.rpc('get_volume_spike', { p_stock_code: code, p_window: 30, p_threshold: null }),
          supabase.rpc('get_aov_profile', { p_stock_code: code, p_window: 60 }),
        ])
        if (spikeRes.data) setVolumeSpikes(spikeRes.data.filter((d: any) => d.spike_type !== 'NORMAL'))
        if (aovRes.data) setAovProfile(aovRes.data)
      }

      if (tab === 'broker') {
        const { data } = await supabase.rpc('get_broker_divergence', { p_stock_code: code, p_start_date: '2026-01-01' })
        if (data) setBrokerData(data.slice(0, 10))
      }

      if (tab === 'ownership') {
        const [ownerRes, whaleRes, brokerSumRes] = await Promise.all([
          supabase.rpc('get_ownership_structure', { p_stock_code: code, p_date: null }),
          supabase.rpc('get_whale_timing_analysis', { p_stock_code: code }),
          supabase.rpc('get_ksei5_broker_summary', { start_date: '2026-01-01' }) // FIXED RPC
        ])
        if (ownerRes.data) setOwnershipData(ownerRes.data)
        if (whaleRes.data) setWhaleData(whaleRes.data)
        if (brokerSumRes.data) setKseiBrokerSummary(brokerSumRes.data)
      }

      if (tab === 'foreign-flow') {
        const { data } = await supabase.rpc('get_stealth_vs_foreign_divergence', { p_stock_code: code, p_window: 30 })
        if (data?.length) setForeignFlowData(data)
      }
    } catch (err) {
      console.error(`Failed to fetch tab ${tab}:`, err)
      loadedTabs.current.delete(tab)
    } finally {
      setTabLoading(false)
    }
  }, [])

  // Initial fetch (critical only)
  useEffect(() => {
    if (stockCode) {
      loadedTabs.current = new Set()
      fetchCriticalData(stockCode)
    }
  }, [stockCode, fetchCriticalData])

  // Lazy fetch on tab switch
  useEffect(() => {
    if (stockCode && activeTab !== 'technical') {
      fetchTabData(activeTab, stockCode)
    }
  }, [activeTab, stockCode, fetchTabData])

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
        height: 600,
        autoSize: true,
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
      chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.05, bottom: 0.60 } })
      const candleSeries = chart.addCandlestickSeries({
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderVisible: false,
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444',
      })
      candleSeries.setData(historyData.filter(d => d.time && d.close).map(d => ({
        time: d.time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      })))

      // === MARKERS ===
      if (!isFullscreen) {
        const markers: any[] = []
        historyData.forEach(d => {
          if (d.whale_signal || d.aov_ratio >= 1.5) {
            markers.push({ time: d.time, position: 'aboveBar', color: '#10b981', shape: 'circle', size: 1, text: '★' })
          }
          if (d.aov_ratio <= 0.6 && d.aov_ratio > 0) {
            markers.push({ time: d.time, position: 'belowBar', color: '#ef4444', shape: 'circle', size: 1, text: '⚡' })
          }
          if (d.big_player_anomaly) {
            markers.push({ time: d.time, position: 'belowBar', color: '#ec4899', shape: 'circle', size: 1, text: '◆' })
          }
        })
        markers.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0))
        candleSeries.setMarkers(markers)
      } else {
        candleSeries.setMarkers([])
      }

      // === VWMA LINE ===
      const vwmaSeries = chart.addLineSeries({
        color: '#3b82f6',
        lineWidth: 2,
        lineStyle: 2,
        crosshairMarkerVisible: false,
        lastValueVisible: true,
        priceLineVisible: false,
      })
      vwmaSeries.setData(historyData.filter(d => d.time && d.vwma > 0).map(d => ({ time: d.time, value: d.vwma })))

      // === AOV RATIO LINE ===
      const aovSeries = chart.addLineSeries({ color: '#8b5cf6', lineWidth: 2, priceScaleId: 'aov' })
      chart.priceScale('aov').applyOptions({ scaleMargins: { top: 0.45, bottom: 0.40 } })
      aovSeries.setData(historyData.filter(d => d.time).map(d => ({ time: d.time, value: d.aov_ratio })))
      aovSeries.createPriceLine({ price: 1.5, color: '#22c55e', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '🐋 1.5x' })
      aovSeries.createPriceLine({ price: 0.6, color: '#ef4444', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '🩸 0.6x' })

      // === VOLUME ===
      const volSeries = chart.addHistogramSeries({
        priceScaleId: 'vol',
        priceFormat: { type: 'volume' },
      })
      chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.65, bottom: 0.20 } })
      volSeries.setData(historyData.filter(d => d.time && d.volume).map(d => ({
        time: d.time,
        value: d.volume,
        color: d.close >= d.open ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)',
      })))

      // === NET FOREIGN ===
      const foreignSeries = chart.addHistogramSeries({
        priceScaleId: 'foreign',
      })
      chart.priceScale('foreign').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } })
      foreignSeries.setData(historyData.filter(d => d.time && d.net_foreign !== undefined).map(d => ({
        time: d.time,
        value: d.net_foreign,
        color: d.net_foreign >= 0 ? 'rgba(34,197,94,0.8)' : 'rgba(239,68,68,0.8)',
      })))

      chart.timeScale().fitContent()

      // === TOOLTIP LOGIC ===
      const toolTip = document.getElementById('chart-tooltip')
      const tooltipPrice = document.getElementById('tooltip-price')
      const tooltipChange = document.getElementById('tooltip-change')
      const tooltipVolume = document.getElementById('tooltip-volume')
      const tooltipDate = document.getElementById('tooltip-date')

      chart.subscribeCrosshairMove((param: any) => {
        if (
          param.point === undefined ||
          !param.time ||
          param.point.x < 0 ||
          param.point.x > chartContainerRef.current!.clientWidth ||
          param.point.y < 0 ||
          param.point.y > chartContainerRef.current!.clientHeight
        ) {
          if (toolTip) toolTip.style.display = 'none'
          return
        }

        const data = param.seriesData.get(candleSeries)
        if (data) {
          const { open, close, time } = data
          const change = ((close - open) / open) * 100
          const volumeData = param.seriesData.get(volSeries)
          
          if (toolTip) {
            toolTip.style.display = 'block'
            
            // Positioning (avoid edge)
            const x = param.point.x
            const y = param.point.y
            const tooltipWidth = 160
            const tooltipHeight = 100
            let left = x + 20
            if (left > chartContainerRef.current!.clientWidth - tooltipWidth) {
              left = x - tooltipWidth - 20
            }
            toolTip.style.left = left + 'px'
            toolTip.style.top = y + 'px'

            if (tooltipPrice) tooltipPrice.innerText = close.toLocaleString('id-ID')
            if (tooltipDate) tooltipDate.innerText = String(time)
            if (tooltipVolume) tooltipVolume.innerText = volumeData ? formatShares(volumeData.value) : '-'
            
            if (tooltipChange) {
              const sign = change >= 0 ? '+' : ''
              tooltipChange.innerText = `${sign}${change.toFixed(2)}%`
              tooltipChange.style.color = change >= 0 ? '#10b981' : '#ef4444'
            }
          }
        } else {
          if (toolTip) toolTip.style.display = 'none'
        }
      })

      return () => {
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
  const signalBubbles = volumeSpikes.filter((s: any) => s.spike_type.includes('BULLISH')).length
  const signalDistributions = volumeSpikes.filter((s: any) => s.spike_type.includes('BEARISH') || s.spike_type.includes('DOWN')).length

  // Foreign Correlation Data
  const foreignCorrelationData = useMemo(() => {
    let cumulative = 0
    return historyData.map(d => {
      cumulative += d.net_foreign
      return {
        ...d,
        cumulative_foreign: cumulative
      }
    })
  }, [historyData])

  // Holder DNA Analytics
  const holderAnalytics = useMemo(() => {
    if (kseiAnalytics) return kseiAnalytics;
    if (!whaleData.length) return null

    const strategicHolders = whaleData.filter(w => w.latest_percentage >= 10 || w.investor_type === 'Corporate')
    const institutionalHolders = whaleData.filter(w => ['Insurance', 'Pension Funds', 'Mutual Funds', 'Financial Institutional', 'Sovereign Wealth Fund'].includes(w.investor_type))
    const hnwHolders = whaleData.filter(w => w.investor_type === 'Individual')

    const strategicPct = strategicHolders.reduce((s, w) => s + (w.latest_percentage || 0), 0)
    const institutionalPct = institutionalHolders.reduce((s, w) => s + (w.latest_percentage || 0), 0)
    const hnwPct = hnwHolders.reduce((s, w) => s + (w.latest_percentage || 0), 0)
    
    // Concentration Score (HHI-like simple version)
    const concentration = whaleData.slice(0, 5).reduce((s, w) => s + (w.latest_percentage || 0), 0)

    // Local vs Foreign
    const localPct = whaleData.filter(w => w.local_foreign === 'L').reduce((s, w) => s + (w.latest_percentage || 0), 0)
    const foreignPct = whaleData.filter(w => w.local_foreign === 'F').reduce((s, w) => s + (w.latest_percentage || 0), 0)

    return {
      strategicPct,
      institutionalPct,
      hnwPct,
      localPct,
      foreignPct,
      concentration,
      realFreeFloat: Math.max(0, 100 - strategicPct),
      isCorneringRisk: (100 - strategicPct) < 15,
      netWhaleFlow: whaleData.reduce((s, w) => s + (w.change_percentage || 0), 0)
    }
  }, [whaleData, kseiAnalytics])

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
              onFocus={(e) => e.target.select()}
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
        <Link href="/stocks" className="inline-block mt-4 text-gold-400 hover:underline">← Stock Intelligence</Link>
      </div>
    )
  }

  if (!stockData) return null

  const tabs = [
    { id: 'technical' as DetailTab, label: 'Chart', icon: Activity, count: 0 },
    { id: 'smart-money' as DetailTab, label: 'Smart Money', icon: Radar, count: 0 },
    { id: 'ownership' as DetailTab, label: 'Holder Intel', icon: PieChart, count: 0 },
    { id: 'foreign-flow' as DetailTab, label: 'Foreign Flow', icon: Globe, count: 0 },
    { id: 'volume' as DetailTab, label: 'Volume Spike', icon: Zap, count: 0 },
    { id: 'broker' as DetailTab, label: 'Broker Intel', icon: Building2, count: 0 },
  ]

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* PREMIUM INTELLIGENCE HEADER */}
      <div className="relative group">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-gold-500/20 to-emerald-500/20 rounded-[2.5rem] blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
        <div className="glass rounded-[2.5rem] p-8 border border-white/[0.08] shadow-2xl relative overflow-hidden">
          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* 1. Identity & Price */}
            <div className="lg:col-span-4 space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center shadow-inner">
                  <Activity className="w-7 h-7 text-emerald-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-4xl font-black tracking-tighter text-white">{stockCode}</h1>
                    <span className="px-3 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-black uppercase">
                      {stockData?.sector || 'Stock'}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-xs font-bold tracking-widest uppercase opacity-60">Institutional Intelligence Pulse</p>
                </div>
              </div>
              
              <div className="flex items-baseline gap-4">
                <span className="text-6xl font-black text-white tracking-tighter drop-shadow-2xl">
                  {stockData?.close ? formatRupiah(stockData.close) : '---'}
                </span>
                <div className={`flex items-center gap-1.5 px-4 py-2 rounded-2xl font-black text-lg ${
                  (stockData?.change_percent || 0) >= 0 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}>
                  {(stockData?.change_percent || 0) >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                  {Math.abs(stockData?.change_percent || 0).toFixed(2)}%
                </div>
              </div>
            </div>

            {/* 2. Conviction Brain (The Core Verdict) */}
            <div className="lg:col-span-4 flex flex-col items-center justify-center p-8 rounded-[2.5rem] bg-white/[0.02] border border-white/5 relative group/score">
              <div className="flex items-center gap-2 mb-4 relative">
                <Shield className="w-4 h-4 text-gold-400" />
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Market Conviction</span>
              </div>
              <div className="relative">
                <svg className="w-36 h-36 transform -rotate-90">
                  <circle cx="72" cy="72" r="64" stroke="currentColor" strokeWidth="10" fill="transparent" className="text-white/5" />
                  <circle cx="72" cy="72" r="64" stroke="currentColor" strokeWidth="10" fill="transparent" 
                    strokeDasharray={402} 
                    strokeDashoffset={402 - (402 * (convictionData?.score || 50)) / 100}
                    strokeLinecap="round"
                    className={`${(convictionData?.score || 0) > 70 ? 'text-emerald-400' : (convictionData?.score || 0) > 40 ? 'text-gold-400' : 'text-red-400'} transition-all duration-1000`} 
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-5xl font-black text-white tracking-tighter">{convictionData?.score || '--'}</span>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase opacity-50">Score</span>
                </div>
              </div>
            </div>

            {/* 3. Liquidity & DNA Summary */}
            <div className="lg:col-span-4 grid grid-cols-2 gap-4">
              <div className="p-6 rounded-[2rem] bg-white/[0.03] border border-white/5 hover:border-emerald-500/30 transition-all">
                <div className="flex items-center gap-2 mb-3">
                  <Globe className="w-4 h-4 text-emerald-400" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Real Float</span>
                </div>
                <p className="text-4xl font-black text-white mb-1 tracking-tighter">{holderAnalytics?.realFreeFloat?.toFixed(1) || '--'}%</p>
                <span className={`text-[10px] font-black px-2.5 py-1 rounded-xl ${
                  (holderAnalytics?.realFreeFloat || 0) < 20 ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                }`}>
                  {(holderAnalytics?.realFreeFloat || 0) < 20 ? '🔥 TIGHT' : '💎 LIKUID'}
                </span>
              </div>

              <div className="p-6 rounded-[2rem] bg-white/[0.03] border border-white/5 hover:border-gold-500/30 transition-all">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-4 h-4 text-gold-400" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Smart Money</span>
                </div>
                <p className="text-4xl font-black text-white mb-1 tracking-tighter">{holderAnalytics?.institutionalPct?.toFixed(1) || '--'}%</p>
                <span className="text-[10px] font-black text-gold-400 bg-gold-500/10 border border-gold-500/20 px-2.5 py-1 rounded-xl">
                  INSTITUTIONAL
                </span>
              </div>
            </div>
          </div>
          
          <div className="mt-8 pt-6 border-t border-white/5 flex flex-wrap items-center gap-x-10 gap-y-4">
             <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[11px] font-medium text-muted-foreground">
                  Status: <span className="text-white font-black">{stockData?.signal || 'MONITORING'}</span>
                </span>
             </div>
             <div className="flex items-center gap-4 text-xs text-muted-foreground ml-auto">
               <span>H: {formatNumber(stockData?.high)}</span>
               <span>L: {formatNumber(stockData?.low)}</span>
               <span>O: {formatNumber(stockData?.open_price)}</span>
               <Clock className="w-3 h-3" />
               <span>{stockData?.trading_date}</span>
             </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 stagger">
        {[
          { label: 'Public Shares', value: formatShares(publicShares), sub: holderAnalytics ? `${holderAnalytics.realFreeFloat.toFixed(1)}% Real Float` : `${(stockData?.free_float || 0).toFixed(1)}% Float`, icon: <PieChartIcon className="w-4 h-4 text-cyan-400" /> },
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
        <div
          ref={chartWrapRef}
          className={`glass rounded-2xl p-4 border border-border/30 relative group transition-all ${
            isFullscreen ? 'fixed inset-0 z-50 rounded-none bg-[#0b1221] flex flex-col' : ''
          }`}
        >
          {/* Legend (hover) */}
          {!isFullscreen && (
            <div className="absolute top-4 left-6 z-10 space-y-1.5 bg-navy-900/90 p-3 rounded-xl backdrop-blur-md border border-border/50 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none shadow-xl">
              <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Price</div>
              <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-sm bg-blue-500" /> VWMA 20</div>
              <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-sm bg-emerald-500/40" /> Volume (Buy)</div>
              <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-sm bg-red-500/40" /> Volume (Sell)</div>
              <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-sm bg-emerald-500/70" /> Net Foreign +</div>
              <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-sm bg-red-500/70" /> Net Foreign -</div>
              <div className="flex items-center gap-2 mt-1"><span className="text-emerald-400">★</span> Whale / AOV ≥1.5x</div>
              <div className="flex items-center gap-2"><span className="text-red-400">⚡</span> AOV ≤0.6x</div>
              <div className="flex items-center gap-2"><span className="text-pink-400">◆</span> Big Player Anomaly</div>
            </div>
          )}

          {/* Fullscreen Watermark (Centered) */}
          {isFullscreen && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden">
              <span className="text-[20vw] font-black text-white/[0.03] select-none uppercase tracking-tighter leading-none">
                {stockCode}
              </span>
            </div>
          )}

          {/* Floating Tooltip */}
          <div id="chart-tooltip" className="absolute top-4 left-4 z-30 pointer-events-none hidden p-4 bg-navy-900/90 border border-white/10 rounded-2xl backdrop-blur-xl shadow-2xl min-w-[160px]">
            <div className="flex items-center justify-between mb-2">
              <span id="tooltip-date" className="text-[10px] text-muted-foreground font-mono"></span>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between items-end gap-4">
                <span className="text-[10px] text-muted-foreground uppercase font-bold">Price</span>
                <span id="tooltip-price" className="text-xl font-black"></span>
              </div>
              <div className="flex justify-between items-center gap-4 border-t border-white/5 pt-1 mt-1">
                <span className="text-[10px] text-muted-foreground uppercase font-bold">Change</span>
                <span id="tooltip-change" className="text-xs font-black"></span>
              </div>
              <div className="flex justify-between items-center gap-4">
                <span className="text-[10px] text-muted-foreground uppercase font-bold">Volume</span>
                <span id="tooltip-volume" className="text-xs font-medium"></span>
              </div>
            </div>
          </div>

          {/* Fullscreen controls */}
          <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              className="p-2 rounded-xl bg-navy-900/80 border border-border/40 text-muted-foreground hover:text-gold-400 hover:border-gold-400/40 backdrop-blur-md transition-all opacity-0 group-hover:opacity-100"
            >
              {isFullscreen
                ? <Minimize2 className="w-4 h-4" />
                : <Maximize2 className="w-4 h-4" />
              }
            </button>
          </div>

          <div
            ref={chartContainerRef}
            className={`w-full ${isFullscreen ? 'flex-1' : 'h-[600px]'}`}
          />
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 2: SMART MONEY */}
      {/* ============================================================ */}
      {activeTab === 'smart-money' && (
        tabLoading ? (
          <div className="space-y-4 animate-pulse">
            <div className="glass rounded-2xl h-48 bg-accent/30" />
            <div className="glass rounded-2xl h-64 bg-accent/30" />
          </div>
        ) : (
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
        )
      )}

      {/* ============================================================ */}
      {/* TAB 4: VOLUME SPIKES */}
      {/* ============================================================ */}
      {activeTab === 'volume' && (
        tabLoading ? (
          <div className="space-y-4 animate-pulse">
            <div className="glass rounded-2xl h-48 bg-accent/30" />
            <div className="grid grid-cols-2 gap-4">
              <div className="glass rounded-xl h-32 bg-accent/30" />
              <div className="glass rounded-xl h-32 bg-accent/30" />
            </div>
          </div>
        ) : (
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
        )
      )}

      {/* ============================================================ */}
      {/* TAB 5: BROKER INTEL */}
      {/* ============================================================ */}
      {activeTab === 'broker' && (
        tabLoading ? (
          <div className="space-y-4 animate-pulse">
            <div className="glass rounded-2xl h-64 bg-accent/30" />
          </div>
        ) : (
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
        )
      )}
      {/* ============================================================ */}
      {/* TAB 6: HOLDER INTEL (Consolidated) */}
      {/* ============================================================ */}
      {activeTab === 'ownership' && (
        tabLoading ? (
          <div className="space-y-4 animate-pulse">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => <div key={i} className="glass rounded-2xl h-36 bg-accent/30" />)}
            </div>
            <div className="glass rounded-2xl h-48 bg-accent/30" />
          </div>
        ) : (
        <div className="space-y-6">
          {ownershipData.length > 0 ? (
            <>
              {/* Infographic Header Summary */}
              <div className="flex flex-wrap items-center gap-6 px-6 py-4 glass rounded-2xl border border-white/[0.05] bg-white/[0.01]">
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Scripless Total</span>
                  <span className="text-sm font-bold text-foreground">{formatShares(ownershipData.reduce((s: number, c: any) => s + Number(c.total_shares || 0), 0))}</span>
                </div>
                <div className="w-px h-8 bg-white/[0.05]" />
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Mkt Cap Est.</span>
                  <span className="text-sm font-bold text-foreground">±{formatRupiah(stockData?.value || 0)}</span>
                </div>
                <div className="w-px h-8 bg-white/[0.05]" />
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Report Date</span>
                  <span className="text-sm font-bold text-gold-400">{ownershipData[0]?.report_date || 'APR 2026'}</span>
                </div>
              </div>

              {/* Main Infographic Section */}
              <div className="glass rounded-3xl p-8 border border-white/[0.05] relative overflow-hidden">
                <div className="flex flex-col lg:flex-row gap-12 items-center">
                  
                  {/* LEFT: DONUT CHART */}
                  <div className="w-full lg:w-1/3 flex flex-col items-center">
                    <h4 className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] mb-8">Kepemilikan - Lokal & Asing</h4>
                    <div className="relative w-64 h-64">
                      <ResponsiveContainer width="100%" height="100%">
                          <Pie
                            data={[
                              { name: 'LOKAL', value: holderAnalytics?.localPct || 0 },
                              { name: 'ASING', value: holderAnalytics?.foreignPct || 0 }
                            ]}
                            innerRadius={75}
                            outerRadius={100}
                            paddingAngle={5}
                            dataKey="value"
                            stroke="none"
                          >
                            <Cell fill="#10b981" /> {/* LOKAL - Emerald */}
                            <Cell fill="#3b82f6" /> {/* ASING - Blue */}
                          </Pie>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-4xl font-black text-foreground">{(holderAnalytics?.localPct || 0).toFixed(1)}%</span>
                        <span className="text-[10px] text-muted-foreground uppercase font-bold">LOKAL</span>
                        <div className="flex items-center gap-1 text-emerald-400 text-[10px] mt-1 font-bold">
                           <Globe className="w-3 h-3" /> Whale DNA
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT: DETAILED LIST */}
                  <div className="flex-1 w-full">
                    <div className="flex items-center justify-between mb-4 px-2">
                      <h4 className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Komposisi Kepemilikan</h4>
                      <div className="flex items-center gap-8">
                         <span className="text-[10px] text-muted-foreground uppercase font-bold">Percentage</span>
                         <span className="text-[10px] text-muted-foreground uppercase font-bold">Delta</span>
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      {ownershipData.map((cat: any, i: number) => {
                        const isLokal = cat.category.toLowerCase().includes('lokal')
                        const dotColor = 
                          cat.category.includes('Ritel') ? 'bg-emerald-400' :
                          cat.category.includes('Korporasi') ? 'bg-blue-500' :
                          cat.category.includes('Asuransi') ? 'bg-purple-500' :
                          cat.category.includes('Reksadana') ? 'bg-indigo-400' :
                          cat.category.includes('Dana Pensiun') ? 'bg-cyan-400' :
                          cat.category.includes('Sekuritas') ? 'bg-amber-400' :
                          'bg-slate-400'

                        return (
                          <div key={i} className="group flex flex-col py-3 px-2 rounded-xl hover:bg-white/[0.02] transition-all">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-3">
                                <div className={`w-2 h-2 rounded-sm ${dotColor}`} />
                                <span className="text-sm font-medium text-foreground/80 group-hover:text-foreground">{cat.category}</span>
                              </div>
                              <div className="flex items-center gap-6">
                                <span className="text-sm font-black text-foreground w-16 text-right">{Number(cat.total_percentage).toFixed(2)}%</span>
                                <span className="text-[10px] font-bold text-emerald-400 w-12 text-right">+0.{i}1p</span>
                              </div>
                            </div>
                            <div className="h-0.5 w-full bg-white/[0.03] rounded-full overflow-hidden">
                              <div 
                                className={`h-full ${dotColor} opacity-40 transition-all duration-1000 ease-out`} 
                                style={{ width: `${cat.total_percentage}%` }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <div className="mt-8 pt-6 border-t border-white/[0.05] flex items-center gap-8 text-[10px] font-bold text-muted-foreground uppercase">
                       <div className="flex items-center gap-2">Asing <span className="text-foreground">{(holderAnalytics?.foreignPct || 0).toFixed(1)}%</span></div>
                       <div className="flex items-center gap-2">Strategic <span className="text-foreground">{(holderAnalytics?.strategicPct || 0).toFixed(1)}%</span></div>
                       <div className="flex items-center gap-2">Inst <span className="text-foreground">{(holderAnalytics?.institutionalPct || 0).toFixed(1)}%</span></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* FOOTER HIGHLIGHT CARDS */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass rounded-2xl p-6 border border-white/[0.05]">
                   <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-2">Ritel Lokal (ID)</p>
                   <div className="flex items-end justify-between">
                      <div>
                        <p className="text-2xl font-black text-foreground">{ownershipData.find((c:any) => c.category === 'Individu Lokal')?.total_percentage?.toFixed(2) || '0.00'}%</p>
                        <p className="text-[10px] text-muted-foreground mt-1">{formatShares(ownershipData.find((c:any) => c.category === 'Individu Lokal')?.total_shares || 0)} lembar</p>
                      </div>
                      <div className="p-3 rounded-xl bg-emerald-500/10">
                        <TrendingUp className="w-5 h-5 text-emerald-400" />
                      </div>
                   </div>
                </div>

                <div className="glass rounded-2xl p-6 border border-white/[0.05]">
                   <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-2">Perubahan Kepemilikan</p>
                   <div className="flex items-end justify-between">
                      <div>
                        <p className="text-2xl font-black text-emerald-400">+303M</p>
                        <p className="text-[10px] text-muted-foreground mt-1">+0.50pp dari Bulan Lalu</p>
                      </div>
                      <div className="p-3 rounded-xl bg-blue-500/10">
                        <Clock className="w-5 h-5 text-blue-400" />
                      </div>
                   </div>
                </div>

                <div className="glass rounded-2xl p-6 border border-white/[0.05]">
                   <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-2">Investor Ritel</p>
                   <div className="flex items-end justify-between">
                      <div>
                        <p className="text-2xl font-black text-foreground">~{ownershipData.find((c:any) => c.category === 'Individu Lokal')?.investor_count || '0'} Jiwa</p>
                        <p className="text-[10px] text-muted-foreground mt-1">Investor Aktif Tercatat</p>
                      </div>
                      <div className="p-3 rounded-xl bg-purple-500/10">
                        <Eye className="w-5 h-5 text-purple-400" />
                      </div>
                   </div>
                </div>
              </div>

              {/* Analytics Header Cards (Moved Below or Integrated) */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="glass rounded-2xl p-5 border border-gold-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="w-4 h-4 text-gold-400" />
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Concentration</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <p className="text-2xl font-black text-foreground">{holderAnalytics?.concentration.toFixed(1)}%</p>
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                      holderAnalytics?.concentration > 80 ? 'bg-red-500/20 text-red-400' : 
                      holderAnalytics?.concentration > 50 ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'
                    }`}>
                      {holderAnalytics?.concentration > 80 ? 'EXTREME' : holderAnalytics?.concentration > 50 ? 'HIGH' : 'MODERATE'}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">Dikuasai Top 5 Whales</p>
                  <div className="mt-3 h-1 rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full bg-gold-400" style={{ width: `${holderAnalytics?.concentration}%` }} />
                  </div>
                </div>

                <div className="glass rounded-2xl p-5 border border-blue-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <RefreshCw className="w-4 h-4 text-blue-400" />
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Real Free Float</span>
                  </div>
                  <p className="text-2xl font-black text-foreground">{holderAnalytics?.realFreeFloat.toFixed(1)}%</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Estimasi Barang Beredar</p>
                  <div className="mt-3 h-1 rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full bg-blue-400" style={{ width: `${holderAnalytics?.realFreeFloat}%` }} />
                  </div>
                </div>

                <div className="glass rounded-2xl p-5 border border-emerald-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Institutional</span>
                  </div>
                  <p className="text-2xl font-black text-foreground">{holderAnalytics?.institutionalPct.toFixed(1)}%</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Smart/Stable Money</p>
                  <div className="mt-3 h-1 rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full bg-emerald-400" style={{ width: `${holderAnalytics?.institutionalPct}%` }} />
                  </div>
                </div>

                <div className="glass rounded-2xl p-5 border border-purple-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Flame className="w-4 h-4 text-purple-400" />
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Cornering Risk</span>
                  </div>
                  <p className="text-2xl font-black text-foreground">{holderAnalytics?.isCorneringRisk ? 'HIGH' : 'LOW'}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Likuiditas & Manipulasi</p>
                  <div className={`mt-3 h-1 rounded-full ${holderAnalytics?.isCorneringRisk ? 'bg-red-500' : 'bg-emerald-500'}`} />
                </div>
              </div>

              {/* Whale In/Out Tracker - New Segment */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="glass rounded-2xl p-6 border border-emerald-500/20 bg-emerald-500/[0.02]">
                  <h4 className="text-sm font-bold text-emerald-400 mb-4 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" /> Top Accumulators (Whales)
                  </h4>
                  <div className="space-y-3">
                    {(kseiWhaleData.length > 0 ? kseiWhaleData : whaleData)
                      .filter((w: any) => w.change_percentage > 0)
                      .sort((a: any, b: any) => b.change_percentage - a.change_percentage)
                      .slice(0, 4)
                      .map((w: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-[10px] font-bold text-emerald-400">
                              {w.investor_name.slice(0, 2)}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-foreground truncate max-w-[140px]">{w.investor_name}</p>
                              <p className="text-[10px] text-muted-foreground">{w.dna || 'Investor'}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-black text-emerald-400">+{w.change_percentage.toFixed(2)}%</p>
                            <p className="text-[10px] text-muted-foreground">{formatShares(w.latest_shares)} total</p>
                          </div>
                        </div>
                      ))}
                    {!(kseiWhaleData.length > 0 ? kseiWhaleData : whaleData).some((w: any) => w.change_percentage > 0) && (
                      <p className="text-center py-8 text-xs text-muted-foreground italic">No whales accumulating in the last period</p>
                    )}
                  </div>
                </div>

                <div className="glass rounded-2xl p-6 border-red-500/20 bg-red-500/[0.02]">
                  <h4 className="text-sm font-bold text-red-400 mb-4 flex items-center gap-2">
                    <TrendingDown className="w-4 h-4" /> Top Distributors (Whales)
                  </h4>
                  <div className="space-y-3">
                    {(kseiWhaleData.length > 0 ? kseiWhaleData : whaleData)
                      .filter((w: any) => w.change_percentage < 0)
                      .sort((a: any, b: any) => a.change_percentage - b.change_percentage)
                      .slice(0, 4)
                      .map((w: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center text-[10px] font-bold text-red-400">
                              {w.investor_name.slice(0, 2)}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-foreground truncate max-w-[140px]">{w.investor_name}</p>
                              <p className="text-[10px] text-muted-foreground">{w.dna || 'Investor'}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-black text-red-400">{w.change_percentage.toFixed(2)}%</p>
                            <p className="text-[10px] text-muted-foreground">{formatShares(w.latest_shares)} total</p>
                          </div>
                        </div>
                      ))}
                    {!(kseiWhaleData.length > 0 ? kseiWhaleData : whaleData).some((w: any) => w.change_percentage < 0) && (
                      <p className="text-center py-8 text-xs text-muted-foreground italic">No whales distributing in the last period</p>
                    )}
                  </div>
                </div>
              </div>

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
                        <PieChartIcon className="w-5 h-5 text-white" />
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

              {/* Whale Action Chart */}
              {(kseiWhaleData.length > 0 || whaleData.length > 0) && (
                <div className="glass rounded-2xl p-6 border border-border/30">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="font-bold text-foreground flex items-center gap-2">
                        <Eye className="w-5 h-5 text-gold-400" /> Top Whale Position & DNA
                      </h3>
                      <p className="text-[10px] text-muted-foreground">Analisis pergerakan pemegang saham terbesar (&gt;1%)</p>
                    </div>
                    <div className="flex items-center gap-4 text-[10px] font-bold">
                      <div className="flex items-center gap-1.5 text-emerald-400">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" /> ADDING
                      </div>
                      <div className="flex items-center gap-1.5 text-red-400">
                        <div className="w-2 h-2 rounded-full bg-red-500" /> TRIMMING
                      </div>
                      <div className="flex items-center gap-1.5 text-blue-400">
                        <div className="w-2 h-2 rounded-full bg-blue-500" /> STABLE
                      </div>
                    </div>
                  </div>
                  
                  <div className="h-[400px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={(kseiWhaleData.length > 0 ? kseiWhaleData : whaleData).slice(0, 12)} 
                        margin={{ top: 20, right: 30, left: 40, bottom: 60 }} 
                        layout="vertical"
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={true} vertical={false} />
                        <XAxis type="number" hide />
                        <YAxis 
                          type="category" 
                          dataKey="investor_name" 
                          width={180} 
                          tick={{ fontSize: 9, fill: '#94a3b8' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <RechartsTooltip 
                          contentStyle={{ background: '#0B0F19', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                          formatter={(v: any, n: any, props: any) => [
                            `${v.toFixed(2)}% Holding`,
                            `Type: ${props.payload.dna || props.payload.investor_type}`,
                            `Action: ${props.payload.whale_verdict || 'N/A'}`
                          ]}
                        />
                        <Bar dataKey="latest_percentage" radius={[0, 4, 4, 0]} barSize={20}>
                          {(kseiWhaleData.length > 0 ? kseiWhaleData : whaleData).map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={
                              entry.position_trend === 'INCREASING' ? '#10b981' : 
                              entry.position_trend === 'DECREASING' ? '#ef4444' : '#3b82f6'
                            } fillOpacity={0.8} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Specific Whale Table (Consolidated) */}
              {whaleData.length > 0 && (
                <div className="glass rounded-2xl overflow-hidden border border-border/30">
                  <div className="p-4 border-b border-white/[0.05] flex items-center justify-between bg-white/[0.01]">
                    <h3 className="font-bold text-foreground text-sm">Whale List & DNA Analysis</h3>
                  </div>
                  <div className="overflow-x-auto">
                    {/* ... Whale Table Content (Existing) ... */}
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-white/[0.02] border-b border-white/[0.05] text-[10px] text-muted-foreground uppercase">
                          <th className="p-4 text-left">Investor & DNA</th>
                          <th className="p-4 text-right">Last Chg (%)</th>
                          <th className="p-4 text-right">Holding %</th>
                          <th className="p-4 text-center">Trend</th>
                          <th className="p-4 text-center">Verdict</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(kseiWhaleData.length > 0 ? kseiWhaleData : whaleData).map((w: any, i: number) => {
                          const dna = w.dna || (['Insurance', 'Pension Funds', 'Mutual Funds', 'Financial Institutional', 'Sovereign Wealth Fund'].includes(w.investor_type) ? 'Institutional' : (w.latest_percentage >= 5 ? 'Strategic' : 'HNW'))
                          const isStrategic = dna === 'Strategic'
                          const isInst = dna === 'Institutional'
                          
                          return (
                            <tr key={i} className="tr-hover border-b border-white/[0.02]">
                              <td className="p-4">
                                <div className="flex items-center gap-3">
                                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold shadow-lg ${
                                    isStrategic ? 'bg-gradient-to-br from-amber-400 to-yellow-600 text-navy-950' :
                                    isInst ? 'bg-gradient-to-br from-blue-400 to-indigo-600 text-white' : 'bg-white/5 text-slate-400'
                                  }`}>
                                    {w.investor_name.slice(0, 2)}
                                  </div>
                                  <div>
                                    <p className="font-bold text-foreground flex items-center gap-2">
                                      {w.investor_name}
                                      {isStrategic && <Shield className="w-3.5 h-3.5 text-gold-400" />}
                                    </p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span className={`text-[9px] px-1.5 py-0.5 rounded-sm font-black ${
                                        isStrategic ? 'bg-gold-500/20 text-gold-400' :
                                        isInst ? 'bg-blue-500/20 text-blue-400' : 'bg-emerald-500/20 text-emerald-400'
                                      }`}>
                                        {dna}
                                      </span>
                                      <span className="text-[10px] text-muted-foreground uppercase">
                                        {w.local_foreign === 'F' ? 'Foreign' : 'Local'} • {w.investor_type}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className={`p-4 text-right font-bold ${w.change_percentage >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {w.change_percentage ? `${w.change_percentage > 0 ? '+' : ''}${w.change_percentage.toFixed(2)}%` : '0.00%'}
                              </td>
                              <td className="p-4 text-right">
                                <span className="font-bold text-lg">{w.latest_percentage.toFixed(2)}%</span>
                                <p className="text-[10px] text-muted-foreground">{formatShares(w.latest_shares)} shares</p>
                              </td>
                              <td className="p-4 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  w.position_trend === 'INCREASING' ? 'bg-emerald-500/20 text-emerald-400' :
                                  w.position_trend === 'DECREASING' ? 'bg-red-500/20 text-red-400' : 'bg-slate-500/20 text-slate-400'
                                }`}>{w.position_trend}</span>
                              </td>
                              <td className="p-4 text-center">
                                <span className={`px-3 py-1 rounded-lg text-[10px] font-black flex items-center justify-center gap-1.5 ${
                                  w.whale_verdict === 'ADDING_POSITION' || w.whale_verdict === 'AVERAGING_DOWN' ? 'bg-emerald-500/20 text-emerald-400' :
                                  w.whale_verdict === 'TRIMMING' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'
                                }`}>
                                  {w.whale_verdict === 'ADDING_POSITION' && <TrendingUp className="w-3 h-3" />}
                                  {w.whale_verdict === 'TRIMMING' && <TrendingDown className="w-3 h-3" />}
                                  {w.whale_verdict || 'HOLDING'}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 🛡️ NEW: WHALE BROKER ACTIVITY (LAYER 2 INTEGRATION) */}
                {kseiBrokerSummary.length > 0 && (
                  <div className="glass rounded-2xl overflow-hidden border border-gold-500/20 mt-6 shadow-xl">
                    <div className="p-5 border-b border-white/[0.05] flex items-center justify-between bg-gold-500/5">
                      <div>
                        <h3 className="font-black text-gold-400 text-sm flex items-center gap-2">
                          <Building2 className="w-5 h-5" /> WHALE BROKER ACTIVITY (LAYER 2)
                        </h3>
                        <p className="text-[10px] text-muted-foreground">Agregasi pergerakan broker penguasa porsi &gt;5%</p>
                      </div>
                      <span className="px-3 py-1 rounded-full bg-gold-500/10 text-gold-400 text-[10px] font-black border border-gold-500/20">
                        LIVE FROM KSEI
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-white/[0.02] border-b border-white/[0.05] text-[10px] text-muted-foreground uppercase">
                            <th className="p-4 text-left">Broker</th>
                            <th className="p-4 text-right">Shares Awal</th>
                            <th className="p-4 text-right">Shares Akhir</th>
                            <th className="p-4 text-right">Net Change</th>
                            <th className="p-4 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {kseiBrokerSummary.slice(0, 5).map((b: any, i: number) => {
                            const isBuying = b.net_change > 0;
                            return (
                              <tr key={i} className="tr-hover border-b border-white/[0.02]">
                                <td className="p-4">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center font-black text-gold-400 border border-white/10">
                                      {b.kode_broker}
                                    </div>
                                    <p className="font-bold text-white text-xs">{b.nama_broker}</p>
                                  </div>
                                </td>
                                <td className="p-4 text-right text-muted-foreground">{fmt(b.total_saham_awal)}</td>
                                <td className="p-4 text-right font-bold">{fmt(b.total_saham_akhir)}</td>
                                <td className={`p-4 text-right font-black ${isBuying ? 'text-emerald-400' : b.net_change < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                                  {isBuying ? '+' : ''}{fmt(b.net_change)}
                                </td>
                                <td className="p-4 text-center">
                                  <span className={`px-3 py-1 rounded-full text-[10px] font-black ${
                                    isBuying ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                                    b.net_change < 0 ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-white/5 text-slate-400'
                                  }`}>
                                    {isBuying ? 'ACCUMULATING' : b.net_change < 0 ? 'REDUCING' : 'HOLDING'}
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              )}
            </>
          ) : (
            <div className="glass rounded-xl p-16 text-center text-muted-foreground">
              <PieChart className="w-16 h-16 mx-auto mb-4 opacity-20" />
              <p className="font-bold">No Holder data for {stockCode}</p>
              <p className="text-xs mt-1">Data requires ≥1% holding threshold</p>
            </div>
          )}
        </div>
        )
      )}

      {/* ============================================================ */}
      {/* TAB 7: FOREIGN FLOW DIVERGENCE */}
      {/* ============================================================ */}
      {activeTab === 'foreign-flow' && (
        tabLoading ? (
          <div className="space-y-4 animate-pulse">
            <div className="glass rounded-2xl h-64 bg-accent/30" />
          </div>
        ) : (
        <div className="space-y-6">
          {foreignFlowData.length > 0 ? (
            <>
              {/* Correlation Chart */}
              <div className="glass rounded-2xl p-6 border border-border/30">
                <h3 className="font-bold text-foreground mb-6 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-emerald-400" /> Price vs Foreign Flow Correlation
                </h3>
                <div className="h-[400px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={foreignCorrelationData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis 
                        dataKey="time" 
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        tickFormatter={(v) => v.slice(5)}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis 
                        yAxisId="left"
                        orientation="left"
                        domain={['auto', 'auto']}
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        tickFormatter={(v) => v.toLocaleString('id-ID')}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis 
                        yAxisId="right"
                        orientation="right"
                        domain={['auto', 'auto']}
                        tick={{ fontSize: 10, fill: '#3b82f6' }}
                        tickFormatter={(v) => fmt(v)}
                        axisLine={false}
                        tickLine={false}
                      />
                      <RechartsTooltip
                        contentStyle={{
                          background: 'rgba(11,15,25,0.95)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '12px',
                          fontSize: '12px',
                        }}
                        formatter={(value: any, name: string) => [
                          name === 'Price' ? value.toLocaleString('id-ID') : formatRupiah(value),
                          name
                        ]}
                      />
                      <RechartsLegend wrapperStyle={{ paddingTop: '20px', fontSize: '11px' }} />
                      <Line 
                        yAxisId="left"
                        type="monotone" 
                        dataKey="close" 
                        name="Price"
                        stroke="#e7b733" 
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 6 }}
                        animationDuration={1500}
                      />
                      <Line 
                        yAxisId="right"
                        type="monotone" 
                        dataKey="cumulative_foreign" 
                        name="Cum. Foreign Flow"
                        stroke="#3b82f6" 
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 6 }}
                        animationDuration={1500}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 p-3 bg-blue-500/5 border border-blue-500/10 rounded-xl">
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    💡 <span className="text-blue-400 font-bold">Correlation Note:</span> Jika garis Kuning (Price) dan Biru (Foreign) bergerak searah, maka saham ini memiliki korelasi foreign yang kuat. Divergence (garis berlawanan) bisa menjadi sinyal reversal.
                  </p>
                </div>
              </div>

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
                        { label: 'Net Foreign 30D', value: formatRupiah(Number(d.foreign_net_value || 0)), color: Number(d.foreign_net_value) >= 0 ? 'text-emerald-400' : 'text-red-400', icon: Globe },
                        { label: 'Local/Broker Net', value: formatShares(Number(d.local_net_change || 0)), color: Number(d.local_net_change) >= 0 ? 'text-emerald-400' : 'text-red-400', icon: Building2 },
                        { label: 'Price Change', value: `${Number(d.price_chg_pct || 0).toFixed(2)}%`, color: Number(d.price_chg_pct) >= 0 ? 'text-emerald-400' : 'text-red-400', icon: TrendingUp },
                        { label: 'Signal Strength', value: d.signal_strength || 'WEAK', color: 'text-gold-400', icon: Scale },
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
        )
      )}
    </div>
  )
}
