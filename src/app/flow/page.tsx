'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatRupiah, formatPercent, formatNumber, formatShares } from '@/lib/utils'
import {
  TrendingUp, TrendingDown, RefreshCw, Search, X, AlertTriangle,
  Globe, Building2, Activity, BarChart3, Zap, ArrowRightLeft,
  Calendar, Filter, ChevronDown
} from 'lucide-react'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────
interface KseiFlow {
  kode_efek:         string
  nama_efek?:        string
  aksi:              string
  transaction_value: number
  net_change:        number
  konglomerasi?:     string
  broker_name?:      string
  current_price?:    number
  price_change_pct?: number
  whale_signal?:     boolean
  market_signal?:    string
}

interface KongloSummary {
  konglo:      string
  stock:       string
  entity:      string
  net_change:  number
  net_value:   number
  action?:     string
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function FlowPage() {
  const [flowData, setFlowData]     = useState<KseiFlow[]>([])
  const [kongloData, setKongloData] = useState<KongloSummary[]>([])
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [search, setSearch]         = useState('')
  const [filterAksi, setFilterAksi] = useState('ALL')
  const [view, setView]             = useState<'flow' | 'konglo'>('flow')
  const [latestDate, setLatestDate] = useState('')
  const [windowDays, setWindowDays] = useState(30)

  // ── Fetch 5% Flow ───────────────────────────────────────────────────────────
  const fetchFlow = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      // Get latest date
      const { data: dateData } = await supabase
        .from('ksei_data5_mutasi')
        .select('tanggal_data')
        .order('tanggal_data', { ascending: false })
        .limit(1)
      const date = dateData?.[0]?.tanggal_data
      if (date) setLatestDate(date)

      const { data, error: e } = await supabase.rpc('get_ksei5_flow_summary', {
        p_start_date: (() => {
          const d = new Date(); d.setDate(d.getDate() - windowDays)
          return d.toISOString().split('T')[0]
        })(),
        p_aksi_filter: filterAksi === 'ALL' ? null : filterAksi,
        p_limit: 200,
      })
      if (e) throw e
      setFlowData(data || [])
    } catch (e: any) {
      // Fallback: direct table query
      try {
        const { data: dateData } = await supabase
          .from('ksei_data5_mutasi')
          .select('tanggal_data')
          .order('tanggal_data', { ascending: false })
          .limit(1)
        const date = dateData?.[0]?.tanggal_data
        if (!date) return

        const startDate = new Date(date)
        startDate.setDate(startDate.getDate() - windowDays)

        let q = supabase
          .from('ksei_data5_mutasi')
          .select('kode_efek,aksi,transaction_value,konglomerasi,broker_name')
          .gte('tanggal_data', startDate.toISOString().split('T')[0])
          .in('aksi', filterAksi === 'ALL' ? ['Buying','Accumulation','Reduction'] : [filterAksi])
          .order('transaction_value', { ascending: false })
          .limit(200)

        const { data: raw } = await q

        // Aggregate by kode_efek
        const map = new Map<string, KseiFlow>()
        ;(raw || []).forEach((r: any) => {
          const tv = Number(r.transaction_value) || 0
          if (!map.has(r.kode_efek)) {
            map.set(r.kode_efek, { kode_efek: r.kode_efek, aksi: r.aksi, transaction_value: 0, net_change: 0, konglomerasi: r.konglomerasi, broker_name: r.broker_name })
          }
          const item = map.get(r.kode_efek)!
          item.transaction_value += tv
          if (r.aksi === 'Buying' || r.aksi === 'Accumulation') item.net_change += tv
          else if (r.aksi === 'Reduction') item.net_change -= tv
        })
        setFlowData(Array.from(map.values()).sort((a, b) => Math.abs(b.net_change) - Math.abs(a.net_change)))
      } catch (e2: any) { setError(e2.message) }
    } finally { setLoading(false) }
  }, [filterAksi, windowDays])

  // ── Fetch Konglo ────────────────────────────────────────────────────────────
  const fetchKonglo = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const startDate = new Date(); startDate.setDate(startDate.getDate() - windowDays)
      const { data, error: e } = await supabase.rpc('get_ksei5_konglo_summary', {
        start_date: startDate.toISOString().split('T')[0],
      })
      if (e) throw e
      setKongloData(data || [])
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [windowDays])

  useEffect(() => {
    if (view === 'flow') fetchFlow(); else fetchKonglo()
  }, [view, fetchFlow, fetchKonglo])

  // ── Derived: Flow ────────────────────────────────────────────────────────────
  const filteredFlow = flowData.filter(r =>
    !search || r.kode_efek.toUpperCase().includes(search.toUpperCase()) ||
    r.konglomerasi?.toLowerCase().includes(search.toLowerCase())
  )

  const totalBuy  = flowData.filter(r => r.net_change > 0).reduce((s, r) => s + r.net_change, 0)
  const totalSell = flowData.filter(r => r.net_change < 0).reduce((s, r) => s + Math.abs(r.net_change), 0)
  const topBuyers  = filteredFlow.filter(r => r.net_change > 0).sort((a, b) => b.net_change - a.net_change).slice(0, 10)
  const topSellers = filteredFlow.filter(r => r.net_change < 0).sort((a, b) => a.net_change - b.net_change).slice(0, 10)

  // ── Derived: Konglo ──────────────────────────────────────────────────────────
  const kongloMap = new Map<string, { name: string; stocks: string[]; net: number; value: number }>()
  kongloData.forEach(r => {
    if (!r.konglo || r.konglo === '-') return
    if (!kongloMap.has(r.konglo)) kongloMap.set(r.konglo, { name: r.konglo, stocks: [], net: 0, value: 0 })
    const g = kongloMap.get(r.konglo)!
    if (!g.stocks.includes(r.stock)) g.stocks.push(r.stock)
    g.net += Number(r.net_change) || 0
    g.value += Number(r.net_value) || 0
  })
  const kongloList = Array.from(kongloMap.values()).sort((a, b) => Math.abs(b.net) - Math.abs(a.net))

  const chartData = kongloList.slice(0, 12).map(k => ({
    name: k.name.slice(0, 16), net: k.net, value: k.value
  }))

  return (
    <div className="space-y-6 animate-fade-in pb-10">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">
            <span className="gradient-gold">5%</span>{' '}
            <span className="text-foreground">Flow Tracker</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Monitoring kepemilikan ≥5% &amp; konglomerasi lintas emiten IDX
            {latestDate && <span className="ml-2 text-[11px] opacity-60">· Latest: {latestDate}</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="glass rounded-xl p-1 flex gap-1 border border-border/30">
            {([['flow','📊 5% Flow'],['konglo','🏢 Konglomerat']] as const).map(([v, label]) => (
              <button key={v} onClick={() => setView(v)}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  view === v ? 'bg-gradient-to-r from-gold-400 to-yellow-500 text-navy-900 shadow' : 'text-muted-foreground hover:text-foreground'
                }`}>{label}</button>
            ))}
          </div>
          {/* Window Selector */}
          <select value={windowDays} onChange={e => setWindowDays(Number(e.target.value))}
            className="bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-xs">
            <option value={7}>7 Hari</option>
            <option value={14}>14 Hari</option>
            <option value={30}>30 Hari</option>
            <option value={60}>60 Hari</option>
          </select>
          <button onClick={() => view === 'flow' ? fetchFlow() : fetchKonglo()} disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gold-400/10 border border-gold-400/30 text-gold-400 hover:bg-gold-400/20 text-sm font-bold">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Stats ─────────────────────────────────────────────────────────── */}
      {view === 'flow' ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Emiten Aktif',  value: new Set(flowData.map(r => r.kode_efek)).size, color: 'text-foreground',  icon: Activity   },
            { label: 'Total Buying',  value: formatRupiah(totalBuy),   color: 'text-emerald-400', icon: TrendingUp  },
            { label: 'Total Selling', value: formatRupiah(totalSell),  color: 'text-red-400',     icon: TrendingDown},
            { label: 'Net Flow',      value: formatRupiah(totalBuy - totalSell), color: (totalBuy - totalSell) >= 0 ? 'text-emerald-400' : 'text-red-400', icon: ArrowRightLeft },
          ].map((m, i) => { const Icon = m.icon; return (
            <div key={i} className="glass rounded-2xl p-5 border border-border/30 card-hover">
              <Icon className={`w-5 h-5 ${m.color} mb-3`} />
              <p className="text-xs text-muted-foreground uppercase">{m.label}</p>
              <p className={`text-xl font-black mt-1 ${m.color}`}>{m.value}</p>
            </div>
          )})}</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Konglomerat',  value: kongloList.length,                                                       color: 'text-foreground',   icon: Building2   },
            { label: 'Net Buyers',   value: kongloList.filter(k => k.net > 0).length,                                color: 'text-emerald-400',  icon: TrendingUp  },
            { label: 'Net Sellers',  value: kongloList.filter(k => k.net < 0).length,                                color: 'text-red-400',      icon: TrendingDown},
            { label: 'Total Emiten', value: new Set(kongloData.map(r => r.stock)).size,                              color: 'text-gold-400',     icon: Activity    },
          ].map((m, i) => { const Icon = m.icon; return (
            <div key={i} className="glass rounded-2xl p-5 border border-border/30 card-hover">
              <Icon className={`w-5 h-5 ${m.color} mb-3`} />
              <p className="text-xs text-muted-foreground uppercase">{m.label}</p>
              <p className={`text-2xl font-black mt-1 ${m.color}`}>{m.value}</p>
            </div>
          )})}</div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ═══════════════════════ VIEW: 5% FLOW ═══════════════════════════ */}
      {view === 'flow' && (
        loading ? (
          <div className="space-y-2">{Array.from({length:6}).map((_,i) => <div key={i} className="shimmer h-14 rounded-xl" />)}</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Buyers */}
            <div className="glass rounded-2xl overflow-hidden border border-emerald-500/20">
              <div className="p-4 border-b border-white/[0.05] flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-emerald-400">Top Akumulasi ({windowDays}D)</h3>
                <span className="ml-auto text-xs text-muted-foreground">{topBuyers.length} emiten</span>
              </div>
              {topBuyers.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10px] text-muted-foreground uppercase border-b border-white/[0.05]">
                        <th className="p-3 text-left">Emiten</th>
                        <th className="p-3 text-right">Net Value</th>
                        <th className="p-3 text-left hidden md:table-cell">Konglomerat</th>
                        <th className="p-3 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topBuyers.map((r, i) => (
                        <tr key={i} className="tr-hover border-b border-white/[0.02]">
                          <td className="p-3">
                            <Link href={`/stock/${r.kode_efek}`} className="font-mono font-black text-foreground hover:text-gold-400 transition-colors">
                              {r.kode_efek}
                            </Link>
                          </td>
                          <td className="p-3 text-right font-bold text-emerald-400">
                            +{formatRupiah(r.net_change)}
                          </td>
                          <td className="p-3 hidden md:table-cell">
                            {r.konglomerasi && r.konglomerasi !== '-' ? (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-gold-400/10 text-gold-400 font-bold">
                                {r.konglomerasi.slice(0, 20)}
                              </span>
                            ) : <span className="text-muted-foreground text-[10px]">—</span>}
                          </td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              r.aksi === 'Buying' ? 'signal-strong-buy' : 'signal-watch'
                            }`}>{r.aksi}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground text-sm">Tidak ada data akumulasi</div>
              )}
            </div>

            {/* Top Sellers */}
            <div className="glass rounded-2xl overflow-hidden border border-red-500/20">
              <div className="p-4 border-b border-white/[0.05] flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-red-400" />
                <h3 className="font-bold text-red-400">Top Distribusi ({windowDays}D)</h3>
                <span className="ml-auto text-xs text-muted-foreground">{topSellers.length} emiten</span>
              </div>
              {topSellers.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10px] text-muted-foreground uppercase border-b border-white/[0.05]">
                        <th className="p-3 text-left">Emiten</th>
                        <th className="p-3 text-right">Net Value</th>
                        <th className="p-3 text-left hidden md:table-cell">Konglomerat</th>
                        <th className="p-3 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topSellers.map((r, i) => (
                        <tr key={i} className="tr-hover border-b border-white/[0.02]">
                          <td className="p-3">
                            <Link href={`/stock/${r.kode_efek}`} className="font-mono font-black text-foreground hover:text-gold-400 transition-colors">
                              {r.kode_efek}
                            </Link>
                          </td>
                          <td className="p-3 text-right font-bold text-red-400">
                            {formatRupiah(r.net_change)}
                          </td>
                          <td className="p-3 hidden md:table-cell">
                            {r.konglomerasi && r.konglomerasi !== '-' ? (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-gold-400/10 text-gold-400 font-bold">
                                {r.konglomerasi.slice(0, 20)}
                              </span>
                            ) : <span className="text-muted-foreground text-[10px]">—</span>}
                          </td>
                          <td className="p-3 text-center">
                            <span className="signal-avoid px-2 py-0.5 rounded-full text-[10px] font-bold">Reduction</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground text-sm">Tidak ada data distribusi</div>
              )}
            </div>
          </div>
        )
      )}

      {/* ═══════════════════ VIEW: KONGLOMERAT ═══════════════════════════ */}
      {view === 'konglo' && (
        loading ? (
          <div className="space-y-2">{Array.from({length:5}).map((_,i) => <div key={i} className="shimmer h-20 rounded-xl" />)}</div>
        ) : kongloList.length === 0 ? (
          <div className="glass rounded-xl p-16 text-center text-muted-foreground">
            <Building2 className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p className="font-bold">Tidak ada data konglomerasi</p>
            <p className="text-xs mt-1">Pastikan kolom `konglomerasi` sudah diisi di ksei_data5_mutasi</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Bar Chart */}
            <div className="glass rounded-2xl p-6 border border-border/30">
              <h3 className="font-bold mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-gold-400" /> Net Position per Konglomerat ({windowDays}D)
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} margin={{ top: 0, right: 10, bottom: 70, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} angle={-40} textAnchor="end" />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => formatShares(v)} />
                  <Tooltip
                    formatter={(v: any) => [formatRupiah(Number(v)), 'Net']}
                    contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                  />
                  <Bar dataKey="net" radius={[4, 4, 0, 0]}>
                    {chartData.map((d, i) => (
                      <Cell key={i} fill={d.net >= 0 ? '#22c55e' : '#ef4444'} opacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Konglo Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {kongloList.map((k, i) => (
                <Link key={k.name} href={`/konlo`}
                  className="glass rounded-xl p-5 border border-border/30 hover:border-gold-400/30 transition-all text-left group card-hover block">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-bold text-foreground group-hover:text-gold-400 transition-colors text-sm leading-tight">{k.name}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{k.stocks.length} emiten aktif</p>
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${k.net >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                      {k.net >= 0 ? '▲' : '▼'} {k.net >= 0 ? 'Akumulasi' : 'Distribusi'}
                    </span>
                  </div>
                  <div className={`flex items-center gap-2 mb-3 p-2.5 rounded-lg ${k.net >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                    {k.net >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
                    <span className={`font-black text-sm ${k.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {k.net >= 0 ? '+' : ''}{formatRupiah(k.net)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {k.stocks.slice(0, 5).map(s => (
                      <span key={s} className="text-[10px] px-2 py-0.5 rounded bg-accent/40 text-muted-foreground font-mono">{s}</span>
                    ))}
                    {k.stocks.length > 5 && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-gold-400/10 text-gold-400">+{k.stocks.length - 5}</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  )
}
