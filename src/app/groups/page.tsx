'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatRupiah } from '@/lib/utils'
import { Building2, TrendingUp, TrendingDown, Activity, Search, Crown, RefreshCw } from 'lucide-react'
import Link from 'next/link'

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

export default function GroupsPage() {
  const [groups, setGroups] = useState<any[]>([])
  const [foreignFlow, setForeignFlow] = useState<any[]>([])
  const [ownership, setOwnership] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [groupStocks, setGroupStocks] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<'momentum' | 'foreign' | 'ownership'>('momentum')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [g, f, o] = await Promise.all([
        mdQuery('SELECT * FROM market.vw_group_summary ORDER BY momentum_score DESC'),
        mdQuery('SELECT * FROM market.vw_group_foreign_flow ORDER BY total_foreign_30d DESC'),
        mdQuery('SELECT * FROM ksei.vw_group_ownership ORDER BY total_stocks DESC'),
      ])
      setGroups(g)
      setForeignFlow(f)
      setOwnership(o)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const fetchGroupStocks = async (groupName: string) => {
    const data = await mdQuery(`
      SELECT 
        d.stock_code, d.close, d.change_percent, d.net_foreign_value,
        d.value, d.whale_signal, d.aov_ratio_ma20,
        cp.sector, cp.free_float
      FROM market.daily_transactions d
      JOIN market.company_profile cp ON d.stock_code = cp.stock_code
      WHERE cp.group_name = $1
        AND d.trading_date = (SELECT MAX(trading_date) FROM market.daily_transactions)
      ORDER BY d.value DESC
    `, [groupName])
    setGroupStocks(data)
  }

  const handleGroupClick = (groupName: string) => {
    if (selectedGroup === groupName) {
      setSelectedGroup(null)
      setGroupStocks([])
    } else {
      setSelectedGroup(groupName)
      fetchGroupStocks(groupName)
    }
  }

  const data = activeTab === 'momentum' ? groups : activeTab === 'foreign' ? foreignFlow : ownership

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">
            <Building2 className="w-8 h-8 text-amber-400 inline mr-2" />
            <span className="bg-gradient-to-r from-amber-400 to-gold-400 bg-clip-text text-transparent">Group Intelligence</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Track konglomerasi & institutional groups — {groups.length} active groups
          </p>
        </div>
        <button onClick={fetchData} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-400/10 border border-amber-400/30 text-amber-400 text-sm font-bold">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border/50">
        {[
          ['momentum', '⚡ Momentum', 'Score + Signal'],
          ['foreign', '🌏 Foreign Flow', '30D Flow'],
          ['ownership', '💼 Ownership', 'KSEI 1%'],
        ].map(([id, label, desc]) => (
          <button key={id} onClick={() => setActiveTab(id as any)}
            className={`px-5 py-3 text-sm font-bold transition-all relative ${
              activeTab === id ? 'text-amber-400' : 'text-muted-foreground hover:text-white'
            }`}>
            {label}
            {activeTab === id && <span className="absolute bottom-[-1px] left-0 w-full h-0.5 bg-amber-400" />}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && <div className="space-y-3">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="shimmer h-24 rounded-2xl" />)}</div>}

      {/* Group Cards */}
      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((group: any) => (
            <div key={group.group_name}>
              <div onClick={() => handleGroupClick(group.group_name)}
                className={`glass rounded-2xl p-5 border cursor-pointer transition-all card-hover ${
                  selectedGroup === group.group_name ? 'ring-2 ring-amber-400/50 border-amber-400/30' : 'border-border/30'
                }`}>
                {/* Group Name & Signal */}
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-black uppercase tracking-wider truncate max-w-[60%]">{group.group_name}</h3>
                  {group.group_signal && (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      group.group_signal.includes('STRONG') ? 'bg-emerald-500/20 text-emerald-400' :
                      group.group_signal.includes('MODERATE') ? 'bg-amber-500/20 text-amber-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>{group.group_signal}</span>
                  )}
                  {group.flow_signal && (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      group.flow_signal.includes('INFLOW') ? 'bg-emerald-500/20 text-emerald-400' :
                      group.flow_signal.includes('OUTFLOW') ? 'bg-red-500/20 text-red-400' :
                      'bg-slate-500/20 text-slate-400'
                    }`}>{group.flow_signal}</span>
                  )}
                </div>

                {/* KPI Grid */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="p-2 rounded-lg bg-white/[0.02]">
                    <p className="text-[8px] text-muted-foreground uppercase">Stocks</p>
                    <p className="text-lg font-black">{group.total_stocks}</p>
                  </div>
                  {group.momentum_score != null && (
                    <div className="p-2 rounded-lg bg-white/[0.02]">
                      <p className="text-[8px] text-muted-foreground uppercase">Score</p>
                      <p className={`text-lg font-black ${group.momentum_score >= 50 ? 'text-emerald-400' : 'text-amber-400'}`}>{group.momentum_score}</p>
                    </div>
                  )}
                  {group.avg_change_pct != null && (
                    <div className="p-2 rounded-lg bg-white/[0.02]">
                      <p className="text-[8px] text-muted-foreground uppercase">Avg Chg</p>
                      <p className={`text-lg font-black ${group.avg_change_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {group.avg_change_pct >= 0 ? '+' : ''}{Number(group.avg_change_pct).toFixed(2)}%
                      </p>
                    </div>
                  )}
                  <div className="p-2 rounded-lg bg-white/[0.02]">
                    <p className="text-[8px] text-muted-foreground uppercase">Foreign</p>
                    <p className={`text-sm font-bold ${Number(group.total_foreign || group.total_foreign_30d || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatRupiah(Number(group.total_foreign || group.total_foreign_30d || 0))}
                    </p>
                  </div>
                </div>

                {/* Bottom Stats */}
                <div className="flex items-center gap-3 text-[9px] text-muted-foreground pt-2 border-t border-white/[0.04]">
                  {group.gainers != null && <span className="text-emerald-400">{group.gainers}↑</span>}
                  {group.losers != null && <span className="text-red-400">{group.losers}↓</span>}
                  {group.whale_count > 0 && <span>🐋{group.whale_count}</span>}
                  {group.avg_ownership_pct != null && <span>Own: {Number(group.avg_ownership_pct).toFixed(1)}%</span>}
                </div>
              </div>

              {/* Drill-down Stocks */}
              {selectedGroup === group.group_name && groupStocks.length > 0 && (
                <div className="mt-2 glass rounded-2xl border border-amber-400/20 overflow-hidden animate-fade-in">
                  <div className="p-3 border-b border-white/[0.05] bg-amber-400/[0.02]">
                    <p className="text-xs font-black text-amber-400 uppercase">{group.group_name} — Stocks</p>
                  </div>
                  <div className="divide-y divide-white/[0.03] max-h-[300px] overflow-y-auto">
                    {groupStocks.map((stock: any) => (
                      <Link key={stock.stock_code} href={`/stock/${stock.stock_code}`}
                        className="flex items-center justify-between p-3 hover:bg-white/[0.02] transition-colors group">
                        <div>
                          <p className="font-mono font-black text-xs group-hover:text-amber-400">{stock.stock_code}</p>
                          <p className="text-[9px] text-muted-foreground">{stock.sector}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold">{formatRupiah(Number(stock.close))}</p>
                          <p className={`text-[10px] font-bold ${Number(stock.change_percent) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {Number(stock.change_percent) >= 0 ? '+' : ''}{Number(stock.change_percent).toFixed(2)}%
                          </p>
                        </div>
                        <div className="flex items-center gap-2 ml-3">
                          <span className={`text-[10px] ${Number(stock.net_foreign_value) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {formatRupiah(Number(stock.net_foreign_value))}
                          </span>
                          {stock.whale_signal && <span>🐋</span>}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
