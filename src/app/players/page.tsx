'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatRupiah, formatPercent, formatNumber, formatShares } from '@/lib/utils'
import { Users, RefreshCw, TrendingUp, TrendingDown, Search, X, AlertTriangle, Eye, Target, Clock, Activity, Globe, SlidersHorizontal } from 'lucide-react'
import Link from 'next/link'

interface HighConvStock {
  stock_code: string; sector: string; close: number; change_percent: number
  net_foreign_value: number; whale_signal: boolean; big_player_anomaly: boolean
  signal: string; aov_ratio_ma20: number; value: number; conviction_score: number
}
interface WhalePos {
  share_code: string; investor_name: string; investor_type: string; local_foreign: string
  percentage: number; date: string
}

function convScore(r: any) {
  let s = 0
  if (r.signal === 'Akumulasi' || r.signal === 'STRONG_BUY') s += 40
  else if (r.signal === 'WATCH') s += 25
  if (r.whale_signal)       s += 25
  if (r.big_player_anomaly) s += 20
  const aov = Number(r.aov_ratio_ma20) || 1
  if (aov >= 2) s += 15; else if (aov >= 1.5) s += 8
  return Math.min(s, 100)
}

export default function PlayersPage() {
  const [view, setView] = useState<'conviction'|'whale'>('conviction')
  const [conviction, setConviction] = useState<HighConvStock[]>([])
  const [whales, setWhales]         = useState<WhalePos[]>([])
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string|null>(null)
  const [search, setSearch]         = useState('')
  const [filterTrend, setFilterTrend] = useState('ALL')
  const [filterLF, setFilterLF]     = useState('ALL')
  const [lastDate, setLastDate]     = useState('')
  const [whaleDate, setWhaleDate]   = useState('')

  const fetchConviction = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data: dd } = await supabase.from('daily_transactions')
        .select('trading_date').order('trading_date', { ascending: false }).limit(1)
      const date = dd?.[0]?.trading_date; if (!date) return
      setLastDate(date)
      const { data, error: e } = await supabase.from('daily_transactions')
        .select('stock_code,sector,close,change_percent,value,net_foreign_value,whale_signal,big_player_anomaly,signal,aov_ratio_ma20')
        .eq('trading_date', date)
        .or('whale_signal.eq.true,big_player_anomaly.eq.true,signal.eq.Akumulasi,signal.eq.STRONG_BUY')
        .gt('value', 500_000_000).limit(500)
      if (e) throw e
      const scored = (data || []).map((r: any) => ({ ...r, conviction_score: convScore(r) }))
        .sort((a: any, b: any) => b.conviction_score - a.conviction_score)
      setConviction(scored)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  const fetchWhales = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data: dd } = await supabase.from('ksei_data1persen_mutasi')
        .select('date').order('date', { ascending: false }).limit(1)
      const date = dd?.[0]?.date; if (!date) return
      setWhaleDate(date)
      let q = supabase.from('ksei_data1persen_mutasi')
        .select('share_code,investor_name,investor_type,local_foreign,percentage,date')
        .eq('date', date).order('percentage', { ascending: false }).limit(200)
      if (filterLF !== 'ALL') q = q.eq('local_foreign', filterLF)
      const { data, error: e } = await q
      if (e) throw e
      setWhales(data || [])
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [filterLF])

  useEffect(() => {
    if (view === 'conviction') fetchConviction(); else fetchWhales()
  }, [view, fetchConviction, fetchWhales])

  const filteredC = conviction.filter(r =>
    !search || r.stock_code.includes(search.toUpperCase()) || r.sector?.toLowerCase().includes(search.toLowerCase())
  )
  const filteredW = whales.filter(w =>
    (!search || w.investor_name.toLowerCase().includes(search.toLowerCase()) || w.share_code.includes(search.toUpperCase())) &&
    (filterLF === 'ALL' || w.local_foreign === filterLF)
  )

  const SIGNAL_STYLE: Record<string, string> = {
    Akumulasi: 'bg-emerald-500/20 text-emerald-400', STRONG_BUY: 'bg-emerald-500/20 text-emerald-400',
    WATCH: 'bg-amber-500/20 text-amber-400', Distribusi: 'bg-red-500/20 text-red-400',
    Netral: 'bg-slate-500/20 text-slate-400', NEUTRAL: 'bg-slate-500/20 text-slate-400',
  }

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">
            <Users className="w-8 h-8 text-gold-400 inline mr-2" />
            <span className="gradient-gold">Big Player</span> <span className="text-foreground">Radar</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {view === 'conviction' ? `${conviction.length} saham high conviction · ${lastDate}` : `${whales.length} posisi whale · KSEI ${whaleDate}`}
          </p>
        </div>
        <div className="flex gap-3">
          <div className="glass rounded-xl p-1 flex gap-1 border border-border/30">
            {([['conviction','🎯 High Conviction'],['whale','🐋 Whale Pos.']] as const).map(([v,l]) => (
              <button key={v} onClick={() => setView(v)}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${view===v?'bg-gradient-to-r from-gold-400 to-yellow-500 text-navy-900':'text-muted-foreground hover:text-foreground'}`}>{l}</button>
            ))}
          </div>
          <button onClick={() => view==='conviction'?fetchConviction():fetchWhales()} disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gold-400/10 border border-gold-400/30 text-gold-400 text-sm font-bold">
            <RefreshCw className={`w-4 h-4 ${loading?'animate-spin':''}`} />
          </button>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="flex gap-3">
        <div className="glass rounded-xl p-3 border border-border/30 flex items-center gap-3 flex-1">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder={view==='conviction'?'Cari kode/sektor...':'Cari investor atau saham...'}
            value={search} onChange={e => setSearch(e.target.value.toUpperCase())}
            className="flex-1 bg-transparent text-sm focus:outline-none" />
          {search && <button onClick={()=>setSearch('')}><X className="w-4 h-4 text-muted-foreground"/></button>}
        </div>
        {view==='whale' && (
          <div className="flex gap-2">
            {[['ALL','Semua'],['L','🇮🇩 Lokal'],['F','🌏 Asing']].map(([v,l]) => (
              <button key={v} onClick={()=>setFilterLF(v)}
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${filterLF===v?'bg-gold-400/20 border-gold-400/40 text-gold-400':'glass border-border/30 text-muted-foreground'}`}>{l}</button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm">
          <AlertTriangle className="w-5 h-5"/><span className="flex-1">{error}</span>
          <button onClick={()=>setError(null)}><X className="w-4 h-4"/></button>
        </div>
      )}

      {/* High Conviction Table */}
      {view==='conviction' && (
        loading ? <div className="space-y-2">{Array.from({length:8}).map((_,i)=><div key={i} className="shimmer h-14 rounded-xl"/>)}</div>
        : filteredC.length===0 ? (
          <div className="glass rounded-xl p-12 text-center text-muted-foreground"><Target className="w-12 h-12 mx-auto mb-3 opacity-20"/><p>Tidak ada data</p></div>
        ) : (
          <div className="glass rounded-2xl overflow-hidden border border-border/30">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-white/[0.02] border-b border-white/[0.05] text-[10px] text-muted-foreground uppercase">
                  <th className="p-3 text-left w-8">#</th>
                  <th className="p-3 text-left">Emiten</th>
                  <th className="p-3 text-right">Harga</th>
                  <th className="p-3 text-right">Chg%</th>
                  <th className="p-3 text-center">Score</th>
                  <th className="p-3 text-center">Flags</th>
                  <th className="p-3 text-center">Signal</th>
                </tr></thead>
                <tbody>
                  {filteredC.map((r, i) => (
                    <tr key={r.stock_code} className="tr-hover border-b border-white/[0.02]">
                      <td className="p-3 text-[11px] text-muted-foreground">{i+1}</td>
                      <td className="p-3">
                        <Link href={`/stock/${r.stock_code}`} className="block group">
                          <p className="font-black font-mono text-base text-foreground group-hover:text-gold-400 transition-colors">{r.stock_code}</p>
                          <p className="text-[10px] text-muted-foreground truncate max-w-[130px]">{r.sector||'—'}</p>
                        </Link>
                      </td>
                      <td className="p-3 text-right font-semibold">{formatNumber(r.close)}</td>
                      <td className={`p-3 text-right font-bold ${r.change_percent>=0?'text-emerald-400':'text-red-400'}`}>
                        {r.change_percent>=0?'▲':'▼'} {Math.abs(r.change_percent).toFixed(2)}%
                      </td>
                      <td className="p-3 text-center">
                        <span className={`text-xl font-black ${r.conviction_score>=60?'text-emerald-400':r.conviction_score>=40?'text-amber-400':'text-muted-foreground'}`}>
                          {r.conviction_score}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        {r.whale_signal&&<span>🐋</span>}
                        {r.big_player_anomaly&&<span>⚡</span>}
                        {r.net_foreign_value>0&&<span>🌏</span>}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${SIGNAL_STYLE[r.signal]||'bg-slate-500/20 text-slate-400'}`}>{r.signal}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Whale Positions */}
      {view==='whale' && (
        loading ? <div className="space-y-2">{Array.from({length:6}).map((_,i)=><div key={i} className="shimmer h-14 rounded-xl"/>)}</div>
        : filteredW.length===0 ? (
          <div className="glass rounded-xl p-12 text-center text-muted-foreground"><Eye className="w-12 h-12 mx-auto mb-3 opacity-20"/><p className="font-bold">Tidak ada posisi whale KSEI ≥1%</p></div>
        ) : (
          <div className="glass rounded-2xl overflow-hidden border border-border/30">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-white/[0.02] border-b border-white/[0.05] text-[10px] text-muted-foreground uppercase">
                  <th className="p-3 text-left">#</th>
                  <th className="p-3 text-left">Investor</th>
                  <th className="p-3 text-center hidden md:table-cell">L/F</th>
                  <th className="p-3 text-right">Kepemilikan</th>
                  <th className="p-3 text-left hidden md:table-cell">Tipe</th>
                </tr></thead>
                <tbody>
                  {filteredW.map((w, i) => (
                    <tr key={`${w.investor_name}-${w.share_code}`} className="tr-hover border-b border-white/[0.02]">
                      <td className="p-3 text-[11px] text-muted-foreground">{i+1}</td>
                      <td className="p-3 max-w-[180px]">
                        <p className="font-bold text-sm truncate">{w.investor_name}</p>
                        <p className="text-[10px] text-muted-foreground">{w.investor_type}</p>
                      </td>
                      <td className="p-3 hidden md:table-cell">
                        <Link href={`/stock/${w.share_code}`} className="font-mono font-black text-foreground hover:text-gold-400 transition-colors">{w.share_code}</Link>
                      </td>
                      <td className="p-3 text-center hidden md:table-cell">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${w.local_foreign==='F'?'bg-blue-500/20 text-blue-400':'bg-emerald-500/20 text-emerald-400'}`}>
                          {w.local_foreign==='F'?'🌏 Asing':'🇮🇩 Lokal'}
                        </span>
                      </td>
                      <td className="p-3 text-right font-black text-gold-400 text-lg">{Number(w.percentage).toFixed(2)}%</td>
                      <td className="p-3 text-left hidden md:table-cell text-muted-foreground text-xs">{w.investor_type||'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-3 border-t border-white/[0.05] text-xs text-muted-foreground">
              {filteredW.length} posisi · KSEI ≥1% · As of {whaleDate}
            </div>
          </div>
        )
      )}
    </div>
  )
}
