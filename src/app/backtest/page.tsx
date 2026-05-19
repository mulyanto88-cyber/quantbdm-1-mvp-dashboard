'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  FlaskConical, Play, Settings2, TrendingUp, TrendingDown,
  Target, Clock, AlertTriangle, X, Calculator, BarChart3,
  DollarSign, Activity, Zap, Calendar, RefreshCw, Info,
} from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
  Cell, Legend,
} from 'recharts'
import { formatRupiah } from '@/lib/utils'

declare const window: any

// ─── API Helper ───────────────────────────────────────────────────────────────
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

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmtRp(v: number): string {
  if (!v && v !== 0) return 'Rp 0'
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1e12) return `${sign}Rp ${(abs / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `${sign}Rp ${(abs / 1e9).toFixed(2)}M`
  if (abs >= 1e6) return `${sign}Rp ${(abs / 1e6).toFixed(0)}Jt`
  return `${sign}Rp ${abs.toLocaleString('id-ID')}`
}

// Indonesian broker fee standard
const BROKER_FEE_BUY  = 0.0015  // 0.15%
const BROKER_FEE_SELL = 0.0025  // 0.25% (includes PPh 0.1%)

// ─── Types ────────────────────────────────────────────────────────────────────
interface Trade {
  entryDate: string
  entryPrice: number
  exitDate: string
  exitPrice: number
  returnPct: number
  returnRp: number
  daysHeld: number
  reason: 'TP' | 'SL' | 'TIME' | 'END'
  lots: number
  modal: number
  fee: number
}

interface BnHResult {
  mode: 'bnh'
  buyDate: string
  sellDate: string
  buyPrice: number
  sellPrice: number
  lots: number
  shares: number
  modal: number
  grossReturn: number
  fee: number
  netReturn: number
  returnPct: number
  annualizedReturn: number
  days: number
  maxDrawdown: number       // ← fixed: true peak-to-trough
  whaleCount: number
  bpAnomalyCount: number
  totalForeign: number
  highestPrice: number
  lowestPrice: number
  rawData: any[]
  // IHSG comparison
  ihsgReturnPct: number | null
  ihsgBuyPrice: number | null
  ihsgSellPrice: number | null
}

interface StratResult {
  mode: 'strategy'
  trades: Trade[]
  winRate: number
  totalReturnPct: number
  totalReturnRp: number
  annualizedReturn: number
  maxDrawdown: number
  avgHolding: number
  profitFactor: number
  sharpeApprox: number
  totalFee: number
  equityCurve: { date: string; equity: number; drawdown: number }[]
}

type Mode = 'strategy' | 'bnh'

// ─── Component ────────────────────────────────────────────────────────────────
export default function BacktestPage() {
  // ── Shared ─────────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<Mode>('strategy')
  const [stockCode, setStockCode] = useState('BBCA')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Strategy mode ──────────────────────────────────────────────────────────
  const [signalType, setSignalType] = useState('WHALE_SIGNAL')
  const [holdingPeriod, setHoldingPeriod] = useState(10)
  const [takeProfit, setTakeProfit] = useState(5)
  const [stopLoss, setStopLoss] = useState(3)
  const [lotsStrat, setLotsStrat] = useState(10)
  const [stratResult, setStratResult] = useState<StratResult | null>(null)

  // ── Buy & Hold mode ────────────────────────────────────────────────────────
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [lotsBnH, setLotsBnH] = useState(10)
  const [bnhResult, setBnHResult] = useState<BnHResult | null>(null)

  const chartRef = useRef<HTMLDivElement>(null)
  const [chartScriptLoaded, setChartScriptLoaded] = useState(false)
  const todayStr = new Date().toISOString().split('T')[0]

  // ── Load LWC ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if ((window as any).LightweightCharts) { setChartScriptLoaded(true); return }
    const s = document.createElement('script')
    s.src = 'https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js'
    s.async = true; s.onload = () => setChartScriptLoaded(true)
    document.body.appendChild(s)
  }, [])

  // ── Set default dates ───────────────────────────────────────────────────────
  useEffect(() => {
    const end = new Date()
    const start = new Date(); start.setDate(start.getDate() - 90)
    setEndDate(end.toISOString().split('T')[0])
    setStartDate(start.toISOString().split('T')[0])
  }, [])

  // ─── Strategy Backtest ─────────────────────────────────────────────────────
  const runStrategy = useCallback(async () => {
    if (!stockCode || stockCode.length < 1) { setError('Isi kode saham'); return }
    setLoading(true); setError(null); setStratResult(null)

    try {
      const data = await mdQuery(
        `SELECT trading_date, open_price, high, low, close,
                whale_signal, net_foreign_value, aov_ratio_ma20, big_player_anomaly
         FROM market.daily_transactions
         WHERE stock_code = $1
         ORDER BY trading_date ASC`,
        [stockCode.toUpperCase()]
      )
      if (!data.length) throw new Error(`Tidak ada data untuk ${stockCode.toUpperCase()}`)

      const lots = lotsStrat
      const shares = lots * 100
      const trades: Trade[] = []
      let equity = 100
      const equityHistory: { date: string; equity: number; peak: number }[] = []
      let position: { entry: number; date: string; idx: number } | null = null
      let peak = 100

      for (let i = 0; i < data.length; i++) {
        const row = data[i]
        const date = String(row.trading_date).split('T')[0]
        const close = Number(row.close)
        const high  = Number(row.high)  || close
        const low   = Number(row.low)   || close

        // ── Update equity (mark-to-market) ──
        let curEq = equity
        if (position) {
          const ret = (close - position.entry) / position.entry
          curEq = equity * (1 + ret)
        }
        peak = Math.max(peak, curEq)
        equityHistory.push({ date, equity: curEq, peak })

        // ── Check exit conditions ──
        if (position) {
          const tpPrice = position.entry * (1 + takeProfit / 100)
          const slPrice = position.entry * (1 - stopLoss / 100)
          const daysHeld = i - position.idx
          let exitPrice = 0, reason: Trade['reason'] | null = null

          if (high >= tpPrice) { exitPrice = tpPrice; reason = 'TP' }
          else if (low <= slPrice) { exitPrice = slPrice; reason = 'SL' }
          else if (daysHeld >= holdingPeriod) { exitPrice = close; reason = 'TIME' }
          else if (i === data.length - 1) { exitPrice = close; reason = 'END' }

          if (reason) {
            const ret = (exitPrice - position.entry) / position.entry
            const grossRp = ret * position.entry * shares
            const fee = position.entry * shares * BROKER_FEE_BUY + exitPrice * shares * BROKER_FEE_SELL
            const netRet = ret - (BROKER_FEE_BUY + BROKER_FEE_SELL)
            equity = equity * (1 + netRet)
            peak   = Math.max(peak, equity)
            trades.push({
              entryDate: position.date, entryPrice: position.entry,
              exitDate: date, exitPrice,
              returnPct: ret * 100,
              returnRp: grossRp - fee,
              daysHeld, reason, lots,
              modal: position.entry * shares,
              fee: Math.round(fee),
            })
            position = null
          }
          continue
        }

        // ── Check entry ──
        let signal = false
        if (signalType === 'WHALE_SIGNAL' && row.whale_signal) signal = true
        if (signalType === 'AOV_SPIKE' && Number(row.aov_ratio_ma20) >= 1.5) signal = true
        if (signalType === 'FOREIGN_BUY' && Number(row.net_foreign_value) > 0) signal = true
        if (signalType === 'BIG_PLAYER' && row.big_player_anomaly) signal = true
        if (signalType === 'COMBINED' && (row.whale_signal || Number(row.aov_ratio_ma20) >= 1.5) && Number(row.net_foreign_value) > 0) signal = true

        if (signal) position = { entry: close, date, idx: i }
      }

      // ── Compute metrics ──
      const wins = trades.filter(t => t.returnPct > 0)
      const losses = trades.filter(t => t.returnPct <= 0)
      const winRate = trades.length ? (wins.length / trades.length) * 100 : 0
      const totalReturnPct = equity - 100
      const totalReturnRp = trades.reduce((s, t) => s + t.returnRp, 0)
      const totalFee = trades.reduce((s, t) => s + t.fee, 0)

      // True max drawdown: peak-to-trough
      let maxDrawdown = 0
      let runPeak = 0
      for (const pt of equityHistory) {
        if (pt.equity > runPeak) runPeak = pt.equity
        const dd = runPeak > 0 ? ((runPeak - pt.equity) / runPeak) * 100 : 0
        if (dd > maxDrawdown) maxDrawdown = dd
      }

      const avgHolding = trades.length ? trades.reduce((s, t) => s + t.daysHeld, 0) / trades.length : 0
      const grossProfit = wins.reduce((s, t) => s + t.returnRp, 0)
      const grossLoss   = Math.abs(losses.reduce((s, t) => s + t.returnRp, 0))
      const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0

      // Annualized return (CAGR-like from first to last data point)
      const totalDays = equityHistory.length
      const annualizedReturn = totalDays > 0
        ? ((Math.pow(equity / 100, 365 / totalDays) - 1) * 100)
        : 0

      // Approx Sharpe: avg trade return / std of trade returns
      const tradeReturns = trades.map(t => t.returnPct)
      const avgR = tradeReturns.length ? tradeReturns.reduce((s, r) => s + r, 0) / tradeReturns.length : 0
      const variance = tradeReturns.length > 1
        ? tradeReturns.reduce((s, r) => s + Math.pow(r - avgR, 2), 0) / (tradeReturns.length - 1)
        : 0
      const sharpeApprox = variance > 0 ? avgR / Math.sqrt(variance) : 0

      // Build equity curve with drawdown
      const equityCurve = equityHistory.map(pt => ({
        date: pt.date,
        equity: Number(pt.equity.toFixed(2)),
        drawdown: Number((pt.peak > 0 ? ((pt.peak - pt.equity) / pt.peak) * 100 : 0).toFixed(2)),
      }))

      setStratResult({
        mode: 'strategy', trades, winRate, totalReturnPct, totalReturnRp,
        annualizedReturn, maxDrawdown, avgHolding, profitFactor,
        sharpeApprox, totalFee, equityCurve,
      })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [stockCode, signalType, holdingPeriod, takeProfit, stopLoss, lotsStrat])

  // ─── Buy & Hold Backtest ───────────────────────────────────────────────────
  const runBnH = useCallback(async () => {
    if (!stockCode || !startDate || !endDate) { setError('Isi semua field'); return }
    if (startDate >= endDate) { setError('Tanggal mulai harus sebelum tanggal akhir'); return }
    setLoading(true); setError(null); setBnHResult(null)

    try {
      // Fetch stock + IHSG parallel
      const [data, ihsgData] = await Promise.all([
        mdQuery(
          `SELECT trading_date, open_price, high, low, close,
                  net_foreign_value, aov_ratio_ma20, whale_signal, big_player_anomaly
           FROM market.daily_transactions
           WHERE stock_code = $1 AND trading_date >= $2 AND trading_date <= $3
           ORDER BY trading_date ASC LIMIT 1000`,
          [stockCode.toUpperCase(), startDate, endDate]
        ),
        mdQuery(
          `SELECT trading_date, close
           FROM market.daily_transactions
           WHERE stock_code = 'COMPOSITE' AND trading_date >= $1 AND trading_date <= $2
           ORDER BY trading_date ASC LIMIT 1000`,
          [startDate, endDate]
        ),
      ])

      if (!data.length) throw new Error(`Tidak ada data untuk ${stockCode.toUpperCase()} dalam periode ini`)

      const first = data[0], last = data[data.length - 1]
      const buyPrice  = Number(first.open_price) || Number(first.close)
      const sellPrice = Number(last.close)
      const lots = lotsBnH
      const shares = lots * 100
      const modal = buyPrice * shares
      const grossReturn = (sellPrice - buyPrice) * shares
      const fee = modal * BROKER_FEE_BUY + sellPrice * shares * BROKER_FEE_SELL
      const netReturn = grossReturn - fee
      const returnPct = (netReturn / modal) * 100

      // Days (calendar)
      const days = Math.round(
        (new Date(String(last.trading_date).split('T')[0]).getTime() -
         new Date(String(first.trading_date).split('T')[0]).getTime()) / 86400000
      ) || data.length

      // Annualized return
      const annualizedReturn = days > 0
        ? ((Math.pow((sellPrice / buyPrice), 365 / days) - 1) * 100)
        : 0

      // True max drawdown (peak-to-trough from buyPrice baseline)
      let runPeak = buyPrice
      let maxDrawdown = 0
      for (const r of data) {
        const h = Number(r.high) || Number(r.close)
        const l = Number(r.low)  || Number(r.close)
        if (h > runPeak) runPeak = h
        const dd = ((runPeak - l) / runPeak) * 100
        if (dd > maxDrawdown) maxDrawdown = dd
      }

      const whaleCount    = data.filter((r: any) => r.whale_signal === true || Number(r.aov_ratio_ma20) >= 1.5).length
      const bpAnomalyCount = data.filter((r: any) => r.big_player_anomaly === true).length
      const totalForeign  = data.reduce((s: number, r: any) => s + (Number(r.net_foreign_value) || 0), 0)
      const highestPrice  = Math.max(...data.map((r: any) => Number(r.high) || Number(r.close)))
      const lowestPrice   = Math.min(...data.map((r: any) => Number(r.low)  || Number(r.close)))

      // IHSG comparison
      let ihsgReturnPct: number | null = null
      let ihsgBuyPrice: number | null = null
      let ihsgSellPrice: number | null = null
      if (ihsgData.length >= 2) {
        ihsgBuyPrice  = Number(ihsgData[0].close)
        ihsgSellPrice = Number(ihsgData[ihsgData.length - 1].close)
        ihsgReturnPct = ((ihsgSellPrice - ihsgBuyPrice) / ihsgBuyPrice) * 100
      }

      const result: BnHResult = {
        mode: 'bnh', buyDate: String(first.trading_date).split('T')[0],
        sellDate: String(last.trading_date).split('T')[0],
        buyPrice, sellPrice, lots, shares, modal, grossReturn,
        fee: Math.round(fee), netReturn, returnPct, annualizedReturn,
        days, maxDrawdown, whaleCount, bpAnomalyCount, totalForeign,
        highestPrice, lowestPrice, rawData: data,
        ihsgReturnPct, ihsgBuyPrice, ihsgSellPrice,
      }
      setBnHResult(result)
      setTimeout(() => renderBnHChart(data), 200)

    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [stockCode, startDate, endDate, lotsBnH])

  // ─── Render Buy & Hold Candlestick Chart ───────────────────────────────────
  function renderBnHChart(data: any[]) {
    if (!chartScriptLoaded || !chartRef.current || !data.length) return
    const lwc = (window as any).LightweightCharts
    if (!lwc) return

    chartRef.current.innerHTML = ''
    const chart = lwc.createChart(chartRef.current, {
      height: 320, autoSize: true,
      layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#94a3b8' },
      grid: { vertLines: { color: 'rgba(51,65,85,0.15)' }, horzLines: { color: 'rgba(51,65,85,0.15)' } },
      rightPriceScale: { borderColor: 'rgba(51,65,85,0.5)' },
      timeScale: { borderColor: 'rgba(51,65,85,0.5)' },
    })

    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.05, bottom: 0.2 } })
    const candle = chart.addCandlestickSeries({
      upColor: '#22c55e', downColor: '#ef4444', borderVisible: false,
      wickUpColor: '#22c55e', wickDownColor: '#ef4444',
    })
    candle.setData(data.map((r: any) => ({
      time: String(r.trading_date).split('T')[0],
      open: Number(r.open_price) || Number(r.close),
      high: Number(r.high) || Number(r.close),
      low:  Number(r.low)  || Number(r.close),
      close: Number(r.close),
    })))

    // Buy price line
    const buyPrice = Number(data[0].open_price) || Number(data[0].close)
    candle.createPriceLine({ price: buyPrice, color: '#3b82f6', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '📌 Entry' })

    // Volume
    const volSeries = chart.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' } })
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })
    volSeries.setData(data.map((r: any) => ({
      time: String(r.trading_date).split('T')[0],
      value: Number(r.volume) || 0,
      color: Number(r.close) >= (Number(r.open_price) || Number(r.close)) ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)',
    })))

    // Markers
    const markers: any[] = []
    data.forEach((r: any) => {
      if (r.whale_signal || Number(r.aov_ratio_ma20) >= 1.5)
        markers.push({ time: String(r.trading_date).split('T')[0], position: 'aboveBar', color: '#e7b733', shape: 'arrowDown', text: '🐋' })
      if (r.big_player_anomaly)
        markers.push({ time: String(r.trading_date).split('T')[0], position: 'belowBar', color: '#ec4899', shape: 'circle', size: 1, text: '◆' })
    })
    markers.sort((a, b) => (a.time < b.time ? -1 : 1))
    candle.setMarkers(markers)
    chart.timeScale().fitContent()
    return () => chart.remove()
  }

  const handleRun = () => {
    setError(null)
    mode === 'strategy' ? runStrategy() : runBnH()
  }

  // ─── Quick date presets ────────────────────────────────────────────────────
  const setPreset = (days: number) => {
    const e = new Date()
    const s = new Date(); s.setDate(s.getDate() - days)
    setEndDate(e.toISOString().split('T')[0])
    setStartDate(s.toISOString().split('T')[0])
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-12 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center">
              <FlaskConical className="w-5 h-5 text-white" />
            </div>
            <span>Backtest <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-violet-400">Lab</span></span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">Uji strategi sinyal · Hitung P&L dengan biaya broker</p>
        </div>

        {/* Mode Toggle */}
        <div className="flex bg-white/[0.03] border border-white/[0.08] p-1 rounded-xl">
          {(['strategy', 'bnh'] as Mode[]).map(m => (
            <button key={m} onClick={() => { setMode(m); setError(null) }}
              className={`px-5 py-2 rounded-lg text-xs font-black transition-all capitalize ${
                mode === m ? 'bg-purple-500/30 text-purple-300 border border-purple-500/30' : 'text-muted-foreground hover:text-white'
              }`}>
              {m === 'strategy' ? '⚡ Strategy' : '📊 Buy & Hold'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ══ LEFT — Settings Panel ══ */}
        <div className="glass rounded-2xl p-6 border border-border/30 h-fit space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Settings2 className="w-4 h-4 text-purple-400" />
            <h3 className="font-bold text-sm">Parameter</h3>
          </div>

          {/* Stock code */}
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1.5">Kode Saham</label>
            <input type="text" value={stockCode}
              onChange={e => setStockCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleRun()}
              placeholder="BBCA"
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm font-mono font-bold uppercase focus:border-purple-500/50 outline-none" maxLength={10} />
          </div>

          {/* ── Strategy-only params ── */}
          {mode === 'strategy' && (
            <>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1.5">Signal Entry</label>
                <select value={signalType} onChange={e => setSignalType(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm focus:border-purple-500/50 outline-none">
                  <option value="WHALE_SIGNAL">🐋 Whale Signal (AOV anomaly)</option>
                  <option value="AOV_SPIKE">📊 AOV Spike ≥ 1.5x</option>
                  <option value="FOREIGN_BUY">🌏 Foreign Net Buy</option>
                  <option value="BIG_PLAYER">⚡ Big Player Anomaly</option>
                  <option value="COMBINED">🔀 Combined (Whale + Foreign)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-emerald-400 uppercase block mb-1.5">TP %</label>
                  <input type="number" value={takeProfit} onChange={e => setTakeProfit(Number(e.target.value))} min="0.5" step="0.5"
                    className="w-full bg-white/[0.03] border border-emerald-500/20 rounded-xl px-3 py-2.5 text-sm focus:border-emerald-500/50 outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-red-400 uppercase block mb-1.5">SL %</label>
                  <input type="number" value={stopLoss} onChange={e => setStopLoss(Number(e.target.value))} min="0.5" step="0.5"
                    className="w-full bg-white/[0.03] border border-red-500/20 rounded-xl px-3 py-2.5 text-sm focus:border-red-500/50 outline-none" />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1.5">Max Hold (Hari)</label>
                <input type="number" value={holdingPeriod} onChange={e => setHoldingPeriod(Number(e.target.value))} min="1"
                  className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm focus:border-purple-500/50 outline-none" />
              </div>

              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1.5">Lot per Trade</label>
                <input type="number" value={lotsStrat} onChange={e => setLotsStrat(Number(e.target.value))} min="1"
                  className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm focus:border-purple-500/50 outline-none" />
              </div>
            </>
          )}

          {/* ── Buy & Hold params ── */}
          {mode === 'bnh' && (
            <>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1.5">Jumlah Lot</label>
                <input type="number" value={lotsBnH} onChange={e => setLotsBnH(Number(e.target.value))} min="1"
                  className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm focus:border-purple-500/50 outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1.5">Tanggal Beli</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} max={endDate}
                  className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm focus:border-purple-500/50 outline-none [color-scheme:dark]" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1.5">Tanggal Jual</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} min={startDate} max={todayStr}
                  className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm focus:border-purple-500/50 outline-none [color-scheme:dark]" />
              </div>
              {/* Quick presets */}
              <div className="flex gap-1.5 flex-wrap">
                {[['1M',30],['3M',90],['6M',180],['1Y',365]].map(([l, d]) => (
                  <button key={l} onClick={() => setPreset(Number(d))}
                    className="px-3 py-1 text-[10px] font-bold bg-white/[0.03] border border-white/[0.08] rounded-lg hover:border-purple-500/30 hover:text-purple-400 transition-colors">
                    {l}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Fee disclaimer */}
          <div className="p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/10 text-[10px] text-amber-400/80 flex items-start gap-1.5">
            <Info className="w-3 h-3 shrink-0 mt-0.5" />
            <span>Termasuk biaya broker: beli 0.15%, jual 0.25% (PPh 0.1% included)</span>
          </div>

          <button onClick={handleRun} disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-violet-600 text-white font-bold hover:shadow-lg hover:shadow-purple-500/25 transition-all disabled:opacity-50">
            {loading
              ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Running...</>
              : <><Play className="w-4 h-4 fill-current" /> Jalankan Backtest</>}
          </button>
        </div>

        {/* ══ RIGHT — Results ══ */}
        <div className="lg:col-span-2 space-y-4">

          {/* Empty state */}
          {!stratResult && !bnhResult && !loading && (
            <div className="glass rounded-2xl border border-border/30 min-h-[400px] flex flex-col items-center justify-center text-center p-8">
              <Target className="w-14 h-14 text-muted-foreground/20 mb-4" />
              <p className="font-bold text-lg">Siap Diuji</p>
              <p className="text-sm text-muted-foreground mt-2 max-w-sm">
                {mode === 'strategy'
                  ? 'Atur sinyal entry, TP/SL, holding period, lalu jalankan.'
                  : 'Pilih saham, lot, tanggal beli & jual, lalu lihat P&L real.'}
              </p>
            </div>
          )}

          {loading && (
            <div className="glass rounded-2xl border border-border/30 min-h-[400px] flex flex-col items-center justify-center">
              <div className="w-12 h-12 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin mb-4" />
              <p className="text-sm text-purple-400 font-bold animate-pulse">Menghitung Skenario...</p>
            </div>
          )}

          {/* ════ STRATEGY RESULTS ════ */}
          {mode === 'strategy' && stratResult && !loading && (
            <>
              {/* KPI Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { l: 'Total Trades',   v: String(stratResult.trades.length),                             c: 'text-foreground' },
                  { l: 'Win Rate',       v: `${stratResult.winRate.toFixed(1)}%`,                           c: stratResult.winRate >= 50 ? 'text-emerald-400' : 'text-red-400' },
                  { l: 'Total Return',   v: `${stratResult.totalReturnPct >= 0 ? '+' : ''}${stratResult.totalReturnPct.toFixed(2)}%`, c: stratResult.totalReturnPct >= 0 ? 'text-emerald-400' : 'text-red-400' },
                  { l: 'Max Drawdown',   v: `-${stratResult.maxDrawdown.toFixed(2)}%`,                      c: 'text-red-400' },
                  { l: 'P&L (Rp)',       v: fmtRp(stratResult.totalReturnRp),                              c: stratResult.totalReturnRp >= 0 ? 'text-emerald-400' : 'text-red-400' },
                  { l: 'Ann. Return',    v: `${stratResult.annualizedReturn >= 0 ? '+' : ''}${stratResult.annualizedReturn.toFixed(1)}%/yr`, c: stratResult.annualizedReturn >= 0 ? 'text-emerald-400' : 'text-amber-400' },
                  { l: 'Profit Factor',  v: stratResult.profitFactor >= 99 ? '∞' : stratResult.profitFactor.toFixed(2), c: stratResult.profitFactor > 1.5 ? 'text-emerald-400' : stratResult.profitFactor > 1 ? 'text-amber-400' : 'text-red-400' },
                  { l: 'Sharpe (Est)',   v: stratResult.sharpeApprox.toFixed(2),                            c: stratResult.sharpeApprox > 1 ? 'text-emerald-400' : stratResult.sharpeApprox > 0 ? 'text-amber-400' : 'text-red-400' },
                ].map((m, i) => (
                  <div key={i} className="glass rounded-xl p-3 border border-border/30">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{m.l}</p>
                    <p className={`text-lg font-black mt-1 ${m.c}`}>{m.v}</p>
                  </div>
                ))}
              </div>

              {/* Extra stats bar */}
              <div className="glass rounded-xl p-3 border border-border/30 flex flex-wrap gap-4 text-[10px] text-muted-foreground">
                <span>Avg Hold: <span className="font-bold text-foreground">{stratResult.avgHolding.toFixed(1)} hari</span></span>
                <span>Total Fee: <span className="font-bold text-amber-400">{fmtRp(stratResult.totalFee)}</span></span>
                <span>Trades: <span className="text-emerald-400 font-bold">{stratResult.trades.filter(t => t.reason === 'TP').length} TP</span> · <span className="text-red-400 font-bold">{stratResult.trades.filter(t => t.reason === 'SL').length} SL</span> · <span className="text-blue-400 font-bold">{stratResult.trades.filter(t => t.reason === 'TIME').length} TIME</span></span>
              </div>

              {/* Equity Curve */}
              <div className="glass rounded-2xl p-5 border border-border/30">
                <h3 className="font-bold text-sm mb-4 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-purple-400" /> Equity Curve (Base 100)
                </h3>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stratResult.equityCurve}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickMargin={8} minTickGap={40} />
                      <YAxis stroke="#64748b" fontSize={10} domain={['auto', 'auto']} tickFormatter={v => v.toFixed(0)} width={40} />
                      <Tooltip
                        contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '11px' }}
                        formatter={(val: any, name: string) => [Number(val).toFixed(2), name === 'equity' ? 'Equity' : 'Drawdown %']}
                      />
                      <ReferenceLine y={100} stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" />
                      <Line type="monotone" dataKey="equity" stroke="#a855f7" strokeWidth={2} dot={false} activeDot={{ r: 3 }} name="equity" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Trade Log */}
              {stratResult.trades.length > 0 && (
                <div className="glass rounded-2xl overflow-hidden border border-border/30">
                  <div className="p-3 border-b border-white/[0.05] flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gold-400" />
                    <h3 className="font-bold text-sm">Trade Log ({stratResult.trades.length} trades)</h3>
                  </div>
                  <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-[#0B0F19]/95">
                        <tr className="text-[9px] text-muted-foreground uppercase border-b border-white/[0.05]">
                          <th className="p-2 text-left">Entry</th>
                          <th className="p-2 text-right">Harga Beli</th>
                          <th className="p-2 text-left">Exit</th>
                          <th className="p-2 text-right">Harga Jual</th>
                          <th className="p-2 text-center">Hold</th>
                          <th className="p-2 text-center">Alasan</th>
                          <th className="p-2 text-right">Return %</th>
                          <th className="p-2 text-right">P&L Rp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stratResult.trades.map((t, i) => (
                          <tr key={i} className="border-b border-white/[0.02] hover:bg-white/[0.02]">
                            <td className="p-2 font-mono text-[10px]">{t.entryDate}</td>
                            <td className="p-2 text-right">{formatRupiah(t.entryPrice)}</td>
                            <td className="p-2 font-mono text-[10px]">{t.exitDate}</td>
                            <td className="p-2 text-right">{formatRupiah(t.exitPrice)}</td>
                            <td className="p-2 text-center text-muted-foreground">{t.daysHeld}h</td>
                            <td className="p-2 text-center">
                              <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-bold ${
                                t.reason === 'TP' ? 'bg-emerald-500/20 text-emerald-400' :
                                t.reason === 'SL' ? 'bg-red-500/20 text-red-400' :
                                t.reason === 'TIME' ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-500/20 text-slate-400'
                              }`}>{t.reason}</span>
                            </td>
                            <td className={`p-2 text-right font-bold ${t.returnPct > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {t.returnPct > 0 ? '+' : ''}{t.returnPct.toFixed(2)}%
                            </td>
                            <td className={`p-2 text-right font-bold ${t.returnRp > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {fmtRp(t.returnRp)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ════ BUY & HOLD RESULTS ════ */}
          {mode === 'bnh' && bnhResult && !loading && (
            <>
              {/* Main KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { l: 'Return (net)', v: `${bnhResult.returnPct >= 0 ? '+' : ''}${bnhResult.returnPct.toFixed(2)}%`, c: bnhResult.returnPct >= 0 ? 'text-emerald-400' : 'text-red-400' },
                  { l: 'P&L Rp (net)',  v: fmtRp(bnhResult.netReturn),   c: bnhResult.netReturn >= 0 ? 'text-emerald-400' : 'text-red-400' },
                  { l: 'Modal',         v: fmtRp(bnhResult.modal),        c: 'text-blue-400' },
                  { l: 'Ann. Return',   v: `${bnhResult.annualizedReturn >= 0 ? '+' : ''}${bnhResult.annualizedReturn.toFixed(1)}%/yr`, c: bnhResult.annualizedReturn >= 0 ? 'text-emerald-400' : 'text-red-400' },
                ].map((m, i) => (
                  <div key={i} className="glass rounded-xl p-4 border border-border/30">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{m.l}</p>
                    <p className={`text-xl font-black mt-1 ${m.c}`}>{m.v}</p>
                  </div>
                ))}
              </div>

              {/* Detail table + IHSG comparison */}
              <div className="glass rounded-2xl p-5 border border-border/30">
                <h3 className="font-bold text-sm mb-4 flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-purple-400" /> Detail Skenario
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  {[
                    { l: `Harga Beli (${bnhResult.buyDate})`,      v: `Rp ${bnhResult.buyPrice.toLocaleString('id-ID')}` },
                    { l: `Harga Jual (${bnhResult.sellDate})`,      v: `Rp ${bnhResult.sellPrice.toLocaleString('id-ID')}` },
                    { l: 'Lot × 100 Lembar',                        v: `${bnhResult.lots}L × 100 = ${bnhResult.shares.toLocaleString('id-ID')} lbr` },
                    { l: 'Periode (hari)',                           v: `${bnhResult.days} hari (${bnhResult.rawData.length} trading days)` },
                    { l: 'Modal',                                    v: fmtRp(bnhResult.modal),        c: 'text-blue-400' },
                    { l: 'Gross Return',                             v: fmtRp(bnhResult.grossReturn),   c: bnhResult.grossReturn >= 0 ? 'text-emerald-400' : 'text-red-400' },
                    { l: 'Broker Fee (est)',                         v: fmtRp(bnhResult.fee),           c: 'text-amber-400' },
                    { l: 'Net Return',                               v: fmtRp(bnhResult.netReturn),     c: bnhResult.netReturn >= 0 ? 'text-emerald-400' : 'text-red-400' },
                    { l: 'Highest Price',                            v: `Rp ${bnhResult.highestPrice.toLocaleString('id-ID')}`, c: 'text-emerald-400' },
                    { l: 'Lowest Price',                             v: `Rp ${bnhResult.lowestPrice.toLocaleString('id-ID')}`, c: 'text-red-400' },
                    { l: 'Max Drawdown (peak→trough)',               v: `-${bnhResult.maxDrawdown.toFixed(2)}%`,                c: 'text-red-400' },
                    { l: 'Net Foreign (total periode)',              v: fmtRp(bnhResult.totalForeign),   c: bnhResult.totalForeign >= 0 ? 'text-emerald-400' : 'text-red-400' },
                  ].map((m, i) => (
                    <div key={i} className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.03]">
                      <p className="text-[8px] text-muted-foreground uppercase mb-0.5">{m.l}</p>
                      <p className={`font-bold ${m.c || 'text-foreground'}`}>{m.v}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* IHSG Comparison */}
              {bnhResult.ihsgReturnPct !== null && (
                <div className="glass rounded-xl p-4 border border-border/30">
                  <h3 className="font-bold text-xs mb-3 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-gold-400" /> vs IHSG Benchmark
                  </h3>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="p-3 rounded-lg bg-white/[0.02]">
                      <p className="text-[9px] text-muted-foreground uppercase">{stockCode.toUpperCase()} Return</p>
                      <p className={`text-xl font-black mt-1 ${bnhResult.returnPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {bnhResult.returnPct >= 0 ? '+' : ''}{bnhResult.returnPct.toFixed(2)}%
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-white/[0.02]">
                      <p className="text-[9px] text-muted-foreground uppercase">IHSG Return</p>
                      <p className={`text-xl font-black mt-1 ${bnhResult.ihsgReturnPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {bnhResult.ihsgReturnPct >= 0 ? '+' : ''}{bnhResult.ihsgReturnPct.toFixed(2)}%
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-white/[0.02]">
                      <p className="text-[9px] text-muted-foreground uppercase">Alpha</p>
                      <p className={`text-xl font-black mt-1 ${(bnhResult.returnPct - bnhResult.ihsgReturnPct) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {(bnhResult.returnPct - bnhResult.ihsgReturnPct) >= 0 ? '+' : ''}{(bnhResult.returnPct - bnhResult.ihsgReturnPct).toFixed(2)}%
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Signal Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { l: 'Whale Signals',  v: `${bnhResult.whaleCount}x`,     c: 'text-gold-400',   icon: Zap },
                  { l: 'BP Anomaly',     v: `${bnhResult.bpAnomalyCount}x`, c: 'text-pink-400',   icon: Activity },
                  { l: 'Net Foreign',    v: fmtRp(bnhResult.totalForeign),  c: bnhResult.totalForeign >= 0 ? 'text-emerald-400' : 'text-red-400', icon: TrendingUp },
                  { l: 'Max Drawdown',   v: `-${bnhResult.maxDrawdown.toFixed(2)}%`, c: 'text-red-400', icon: TrendingDown },
                ].map((m, i) => {
                  const Icon = m.icon
                  return (
                    <div key={i} className="glass rounded-xl p-3 border border-border/30">
                      <Icon className={`w-3.5 h-3.5 ${m.c} mb-1.5`} />
                      <p className="text-[9px] text-muted-foreground uppercase">{m.l}</p>
                      <p className={`text-base font-black mt-0.5 ${m.c}`}>{m.v}</p>
                    </div>
                  )
                })}
              </div>

              {/* Candlestick Chart */}
              <div className="glass rounded-2xl p-5 border border-border/30">
                <h3 className="font-bold text-sm mb-4 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-purple-400" /> Price Chart
                </h3>
                <div ref={chartRef} className="w-full" style={{ minHeight: '320px' }} />
                <div className="flex gap-4 text-[9px] text-muted-foreground mt-2 flex-wrap">
                  <span>🕯️ Candle + Volume</span>
                  <span className="text-blue-400">── Entry price</span>
                  <span className="text-gold-400">🐋 Whale signal</span>
                  <span className="text-pink-400">◆ BP anomaly</span>
                  <span className="ml-auto">{bnhResult.rawData.length} trading days</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
