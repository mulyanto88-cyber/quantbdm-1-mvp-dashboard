'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { formatShares } from '@/lib/utils'
import { 
  Eye, AlertTriangle, Search, Building2, TrendingUp, TrendingDown, 
  PieChart as PieChartIcon, Activity, Shield, Users,
  X, RefreshCw
} from 'lucide-react'
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Legend
} from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────
interface InvestorPosition {
  investor_name: string
  investor_type: string
  local_foreign: string
  percentage: number
  total_shares: number
  date: string
}

interface OwnershipChange {
  investor_name: string
  investor_type: string
  local_foreign: string
  prev_percentage: number
  curr_percentage: number
  pct_change: number
  share_change: number
  action: string
  alert_level: string
}

interface SignalDetection {
  label: string
  type: 'bullish' | 'bearish' | 'neutral'
  detail: string
}

interface TopStock {
  code: string
  signals: string[]
  score: number
  corpChange: number
  foreignChange: number
  indChange: number
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PERIOD_OPTIONS = [
  { label: '1M', months: 1 },
  { label: '2M', months: 2 },
  { label: '3M', months: 3 },
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

const LINE_COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899',
  '#06b6d4', '#f97316', '#ef4444', '#84cc16', '#6366f1',
]

// ─── Component ────────────────────────────────────────────────────────────────
export default function KSEI1PersenPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState(1)
  const [selectedStock, setSelectedStock] = useState<string | null>(null)
  const [stockList, setStockList] = useState<string[]>([])
  const [searchStock, setSearchStock] = useState('')
  const [showChangeTable, setShowChangeTable] = useState(false)

  // Data states
  const [allData, setAllData] = useState<any[]>([])
  const [currentMonthData, setCurrentMonthData] = useState<InvestorPosition[]>([])
  const [previousMonthData, setPreviousMonthData] = useState<InvestorPosition[]>([])
  const [historyData, setHistoryData] = useState<any[]>([])
  const [changes, setChanges] = useState<OwnershipChange[]>([])
  const [signals, setSignals] = useState<SignalDetection[]>([])
  const [topStocks, setTopStocks] = useState<TopStock[]>([])

  // ─── Fetch Data ──────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const { data, error: fetchError } = await supabase
        .from('ksei_data1persen_mutasi')
        .select('date, share_code, investor_name, investor_type, local_foreign, percentage, total_holding_shares')
        .order('date', { ascending: false })
        .limit(50000)

      if (fetchError) throw fetchError
      if (!data || data.length === 0) {
        setAllData([])
        setLoading(false)
        return
      }

      setAllData(data)

      const stocks = Array.from(new Set(data.map((d: any) => d.share_code))).sort()
      setStockList(stocks)

      computeTopStocks(data)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Failed to fetch')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ─── Compute Top Stocks (Screener View) ──────────────────────────────────────
  const computeTopStocks = (data: any[]) => {
    const dates = Array.from(new Set(data.map((d: any) => d.date))).sort().reverse()
    if (dates.length < 2) return

    const latest = dates[0]
    const prev = dates[1]

    const stockSignals: TopStock[] = []

    const stocks = Array.from(new Set(data.map((d: any) => d.share_code)))
    stocks.forEach(code => {
      const currData = data.filter((d: any) => d.share_code === code && d.date === latest)
      const prevData = data.filter((d: any) => d.share_code === code && d.date === prev)

      if (currData.length === 0) return

      let corpCurr = 0, corpPrev = 0, foreignCurr = 0, foreignPrev = 0, indCurr = 0, indPrev = 0
      
      currData.forEach((d: any) => {
        if (d.investor_type === 'Corporate') corpCurr += Number(d.percentage)
        if (d.local_foreign === 'F') foreignCurr += Number(d.percentage)
        if (d.investor_type === 'Individual') indCurr += Number(d.percentage)
      })
      prevData.forEach((d: any) => {
        if (d.investor_type === 'Corporate') corpPrev += Number(d.percentage)
        if (d.local_foreign === 'F') foreignPrev += Number(d.percentage)
        if (d.investor_type === 'Individual') indPrev += Number(d.percentage)
      })

      const corpChange = corpCurr - corpPrev
      const foreignChange = foreignCurr - foreignPrev
      const indChange = indCurr - indPrev

      const signals: string[] = []
      let score = 0

      if (corpChange > 1 && indChange < -0.5) { signals.push('🟢 Corp Acc'); score += 3 }
      if (foreignChange > 1) { signals.push('🟢 Foreign In'); score += 2 }
      if (corpCurr + foreignCurr > 50) { signals.push('💎 Inst Dom'); score += 1 }
      if (corpChange < -1 && indChange > 0.5) { signals.push('🔴 Corp Dist'); score -= 2 }
      if (foreignChange < -1) { signals.push('🔴 Foreign Out'); score -= 2 }
      if (indChange > 1) { signals.push('🟡 Insider Buy'); score += 1 }

      if (Math.abs(corpChange) >= 0.3 || Math.abs(foreignChange) >= 0.3 || Math.abs(indChange) >= 0.3) {
        stockSignals.push({ code, signals, score, corpChange, foreignChange, indChange })
      }
    })

    setTopStocks(stockSignals.sort((a, b) => b.score - a.score).slice(0, 50))
  }

  // ─── Compute Stock Detail ────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedStock || allData.length === 0) return

    const stockData = allData.filter((d: any) => d.share_code === selectedStock)
    const dates = Array.from(new Set(stockData.map((d: any) => d.date))).sort().reverse()

    if (dates.length === 0) return

    const latestDate = dates[0]
    const currData = stockData.filter((d: any) => d.date === latestDate)
    setCurrentMonthData(currData.map((d: any) => ({
      investor_name: d.investor_name,
      investor_type: d.investor_type,
      local_foreign: d.local_foreign,
      percentage: Number(d.percentage),
      total_shares: Number(d.total_holding_shares),
      date: d.date,
    })))

    if (dates.length >= 2) {
      const prevDate = dates[1]
      const prevData = stockData.filter((d: any) => d.date === prevDate)
      setPreviousMonthData(prevData.map((d: any) => ({
        investor_name: d.investor_name,
        investor_type: d.investor_type,
        local_foreign: d.local_foreign,
        percentage: Number(d.percentage),
        total_shares: Number(d.total_holding_shares),
        date: d.date,
      })))

      const changeList: OwnershipChange[] = []
      currData.forEach((curr: any) => {
        const prev = prevData.find((p: any) => p.investor_name === curr.investor_name)
        const currPct = Number(curr.percentage)
        const prevPct = prev ? Number(prev.percentage) : 0
        const currShares = Number(curr.total_holding_shares)
        const prevShares = prev ? Number(prev.total_holding_shares) : 0
        const pctChange = currPct - prevPct
        const shareChange = currShares - prevShares

        if (Math.abs(pctChange) < 0.1) return

        const action = pctChange > 0.3 ? 'BUYING' : pctChange < -0.3 ? 'SELLING' : 'HOLDING'
        const alertLevel = Math.abs(pctChange) >= 2 ? 'HIGH' : Math.abs(pctChange) >= 1 ? 'MEDIUM' : 'LOW'

        changeList.push({
          investor_name: curr.investor_name,
          investor_type: curr.investor_type,
          local_foreign: curr.local_foreign,
          prev_percentage: prevPct,
          curr_percentage: currPct,
          pct_change: pctChange,
          share_change: shareChange,
          action,
          alert_level: alertLevel,
        })
      })
      setChanges(changeList.sort((a, b) => Math.abs(b.pct_change) - Math.abs(a.pct_change)))
    }

    // History for line chart
    const historyDates = dates.slice(0, 6).reverse()
    const historyMap: Record<string, any[]> = {}
    historyDates.forEach(date => {
      stockData.filter((d: any) => d.date === date).forEach((d: any) => {
        if (!historyMap[d.investor_name]) historyMap[d.investor_name] = []
        historyMap[d.investor_name].push({ date, shares: Number(d.total_holding_shares) })
      })
    })
    setHistoryData(historyDates.map(date => {
      const point: any = { date }
      Object.entries(historyMap).forEach(([name, entries]) => {
        const entry = entries.find((e: any) => e.date === date)
        point[name] = entry ? entry.shares : 0
      })
      return point
    }))

    computeSignals(currData, dates.length >= 2 ? stockData.filter((d: any) => d.date === dates[1]) : [])
  }, [selectedStock, allData])

  // ─── Compute Signals ─────────────────────────────────────────────────────────
  const computeSignals = (currData: any[], prevData: any[]) => {
    const sigs: SignalDetection[] = []

    let corpCurr = 0, corpPrev = 0, foreignCurr = 0, foreignPrev = 0
    let indCurr = 0, indPrev = 0, fundCurr = 0, finCurr = 0

    currData.forEach((d: any) => {
      if (d.investor_type === 'Corporate') corpCurr += Number(d.percentage)
      if (d.local_foreign === 'F') foreignCurr += Number(d.percentage)
      if (d.investor_type === 'Individual') indCurr += Number(d.percentage)
      if (d.investor_type === 'Fund Manager') fundCurr += Number(d.percentage)
      if (d.investor_type === 'Financial Institutional') finCurr += Number(d.percentage)
    })
    prevData.forEach((d: any) => {
      if (d.investor_type === 'Corporate') corpPrev += Number(d.percentage)
      if (d.local_foreign === 'F') foreignPrev += Number(d.percentage)
      if (d.investor_type === 'Individual') indPrev += Number(d.percentage)
    })

    if (corpCurr - corpPrev > 1 && indCurr - indPrev < -0.5) 
      sigs.push({ label: 'Corporate Accumulation', type: 'bullish', detail: `+${(corpCurr - corpPrev).toFixed(1)}% Corp, ${(indCurr - indPrev).toFixed(1)}% Ind` })
    if (foreignCurr - foreignPrev > 1) 
      sigs.push({ label: 'Foreign Inflow', type: 'bullish', detail: `+${(foreignCurr - foreignPrev).toFixed(1)}% Foreign` })
    if (corpCurr + fundCurr + finCurr > 50) 
      sigs.push({ label: 'Institutional Dominance', type: 'bullish', detail: `${(corpCurr + fundCurr + finCurr).toFixed(1)}% Institutional` })
    if (corpCurr - corpPrev < -1 && indCurr - indPrev > 0.5) 
      sigs.push({ label: 'Corporate Distribution', type: 'bearish', detail: `${(corpCurr - corpPrev).toFixed(1)}% Corp, +${(indCurr - indPrev).toFixed(1)}% Ind` })
    if (foreignCurr - foreignPrev < -1) 
      sigs.push({ label: 'Foreign Outflow', type: 'bearish', detail: `${(foreignCurr - foreignPrev).toFixed(1)}% Foreign` })
    if (indCurr - indPrev > 1) 
      sigs.push({ label: 'Insider Buying', type: 'neutral', detail: `+${(indCurr - indPrev).toFixed(1)}% Individual` })
    if (indCurr > 60) 
      sigs.push({ label: 'Retail Dominance', type: 'neutral', detail: `${indCurr.toFixed(1)}% Individual` })

    setSignals(sigs)
  }

  // ─── Pie Chart Data ──────────────────────────────────────────────────────────
  const pieData = useMemo(() => {
    if (!currentMonthData.length) return []
    const grouped: Record<string, number> = {}
    currentMonthData.forEach(d => {
      grouped[d.investor_type] = (grouped[d.investor_type] || 0) + d.percentage
    })
    return Object.entries(grouped).map(([name, value]) => ({ name, value }))
  }, [currentMonthData])

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 animate-fade-in pb-10">

      {/* ════════════════════════════════════════════════════════════
          HEADER
      ════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-foreground tracking-tight">
            <Eye className="w-8 h-8 text-blue-400 inline mr-2" />
            <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">KSEI &gt;1%</span>
            <span className="text-foreground"> Ownership Intelligence</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Monthly ownership data · Detect institutional accumulation & distribution
          </p>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          FILTERS
      ════════════════════════════════════════════════════════════ */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-white/[0.03] rounded-lg p-0.5 border border-white/[0.06]">
          {PERIOD_OPTIONS.map(opt => (
            <button key={opt.months} onClick={() => setPeriod(opt.months)}
              className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition-all ${
                period === opt.months ? 'bg-blue-400/20 text-blue-400' : 'text-muted-foreground hover:text-white'
              }`}>{opt.label}</button>
          ))}
        </div>

        {/* Global Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Cari kode saham..."
            value={searchStock}
            onChange={(e) => setSearchStock(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchStock.length >= 2) {
                if (stockList.includes(searchStock)) {
                  setSelectedStock(searchStock)
                }
              }
            }}
            className="w-full pl-9 pr-4 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-sm focus:outline-none focus:border-blue-400/30 uppercase"
            maxLength={4}
          />
          {searchStock && stockList.includes(searchStock) && (
            <button
              onClick={() => setSelectedStock(searchStock)}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded bg-blue-400/20 text-blue-400 text-[10px] font-bold hover:bg-blue-400/30"
            >
              Go
            </button>
          )}
        </div>

        {selectedStock && (
          <button onClick={() => { setSelectedStock(null); setSearchStock('') }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-muted-foreground hover:text-white">
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════
          INSTITUTIONAL FLOW SCREENER (Default View)
      ════════════════════════════════════════════════════════════ */}
      {!selectedStock && !loading && (
        <div className="glass rounded-2xl overflow-hidden border border-border/30">
          <div className="p-4 border-b border-white/[0.05] flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-black text-foreground uppercase tracking-widest">
              Institutional Flow Screener
            </h2>
            <span className="text-[10px] text-muted-foreground ml-auto">
              {topStocks.length} saham dengan perubahan signifikan
            </span>
          </div>
          
          {topStocks.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/[0.02] border-b border-white/[0.05] text-[9px] text-muted-foreground uppercase tracking-wider">
                    <th className="p-2 text-left w-6">#</th>
                    <th className="p-2 text-left">Saham</th>
                    <th className="p-2 text-right">Corp Δ%</th>
                    <th className="p-2 text-right hidden sm:table-cell">Foreign Δ%</th>
                    <th className="p-2 text-right hidden sm:table-cell">Ind Δ%</th>
                    <th className="p-2 text-right">Score</th>
                    <th className="p-2 text-left">Signals</th>
                  </tr>
                </thead>
                <tbody>
                  {topStocks.map((s, i) => (
                    <tr key={s.code} 
                      onClick={() => setSelectedStock(s.code)}
                      className="tr-hover border-b border-white/[0.02] cursor-pointer hover:bg-blue-400/[0.03] transition-all">
                      <td className="p-2 text-muted-foreground">{i + 1}</td>
                      <td className="p-2">
                        <span className="font-mono font-black text-foreground hover:text-blue-400 transition-colors">
                          {s.code}
                        </span>
                      </td>
                      <td className={`p-2 text-right font-bold ${s.corpChange > 0 ? 'text-emerald-400' : s.corpChange < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                        {s.corpChange > 0 ? '+' : ''}{s.corpChange.toFixed(1)}%
                      </td>
                      <td className={`p-2 text-right font-bold hidden sm:table-cell ${s.foreignChange > 0 ? 'text-emerald-400' : s.foreignChange < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                        {s.foreignChange > 0 ? '+' : ''}{s.foreignChange.toFixed(1)}%
                      </td>
                      <td className={`p-2 text-right font-bold hidden sm:table-cell ${s.indChange > 0 ? 'text-emerald-400' : s.indChange < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                        {s.indChange > 0 ? '+' : ''}{s.indChange.toFixed(1)}%
                      </td>
                      <td className="p-2 text-right">
                        <span className={`font-black ${s.score > 0 ? 'text-emerald-400' : s.score < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                          {s.score > 0 ? '+' : ''}{s.score}
                        </span>
                      </td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1">
                          {s.signals.map((sig: string, j: number) => (
                            <span key={j} className="text-[8px] px-1 py-0.5 rounded bg-white/[0.04] text-muted-foreground">
                              {sig}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Tidak ada perubahan kepemilikan signifikan terdeteksi.
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          SIGNAL DETECTION (Setelah pilih saham)
      ════════════════════════════════════════════════════════════ */}
      {selectedStock && signals.length > 0 && (
        <div className="glass rounded-2xl p-4 border border-blue-400/20 bg-blue-400/[0.02]">
          <h3 className="text-xs font-black text-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-400" />
            Institutional Signal Detection — {selectedStock}
          </h3>
          <div className="flex flex-wrap gap-2">
            {signals.map((sig, i) => (
              <span key={i} className={`px-3 py-2 rounded-xl text-xs font-bold border ${
                sig.type === 'bullish' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : sig.type === 'bearish' ? 'bg-red-500/10 text-red-400 border-red-500/20'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
              }`}>
                {sig.type === 'bullish' ? '🟢' : sig.type === 'bearish' ? '🔴' : '🟡'} {sig.label}: {sig.detail}
              </span>
            ))}
          </div>
        </div>
      )}

      {selectedStock && signals.length === 0 && currentMonthData.length > 0 && (
        <div className="glass rounded-xl p-3 border border-white/[0.06] text-center">
          <p className="text-xs text-muted-foreground">
            Tidak ada sinyal institusional signifikan terdeteksi untuk {selectedStock} pada periode ini.
          </p>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          STOCK DETAIL VIEW
      ════════════════════════════════════════════════════════════ */}
      {selectedStock && (
        <>
          {/* Pie Chart + Table */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="glass rounded-2xl p-5 border border-border/30">
              <h3 className="text-sm font-black text-foreground mb-4 flex items-center gap-2">
                <PieChartIcon className="w-4 h-4 text-blue-400" />
                Ownership by Investor Type
              </h3>
              {pieData.length > 0 ? (
                <div className="flex flex-col items-center">
                  <div className="w-64 h-64">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} stroke="none">
                          {pieData.map((entry, i) => (
                            <Cell key={i} fill={INVESTOR_TYPE_COLORS[entry.name] || '#6b7280'} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }} formatter={(v: any) => `${v.toFixed(1)}%`} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-wrap gap-3 mt-3 justify-center">
                    {pieData.map((entry, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[9px]">
                        <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: INVESTOR_TYPE_COLORS[entry.name] || '#6b7280' }} />
                        <span className="text-muted-foreground">{entry.name}</span>
                        <span className="font-bold">{entry.value.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <p className="text-center py-8 text-muted-foreground">No data</p>}
            </div>

            <div className="glass rounded-2xl p-5 border border-border/30 overflow-x-auto">
              <h3 className="text-sm font-black text-foreground mb-4 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400" />
                Current Positions
              </h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[9px] text-muted-foreground uppercase border-b border-white/[0.05]">
                    <th className="p-2 text-left">Investor</th>
                    <th className="p-2 text-left hidden md:table-cell">Type</th>
                    <th className="p-2 text-center">L/F</th>
                    <th className="p-2 text-right">%</th>
                    <th className="p-2 text-right hidden lg:table-cell">Shares</th>
                  </tr>
                </thead>
                <tbody>
                  {currentMonthData.map((d, i) => (
                    <tr key={i} className="border-b border-white/[0.02] hover:bg-white/[0.02]">
                      <td className="p-2 font-bold text-[10px] truncate max-w-[120px]">{d.investor_name}</td>
                      <td className="p-2 text-[10px] text-muted-foreground hidden md:table-cell">{d.investor_type}</td>
                      <td className="p-2 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${d.local_foreign === 'F' ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                          {d.local_foreign === 'F' ? 'F' : 'L'}
                        </span>
                      </td>
                      <td className="p-2 text-right font-black">{d.percentage.toFixed(2)}%</td>
                      <td className="p-2 text-right text-muted-foreground hidden lg:table-cell">{formatShares(d.total_shares)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Line Chart */}
          {historyData.length > 0 && (
            <div className="glass rounded-2xl p-5 border border-border/30">
              <h3 className="text-sm font-black text-foreground mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-400" />
                Ownership History — Total Shares per Investor
              </h3>
              <div className="h-[400px]">
                <ResponsiveContainer>
                  <LineChart data={historyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} />
                    <YAxis tickFormatter={v => formatShares(v)} tick={{ fontSize: 10, fill: '#6b7280' }} />
                    <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }} formatter={(v: any) => formatShares(v)} />
                    <Legend wrapperStyle={{ fontSize: '9px' }} />
                    {currentMonthData.map((d, i) => (
                      <Line key={d.investor_name} type="monotone" dataKey={d.investor_name}
                        stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={1.5}
                        dot={false} activeDot={{ r: 3 }} connectNulls />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Changes Table Toggle */}
          {changes.length > 0 && (
            <div className="glass rounded-2xl border border-border/30 overflow-hidden">
              <button onClick={() => setShowChangeTable(!showChangeTable)}
                className="w-full p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                <h3 className="text-sm font-black text-foreground flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-400" />
                  Ownership Changes ({changes.length} detected)
                </h3>
                <span className={`text-xs text-muted-foreground transition-transform ${showChangeTable ? 'rotate-180' : ''}`}>▼</span>
              </button>
              {showChangeTable && (
                <div className="overflow-x-auto border-t border-white/[0.05]">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[9px] text-muted-foreground uppercase border-b border-white/[0.05]">
                        <th className="p-2 text-left">Investor</th>
                        <th className="p-2 text-right">% Prev</th>
                        <th className="p-2 text-right">% Now</th>
                        <th className="p-2 text-right">Δ%</th>
                        <th className="p-2 text-right hidden md:table-cell">ΔShares</th>
                        <th className="p-2 text-center">Action</th>
                        <th className="p-2 text-center">Level</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changes.map((c, i) => (
                        <tr key={i} className="border-b border-white/[0.02] hover:bg-white/[0.02]">
                          <td className="p-2 font-bold text-[10px] truncate max-w-[120px]">{c.investor_name}</td>
                          <td className="p-2 text-right">{c.prev_percentage.toFixed(2)}%</td>
                          <td className="p-2 text-right">{c.curr_percentage.toFixed(2)}%</td>
                          <td className={`p-2 text-right font-bold ${c.pct_change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {c.pct_change >= 0 ? '+' : ''}{c.pct_change.toFixed(2)}%
                          </td>
                          <td className="p-2 text-right hidden md:table-cell">{formatShares(c.share_change)}</td>
                          <td className="p-2 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                              c.action === 'BUYING' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                            }`}>{c.action}</span>
                          </td>
                          <td className="p-2 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                              c.alert_level === 'HIGH' ? 'alert-high' : c.alert_level === 'MEDIUM' ? 'alert-medium' : 'alert-low'
                            }`}>{c.alert_level}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Loading & Error */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
        </div>
      )}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}
    </div>
  )
}
