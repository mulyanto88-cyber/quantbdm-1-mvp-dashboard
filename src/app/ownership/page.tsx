'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatPercent, formatRupiah, formatNumber } from '@/lib/utils'
import { 
  Briefcase, RefreshCw, Search, X, AlertTriangle, 
  Globe, Building2, Users, TrendingUp, TrendingDown, Eye, Activity, BarChart3
} from 'lucide-react'
import Link from 'next/link'

interface WhalePortfolio {
  investor_name:  string
  investor_type:  string
  local_foreign:  string
  holdings:       { share_code: string; percentage: number }[]
  total_stocks:   number
  max_pct:        number
  top_stock:      string
}

export default function OwnershipPage() {
  const [view, setView]             = useState<'portfolio' | 'flow' | 'top'>('flow')
  const [portfolios, setPortfolios] = useState<WhalePortfolio[]>([])
  const [flowData, setFlowData]     = useState<any[]>([])
  const [topData, setTopData]       = useState<any[]>([])
  
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string|null>(null)
  
  const [search, setSearch]         = useState('')
  const [filterLF, setFilterLF]     = useState('ALL')
  const [filterType, setFilterType] = useState('ALL')
  const [daysFilter, setDaysFilter] = useState(7)
  const [reportDate, setReportDate] = useState('')
  const [expanded, setExpanded]     = useState<string|null>(null)

  // ── 1. Fetch 1% Whale Portfolio ─────────────────────────────────────────────
  const fetchPortfolio = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data: dd } = await supabase
        .from('ksei_data1persen_mutasi')
        .select('date').order('date', { ascending: false }).limit(1)
      const date = dd?.[0]?.date
      if (!date) throw new Error('Tidak ada data KSEI 1%')
      setReportDate(date)

      const { data, error: e } = await supabase
        .from('ksei_data1persen_mutasi')
        .select('investor_name,investor_type,local_foreign,share_code,percentage')
        .eq('date', date)
        .order('percentage', { ascending: false })
        .limit(5000)
      if (e) throw e

      const map = new Map<string, WhalePortfolio>()
      ;(data || []).forEach((r: any) => {
        const key = r.investor_name
        if (!map.has(key)) {
          map.set(key, {
            investor_name: r.investor_name,
            investor_type: r.investor_type || '—',
            local_foreign:  r.local_foreign,
            holdings: [],
            total_stocks: 0,
            max_pct: 0,
            top_stock: '',
          })
        }
        const inv = map.get(key)!
        inv.holdings.push({ share_code: r.share_code, percentage: Number(r.percentage) })
        inv.total_stocks++
        if (Number(r.percentage) > inv.max_pct) {
          inv.max_pct = Number(r.percentage)
          inv.top_stock = r.share_code
        }
      })

      const list = Array.from(map.values())
        .map(p => ({ ...p, holdings: p.holdings.sort((a,b) => b.percentage - a.percentage) }))
        .sort((a, b) => b.total_stocks - a.total_stocks || b.max_pct - a.max_pct)
      setPortfolios(list)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  // ── 2. Fetch 5% Smart Money Flow ────────────────────────────────────────────
  const fetchFlow = useCallback(async (days: number) => {
    setLoading(true); setError(null)
    try {
      const { data, error: e } = await supabase.rpc('get_ksei5_movements', { p_days: days })
      if (e) throw e
      setFlowData(data || [])
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  // ── 3. Fetch 5% Top Accumulated Stocks ──────────────────────────────────────
  const fetchTop = useCallback(async (days: number) => {
    setLoading(true); setError(null)
    try {
      const { data, error: e } = await supabase.rpc('get_ksei5_top_stocks', { p_days: days })
      if (e) throw e
      setTopData(data || [])
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { 
    if (view === 'portfolio') fetchPortfolio()
    else if (view === 'flow') fetchFlow(daysFilter)
    else if (view === 'top') fetchTop(daysFilter)
  }, [view, daysFilter, fetchPortfolio, fetchFlow, fetchTop])

  // Helpers
  const types = ['ALL', ...Array.from(new Set(portfolios.map(p => p.investor_type).filter(t => t && t !== '—'))).sort()]
  const filteredPortfolios = portfolios.filter(p => {
    if (filterLF !== 'ALL' && p.local_foreign !== filterLF) return false
    if (filterType !== 'ALL' && p.investor_type !== filterType) return false
    if (search && !p.investor_name.toLowerCase().includes(search.toLowerCase()) &&
        !p.holdings.some(h => h.share_code.includes(search.toUpperCase()))) return false
    return true
  })

  const stats = {
    total:    portfolios.length,
    lokal:    portfolios.filter(p => p.local_foreign === 'L').length,
    asing:    portfolios.filter(p => p.local_foreign === 'F').length,
    top:      portfolios[0]?.investor_name?.slice(0, 24) || '—',
  }

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">
            <Briefcase className="w-8 h-8 text-gold-400 inline mr-2" />
            <span className="gradient-gold">Smart Money</span> <span className="text-foreground">Tracker</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Mendeteksi pergerakan masif Paus 5% dan melacak portofolio 1%
          </p>
        </div>
        
        <div className="glass rounded-xl p-1 flex gap-1 border border-border/30">
          {[
            ['flow', '🔥 5% Flow', Activity],
            ['top', '📈 5% Top Accum', BarChart3],
            ['portfolio', '💼 1% Portfolio', Briefcase]
          ].map(([v, l, Icon]: any) => (
            <button key={v} onClick={() => setView(v)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                view === v ? 'bg-gradient-to-r from-gold-400 to-yellow-500 text-navy-900 shadow' : 'text-muted-foreground hover:text-foreground'
              }`}>
              <Icon className="w-3.5 h-3.5" />
              {l}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ═══════════════════ VIEW: 5% SMART MONEY FLOW ════════════════════════ */}
      {view === 'flow' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex justify-between items-center bg-white/[0.02] p-4 rounded-xl border border-white/[0.05]">
            <p className="text-sm text-muted-foreground">Menampilkan mutasi terbesar &ge;5% berdasarkan Nilai Transaksi.</p>
            <select value={daysFilter} onChange={e => setDaysFilter(Number(e.target.value))}
              className="bg-[#0f172a] border border-white/[0.1] rounded-lg px-3 py-1.5 text-xs text-white">
              <option value={1}>1 Hari Terakhir</option>
              <option value={3}>3 Hari Terakhir</option>
              <option value={7}>7 Hari Terakhir</option>
              <option value={30}>30 Hari Terakhir</option>
            </select>
          </div>

          <div className="glass rounded-2xl overflow-hidden border border-border/30">
            {loading ? (
              <div className="h-64 flex items-center justify-center">
                <RefreshCw className="w-6 h-6 animate-spin text-gold-400" />
              </div>
            ) : flowData.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-muted-foreground">Tidak ada mutasi 5% pada periode ini.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-white/[0.02] border-b border-border/30 text-muted-foreground">
                    <tr>
                      <th className="px-5 py-4 font-medium">Tanggal</th>
                      <th className="px-5 py-4 font-medium">Saham</th>
                      <th className="px-5 py-4 font-medium">Investor</th>
                      <th className="px-5 py-4 font-medium">Konglomerasi</th>
                      <th className="px-5 py-4 font-medium">Broker</th>
                      <th className="px-5 py-4 font-medium text-center">Aksi</th>
                      <th className="px-5 py-4 font-medium text-right">Vol (Lembar)</th>
                      <th className="px-5 py-4 font-medium text-right text-gold-400">Nilai (Rp)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {flowData.map((d, i) => {
                      const isAcc = d.aksi === 'Buying' || d.aksi === 'Accumulation';
                      return (
                        <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-5 py-4 text-xs text-muted-foreground">
                            {new Date(d.tanggal_data).toLocaleDateString('id-ID')}
                          </td>
                          <td className="px-5 py-4 font-bold text-foreground">
                            <Link href={`/stock/${d.kode_efek}`} className="hover:text-gold-400">{d.kode_efek}</Link>
                          </td>
                          <td className="px-5 py-4 truncate max-w-[200px]" title={d.nama_pemegang_saham}>
                            {d.nama_pemegang_saham}
                          </td>
                          <td className="px-5 py-4 text-xs text-blue-400 font-medium">
                            {d.konglomerasi !== '-' ? d.konglomerasi : ''}
                          </td>
                          <td className="px-5 py-4 text-xs text-muted-foreground">
                            {d.kode_broker}
                          </td>
                          <td className="px-5 py-4 text-center">
                            <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                              isAcc ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                            }`}>
                              {d.aksi}
                            </span>
                          </td>
                          <td className={`px-5 py-4 text-right font-mono text-xs ${isAcc ? 'text-emerald-400' : 'text-red-400'}`}>
                            {isAcc ? '+' : '-'}{formatNumber(d.perubahan_saham)}
                          </td>
                          <td className="px-5 py-4 text-right font-mono font-bold text-gold-400">
                            {formatRupiah(d.transaction_value)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════ VIEW: 5% TOP ACCUMULATED STOCKS ════════════════════ */}
      {view === 'top' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
           <div className="flex justify-between items-center bg-white/[0.02] p-4 rounded-xl border border-white/[0.05]">
            <p className="text-sm text-muted-foreground">Saham yang paling banyak diakumulasi oleh pemegang saham 5% (Berdasarkan Net Value).</p>
            <select value={daysFilter} onChange={e => setDaysFilter(Number(e.target.value))}
              className="bg-[#0f172a] border border-white/[0.1] rounded-lg px-3 py-1.5 text-xs text-white">
              <option value={1}>1 Hari Terakhir</option>
              <option value={3}>3 Hari Terakhir</option>
              <option value={7}>7 Hari Terakhir</option>
              <option value={30}>30 Hari Terakhir</option>
            </select>
          </div>

          <div className="glass rounded-2xl overflow-hidden border border-border/30">
            {loading ? (
              <div className="h-64 flex items-center justify-center">
                <RefreshCw className="w-6 h-6 animate-spin text-gold-400" />
              </div>
            ) : topData.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-muted-foreground">Tidak ada mutasi 5% pada periode ini.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-white/[0.02] border-b border-border/30 text-muted-foreground">
                    <tr>
                      <th className="px-5 py-4 font-medium">Saham</th>
                      <th className="px-5 py-4 font-medium text-right text-emerald-400">Total Beli (Rp)</th>
                      <th className="px-5 py-4 font-medium text-right text-red-400">Total Jual (Rp)</th>
                      <th className="px-5 py-4 font-medium text-right text-gold-400">Net Value (Rp)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {topData.map((d, i) => {
                      const isNetBuy = Number(d.net_value) > 0;
                      return (
                        <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-5 py-4 font-bold text-foreground text-lg">
                            <Link href={`/stock/${d.kode_efek}`} className="hover:text-gold-400">{d.kode_efek}</Link>
                          </td>
                          <td className="px-5 py-4 text-right font-mono text-emerald-400">
                            {formatRupiah(d.total_accumulation)}
                          </td>
                          <td className="px-5 py-4 text-right font-mono text-red-400">
                            {formatRupiah(d.total_reduction)}
                          </td>
                          <td className={`px-5 py-4 text-right font-mono font-black ${isNetBuy ? 'text-gold-400' : 'text-red-500'}`}>
                            {isNetBuy ? '+' : ''}{formatRupiah(d.net_value)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════ VIEW: 1% PORTFOLIO ════════════════════════════════ */}
      {view === 'portfolio' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Whale', value: stats.total,  color: 'text-foreground',   icon: Users     },
              { label: 'Lokal',       value: stats.lokal,  color: 'text-emerald-400',  icon: Building2 },
              { label: 'Asing',       value: stats.asing,  color: 'text-blue-400',     icon: Globe     },
              { label: 'Most Diversified', value: stats.top, color: 'text-gold-400',   icon: Eye       },
            ].map((m,i) => { const Icon = m.icon; return (
              <div key={i} className="glass rounded-2xl p-4 border border-border/30 card-hover">
                <Icon className={`w-4 h-4 ${m.color} mb-2`} />
                <p className="text-[10px] text-muted-foreground uppercase">{m.label}</p>
                <p className={`text-xl font-black mt-1 ${m.color} ${i===3?'text-sm truncate':''}`}>{m.value}</p>
              </div>
            )})}
          </div>

          <div className="flex gap-3 flex-wrap">
            <div className="glass rounded-xl p-3 border border-border/30 flex items-center gap-3 flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <input type="text" placeholder="Cari nama investor atau saham..." value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-sm focus:outline-none" />
              {search && <button onClick={() => setSearch('')}><X className="w-4 h-4 text-muted-foreground" /></button>}
            </div>
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              className="bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-xs">
              {types.map(t => <option key={t} value={t}>{t === 'ALL' ? 'Semua Tipe' : t}</option>)}
            </select>
            <span className="flex items-center text-xs text-muted-foreground px-2">{filteredPortfolios.length} investor</span>
          </div>

          {loading ? (
            <div className="space-y-3">{Array.from({length:6}).map((_,i) => <div key={i} className="shimmer h-24 rounded-xl" />)}</div>
          ) : filteredPortfolios.length === 0 ? (
            <div className="glass rounded-xl p-12 text-center text-muted-foreground">
              <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="font-bold">Tidak ada data</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPortfolios.map((p, i) => (
                <div key={p.investor_name}
                  className="glass rounded-xl border border-border/30 hover:border-gold-400/20 transition-all overflow-hidden">
                  <button
                    className="w-full flex items-center gap-4 p-4 text-left hover:bg-white/[0.02] transition-colors"
                    onClick={() => setExpanded(expanded === p.investor_name ? null : p.investor_name)}
                  >
                    <span className="text-[11px] text-muted-foreground w-6 text-center flex-shrink-0">{i+1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-foreground text-sm truncate">{p.investor_name}</p>
                      <p className="text-[10px] text-muted-foreground">{p.investor_type}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ${p.local_foreign==='F'?'bg-blue-500/20 text-blue-400':'bg-emerald-500/20 text-emerald-400'}`}>
                      {p.local_foreign==='F'?'🌏 Asing':'🇮🇩 Lokal'}
                    </span>
                    <div className="text-right flex-shrink-0">
                      <p className="font-black text-gold-400">{p.total_stocks} saham</p>
                      <p className="text-[10px] text-muted-foreground">Max: {p.max_pct.toFixed(2)}% {p.top_stock}</p>
                    </div>
                    <span className={`text-muted-foreground transition-transform duration-200 ${expanded===p.investor_name?'rotate-180':''}`}>▼</span>
                  </button>

                  {expanded === p.investor_name && (
                    <div className="border-t border-white/[0.05] p-4 animate-fade-in">
                      <p className="text-[10px] text-muted-foreground uppercase mb-3">Portofolio ({p.holdings.length} emiten)</p>
                      <div className="flex flex-wrap gap-2">
                        {p.holdings.map(h => (
                          <Link key={h.share_code} href={`/stock/${h.share_code}`}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] hover:border-gold-400/30 hover:bg-gold-400/10 transition-all group">
                            <span className="font-mono font-black text-xs text-foreground group-hover:text-gold-400 transition-colors">{h.share_code}</span>
                            <span className={`text-[10px] font-bold ${h.percentage >= 5 ? 'text-amber-400' : 'text-muted-foreground'}`}>
                              {h.percentage.toFixed(2)}%
                            </span>
                            {h.percentage >= 5 && <span className="text-[9px] text-amber-400">★</span>}
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
      )}

    </div>
  )
}
