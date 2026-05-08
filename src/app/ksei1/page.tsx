'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatRupiah, formatPercent, formatNumber, formatShares } from '@/lib/utils'
import {
  Search, X, AlertTriangle, Globe, Building2, TrendingUp, TrendingDown,
  RefreshCw, Clock, Target, Users, Eye, BarChart3, Shield, Zap
} from 'lucide-react'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend
} from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Ownership {
  report_date:      string
  category:         string
  investor_count:   number
  total_shares:     number
  total_percentage: number
  top1_investor:    string
  top1_percentage:  number
}

interface TopInvestor {
  investor_name: string
  investor_type: string
  local_foreign: string
  emiten_count:  number
  total_pct:     number
}

const CAT_COLORS: Record<string, string> = {
  'Institusi Lokal': '#e7b733',
  'Individu Lokal':  '#22c55e',
  'Institusi Asing': '#3b82f6',
  'Individu Asing':  '#8b5cf6',
  'Lainnya':         '#64748b',
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Ksei1Page() {
  const [view, setView]                 = useState<'ownership' | 'investors' | 'alert' | 'scripless'>('ownership')
  const [stockSearch, setStockSearch]   = useState('AADI')
  const [inputCode, setInputCode]       = useState('AADI')
  const [ownership, setOwnership]       = useState<Ownership[]>([])
  const [institutional, setInstitutional] = useState<any[]>([])
  const [topInvestors, setTopInvestors] = useState<TopInvestor[]>([])
  const [alertData, setAlertData]       = useState<any[]>([])
  const [scriplessData, setScriplessData] = useState<any[]>([])
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [reportDate, setReportDate]     = useState('')
  const [mounted, setMounted]           = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // ── Fetch Ownership ─────────────────────────────────────────────────────────
  const fetchOwnership = useCallback(async (code: string) => {
    if (!code) return
    setLoading(true); setError(null)
    try {
      const { data, error: e } = await supabase.rpc('get_ownership_structure', {
        p_stock_code: code.toUpperCase(),
        p_date: null,
      })
      if (e) throw e
      setOwnership(data || [])
      if (data?.[0]?.report_date) setReportDate(data[0].report_date)

      const { data: instData } = await supabase.rpc('get_institutional_change', {
        p_stock_code: code.toUpperCase(),
        p_months: 6,
      })
      setInstitutional(instData || [])
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  // ── Fetch Top Investors ─────────────────────────────────────────────────────
  const fetchTopInvestors = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      // Get latest date
      const { data: dateData } = await supabase
        .from('ksei_data1persen_mutasi')
        .select('date')
        .order('date', { ascending: false })
        .limit(1)
      const date = dateData?.[0]?.date
      if (!date) return

      const { data } = await supabase
        .from('ksei_data1persen_mutasi')
        .select('investor_name,investor_type,local_foreign,share_code,percentage')
        .eq('date', date)
        .limit(5000)

      if (!data) return

      // Aggregate by investor
      const map = new Map<string, TopInvestor>()
      data.forEach((r: any) => {
        if (!map.has(r.investor_name)) {
          map.set(r.investor_name, {
            investor_name: r.investor_name,
            investor_type: r.investor_type || '—',
            local_foreign:  r.local_foreign,
            emiten_count:   0,
            total_pct:      0,
          })
        }
        const inv = map.get(r.investor_name)!
        inv.emiten_count++
        inv.total_pct += Number(r.percentage) || 0
      })

      setTopInvestors(
        Array.from(map.values())
          .sort((a, b) => b.emiten_count - a.emiten_count)
          .slice(0, 50)
      )
      if (date) setReportDate(date)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  // ── Fetch Insider Alert ──────────────────────────────────────────────────────
  const fetchAlert = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data, error: e } = await supabase.rpc('get_insider_alert', {
        p_stock_code: null,
        p_months: 3,
        p_min_pct_chg: 0.5,
      })
      if (e) throw e
      setAlertData(data || [])
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  // ── Fetch Scripless Mutation ──────────────────────────────────────────────────
  const fetchScripless = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data, error: e } = await supabase.rpc('get_scripless_mutation', {
        p_days: 30,
      })
      if (e) throw e
      setScriplessData(data || [])
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (view === 'ownership') fetchOwnership(stockSearch)
    else if (view === 'investors') fetchTopInvestors()
    else if (view === 'alert') fetchAlert()
    else if (view === 'scripless') fetchScripless()
  }, [view])

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const totalPct = ownership.reduce((s, o) => s + Number(o.total_percentage), 0)
  const pieData  = ownership.map(o => ({ name: o.category, value: Number(o.total_percentage) }))

  const instLokPct = ownership.find(o => o.category === 'Institusi Lokal')?.total_percentage || 0
  const indvLokPct = ownership.find(o => o.category === 'Individu Lokal')?.total_percentage  || 0
  const instAsPct  = ownership.find(o => o.category === 'Institusi Asing')?.total_percentage || 0

  const accumulating = institutional.filter(i => i.action === 'ACCUMULATING').length
  const reducing     = institutional.filter(i => i.action === 'REDUCING').length

  return (
    <div className="space-y-6 animate-fade-in pb-10">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">
            <span className="gradient-gold">1%</span>{' '}
            <span className="text-foreground">Ownership Tracker</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Analisis kepemilikan ≥1% dari KSEI C01 — identifikasi whale, insider, &amp; konsentrasi
            {reportDate && <span className="ml-2 text-[11px] opacity-60">· As of {reportDate}</span>}
          </p>
        </div>
        <div className="glass rounded-xl p-1 flex gap-1 border border-border/30">
          {([
            ['ownership', '🏛️ Per Saham'],
            ['investors', '👤 Top Investor'],
            ['alert',     '🚨 Insider Alert'],
            ['scripless', '⚡ Scripless Scanner'],
          ] as const).map(([v, label]) => (
            <button key={v} onClick={() => setView(v)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                view === v ? 'bg-gradient-to-r from-gold-400 to-yellow-500 text-navy-900 shadow' : 'text-muted-foreground hover:text-foreground'
              }`}>{label}</button>
          ))}
        </div>
      </div>

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ═══════════════════ VIEW: PER SAHAM ════════════════════════════ */}
      {view === 'ownership' && (
        <div className="space-y-6">
          {/* Stock Search */}
          <div className="glass rounded-xl p-4 border border-border/30 flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Masukkan kode saham (contoh: AADI, BBCA, TLKM)..."
                value={inputCode}
                onChange={e => setInputCode(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter' && inputCode.length >= 2) { setStockSearch(inputCode); fetchOwnership(inputCode) }}}
                className="w-full pl-10 pr-4 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-xl text-sm uppercase focus:outline-none focus:border-gold-400/30"
                maxLength={6}
              />
            </div>
            <button
              onClick={() => { setStockSearch(inputCode); fetchOwnership(inputCode) }}
              disabled={loading || inputCode.length < 2}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gold-400/10 border border-gold-400/30 text-gold-400 hover:bg-gold-400/20 text-sm font-bold disabled:opacity-50"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Analisis
            </button>
          </div>

          {!loading && ownership.length > 0 && (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Total Tercatat', value: `${totalPct.toFixed(1)}%`, sub: 'dari total saham', color: 'text-foreground',  icon: Eye     },
                  { label: 'Institusi Lokal',value: `${Number(instLokPct).toFixed(1)}%`, sub: ownership.find(o=>o.category==='Institusi Lokal')?.top1_investor?.slice(0,18), color: 'text-amber-400',   icon: Building2 },
                  { label: 'Individu Lokal', value: `${Number(indvLokPct).toFixed(1)}%`, sub: ownership.find(o=>o.category==='Individu Lokal')?.top1_investor?.slice(0,18),  color: 'text-emerald-400', icon: Users   },
                  { label: 'Institusi Asing',value: `${Number(instAsPct).toFixed(1)}%`,  sub: ownership.find(o=>o.category==='Institusi Asing')?.top1_investor?.slice(0,18), color: 'text-blue-400',    icon: Globe   },
                ].map((m, i) => { const Icon = m.icon; return (
                  <div key={i} className="glass rounded-2xl p-5 border border-border/30 card-hover">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[10px] text-muted-foreground uppercase">{m.label}</p>
                      <Icon className={`w-4 h-4 ${m.color}`} />
                    </div>
                    <p className={`text-3xl font-black ${m.color}`}>{m.value}</p>
                    {m.sub && <p className="text-[10px] text-muted-foreground mt-1 truncate">{m.sub}</p>}
                  </div>
                )})}
              </div>

              {/* Chart + Detail */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Donut Pie */}
                <div className="glass rounded-2xl p-6 border border-border/30">
                  <h3 className="font-bold mb-4 flex items-center gap-2">
                    <Target className="w-5 h-5 text-gold-400" /> Komposisi Kepemilikan
                    <span className="ml-auto text-xs text-muted-foreground font-normal">{stockSearch}</span>
                  </h3>
                  {!mounted ? (
                    <div className="shimmer rounded-xl" style={{ height: 220 }} />
                  ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                        paddingAngle={3} dataKey="value" label={({ name, value }) => `${value?.toFixed(1)}%`}
                        labelLine={false}>
                        {pieData.map((entry, i) => (
                          <Cell key={i} fill={CAT_COLORS[entry.name] || '#64748b'} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => [`${Number(v).toFixed(2)}%`, 'Kepemilikan']}
                        contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                      <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs">{v}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                  )}
                </div>

                {/* Category Detail */}
                <div className="glass rounded-2xl p-6 border border-border/30">
                  <h3 className="font-bold mb-4 flex items-center gap-2">
                    <Shield className="w-5 h-5 text-gold-400" /> Detail per Kategori
                  </h3>
                  <div className="space-y-4">
                    {ownership.map((cat, i) => (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: CAT_COLORS[cat.category] || '#64748b' }} />
                            <span className="text-sm font-bold">{cat.category}</span>
                            <span className="text-[10px] text-muted-foreground">({cat.investor_count} investor)</span>
                          </div>
                          <span className="font-black text-sm" style={{ color: CAT_COLORS[cat.category] || '#94a3b8' }}>
                            {Number(cat.total_percentage).toFixed(2)}%
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-white/[0.05] overflow-hidden mb-1">
                          <div className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${totalPct > 0 ? (Number(cat.total_percentage) / totalPct) * 100 : 0}%`, background: CAT_COLORS[cat.category] || '#64748b', opacity: 0.8 }} />
                        </div>
                        <p className="text-[10px] text-gold-400 font-semibold truncate">
                          Top: {cat.top1_investor} ({Number(cat.top1_percentage).toFixed(2)}%)
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Institutional Change Timeline */}
                {institutional.length > 0 && (
                  <div className="glass rounded-2xl p-6 border border-border/30 lg:col-span-2">
                    <h3 className="font-bold mb-1 flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-purple-400" /> Institutional Change (6M)
                    </h3>
                    <div className="flex gap-3 mb-4 text-xs">
                      <span className="text-emerald-400 font-bold">↑ {accumulating} accumulating</span>
                      <span className="text-red-400 font-bold">↓ {reducing} reducing</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {institutional
                        .filter(i => i.action !== 'HOLDING' && i.action !== 'NEW_ENTRY')
                        .slice(0, 12)
                        .map((item: any, i: number) => (
                          <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] transition-colors border border-white/[0.05]">
                            <div className="flex-1 min-w-0 pr-2">
                              <p className="text-xs font-bold text-foreground truncate">{item.investor_name}</p>
                              <p className="text-[10px] text-muted-foreground">{item.investor_type} · {item.report_date}</p>
                            </div>
                            <div className="text-right">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                item.action === 'ACCUMULATING' ? 'bg-emerald-500/20 text-emerald-400' :
                                item.action === 'REDUCING'     ? 'bg-red-500/20 text-red-400' :
                                'bg-slate-500/20 text-slate-400'
                              }`}>{item.action}</span>
                              <p className={`text-xs font-bold mt-1 ${Number(item.pct_point_change) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {Number(item.pct_point_change) >= 0 ? '+' : ''}{Number(item.pct_point_change)?.toFixed(2)}%
                              </p>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {!loading && ownership.length === 0 && stockSearch && (
            <div className="glass rounded-xl p-16 text-center text-muted-foreground">
              <Eye className="w-16 h-16 mx-auto mb-4 opacity-20" />
              <p className="font-bold">Tidak ada data kepemilikan untuk {stockSearch}</p>
              <p className="text-xs mt-1">Saham ini mungkin tidak memiliki pemegang ≥1% di KSEI</p>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════ VIEW: TOP INVESTORS ════════════════════════ */}
      {view === 'investors' && (
        loading ? (
          <div className="space-y-2">{Array.from({length:8}).map((_,i) => <div key={i} className="shimmer h-14 rounded-xl" />)}</div>
        ) : (
          <div className="glass rounded-2xl overflow-hidden border border-border/30">
            <div className="p-4 border-b border-white/[0.05] flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-2">
                <Users className="w-5 h-5 text-gold-400" /> Top Investor by Diversifikasi
              </h3>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="w-3.5 h-3.5" /> As of {reportDate}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/[0.02] border-b border-white/[0.05] text-[10px] text-muted-foreground uppercase">
                    <th className="p-4 text-left">#</th>
                    <th className="p-4 text-left">Investor</th>
                    <th className="p-4 text-center">L/F</th>
                    <th className="p-4 text-left hidden md:table-cell">Tipe</th>
                    <th className="p-4 text-right">Jumlah Emiten</th>
                    <th className="p-4 text-right hidden md:table-cell">Total %</th>
                  </tr>
                </thead>
                <tbody>
                  {topInvestors.map((inv, i) => (
                    <tr key={i} className="tr-hover border-b border-white/[0.02]">
                      <td className="p-4 text-[11px] text-muted-foreground">{i + 1}</td>
                      <td className="p-4">
                        <p className="font-bold text-foreground text-sm">{inv.investor_name}</p>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          inv.local_foreign === 'F' ? 'bg-blue-500/20 text-blue-400' : 'bg-emerald-500/20 text-emerald-400'
                        }`}>
                          {inv.local_foreign === 'F' ? '🌏 Asing' : '🇮🇩 Lokal'}
                        </span>
                      </td>
                      <td className="p-4 hidden md:table-cell">
                        <span className="text-[11px] text-muted-foreground">{inv.investor_type}</span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="hidden md:flex gap-0.5">
                            {Array.from({ length: Math.min(inv.emiten_count, 10) }).map((_, j) => (
                              <span key={j} className="w-1.5 h-1.5 rounded-full bg-gold-400 opacity-70" />
                            ))}
                            {inv.emiten_count > 10 && <span className="text-[10px] text-gold-400">+</span>}
                          </div>
                          <span className="font-black text-gold-400 text-lg">{inv.emiten_count}</span>
                        </div>
                      </td>
                      <td className="p-4 text-right hidden md:table-cell">
                        <span className="font-semibold">{inv.total_pct.toFixed(2)}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-white/[0.05] text-xs text-muted-foreground">
              Menampilkan {topInvestors.length} investor terdiversifikasi · Diurutkan berdasarkan jumlah emiten
            </div>
          </div>
        )
      )}

      {/* ═══════════════════ VIEW: INSIDER ALERT ════════════════════════ */}
      {view === 'alert' && (
        <div className="space-y-4">
          <div className="glass rounded-xl p-4 border border-amber-500/20 flex items-center gap-3">
            <Zap className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-amber-400">Tentang Insider Alert</p>
              <p className="text-xs text-muted-foreground">
                Mendeteksi perubahan kepemilikan ≥0.5% oleh individu (≥1% KSEI). Karena data KSEI saat ini hanya 1 snapshot (Apr 2026), alert akan aktif saat data multi-periode tersedia.
              </p>
            </div>
          </div>
          {loading ? (
            <div className="space-y-2">{Array.from({length:4}).map((_,i) => <div key={i} className="shimmer h-16 rounded-xl" />)}</div>
          ) : alertData.length === 0 ? (
            <div className="glass rounded-xl p-16 text-center text-muted-foreground">
              <Shield className="w-16 h-16 mx-auto mb-4 opacity-20" />
              <p className="font-bold">Belum ada Insider Alert</p>
              <p className="text-xs mt-1">Alert akan muncul saat KSEI snapshot bulan berikutnya tersedia untuk dibandingkan</p>
            </div>
          ) : (
            <div className="glass rounded-2xl overflow-hidden border border-border/30">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white/[0.02] border-b border-white/[0.05] text-[10px] text-muted-foreground uppercase">
                      <th className="p-4 text-left">Investor</th>
                      <th className="p-4 text-left">Saham</th>
                      <th className="p-4 text-right">Sebelum</th>
                      <th className="p-4 text-right">Sekarang</th>
                      <th className="p-4 text-right">Δ%</th>
                      <th className="p-4 text-center">Aksi</th>
                      <th className="p-4 text-center">Level</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alertData.map((a: any, i: number) => (
                      <tr key={i} className="tr-hover border-b border-white/[0.02]">
                        <td className="p-4 max-w-[160px]">
                          <p className="font-bold text-sm truncate">{a.investor_name}</p>
                          <p className="text-[10px] text-muted-foreground">{a.investor_type}</p>
                        </td>
                        <td className="p-4">
                          <Link href={`/stock/${a.share_code}`} className="font-mono font-black text-foreground hover:text-gold-400 transition-colors">
                            {a.share_code}
                          </Link>
                        </td>
                        <td className="p-4 text-right text-muted-foreground">{Number(a.prev_percentage).toFixed(2)}%</td>
                        <td className="p-4 text-right font-bold">{Number(a.curr_percentage).toFixed(2)}%</td>
                        <td className={`p-4 text-right font-black ${Number(a.pct_point_change) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {Number(a.pct_point_change) >= 0 ? '+' : ''}{Number(a.pct_point_change).toFixed(2)}%
                        </td>
                        <td className="p-4 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            a.action === 'BUYING' ? 'signal-strong-buy' : a.action === 'SELLING' ? 'signal-avoid' : 'signal-neutral'
                          }`}>{a.action}</span>
                        </td>
                        <td className="p-4 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            a.alert_level === 'HIGH' ? 'bg-red-500/20 text-red-400' :
                            a.alert_level === 'MEDIUM' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'
                          }`}>{a.alert_level}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
      {/* ── Scripless Scanner View ─────────────────────────────────────────────────── */}
      {view === 'scripless' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-[#1e293b] rounded-xl p-6 border border-slate-700/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Zap className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-white">Scripless Mutation Scanner</h3>
                <p className="text-sm text-slate-400">
                  Mendeteksi pengendali yang menukarkan saham fisik (Scrip) menjadi digital (Scripless). Sinyal kuat potensi guyuran massal ke market.
                </p>
              </div>
            </div>

            {loading ? (
              <div className="h-64 flex items-center justify-center">
                <RefreshCw className="w-6 h-6 text-[#3b82f6] animate-spin" />
              </div>
            ) : scriplessData.length === 0 ? (
              <div className="h-40 flex flex-col items-center justify-center text-slate-400 bg-slate-800/30 rounded-lg border border-slate-700/50">
                <Shield className="w-10 h-10 mb-2 opacity-50" />
                <p>Belum ada mutasi berbahaya terdeteksi dalam 30 hari terakhir.</p>
                <p className="text-xs mt-1">(Data historis mungkin belum lengkap. Anda perlu upload data KSEI minimal 2 tanggal berbeda)</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-700/50">
                <table className="w-full text-sm text-left">
                  <thead className="bg-[#0f172a] text-slate-400">
                    <tr>
                      <th className="px-4 py-3 font-medium border-b border-slate-700/50">Saham</th>
                      <th className="px-4 py-3 font-medium border-b border-slate-700/50">Nama Investor</th>
                      <th className="px-4 py-3 font-medium border-b border-slate-700/50 text-right text-red-400">Scrip Berkurang</th>
                      <th className="px-4 py-3 font-medium border-b border-slate-700/50 text-right text-purple-400">Scripless Bertambah</th>
                      <th className="px-4 py-3 font-medium border-b border-slate-700/50 text-right">Potensi Guyuran</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {scriplessData.map((s, idx) => (
                      <tr key={idx} className="bg-[#1e293b] hover:bg-slate-800 transition-colors group">
                        <td className="px-4 py-3 font-bold text-white">
                          <Link href={`/stock/${s.share_code}`} className="hover:text-[#3b82f6]">
                            {s.share_code}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-slate-300">{s.investor_name}</td>
                        <td className="px-4 py-3 text-right text-red-400 font-medium">
                          {formatShares(Math.abs(s.scrip_diff))}
                        </td>
                        <td className="px-4 py-3 text-right text-purple-400 font-medium flex items-center justify-end gap-1">
                          <TrendingUp className="w-3 h-3" />
                          {formatShares(s.scripless_diff)}
                        </td>
                        <td className="px-4 py-3 text-right text-amber-400 font-bold">
                          {formatRupiah(s.scripless_diff * 100)} {/* Asumsi harga 100, idealnya kalikan harga aktual */}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════ VIEW: SCRIPLESS SCANNER ════════════════════════════ */}
      {view === 'scripless' && (
        <div className="space-y-6">
          <div className="glass rounded-2xl p-6 border border-border/30">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-purple-500/10 rounded-xl border border-purple-500/20">
                <Zap className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground">Scripless Mutation Scanner</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Mendeteksi pengendali yang menukarkan saham fisik (Scrip) menjadi digital (Scripless). Sinyal kuat potensi guyuran saham ke market dalam waktu dekat.
                </p>
              </div>
            </div>

            {loading ? (
              <div className="h-64 flex flex-col items-center justify-center text-muted-foreground">
                <RefreshCw className="w-8 h-8 animate-spin mb-4 text-purple-400" />
                <p>Memindai mutasi saham warkat ke scripless...</p>
              </div>
            ) : scriplessData.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center p-6 glass rounded-xl border border-dashed border-border/50">
                <Shield className="w-12 h-12 mb-4 text-emerald-400/50" />
                <p className="text-foreground font-medium">Market Terpantau Aman</p>
                <p className="text-sm text-muted-foreground max-w-md mt-2">
                  Belum ada mutasi Scrip ke Scripless yang signifikan dalam 30 hari terakhir. 
                  (Catatan: Fitur ini membutuhkan minimal 2 tanggal data KSEI yang berbeda untuk melakukan perbandingan).
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-border/30 overflow-hidden bg-black/20">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-white/[0.02] border-b border-border/30 text-muted-foreground">
                      <tr>
                        <th className="px-5 py-4 font-medium">Saham</th>
                        <th className="px-5 py-4 font-medium">Nama Investor</th>
                        <th className="px-5 py-4 font-medium text-right text-red-400">Scrip Berkurang</th>
                        <th className="px-5 py-4 font-medium text-right text-purple-400">Scripless Bertambah</th>
                        <th className="px-5 py-4 font-medium text-right">Potensi Lemparan (Lot)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                      {scriplessData.map((s, idx) => (
                        <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-5 py-4">
                            <Link href={`/stock/${s.share_code}`} className="font-bold text-foreground hover:text-gold-400 transition-colors">
                              {s.share_code}
                            </Link>
                          </td>
                          <td className="px-5 py-4">
                            <div className="font-medium text-foreground">{s.investor_name}</div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              Mutasi dari: {new Date(s.old_date).toLocaleDateString('id-ID')} ke {new Date(s.new_date).toLocaleDateString('id-ID')}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-right text-red-400/90 font-medium font-mono">
                            -{formatShares(Math.abs(s.scrip_diff))}
                          </td>
                          <td className="px-5 py-4 text-right text-purple-400 font-bold font-mono">
                            +{formatShares(s.scripless_diff)}
                          </td>
                          <td className="px-5 py-4 text-right text-amber-400 font-bold font-mono">
                            {formatNumber(s.scripless_diff / 100)} lot
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
