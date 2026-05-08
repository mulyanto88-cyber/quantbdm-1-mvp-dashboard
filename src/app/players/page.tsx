'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatRupiah, formatPercent, formatNumber, formatShares } from '@/lib/utils'
import {
  Users, RefreshCw, TrendingUp, TrendingDown, Search, X,
  AlertTriangle, Globe, Target, Zap, Clock, ChevronRight,
  Eye, Activity, BarChart3, SlidersHorizontal
} from 'lucide-react'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────
interface HighConviction {
  stock_code: string
  sector: string
  current_price: number
  price_chg_pct: number
  conviction_score: number
  net_sm_flow: number
  consistency: number
  magnitude: number
  divergence: number
  signal: string
}

interface WhalePosition {
  share_code: string
  investor_name: string
  investor_type: string
  local_foreign: string
  first_seen_date: string
  latest_date: string
  first_percentage: number
  latest_percentage: number
  latest_shares: number
  est_entry_price: number
  current_price: number
  return_since_entry: number
  holding_days: number
  position_trend: 'INCREASING' | 'DECREASING' | 'STABLE'
  whale_verdict: string
}

const TREND_CONFIG = {
  INCREASING: { label: 'Menambah',  className: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20', icon: '▲' },
  DECREASING: { label: 'Mengurangi',className: 'bg-red-500/20 text-red-400 border border-red-500/20',       icon: '▼' },
  STABLE:     { label: 'Stabil',    className: 'bg-slate-500/20 text-slate-400 border border-slate-500/20', icon: '■' },
}

const VERDICT_STYLE = (v: string) =>
  v?.includes('ADDING')   ? 'bg-emerald-500/20 text-emerald-400' :
  v?.includes('AVERAGING') ? 'bg-blue-500/20 text-blue-400' :
  v?.includes('TRIMMING') ? 'bg-red-500/20 text-red-400' : 'bg-slate-500/20 text-slate-400'

// ─── Component ────────────────────────────────────────────────────────────────
export default function PlayersPage() {
  const [view, setView]               = useState<'conviction' | 'whale'>('conviction')
  const [conviction, setConviction]   = useState<HighConviction[]>([])
  const [whales, setWhales]           = useState<WhalePosition[]>([])
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [search, setSearch]           = useState('')
  const [filterTrend, setFilterTrend] = useState('ALL')
  const [filterLocal, setFilterLocal] = useState('ALL')
  const [minReturn, setMinReturn]     = useState(-999)
  const [showFilters, setShowFilters] = useState(false)

  // ── Fetch conviction ────────────────────────────────────────────────────────
  const fetchConviction = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data, error: e } = await supabase.rpc('scan_high_conviction', {
        p_min_conviction: 40,
        p_limit: 150,
      })
      if (e) throw e
      setConviction(data || [])
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  // ── Fetch whale positions ───────────────────────────────────────────────────
  const fetchWhales = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data, error: e } = await supabase.rpc('get_whale_positions', {
        p_min_percentage: 1.0,
        p_min_holding_days: 30,
      })
      if (e) throw e
      setWhales(data || [])
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (view === 'conviction') fetchConviction()
    else fetchWhales()
  }, [view, fetchConviction, fetchWhales])

  // ── Derived: Conviction ─────────────────────────────────────────────────────
  const filteredConviction = conviction
    .filter(r => !search || r.stock_code.toUpperCase().includes(search.toUpperCase()) || r.sector?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.conviction_score - a.conviction_score)

  const convStats = {
    total:   conviction.length,
    strong:  conviction.filter(r => r.conviction_score >= 70).length,
    medium:  conviction.filter(r => r.conviction_score >= 50 && r.conviction_score < 70).length,
    avgConv: conviction.length ? Math.round(conviction.reduce((s, r) => s + r.conviction_score, 0) / conviction.length) : 0,
  }

  // ── Derived: Whales ─────────────────────────────────────────────────────────
  const filteredWhales = whales
    .filter(w => {
      if (search && !w.investor_name.toLowerCase().includes(search.toLowerCase()) &&
          !w.share_code.toUpperCase().includes(search.toUpperCase())) return false
      if (filterTrend !== 'ALL' && w.position_trend !== filterTrend) return false
      if (filterLocal !== 'ALL' && w.local_foreign !== filterLocal) return false
      if (w.return_since_entry < minReturn) return false
      return true
    })
    .sort((a, b) => b.latest_percentage - a.latest_percentage)

  const whaleStats = {
    total:      whales.length,
    increasing: whales.filter(w => w.position_trend === 'INCREASING').length,
    decreasing: whales.filter(w => w.position_trend === 'DECREASING').length,
    foreign:    whales.filter(w => w.local_foreign === 'F').length,
    avgReturn:  whales.length
      ? (whales.reduce((s, w) => s + (w.return_since_entry || 0), 0) / whales.length).toFixed(1)
      : '0',
  }

  return (
    <div className="space-y-6 animate-fade-in pb-10">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">
            <Users className="w-8 h-8 text-gold-400 inline mr-2" />
            <span className="gradient-gold">Big Player</span>{' '}
            <span className="text-foreground">Radar</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Track institusi & individu dengan conviction tinggi di IDX
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="glass rounded-xl p-1 flex gap-1 border border-border/30">
            {([['conviction','🎯 High Conviction'], ['whale','🐋 Whale Positions']] as const).map(([v, label]) => (
              <button key={v} onClick={() => setView(v)}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  view === v ? 'bg-gradient-to-r from-gold-400 to-yellow-500 text-navy-900 shadow' : 'text-muted-foreground hover:text-foreground'
                }`}>{label}</button>
            ))}
          </div>
          <button onClick={() => view === 'conviction' ? fetchConviction() : fetchWhales()} disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gold-400/10 border border-gold-400/30 text-gold-400 hover:bg-gold-400/20 text-sm font-bold">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* ── Stats ─────────────────────────────────────────────────────────── */}
      {view === 'conviction' ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'High Conviction', value: convStats.total,  color: 'text-foreground',  icon: Activity },
            { label: 'Score ≥70',       value: convStats.strong, color: 'text-emerald-400', icon: Target   },
            { label: 'Score 50–69',     value: convStats.medium, color: 'text-amber-400',   icon: BarChart3},
            { label: 'Avg Score',       value: convStats.avgConv,color: 'text-gold-400',    icon: Zap      },
          ].map((m, i) => { const Icon = m.icon; return (
            <div key={i} className="glass rounded-2xl p-5 border border-border/30 card-hover">
              <Icon className={`w-5 h-5 ${m.color} mb-3`} />
              <p className="text-xs text-muted-foreground uppercase">{m.label}</p>
              <p className={`text-3xl font-black mt-1 ${m.color}`}>{m.value}</p>
            </div>
          )})}</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'Total Whale',  value: whaleStats.total,      color: 'text-foreground',  icon: Eye         },
            { label: 'Menambah ▲',  value: whaleStats.increasing,  color: 'text-emerald-400', icon: TrendingUp  },
            { label: 'Mengurangi ▼',value: whaleStats.decreasing,  color: 'text-red-400',     icon: TrendingDown},
            { label: 'Asing',        value: whaleStats.foreign,     color: 'text-blue-400',    icon: Globe       },
            { label: 'Avg Return',   value: `${whaleStats.avgReturn}%`, color: Number(whaleStats.avgReturn) >= 0 ? 'text-emerald-400' : 'text-red-400', icon: Activity },
          ].map((m, i) => { const Icon = m.icon; return (
            <div key={i} className="glass rounded-2xl p-5 border border-border/30 card-hover">
              <Icon className={`w-5 h-5 ${m.color} mb-3`} />
              <p className="text-xs text-muted-foreground uppercase">{m.label}</p>
              <p className={`text-2xl font-black mt-1 ${m.color}`}>{m.value}</p>
            </div>
          )})}</div>
      )}

      {/* ── Search + Filter ───────────────────────────────────────────────── */}
      <div className="flex gap-3">
        <div className="glass rounded-xl p-3 border border-border/30 flex items-center gap-3 flex-1">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder={view === 'conviction' ? 'Cari kode/sektor...' : 'Cari investor atau saham...'}
            value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm focus:outline-none" />
          {search && <button onClick={() => setSearch('')}><X className="w-4 h-4 text-muted-foreground" /></button>}
        </div>
        {view === 'whale' && (
          <button onClick={() => setShowFilters(f => !f)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-bold transition-all ${
              showFilters ? 'bg-gold-400/20 border-gold-400/40 text-gold-400' : 'glass border-border/30 text-muted-foreground'
            }`}>
            <SlidersHorizontal className="w-4 h-4" /> Filter
          </button>
        )}
      </div>

      {/* ── Whale Filters ─────────────────────────────────────────────────── */}
      {view === 'whale' && showFilters && (
        <div className="glass rounded-2xl p-5 border border-gold-400/20 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-[11px] text-muted-foreground uppercase mb-2 block">Posisi Trend</label>
              <div className="flex gap-2">
                {['ALL','INCREASING','DECREASING','STABLE'].map(t => (
                  <button key={t} onClick={() => setFilterTrend(t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      filterTrend === t ? 'bg-gold-400/20 border-gold-400/40 text-gold-400' : 'border-border/30 text-muted-foreground'
                    }`}>{t === 'ALL' ? 'Semua' : t === 'INCREASING' ? '▲ Naik' : t === 'DECREASING' ? '▼ Turun' : '■ Stabil'}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground uppercase mb-2 block">L/F</label>
              <div className="flex gap-2">
                {[['ALL','Semua'],['L','🇮🇩 Lokal'],['F','🌏 Asing']].map(([v, label]) => (
                  <button key={v} onClick={() => setFilterLocal(v)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      filterLocal === v ? 'bg-gold-400/20 border-gold-400/40 text-gold-400' : 'border-border/30 text-muted-foreground'
                    }`}>{label}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground uppercase mb-2 block">
                Min Return: <span className="text-gold-400 font-bold">{minReturn === -999 ? 'Semua' : `${minReturn}%`}</span>
              </label>
              <div className="flex gap-2">
                {[[-999,'Semua'],[0,'≥0%'],[10,'≥10%'],[20,'≥20%']].map(([v, label]) => (
                  <button key={v} onClick={() => setMinReturn(Number(v))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      minReturn === Number(v) ? 'bg-gold-400/20 border-gold-400/40 text-gold-400' : 'border-border/30 text-muted-foreground'
                    }`}>{label}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ═══════════════════ VIEW: HIGH CONVICTION ═══════════════════════ */}
      {view === 'conviction' && (
        loading ? (
          <div className="space-y-2">{Array.from({length:8}).map((_,i) => <div key={i} className="shimmer h-16 rounded-xl" />)}</div>
        ) : filteredConviction.length === 0 ? (
          <div className="glass rounded-xl p-16 text-center text-muted-foreground">
            <Target className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p className="font-bold">Tidak ada saham high conviction</p>
          </div>
        ) : (
          <div className="glass rounded-2xl overflow-hidden border border-border/30">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/[0.02] border-b border-white/[0.05] text-[10px] text-muted-foreground uppercase">
                    <th className="p-4 text-left">#</th>
                    <th className="p-4 text-left">Emiten</th>
                    <th className="p-4 text-right">Harga</th>
                    <th className="p-4 text-right">Chg%</th>
                    <th className="p-4 text-center">Conviction</th>
                    <th className="p-4 text-center hidden md:table-cell">Consistency</th>
                    <th className="p-4 text-center hidden md:table-cell">Magnitude</th>
                    <th className="p-4 text-right hidden lg:table-cell">SM Flow</th>
                    <th className="p-4 text-center">Signal</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredConviction.map((r, i) => {
                    const scoreColor = r.conviction_score >= 70 ? 'text-emerald-400' : r.conviction_score >= 50 ? 'text-amber-400' : 'text-slate-400'
                    const scoreBg = r.conviction_score >= 70 ? 'bg-emerald-400' : r.conviction_score >= 50 ? 'bg-amber-400' : 'bg-slate-500'
                    return (
                      <tr key={r.stock_code} className="tr-hover border-b border-white/[0.02]">
                        <td className="p-4 text-[11px] text-muted-foreground">{i+1}</td>
                        <td className="p-4">
                          <Link href={`/stock/${r.stock_code}`} className="block group">
                            <p className="font-black text-foreground group-hover:text-gold-400 transition-colors font-mono text-base">{r.stock_code}</p>
                            <p className="text-[10px] text-muted-foreground truncate max-w-[140px]">{r.sector || '—'}</p>
                          </Link>
                        </td>
                        <td className="p-4 text-right font-semibold">{formatNumber(r.current_price)}</td>
                        <td className={`p-4 text-right font-bold ${r.price_chg_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {r.price_chg_pct >= 0 ? <TrendingUp className="inline w-3 h-3 mr-0.5" /> : <TrendingDown className="inline w-3 h-3 mr-0.5" />}
                          {formatPercent(r.price_chg_pct)}
                        </td>
                        <td className="p-4 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className={`text-xl font-black ${scoreColor}`}>{Math.round(r.conviction_score)}</span>
                            <div className="w-16 h-1 rounded-full bg-white/[0.05] overflow-hidden">
                              <div className={`h-full rounded-full ${scoreBg}`} style={{width:`${Math.min(100,r.conviction_score)}%`}} />
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-center hidden md:table-cell">
                          <span className="text-sm font-bold text-cyan-400">{Math.round(r.consistency || 0)}</span>
                        </td>
                        <td className="p-4 text-center hidden md:table-cell">
                          <span className="text-sm font-bold text-purple-400">{Math.round(r.magnitude || 0)}</span>
                        </td>
                        <td className={`p-4 text-right hidden lg:table-cell font-semibold ${(r.net_sm_flow||0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {formatPercent(r.net_sm_flow || 0)}
                        </td>
                        <td className="p-4 text-center">
                          <Link href={`/stock/${r.stock_code}`}>
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                              r.signal === 'STRONG_BUY' ? 'signal-strong-buy' :
                              r.signal === 'WATCH'      ? 'signal-watch'      : 'signal-neutral'
                            }`}>{r.signal || 'NEUTRAL'}</span>
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-white/[0.05] text-xs text-muted-foreground">
              Menampilkan {filteredConviction.length} emiten · Conviction score = Consistency (40) + Magnitude (40) + Divergence bonus (20)
            </div>
          </div>
        )
      )}

      {/* ═══════════════════ VIEW: WHALE POSITIONS ═══════════════════════ */}
      {view === 'whale' && (
        loading ? (
          <div className="space-y-2">{Array.from({length:6}).map((_,i) => <div key={i} className="shimmer h-20 rounded-xl" />)}</div>
        ) : filteredWhales.length === 0 ? (
          <div className="glass rounded-xl p-16 text-center text-muted-foreground">
            <Eye className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p className="font-bold">Tidak ada posisi whale yang ditemukan</p>
            <p className="text-xs mt-1">Data dari KSEI ≥1% kepemilikan</p>
          </div>
        ) : (
          <div className="glass rounded-2xl overflow-hidden border border-border/30">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/[0.02] border-b border-white/[0.05] text-[10px] text-muted-foreground uppercase">
                    <th className="p-4 text-left">Investor</th>
                    <th className="p-4 text-left hidden md:table-cell">Saham</th>
                    <th className="p-4 text-right">Kepemilikan</th>
                    <th className="p-4 text-right hidden md:table-cell">Entry Est.</th>
                    <th className="p-4 text-right hidden lg:table-cell">Harga Skrg</th>
                    <th className="p-4 text-right">Return</th>
                    <th className="p-4 text-center hidden md:table-cell">Holding</th>
                    <th className="p-4 text-center">Trend</th>
                    <th className="p-4 text-center hidden lg:table-cell">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWhales.map((w, i) => {
                    const trend = TREND_CONFIG[w.position_trend] || TREND_CONFIG.STABLE
                    return (
                      <tr key={`${w.investor_name}-${w.share_code}-${i}`} className="tr-hover border-b border-white/[0.02]">
                        <td className="p-4 max-w-[180px]">
                          <p className="font-bold text-foreground text-sm truncate">{w.investor_name}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                            <span>{w.local_foreign === 'F' ? '🌏' : '🇮🇩'}</span>
                            <span className="truncate">{w.investor_type}</span>
                          </p>
                        </td>
                        <td className="p-4 hidden md:table-cell">
                          <Link href={`/stock/${w.share_code}`} className="font-mono font-black text-foreground hover:text-gold-400 transition-colors">
                            {w.share_code}
                          </Link>
                        </td>
                        <td className="p-4 text-right">
                          <p className="font-bold text-lg text-gold-400">{Number(w.latest_percentage).toFixed(2)}%</p>
                          <p className="text-[10px] text-muted-foreground">{formatShares(w.latest_shares)} shares</p>
                        </td>
                        <td className="p-4 text-right hidden md:table-cell">
                          <span className="font-semibold">{w.est_entry_price ? formatNumber(w.est_entry_price) : '—'}</span>
                          <p className="text-[10px] text-muted-foreground">{w.first_seen_date}</p>
                        </td>
                        <td className="p-4 text-right hidden lg:table-cell font-semibold">
                          {w.current_price ? formatNumber(w.current_price) : '—'}
                        </td>
                        <td className={`p-4 text-right font-black text-lg ${(w.return_since_entry||0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {w.return_since_entry != null ? formatPercent(w.return_since_entry) : '—'}
                        </td>
                        <td className="p-4 text-center hidden md:table-cell">
                          <div className="flex items-center justify-center gap-1 text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            <span className="text-xs font-semibold">{w.holding_days}d</span>
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${trend.className}`}>
                            {trend.icon} {trend.label}
                          </span>
                        </td>
                        <td className="p-4 text-center hidden lg:table-cell">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${VERDICT_STYLE(w.whale_verdict)}`}>
                            {w.whale_verdict?.replace(/_/g,' ') || '—'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-white/[0.05] flex items-center justify-between text-xs text-muted-foreground">
              <span>{filteredWhales.length} posisi whale · Data KSEI ≥1% kepemilikan</span>
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> As of latest KSEI snapshot</span>
            </div>
          </div>
        )
      )}
    </div>
  )
}
