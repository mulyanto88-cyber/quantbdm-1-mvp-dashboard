'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { FlaskConical, Play, Settings2, TrendingUp, TrendingDown, Target, Clock, AlertTriangle, X } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { formatRupiah, formatPercent } from '@/lib/utils'

interface Trade {
  entryDate: string
  entryPrice: number
  exitDate: string
  exitPrice: number
  returnPct: number
  daysHeld: number
  reason: 'TP' | 'SL' | 'TIME' | 'END'
}

interface BacktestResult {
  trades: Trade[]
  winRate: number
  totalReturn: number
  maxDrawdown: number
  equityCurve: { date: string; equity: number }[]
}

export default function BacktestPage() {
  const [stockCode, setStockCode] = useState('AADI')
  const [signalType, setSignalType] = useState('WHALE_SIGNAL')
  const [holdingPeriod, setHoldingPeriod] = useState(10)
  const [takeProfit, setTakeProfit] = useState(5)
  const [stopLoss, setStopLoss] = useState(3)
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<BacktestResult | null>(null)

  const runBacktest = async () => {
    if (!stockCode || stockCode.length < 2) {
      setError('Masukkan kode saham yang valid')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const { data, error: e } = await supabase
        .from('daily_transactions')
        .select('trading_date, open_price, high, low, close, whale_signal, net_foreign_value, aov_ratio_ma20')
        .eq('stock_code', stockCode.toUpperCase())
        .order('trading_date', { ascending: true })

      if (e) throw e
      if (!data || data.length === 0) throw new Error('Data tidak ditemukan untuk saham ini')

      const trades: Trade[] = []
      const equityCurve: { date: string; equity: number }[] = []
      let currentEquity = 100 // Start with 100 base
      let position: { entryPrice: number; entryDate: string; entryIdx: number } | null = null

      for (let i = 0; i < data.length; i++) {
        const row = data[i]
        const date = row.trading_date

        // Mark equity curve daily
        if (position) {
          const currentRet = (Number(row.close) - position.entryPrice) / position.entryPrice
          equityCurve.push({ date, equity: currentEquity * (1 + currentRet) })
        } else {
          equityCurve.push({ date, equity: currentEquity })
        }

        // Check sell conditions if in position
        if (position) {
          const daysHeld = i - position.entryIdx
          const tpPrice = position.entryPrice * (1 + takeProfit / 100)
          const slPrice = position.entryPrice * (1 - stopLoss / 100)
          
          let exitPrice = 0
          let reason: Trade['reason'] | null = null

          if (Number(row.high) >= tpPrice) {
            exitPrice = tpPrice
            reason = 'TP'
          } else if (Number(row.low) <= slPrice) {
            exitPrice = slPrice
            reason = 'SL'
          } else if (daysHeld >= holdingPeriod) {
            exitPrice = Number(row.close)
            reason = 'TIME'
          } else if (i === data.length - 1) {
            exitPrice = Number(row.close)
            reason = 'END'
          }

          if (reason) {
            const returnPct = (exitPrice - position.entryPrice) / position.entryPrice
            currentEquity = currentEquity * (1 + returnPct)
            
            trades.push({
              entryDate: position.entryDate,
              entryPrice: position.entryPrice,
              exitDate: date,
              exitPrice,
              returnPct: returnPct * 100,
              daysHeld,
              reason
            })
            // Force update the last equity point to exact exit equity
            equityCurve[equityCurve.length - 1].equity = currentEquity
            position = null
          }
          continue // Wait for next day to look for new setup
        }

        // Look for entry signal
        let signalMet = false
        if (signalType === 'WHALE_SIGNAL' && row.whale_signal) signalMet = true
        if (signalType === 'AOV_SPIKE' && Number(row.aov_ratio_ma20) >= 1.5) signalMet = true
        if (signalType === 'FOREIGN_BUY' && Number(row.net_foreign_value) > 0) signalMet = true

        if (signalMet) {
          position = {
            entryPrice: Number(row.close),
            entryDate: date,
            entryIdx: i
          }
        }
      }

      const winTrades = trades.filter(t => t.returnPct > 0).length
      const winRate = trades.length > 0 ? (winTrades / trades.length) * 100 : 0
      const totalReturn = currentEquity - 100
      
      // Calculate max drawdown
      let peak = 100
      let maxDd = 0
      for (const pt of equityCurve) {
        if (pt.equity > peak) peak = pt.equity
        const dd = (peak - pt.equity) / peak
        if (dd > maxDd) maxDd = dd
      }

      setResult({
        trades: trades.sort((a,b) => new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime()),
        winRate,
        totalReturn,
        maxDrawdown: maxDd * 100,
        equityCurve
      })

    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Header */}
      <div>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center">
            <FlaskConical className="w-5 h-5 text-white" />
          </div>
          <span className="text-foreground">Backtest Lab</span>
          <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/20 translate-y-[-4px]">BETA</span>
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Uji strategi kuantitatif menggunakan data historis dan signal engine KSEI.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Panel: Settings */}
        <div className="glass rounded-2xl p-6 border border-border/30 h-fit">
          <div className="flex items-center gap-2 mb-6">
            <Settings2 className="w-5 h-5 text-purple-400" />
            <h3 className="font-bold">Parameter Strategi</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground uppercase font-bold mb-1.5 block">Kode Saham</label>
              <input type="text" value={stockCode} onChange={e => setStockCode(e.target.value.toUpperCase())}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm font-mono uppercase focus:border-purple-500/50 outline-none" />
            </div>

            <div>
              <label className="text-xs text-muted-foreground uppercase font-bold mb-1.5 block">Signal Entry</label>
              <select value={signalType} onChange={e => setSignalType(e.target.value)}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm focus:border-purple-500/50 outline-none">
                <option value="WHALE_SIGNAL">🐋 Whale Accumulation Signal</option>
                <option value="AOV_SPIKE">📊 AOV Spike (≥ 1.5x)</option>
                <option value="FOREIGN_BUY">🌏 Foreign Net Buy</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground uppercase font-bold mb-1.5 block text-emerald-400">Take Profit (%)</label>
                <input type="number" value={takeProfit} onChange={e => setTakeProfit(Number(e.target.value))}
                  className="w-full bg-white/[0.03] border border-emerald-500/20 rounded-xl px-4 py-2.5 text-sm focus:border-emerald-500/50 outline-none" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase font-bold mb-1.5 block text-red-400">Stop Loss (%)</label>
                <input type="number" value={stopLoss} onChange={e => setStopLoss(Number(e.target.value))}
                  className="w-full bg-white/[0.03] border border-red-500/20 rounded-xl px-4 py-2.5 text-sm focus:border-red-500/50 outline-none" />
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground uppercase font-bold mb-1.5 block">Max Holding Period (Hari)</label>
              <input type="number" value={holdingPeriod} onChange={e => setHoldingPeriod(Number(e.target.value))}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm focus:border-purple-500/50 outline-none" />
            </div>

            <button onClick={runBacktest} disabled={loading}
              className="w-full mt-4 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-violet-600 text-white font-bold hover:shadow-lg hover:shadow-purple-500/25 transition-all disabled:opacity-50">
              {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
              Jalankan Backtest
            </button>
          </div>
        </div>

        {/* Right Panel: Results */}
        <div className="lg:col-span-2 space-y-6">
          {!result && !loading ? (
            <div className="glass rounded-2xl h-full min-h-[400px] border border-border/30 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
              <Target className="w-16 h-16 opacity-20 mb-4" />
              <p className="font-bold text-lg text-foreground">Siap Diuji</p>
              <p className="text-sm mt-2 max-w-md">Atur parameter di sebelah kiri lalu klik "Jalankan Backtest" untuk melihat performa strategi secara historis.</p>
            </div>
          ) : loading ? (
            <div className="glass rounded-2xl h-full min-h-[400px] border border-border/30 flex flex-col items-center justify-center space-y-4">
              <div className="w-12 h-12 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
              <p className="text-sm text-purple-400 font-bold animate-pulse">Menghitung Skenario...</p>
            </div>
          ) : result ? (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass rounded-2xl p-4 border border-border/30">
                  <p className="text-[10px] text-muted-foreground uppercase">Total Trades</p>
                  <p className="text-2xl font-black mt-1">{result.trades.length}</p>
                </div>
                <div className="glass rounded-2xl p-4 border border-border/30">
                  <p className="text-[10px] text-muted-foreground uppercase">Win Rate</p>
                  <p className={`text-2xl font-black mt-1 ${result.winRate >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {result.winRate.toFixed(1)}%
                  </p>
                </div>
                <div className="glass rounded-2xl p-4 border border-border/30">
                  <p className="text-[10px] text-muted-foreground uppercase">Total Return</p>
                  <p className={`text-2xl font-black mt-1 ${result.totalReturn >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {result.totalReturn >= 0 ? '+' : ''}{result.totalReturn.toFixed(2)}%
                  </p>
                </div>
                <div className="glass rounded-2xl p-4 border border-border/30">
                  <p className="text-[10px] text-muted-foreground uppercase">Max Drawdown</p>
                  <p className="text-2xl font-black mt-1 text-red-400">
                    -{result.maxDrawdown.toFixed(2)}%
                  </p>
                </div>
              </div>

              {/* Chart */}
              <div className="glass rounded-2xl p-6 border border-border/30">
                <h3 className="font-bold mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-purple-400" /> Equity Curve (Base 100)
                </h3>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={result.equityCurve}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickMargin={10} minTickGap={30} />
                      <YAxis stroke="#64748b" fontSize={10} domain={['auto', 'auto']} tickFormatter={v => v.toFixed(0)} width={40} />
                      <Tooltip
                        contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                        labelStyle={{ color: '#94a3b8', fontSize: '12px' }}
                        itemStyle={{ color: '#c084fc', fontSize: '14px', fontWeight: 'bold' }}
                        formatter={(val: any) => [`${Number(val).toFixed(2)}`, 'Equity']}
                      />
                      <Line type="monotone" dataKey="equity" stroke="#a855f7" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#c084fc' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Trade Log */}
      {result && result.trades.length > 0 && (
        <div className="glass rounded-2xl overflow-hidden border border-border/30 animate-fade-in">
          <div className="p-4 border-b border-white/[0.05]">
            <h3 className="font-bold flex items-center gap-2">
              <Clock className="w-5 h-5 text-gold-400" /> Riwayat Transaksi (Trade Log)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/[0.02] border-b border-white/[0.05] text-[10px] text-muted-foreground uppercase">
                  <th className="p-4 text-left">Entry Date</th>
                  <th className="p-4 text-right">Entry Price</th>
                  <th className="p-4 text-left">Exit Date</th>
                  <th className="p-4 text-right">Exit Price</th>
                  <th className="p-4 text-center">Holding</th>
                  <th className="p-4 text-center">Reason</th>
                  <th className="p-4 text-right">Return</th>
                </tr>
              </thead>
              <tbody>
                {result.trades.map((t, i) => (
                  <tr key={i} className="tr-hover border-b border-white/[0.02]">
                    <td className="p-4">{t.entryDate}</td>
                    <td className="p-4 text-right">{formatRupiah(t.entryPrice)}</td>
                    <td className="p-4">{t.exitDate}</td>
                    <td className="p-4 text-right">{formatRupiah(t.exitPrice)}</td>
                    <td className="p-4 text-center">{t.daysHeld} hari</td>
                    <td className="p-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        t.reason === 'TP' ? 'bg-emerald-500/20 text-emerald-400' :
                        t.reason === 'SL' ? 'bg-red-500/20 text-red-400' :
                        t.reason === 'TIME' ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-500/20 text-slate-400'
                      }`}>{t.reason}</span>
                    </td>
                    <td className={`p-4 text-right font-bold ${t.returnPct > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {t.returnPct > 0 ? '+' : ''}{t.returnPct.toFixed(2)}%
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
