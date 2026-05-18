'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { formatShares, formatPercent } from '@/lib/utils'
import { 
  Eye, Search, TrendingUp, TrendingDown, 
  PieChart as PieChartIcon, Activity, Shield, Users,
  X, RefreshCw, AlertTriangle, Target
} from 'lucide-react'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────
interface InsiderChange {
  investor_name: string
  investor_type: string
  local_foreign: string
  prev_pct: number
  curr_pct: number
  pct_change: number
  share_change: number
  action: string
  alert_level: string
}

interface TopStock {
  code: string
  corp_change: number
  foreign_change: number
  ind_change: number
  score: number
  signals: string
}

// ─── Constants ────────────────────────────────────────────────────────────────
const INVESTOR_TYPE_COLORS: Record<string, string> = {
  'Corporate': '#10b981', 'Individual': '#3b82f6', 'Fund Manager': '#f59e0b',
  'Financial Institutional': '#8b5cf6', 'Insurance': '#ec4899',
  'Pension Fund': '#06b6d4', 'Securities': '#f97316', 'Others': '#6b7280',
}

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

// ─── Component ────────────────────────────────────────────────────────────────
export default function InsiderPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedStock, setSelectedStock] = useState<string | null>(null)
  const [searchStock, setSearchStock] = useState('')
  const [showChangeTable, setShowChangeTable] = useState(false)

  // Data states
  const [topStocks, setTopStocks] = useState<TopStock[]>([])
  const [currentMonthData, setCurrentMonthData] = useState<any[]>([])
  const [pieData, setPieData] = useState<{ name: string; value: number }[]>([])
  const [changes, setChanges] = useState<InsiderChange[]>([])

  // ─── Fetch Top Stocks Screener ──────────────────────────────────────────────
  const fetchTopStocks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await mdQuery(`SELECT * FROM ksei.vw_insider_screener`)
      setTopStocks(data.map((d: any) => ({
        code: d.code,
        corp_change: Number(d.corp_change || 0),
        foreign_change: Number(d.foreign_change || 0),
        ind_change: Number(d.ind_change || 0),
        score: Number(d.score || 0),
        signals: d.signals || '',
      })))
    } catch (err: any) {
      setError(err.message || 'Failed to fetch')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTopStocks() }, [fetchTopStocks])

  // ─── Fetch Stock Detail ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedStock) return

    (async () => {
      setLoading(true)
      try {
        // Current ownership
        const currData = await mdQuery(`
          SELECT investor_name, investor_type, local_foreign, percentage, total_holding_shares
          FROM ksei.ownership_1pct
          WHERE share_code = $1 AND date = (SELECT MAX(date) FROM ksei.ownership_1pct)
          ORDER BY percentage DESC
        `, [selectedStock])
        setCurrentMonthData(currData.map((d: any) => ({
          ...d,
          percentage: Number(d.percentage),
          shares: Number(d.total_holding_shares),
        })))

        // Pie data
        const grouped: Record<string, number> = {}
        currData.forEach((d: any) => {
          const type = d.investor_type || 'Others'
          grouped[type] = (grouped[type] || 0) + Number(d.percentage)
        })
        setPieData(Object.entries(grouped).map(([name, value]) => ({ name, value })))

        // Changes
        const alertData = await mdQuery(`
          SELECT * FROM ksei.vw_insider_alerts WHERE share_code = $1 ORDER BY ABS(pct_point_change) DESC LIMIT 50
        `, [selectedStock])
        setChanges(alertData.map((d: any) => ({
          investor_name: d.investor_name,
          investor_type: d.investor_type || '—',
          local_foreign: d.nationality === 'FOREIGN' ? 'F' : 'L',
          prev_pct: Number(d.prev_percentage || 0),
          curr_pct: Number(d.curr_percentage || 0),
          pct_change: Number(d.pct_point_change || 0),
          share_change: Number(d.share_change || 0),
          action: d.action || 'HOLDING',
          alert_level: d.alert_level || 'LOW',
        })))

      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    })()
  }, [selectedStock])

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 animate-fade-in pb-10">

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">
            <Eye className="w-8 h-8 text-red-400 inline mr-2" />
            <span className="bg-gradient-to-r from-red-400 to-amber-400 bg-clip-text text-transparent">Insider Alerts</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Track insider & institutional ownership changes · Monthly KSEI data
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm">
          <AlertTriangle className="w-5 h-5" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Loading */}
      {loading && !selectedStock && (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-8 h-8 text-red-400 animate-spin" />
        </div>
      )}

      {/* ═══ INSTITUTIONAL FLOW SCREENER ═══ */}
      {!selectedStock && !loading && (
        <div className="glass rounded-2xl overflow-hidden border border-border/30">
          <div className="p-4 border-b border-white/[0.05] flex items-center gap-2">
            <Activity className="w-4 h-4 text-red-400" />
            <h2 className="text-sm font-black uppercase tracking-widest">Institutional Flow Screener</h2>
            <span className="text-[10px] text-muted-foreground ml-auto">{topStocks.length} stocks detected</span>
          </div>
          
          {topStocks.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/[0.02] border-b border-white/[0.05] text-[9px] text-muted-foreground uppercase tracking-wider">
                    <th className="p-2 text-left w-6">#</th>
                    <th className="p-2 text-left">Stock</th>
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
                      className="tr-hover border-b border-white/[0.02] cursor-pointer hover:bg-red-400/[0.03] transition-all">
                      <td className="p-2 text-muted-foreground">{i + 1}</td>
                      <td className="p-2">
                        <span className="font-mono font-black hover:text-red-400 transition-colors">{s.code}</span>
                      </td>
                      <td className={`p-2 text-right font-bold ${s.corp_change > 0 ? 'text-emerald-400' : s.corp_change < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                        {s.corp_change > 0 ? '+' : ''}{s.corp_change.toFixed(1)}%
                      </td>
                      <td className={`p-2 text-right font-bold hidden sm:table-cell ${s.foreign_change > 0 ? 'text-emerald-400' : s.foreign_change < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                        {s.foreign_change > 0 ? '+' : ''}{s.foreign_change.toFixed(1)}%
                      </td>
                      <td className={`p-2 text-right font-bold hidden sm:table-cell ${s.ind_change > 0 ? 'text-emerald-400' : s.ind_change < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                        {s.ind_change > 0 ? '+' : ''}{s.ind_change.toFixed(1)}%
                      </td>
                      <td className="p-2 text-right">
                        <span className={`font-black ${s.score > 0 ? 'text-emerald-400' : s.score < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                          {s.score > 0 ? '+' : ''}{s.score}
                        </span>
                      </td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1">
                          {s.signals.split(', ').filter(Boolean).map((sig: string, j: number) => (
                            <span key={j} className="text-[8px] px-1 py-0.5 rounded bg-white/[0.04] text-muted-foreground">{sig}</span>
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
              No significant ownership changes detected.
            </div>
          )}
        </div>
      )}

      {/* ═══ SEARCH ═══ */}
      <div className="glass rounded-xl p-3 border border-border/30 flex items-center gap-3">
        <Search className="w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search stock code for detail..."
          value={searchStock}
          onChange={(e) => setSearchStock(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && searchStock.length >= 2) setSelectedStock(searchStock)
          }}
          className="flex-1 bg-transparent text-sm focus:outline-none uppercase"
          maxLength={4}
        />
        {selectedStock && (
          <button onClick={() => { setSelectedStock(null); setSearchStock('') }}
            className="px-3 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-muted-foreground hover:text-white">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* ═══ STOCK DETAIL ═══ */}
      {selectedStock && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Pie Chart */}
            <div className="glass rounded-2xl p-5 border border-border/30">
              <h3 className="text-sm font-black mb-4 flex items-center gap-2">
                <PieChartIcon className="w-4 h-4 text-red-400" />
                Ownership by Type — {selectedStock}
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

            {/* Positions Table */}
            <div className="glass rounded-2xl p-5 border border-border/30 overflow-x-auto">
              <h3 className="text-sm font-black mb-4 flex items-center gap-2">
                <Users className="w-4 h-4 text-red-400" />
                Current Positions
              </h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[9px] text-muted-foreground uppercase border-b border-white/[0.05]">
                    <th className="p-2 text-left">Investor</th>
                    <th className="p-2 text-left hidden md:table-cell">Type</th>
                    <th className="p-2 text-center">L/F</th>
                    <th className="p-2 text-right">%</th>
                    <th className="p-2 text-right">Shares</th>
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
                      <td className="p-2 text-right text-muted-foreground">{formatShares(d.shares)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Changes Table */}
          {changes.length > 0 && (
            <div className="glass rounded-2xl border border-border/30 overflow-hidden">
              <button onClick={() => setShowChangeTable(!showChangeTable)}
                className="w-full p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                <h3 className="text-sm font-black flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-red-400" />
                  Ownership Changes ({changes.length})
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
                          <td className="p-2 text-right">{c.prev_pct.toFixed(2)}%</td>
                          <td className="p-2 text-right">{c.curr_pct.toFixed(2)}%</td>
                          <td className={`p-2 text-right font-bold ${c.pct_change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {c.pct_change >= 0 ? '+' : ''}{c.pct_change.toFixed(2)}%
                          </td>
                          <td className="p-2 text-right hidden md:table-cell">{formatShares(c.share_change)}</td>
                          <td className="p-2 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                              c.action === 'BUYING' ? 'bg-emerald-500/20 text-emerald-400' : c.action === 'SELLING' ? 'bg-red-500/20 text-red-400' : 'bg-slate-500/20 text-slate-400'
                            }`}>{c.action}</span>
                          </td>
                          <td className="p-2 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                              c.alert_level === 'HIGH' ? 'bg-red-500/20 text-red-400' : c.alert_level === 'MEDIUM' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'
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

          {/* Link to full stock detail */}
          <div className="flex justify-center">
            <Link href={`/stock/${selectedStock}`}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-red-500/20 to-amber-500/20 border border-red-500/30 text-white font-bold text-sm hover:from-red-500/30 hover:to-amber-500/30 transition-all shadow-lg">
              <Target className="w-5 h-5 text-red-400" />
              Open Full Analysis for {selectedStock}
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
