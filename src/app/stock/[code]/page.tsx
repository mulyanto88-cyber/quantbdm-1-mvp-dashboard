'use client'

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { formatRupiah, formatNumber, formatShares } from '@/lib/utils'
import {
  TrendingUp, TrendingDown, Clock, Target, PieChart as PieChartIcon,
  Building2, Shield, Maximize2, Minimize2, ExternalLink, Users, Loader2, AlertTriangle
} from 'lucide-react'
import Link from 'next/link'

// ─── API Helper ──────────────────────────────────────────────────────────────
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

const OWN_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#6b7280']

// ─── Types ────────────────────────────────────────────────────────────────────
interface StockData {
  stock_code: string; close: number; change_percent: number
  high: number; low: number; open_price: number
  volume: number; value: number; net_foreign_value: number
  vwma_20d: number; aov_ratio_ma20: number; whale_signal: boolean
  big_player_anomaly: boolean; signal: string; sector: string
  free_float: number; tradeable_shares: number; trading_date: string
}

interface HistoryPoint {
  time: string; open: number; high: number; low: number; close: number
  volume: number; net_foreign: number; aov_ratio: number; vwma: number
  whale_signal: boolean; big_player_anomaly: boolean
}

// ─── Simple Pie (No Library) ─────────────────────────────────────────────────
function SimplePie({ data }: { data: { name: string; value: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  let cumulative = 0
  return (
    <div className="flex flex-col items-center gap-3">
      <svg width="160" height="160" viewBox="0 0 160 160">
        {data.map((d, i) => {
          const startAngle = (cumulative / total) * 360
          cumulative += d.value
          const endAngle = (cumulative / total) * 360
          const startRad = (startAngle - 90) * Math.PI / 180
          const endRad = (endAngle - 90) * Math.PI / 180
          const cx = 80, cy = 80, r = 60
          const x1 = cx + r * Math.cos(startRad), y1 = cy + r * Math.sin(startRad)
          const x2 = cx + r * Math.cos(endRad), y2 = cy + r * Math.sin(endRad)
          const largeArc = endAngle - startAngle > 180 ? 1 : 0
          return (
            <path key={i} d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`}
              fill={OWN_COLORS[i % OWN_COLORS.length]} stroke="#0B0F19" strokeWidth="1" />
          )
        })}
        <circle cx="80" cy="80" r="35" fill="#0B0F19" />
      </svg>
      <div className="flex flex-wrap gap-2 justify-center text-[9px]">
        {data.slice(0, 5).map((d, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: OWN_COLORS[i % OWN_COLORS.length] }} />
            {d.name} {((d.value / total) * 100).toFixed(1)}%
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function StockDetailPage() {
  const params = useParams()
  const stockCode = (params?.code as string)?.toUpperCase() || ''

  const [period, setPeriod] = useState(90)
  const [stockData, setStockData] = useState<StockData | null>(null)
  const [historyData, setHistoryData] = useState<HistoryPoint[]>([])
  const [smartMoneyScore, setSmartMoneyScore] = useState<any>(null)
  const [brokerData, setBrokerData] = useState<any[]>([])
  const [ownershipDetails, setOwnershipDetails] = useState<any[]>([])
  const [whaleMovement, setWhaleMovement] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)

  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartWrapRef = useRef<HTMLDivElement>(null)
  const [chartReady, setChartReady] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.LightweightCharts) { setChartReady(true); return }
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js'
    script.async = true
    script.onload = () => setChartReady(true)
    document.body.appendChild(script)
  }, [])

  const fetchAllData = useCallback(async (code: string, days: number) => {
    if (!code) return
    setIsLoading(true); setErrorMsg('')
    try {
      const latestRes = await mdQuery(`
        SELECT d.*, COALESCE(s.sector, 'Others') AS sector, s.free_float
        FROM market.daily_transactions d LEFT JOIN market.sector_lookup s ON d.stock_code = s.stock_code
        WHERE d.stock_code = $1 ORDER BY d.trading_date DESC LIMIT 1`, [code])
      if (!latestRes.length) { setErrorMsg(`Stock ${code} not found`); setIsLoading(false); return }
      setStockData(latestRes[0])

      const smRes = await mdQuery(`SELECT * FROM market.vw_smart_money_score WHERE stock_code = $1`, [code])
      if (smRes.length) setSmartMoneyScore(smRes[0])

      const histRes = await mdQuery(`
        SELECT trading_date, open_price, high, low, close, volume,
               net_foreign_value, vwma_20d, aov_ratio_ma20, whale_signal, big_player_anomaly, previous
        FROM market.daily_transactions WHERE stock_code = $1
        AND trading_date >= (SELECT MAX(trading_date) FROM market.daily_transactions) - INTERVAL '${days} days'
        ORDER BY trading_date ASC`, [code])
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

      const brokerRes = await mdQuery(`
        SELECT broker_code AS kode_broker, MAX(broker_name) AS nama_broker,
               SUM(CASE WHEN side='BUY' THEN value ELSE -value END) AS net_value
        FROM broker_activity WHERE stock_code = $1
        GROUP BY broker_code ORDER BY ABS(SUM(CASE WHEN side='BUY' THEN value ELSE -value END)) DESC LIMIT 6`, [code])
      setBrokerData(brokerRes)

      const ownerRes = await mdQuery(`
        SELECT investor_name, investor_type, local_foreign, percentage, total_holding_shares AS shares
        FROM ksei.ownership_1pct WHERE share_code = $1
        AND date = (SELECT MAX(date) FROM ksei.ownership_1pct) ORDER BY percentage DESC LIMIT 100`, [code])
      setOwnershipDetails(ownerRes)

      const whaleRes = await mdQuery(`SELECT * FROM ksei.vw_whale_timing WHERE share_code = $1`, [code])
      setWhaleMovement(whaleRes)
    } catch (err: any) { setErrorMsg(err.message || 'Failed to fetch data') }
    finally { setIsLoading(false) }
  }, [])

  useEffect(() => { if (stockCode) fetchAllData(stockCode, period) }, [stockCode, period, fetchAllData])

  // ⭐ Chart rendering — WITH FORCED RESIZE
  useEffect(() => {
    if (!chartReady || !chartContainerRef.current || historyData.length === 0) return
    
    const container = chartContainerRef.current
    const lwc = window.LightweightCharts
    if (!lwc) return

    // Force container to have height
    container.style.height = isFullscreen ? `${window.innerHeight - 50}px` : '600px'
    
    while (container.firstChild) { container.removeChild(container.firstChild) }

    const chart = lwc.createChart(container, {
      width: container.clientWidth,
      height: isFullscreen ? window.innerHeight - 50 : 600,
      layout: { background: { type: 'solid', color: '#0B0F19' }, textColor: '#94a3b8' },
      grid: { vertLines: { color: 'rgba(51,65,85,0.15)' }, horzLines: { color: 'rgba(51,65,85,0.15)' } },
      crosshair: { mode: 1 },
      timeScale: { borderColor: 'rgba(51,65,85,0.5)', timeVisible: true },
    })

    chart.addCandlestickSeries({
      upColor: '#22c55e', downColor: '#ef4444', wickUpColor: '#22c55e', wickDownColor: '#ef4444',
    }).setData(historyData.map(d => ({ time: d.time, open: d.open, high: d.high, low: d.low, close: d.close })))

    chart.timeScale().fitContent()
    
    return () => { try { chart.remove() } catch (e) {} }
  }, [historyData, chartReady, isFullscreen])

  const toggleFullscreen = () => {
    if (!chartWrapRef.current) return
    if (!isFullscreen) chartWrapRef.current.requestFullscreen?.().catch(() => {})
    else document.exitFullscreen?.().catch(() => {})
    setIsFullscreen(f => !f)
  }

  const smiScore = smartMoneyScore?.smart_money_score || 0
  const smiSignal = smartMoneyScore?.signal || '➖ NEUTRAL'
  const verdict = useMemo(() => {
    if (smiScore >= 70) return { label: 'STRONG BUY', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' }
    if (smiScore >= 45) return { label: 'WATCH', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' }
    return { label: 'NEUTRAL', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' }
  }, [smiScore])

  const ownershipPieData = useMemo(() => {
    if (!ownershipDetails.length) return []
    const g: Record<string, number> = {}
    ownershipDetails.forEach(d => { g[d.investor_type || 'Others'] = (g[d.investor_type || 'Others'] || 0) + Number(d.percentage) })
    return Object.entries(g).map(([k, v]) => ({ name: k, value: v }))
  }, [ownershipDetails])

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 text-gold-400 animate-spin" /></div>
  if (errorMsg) return <div className="glass rounded-xl p-12 text-center"><AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" /><p className="text-red-400">{errorMsg}</p></div>
  if (!stockData) return null

  return (
    <div className="space-y-4 pb-12 animate-fade-in">

      {/* ═══ HEADER ═══ */}
      <div className="glass rounded-3xl p-5 lg:p-7 border border-white/[0.08] shadow-2xl relative overflow-hidden">
        <div className="flex flex-col xl:flex-row gap-6 justify-between relative z-10">
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
              <span>H:{formatNumber(stockData.high)}</span><span>L:{formatNumber(stockData.low)}</span><span>O:{formatNumber(stockData.open_price)}</span>
              <span className="opacity-30">|</span><span><Clock className="w-3 h-3 inline" /> {String(stockData.trading_date).split('T')[0]}</span>
            </div>
          </div>
          <div className={`rounded-3xl p-5 ${verdict.bg} border ${verdict.border} xl:min-w-[220px] flex flex-col justify-center`}>
            <Shield className={`w-5 h-5 ${verdict.color} mb-2`} />
            <p className={`text-xl font-black ${verdict.color}`}>{verdict.label}</p>
            <p className="text-xs text-muted-foreground">Score: {Math.round(smiScore)}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mt-6 pt-5 border-t border-white/[0.05]">
          {[
            { l: 'Score', v: Math.round(smiScore), c: smiScore >= 70 ? 'text-emerald-400' : smiScore >= 45 ? 'text-amber-400' : 'text-blue-400' },
            { l: 'Signal', v: smiSignal, c: 'text-gold-400' },
            { l: 'Foreign', v: formatRupiah(stockData.net_foreign_value), c: stockData.net_foreign_value >= 0 ? 'text-emerald-400' : 'text-red-400' },
            { l: 'AOV', v: `${(stockData.aov_ratio_ma20||1).toFixed(2)}x`, c: stockData.aov_ratio_ma20 >= 1.5 ? 'text-purple-400' : '' },
            { l: 'Volume', v: formatShares(stockData.volume), c: 'text-orange-400' },
            { l: 'Float%', v: `${stockData.free_float?.toFixed(1)||'--'}%`, c: 'text-blue-400' },
          ].map((m, i) => (
            <div key={i} className="p-2 rounded-xl bg-white/[0.01] border border-white/[0.03] text-center">
              <p className="text-[9px] text-muted-foreground uppercase">{m.l}</p>
              <p className={`text-sm font-black ${m.c}`}>{m.v}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ 3 KOLOM ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass rounded-xl p-4 border border-white/[0.06]">
          <div className="flex items-center gap-2 mb-3"><Target className="w-4 h-4 text-gold-400" /><h3 className="text-[10px] font-black text-gold-400 uppercase">Smart Money</h3></div>
          {smartMoneyScore ? (
            <div className="grid grid-cols-2 gap-2">
              {[
                { l: 'Score', v: Math.round(smiScore), c: 'text-emerald-400' },
                { l: 'Foreign 30D', v: formatRupiah(smartMoneyScore.foreign_30d || 0), c: (smartMoneyScore.foreign_30d || 0) >= 0 ? 'text-emerald-400' : 'text-red-400' },
                { l: 'Broker Net', v: formatRupiah(smartMoneyScore.broker_net || 0), c: (smartMoneyScore.broker_net || 0) >= 0 ? 'text-emerald-400' : 'text-red-400' },
                { l: 'AOV', v: `${(smartMoneyScore.aov_ratio_ma20 || 1).toFixed(2)}x`, c: smartMoneyScore.aov_ratio_ma20 >= 1.5 ? 'text-purple-400' : '' },
              ].map((m, i) => (
                <div key={i} className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                  <p className="text-[8px] text-muted-foreground uppercase">{m.l}</p><p className={`text-xs font-black ${m.c}`}>{m.v}</p>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-muted-foreground text-center py-4">No data</p>}
        </div>

        <div className="glass rounded-xl p-4 border border-white/[0.06]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-blue-400" /><h3 className="text-[10px] font-black text-blue-400 uppercase">Broker</h3></div>
            <Link href={`/bandarmologi?code=${stockCode}`} className="text-[9px] text-blue-400 font-bold">Full →</Link>
          </div>
          {brokerData.length > 0 ? (
            <div className="space-y-1.5">
              {brokerData.slice(0, 4).map((b, i) => (
                <div key={i} className="flex justify-between py-1.5 border-b border-white/[0.03] last:border-0">
                  <div><p className="text-[10px] font-bold truncate w-[60px]">{b.kode_broker}</p></div>
                  <span className={`text-[10px] font-black ${Number(b.net_value) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatRupiah(Number(b.net_value))}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-muted-foreground text-center py-8">No Broker Data</p>}
        </div>

        <div className="glass rounded-xl p-4 border border-white/[0.06]">
          <div className="flex items-center gap-2 mb-3"><PieChartIcon className="w-4 h-4 text-gold-400" /><h3 className="text-[10px] font-black text-gold-400 uppercase">Ownership</h3></div>
          {ownershipPieData.length > 0 ? <SimplePie data={ownershipPieData} /> : <p className="text-xs text-muted-foreground text-center py-8">No data</p>}
        </div>
      </div>

      {/* ═══ CHART — Pindah ke bawah ═══ */}
      <div ref={chartWrapRef} className="glass rounded-2xl p-4 border border-white/[0.06]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1 bg-white/[0.04] rounded-lg p-0.5">
            {PERIOD_OPTIONS.map(opt => (
              <button key={opt.days} onClick={() => setPeriod(opt.days)}
                className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${period === opt.days ? 'bg-gold-400/20 text-gold-400' : 'text-muted-foreground hover:text-white'}`}>{opt.label}</button>
            ))}
          </div>
          <button onClick={toggleFullscreen} className="p-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-muted-foreground hover:text-gold-400">
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
        <div ref={chartContainerRef} style={{ height: '600px', width: '100%' }} />
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
                {whaleMovement.slice(0, 10).map((w, i) => (
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
