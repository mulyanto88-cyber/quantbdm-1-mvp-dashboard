'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatRupiah } from '@/lib/utils'
import { Search, Crown, Activity, Shield, Filter } from 'lucide-react'
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

export default function SmartMoneyMatrix() {
  const [activeTab, setActiveTab] = useState<'TACTICAL' | 'STRATEGIC'>('TACTICAL')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchedStock, setSearchedStock] = useState<any>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  
  const [tacticalList, setTacticalList] = useState<any[]>([])
  const [strategicList, setStrategicList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ⭐ Filter states
  const [threshold, setThreshold] = useState(10)

  // ─── Data Fetching ─────────────────────────────────────────────────────────
  
  // 1. Fetch Strategic (Hanya dipanggil 1 kali saat pertama buka halaman)
  const fetchStrategic = useCallback(async () => {
    try {
      const strategicData = await mdQuery(`
        SELECT * FROM ksei.vw_strategic_positioning_whale_movement_tracker 
        ORDER BY mom_change_pct DESC 
        LIMIT 30
      `)
      setStrategicList(strategicData)
    } catch (err: any) {
      console.error('Strategic Error:', err)
    }
  }, [])

  // 2. Fetch Tactical (Dipanggil tiap kali filter 'threshold' berubah)
  const fetchTactical = useCallback(async () => {
    // Jika data sudah ada, gunakan 'isRefreshing' agar tabel tidak hilang/lompat
    if (tacticalList.length > 0) setIsRefreshing(true)
    else setLoading(true)
    
    setError(null)
    try {
      const tacticalData = await mdQuery(`
        SELECT * FROM market.vw_tactical_momentum_smart_money 
        WHERE ABS(net_foreign_5d) > CAST($1 AS BIGINT)
           OR ABS(broker_net_5d) > CAST($1 AS BIGINT)
        ORDER BY ABS(net_foreign_5d) DESC, ABS(broker_net_5d) DESC 
        LIMIT 30
      `, [threshold * 1000000000])
      
      setTacticalList(tacticalData)
    } catch (err: any) {
      setError(err.message || 'Failed to fetch data')
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }, [threshold, tacticalList.length]) // strategic tidak di-fetch ulang!

  // Panggil saat halaman pertama di-load
  useEffect(() => {
    fetchStrategic()
  }, [fetchStrategic])

  // Panggil saat halaman di-load ATAU threshold berubah
  useEffect(() => {
    fetchTactical()
  }, [fetchTactical])


  // ─── Single Stock Search ───────────────────────────────────────────────────
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return
    
    setSearchLoading(true)
    const code = searchQuery.trim().toUpperCase()
    try {
      const tacData = await mdQuery(`SELECT * FROM market.vw_tactical_momentum_smart_money WHERE stock_code = $1`, [code])
      const strData = await mdQuery(`SELECT * FROM ksei.vw_strategic_positioning_whale_movement_tracker WHERE stock_code = $1`, [code])
      
      if (tacData.length > 0 || strData.length > 0) {
        setSearchedStock({
          code,
          tactical: tacData[0] || null,
          strategic: strData[0] || null
        })
      } else {
        setSearchedStock({ code, notFound: true })
      }
    } catch (err: any) {
      console.error(err)
    } finally {
      setSearchLoading(false)
    }
  }

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-fade-in pb-10 max-w-6xl mx-auto">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">
            <Crown className="w-8 h-8 text-gold-400 inline mr-2 mb-1" />
            <span className="bg-gradient-to-r from-gold-400 to-amber-500 bg-clip-text text-transparent">Smart Money Matrix</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm max-w-xl">
            Institutional command center — Tactical (Daily) + Strategic (Monthly)
          </p>
        </div>
      </div>

      {/* ─── STOCK VALIDATOR ─── */}
      <div className="glass rounded-2xl p-6 border border-border/30">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
          <Search className="w-4 h-4" /> Stock Validator
        </h2>
        
        <form onSubmit={handleSearch} className="flex gap-3 mb-6">
          <div className="relative flex-1 max-w-sm">
            <input 
              type="text" 
              placeholder="Type ticker (e.g. BBCA)" 
              className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-4 pr-10 text-white font-mono uppercase focus:outline-none focus:border-gold-400/50 focus:ring-1 focus:ring-gold-400/50 transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button type="submit" disabled={searchLoading} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-muted-foreground hover:text-white transition-colors">
              <Search className="w-4 h-4" />
            </button>
          </div>
        </form>

        {searchLoading && <div className="shimmer h-32 rounded-xl" />}
        
        {searchedStock && !searchLoading && !searchedStock.notFound && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
            
            {/* Tactical Card */}
            <div className="bg-gradient-to-br from-blue-900/20 to-black/40 p-5 rounded-xl border border-blue-500/20">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-blue-400">Tactical Momentum (Daily)</h3>
              </div>
              
              {searchedStock.tactical ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Signal</p>
                      <p className="text-lg font-black">{searchedStock.tactical.tactical_signal}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground uppercase">Price</p>
                      <p className="font-mono font-bold text-white">{formatRupiah(Number(searchedStock.tactical.close))}</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/5">
                    <div>
                      <p className="text-[9px] text-muted-foreground uppercase">Foreign (1D)</p>
                      <p className={`text-sm font-bold ${Number(searchedStock.tactical.net_foreign_1d) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatRupiah(Number(searchedStock.tactical.net_foreign_1d))}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] text-muted-foreground uppercase">Foreign (5D)</p>
                      <p className={`text-sm font-bold ${Number(searchedStock.tactical.net_foreign_5d) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatRupiah(Number(searchedStock.tactical.net_foreign_5d))}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] text-muted-foreground uppercase">Broker Net (5D)</p>
                      <p className={`text-sm font-bold ${Number(searchedStock.tactical.broker_net_5d) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatRupiah(Number(searchedStock.tactical.broker_net_5d))}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No recent daily transaction data.</p>
              )}
            </div>

            {/* Strategic Card */}
            <div className="bg-gradient-to-br from-purple-900/20 to-black/40 p-5 rounded-xl border border-purple-500/20">
              <div className="flex items-center gap-2 mb-4">
                <Shield className="w-5 h-5 text-purple-400" />
                <h3 className="font-bold text-purple-400">Strategic Positioning (Monthly)</h3>
              </div>
              
              {searchedStock.strategic ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Signal</p>
                      <p className="text-lg font-black">{searchedStock.strategic.strategic_signal}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground uppercase">Inst. Own</p>
                      <p className="font-mono font-bold text-white">{Number(searchedStock.strategic.total_inst_pct).toFixed(2)}%</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/5">
                    <div>
                      <p className="text-[9px] text-muted-foreground uppercase">Previous</p>
                      <p className="text-sm font-bold text-slate-300">{Number(searchedStock.strategic.prev_inst_pct).toFixed(2)}%</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-muted-foreground uppercase">MoM Change</p>
                      <p className={`text-sm font-bold ${Number(searchedStock.strategic.mom_change_pct) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {Number(searchedStock.strategic.mom_change_pct) > 0 ? '+' : ''}{Number(searchedStock.strategic.mom_change_pct).toFixed(2)}%
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No institutional data found.</p>
              )}
            </div>
          </div>
        )}
        
        {searchedStock?.notFound && (
          <p className="text-sm text-amber-400">Stock {searchedStock.code} not found.</p>
        )}
      </div>

      {/* ─── TABS ─── */}
      <div className="flex items-center gap-2 border-b border-border/50">
        <button onClick={() => setActiveTab('TACTICAL')}
          className={`px-6 py-3 text-sm font-bold uppercase tracking-wider transition-all relative ${
            activeTab === 'TACTICAL' ? 'text-blue-400' : 'text-muted-foreground hover:text-white'
          }`}>
          ⚡ Tactical (Daily)
          {activeTab === 'TACTICAL' && <span className="absolute bottom-[-1px] left-0 w-full h-0.5 bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]" />}
        </button>
        <button onClick={() => setActiveTab('STRATEGIC')}
          className={`px-6 py-3 text-sm font-bold uppercase tracking-wider transition-all relative ${
            activeTab === 'STRATEGIC' ? 'text-purple-400' : 'text-muted-foreground hover:text-white'
          }`}>
          🛡️ Strategic (Monthly)
          {activeTab === 'STRATEGIC' && <span className="absolute bottom-[-1px] left-0 w-full h-0.5 bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.8)]" />}
        </button>
      </div>

      {/* ─── FILTER BAR (TACTICAL ONLY) ─── */}
      {activeTab === 'TACTICAL' && (
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 text-xs">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Min Flow:</span>
            {[1, 5, 10, 50, 100].map(t => (
              <button key={t} onClick={() => setThreshold(t)}
                className={`px-3 py-1 rounded-lg font-bold transition-all ${
                  threshold === t ? 'bg-gold-400/20 text-gold-400 border border-gold-400/30' : 'text-muted-foreground hover:text-white bg-white/[0.03] border border-white/[0.06]'
                }`}>
                {t}M
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── TABLES ─── */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 10 }).map((_, i) => <div key={i} className="shimmer h-14 rounded-xl" />)}
        </div>
      ) : error ? (
        <div className="p-4 bg-red-500/10 text-red-400 rounded-xl">{error}</div>
      ) : (
        <div className={`glass rounded-2xl border border-border/30 overflow-hidden transition-opacity duration-300 ${isRefreshing ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
          
          {/* TACTICAL TABLE */}
          {activeTab === 'TACTICAL' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/[0.02] border-b border-border/50 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Stock</th>
                    <th className="px-4 py-3 font-medium">Signal</th>
                    <th className="px-4 py-3 font-medium text-right">Price</th>
                    <th className="px-4 py-3 font-medium text-right">Change</th>
                    <th className="px-4 py-3 font-medium text-right">Foreign (1D)</th>
                    <th className="px-4 py-3 font-medium text-right">Foreign (5D)</th>
                    <th className="px-4 py-3 font-medium text-right">Broker Net (5D)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {tacticalList.map((row, i) => (
                    <tr key={i} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="px-4 py-3">
                        <Link href={`/stock/${row.stock_code}`} className="font-mono font-black text-blue-400 hover:text-blue-300">
                          {row.stock_code}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-xs">{row.tactical_signal}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{formatRupiah(Number(row.close))}</td>
                      <td className={`px-4 py-3 text-right text-xs font-bold ${Number(row.change_percent) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {Number(row.change_percent) > 0 ? '+' : ''}{Number(row.change_percent).toFixed(2)}%
                      </td>
                      <td className={`px-4 py-3 text-right font-mono text-xs ${Number(row.net_foreign_1d) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatRupiah(Number(row.net_foreign_1d))}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono text-xs ${Number(row.net_foreign_5d) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatRupiah(Number(row.net_foreign_5d))}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono text-xs ${Number(row.broker_net_5d) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatRupiah(Number(row.broker_net_5d))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tacticalList.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">No signals match the current filter. Try lowering the threshold.</div>
              )}
            </div>
          )}

          {/* STRATEGIC TABLE */}
          {activeTab === 'STRATEGIC' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/[0.02] border-b border-border/50 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Stock</th>
                    <th className="px-4 py-3 font-medium">Signal</th>
                    <th className="px-4 py-3 font-medium text-right">Inst. Own (%)</th>
                    <th className="px-4 py-3 font-medium text-right">Prev Own (%)</th>
                    <th className="px-4 py-3 font-medium text-right">MoM Change</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {strategicList.map((row, i) => (
                    <tr key={i} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="px-4 py-3">
                        <Link href={`/stock/${row.stock_code}`} className="font-mono font-black text-purple-400 hover:text-purple-300">
                          {row.stock_code}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-xs">{row.strategic_signal}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-white">
                        {Number(row.total_inst_pct).toFixed(2)}%
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-slate-300">
                        {Number(row.prev_inst_pct).toFixed(2)}%
                      </td>
                      <td className={`px-4 py-3 text-right font-mono text-xs font-bold ${Number(row.mom_change_pct) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {Number(row.mom_change_pct) > 0 ? '+' : ''}{Number(row.mom_change_pct).toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {strategicList.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">No strategic signals found.</div>
              )}
            </div>
          )}

        </div>
      )}
      
    </div>
  )
}
