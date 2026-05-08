'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatPercent } from '@/lib/utils'
import { Briefcase, RefreshCw, Search, X, AlertTriangle, Globe, Building2, Users, TrendingUp, TrendingDown, Eye } from 'lucide-react'
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
  const [portfolios, setPortfolios] = useState<WhalePortfolio[]>([])
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string|null>(null)
  const [search, setSearch]         = useState('')
  const [filterLF, setFilterLF]     = useState('ALL')
  const [filterType, setFilterType] = useState('ALL')
  const [reportDate, setReportDate] = useState('')
  const [expanded, setExpanded]     = useState<string|null>(null)

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

      // Group by investor
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

      // Sort by diversification (most stocks first), then by max pct
      const list = Array.from(map.values())
        .map(p => ({ ...p, holdings: p.holdings.sort((a,b) => b.percentage - a.percentage) }))
        .sort((a, b) => b.total_stocks - a.total_stocks || b.max_pct - a.max_pct)
      setPortfolios(list)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchPortfolio() }, [fetchPortfolio])

  const types = ['ALL', ...Array.from(new Set(portfolios.map(p => p.investor_type).filter(t => t && t !== '—'))).sort()]

  const filtered = portfolios.filter(p => {
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
            <span className="gradient-gold">Whale</span> <span className="text-foreground">Portfolio</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Portofolio semua pemegang ≥1% · KSEI · As of {reportDate}
          </p>
        </div>
        <div className="flex gap-3">
          <div className="glass rounded-xl p-1 flex gap-1 border border-border/30">
            {[['ALL','Semua'],['L','🇮🇩 Lokal'],['F','🌏 Asing']].map(([v,l]) => (
              <button key={v} onClick={() => setFilterLF(v)}
                className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${filterLF===v?'bg-gradient-to-r from-gold-400 to-yellow-500 text-navy-900':'text-muted-foreground hover:text-foreground'}`}>{l}</button>
            ))}
          </div>
          <button onClick={fetchPortfolio} disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gold-400/10 border border-gold-400/30 text-gold-400 text-sm font-bold">
            <RefreshCw className={`w-4 h-4 ${loading?'animate-spin':''}`} />
          </button>
        </div>
      </div>

      {/* Stats */}
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

      {/* Filter Bar */}
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
        <span className="flex items-center text-xs text-muted-foreground px-2">{filtered.length} investor</span>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Portfolio Cards */}
      {loading ? (
        <div className="space-y-3">{Array.from({length:6}).map((_,i) => <div key={i} className="shimmer h-24 rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-xl p-12 text-center text-muted-foreground">
          <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-bold">Tidak ada data</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p, i) => (
            <div key={p.investor_name}
              className="glass rounded-xl border border-border/30 hover:border-gold-400/20 transition-all overflow-hidden">
              {/* Header row — clickable to expand */}
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

              {/* Expanded holdings */}
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
      <p className="text-center text-[11px] text-muted-foreground">
        Menampilkan {filtered.length} dari {portfolios.length} investor · Klik baris untuk expand portofolio
      </p>
    </div>
  )
}
