'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { formatRupiah } from '@/lib/utils'
import {
  TrendingUp, TrendingDown, RefreshCw, AlertTriangle, X,
  Building2, Activity, ArrowRightLeft, Zap, Copy, CheckCircle2
} from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

// ============================================================
// TYPES
// ============================================================
interface FlowItem {
  kode_efek:       string
  buy:             number
  sell:            number
  net:             number
  konglomerasi:    string | null
  avgTransaction:  number
  transactionCount: number
  velocity:        number
}

interface KongloItem {
  konglo:     string
  stocks:     string[]
  net:        number
  buy:        number
  sell:       number
  stockCount: number
}

interface FilterState {
  minNet?:          number
  minTransactions?: number
  hasKonglo?:       boolean
  onlyBuy?:         boolean
  onlySell?:        boolean
  search?:          string
}

// ============================================================
// PRESETS
// ============================================================
const PRESETS: { id: string; name: string; icon: React.ElementType; filters: FilterState; color: string }[] = [
  { id: 'whale',        name: '🐋 Whale Hunt',         icon: Zap,          filters: { minNet: 5_000_000_000 },                   color: 'from-yellow-400 to-orange-500' },
  { id: 'active',       name: '🔥 High Activity',      icon: Activity,     filters: { minTransactions: 10 },                     color: 'from-red-400 to-pink-500' },
  { id: 'konglo',       name: '🏢 Konglo Focus',        icon: Building2,    filters: { hasKonglo: true },                         color: 'from-blue-400 to-cyan-500' },
  { id: 'accumulation', name: '📈 Pure Accumulation',  icon: TrendingUp,   filters: { onlyBuy: true, minNet: 1_000_000_000 },    color: 'from-emerald-400 to-green-500' },
  { id: 'distribution', name: '📉 Heavy Distribution', icon: TrendingDown, filters: { onlySell: true, minNet: 1_000_000_000 },   color: 'from-red-500 to-rose-600' },
]

const WINDOW_OPTIONS = [7, 14, 30, 60]

// ============================================================
// COMPONENT
// ============================================================
export default function FlowPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  // ── State ──────────────────────────────────────────────────
  const [flow,        setFlow]        = useState<FlowItem[]>([])
  const [konglo,      setKonglo]      = useState<KongloItem[]>([])
  const [view,        setView]        = useState<'flow' | 'konglo'>('flow')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [period,      setPeriod]      = useState(30)          // ← renamed from 'window' (shadowed browser global)
  const [latestDate,  setLatestDate]  = useState('')
  const [filters,     setFilters]     = useState<FilterState>({})
  const [showFilters, setShowFilters] = useState(false)
  const [copied,      setCopied]      = useState(false)
  const [activePreset,setActivePreset]= useState<string | null>(null)

  // ── Parse URL params on mount ──────────────────────────────
  useEffect(() => {
    const w = searchParams.get('window')
    const f = searchParams.get('filters')
    if (w) setPeriod(Number(w))
    if (f) {
      try { setFilters(JSON.parse(f)) } catch { /* invalid JSON, ignore */ }
    }
  }, [searchParams])

  // ── Sync URL when period/filters change ───────────────────
  useEffect(() => {
    const params = new URLSearchParams()
    params.set('window', period.toString())
    if (Object.keys(filters).length > 0) params.set('filters', JSON.stringify(filters))
    router.replace(`?${params.toString()}`, { scroll: false })
  }, [period, filters, router])

  // ── Fetch ─────────────────────────────────────────────────
  const fetchFlow = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Latest date
      const { data: dd } = await supabase
        .from('ksei_data5_mutasi')
        .select('tanggal_data')
        .order('tanggal_data', { ascending: false })
        .limit(1)
      const latest = dd?.[0]?.tanggal_data
      if (!latest) throw new Error('Tidak ada data KSEI 5%')
      setLatestDate(latest)

      // Date range
      const startDate = new Date(latest)
      startDate.setDate(startDate.getDate() - period)
      const startStr = startDate.toISOString().split('T')[0]

      const { data, error: fetchError } = await supabase
        .from('ksei_data5_mutasi')
        .select('kode_efek,aksi,transaction_value,konglomerasi')
        .gte('tanggal_data', startStr)
        .in('aksi', ['Buying', 'Accumulation', 'Reduction', 'Hold'])
        .order('transaction_value', { ascending: false })
        .limit(10000)
      if (fetchError) throw fetchError

      // ── Aggregate per saham ───────────────────────────────
      const map = new Map<string, FlowItem>()
      ;(data || []).forEach((r: any) => {
        const tv = Number(r.transaction_value) || 0
        if (!map.has(r.kode_efek)) {
          map.set(r.kode_efek, {
            kode_efek:        r.kode_efek,
            buy:              0,
            sell:             0,
            net:              0,
            konglomerasi:     r.konglomerasi || null,
            avgTransaction:   0,
            transactionCount: 0,
            velocity:         0,
          })
        }
        const item = map.get(r.kode_efek)!
        if (r.aksi === 'Buying' || r.aksi === 'Accumulation') {
          item.buy  += tv
          item.net  += tv
          item.transactionCount++
        } else if (r.aksi === 'Reduction') {
          item.sell += tv
          item.net  -= tv
          item.transactionCount++
        }
      })

      const flowArray: FlowItem[] = Array.from(map.values())
        .map(item => ({
          ...item,
          avgTransaction: item.transactionCount > 0
            ? (item.buy + item.sell) / item.transactionCount
            : 0,
          velocity: item.transactionCount / period,
        }))
        .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))

      setFlow(flowArray)

      // ── Aggregate per konglomerasi ────────────────────────
      const km = new Map<string, KongloItem>()
      ;(data || []).forEach((r: any) => {
        const k = r.konglomerasi
        if (!k || k === '-' || k === '') return
        if (!km.has(k)) km.set(k, { konglo: k, stocks: [], net: 0, buy: 0, sell: 0, stockCount: 0 })
        const g = km.get(k)!
        if (!g.stocks.includes(r.kode_efek)) {
          g.stocks.push(r.kode_efek)
          g.stockCount++
        }
        const tv = Number(r.transaction_value) || 0
        if (r.aksi === 'Buying' || r.aksi === 'Accumulation') { g.net += tv; g.buy += tv }
        else if (r.aksi === 'Reduction')                       { g.net -= tv; g.sell += tv }
      })
      setKonglo(Array.from(km.values()).sort((a, b) => Math.abs(b.net) - Math.abs(a.net)))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => { fetchFlow() }, [fetchFlow])

  // ── Filtering ─────────────────────────────────────────────
  const filteredFlow = useMemo(() => {
    let result = [...flow]
    if (filters.minNet)          result = result.filter(r => Math.abs(r.net) >= filters.minNet!)
    if (filters.minTransactions) result = result.filter(r => r.transactionCount >= filters.minTransactions!)
    if (filters.hasKonglo)       result = result.filter(r => r.konglomerasi && r.konglomerasi !== '-')
    if (filters.onlyBuy)         result = result.filter(r => r.net > 0)
    if (filters.onlySell)        result = result.filter(r => r.net < 0)
    if (filters.search)          result = result.filter(r => r.kode_efek.toLowerCase().includes(filters.search!.toLowerCase()))
    return result
  }, [flow, filters])

  const buyers  = filteredFlow.filter(r => r.net > 0).slice(0, 20)
  const sellers = filteredFlow.filter(r => r.net < 0).sort((a, b) => a.net - b.net).slice(0, 20)

  const totalBuy  = filteredFlow.reduce((s, r) => s + (r.buy  || 0), 0)
  const totalSell = filteredFlow.reduce((s, r) => s + (r.sell || 0), 0)
  const netFlow   = totalBuy - totalSell
  const buyRatio  = (totalBuy + totalSell) > 0 ? (totalBuy / (totalBuy + totalSell)) * 100 : 0

  // ── Handlers ──────────────────────────────────────────────
  const applyPreset = (presetId: string) => {
    const preset = PRESETS.find(p => p.id === presetId)
    if (!preset) return
    setFilters(preset.filters)
    setActivePreset(presetId)
  }

  const clearFilters = () => {
    setFilters({})
    setActivePreset(null)
  }

  const exportToCSV = () => {
    const headers = ['Kode Efek', 'Buy', 'Sell', 'Net', 'Transactions', 'Avg Value', 'Velocity', 'Konglomerasi']
    const rows = filteredFlow.map(r => [
      r.kode_efek,
      r.buy,
      r.sell,
      r.net,
      r.transactionCount,
      Math.round(r.avgTransaction),
      r.velocity.toFixed(2),
      r.konglomerasi || '-',
    ])
    const csv  = [headers, ...rows].map(row => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `flow-${period}d-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const shareLink = () => {
    navigator.clipboard.writeText(location.href)   // ← use bare location, not state 'window'
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="space-y-6 animate-fade-in pb-10">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">
            <span className="gradient-gold">5%</span>{' '}
            <span className="text-foreground">Flow Tracker</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Monitoring kepemilikan ≥5% · Latest: {latestDate || '—'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* View toggle */}
          <div className="glass rounded-xl p-1 flex gap-1 border border-border/30">
            {(['flow', 'konglo'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  view === v
                    ? 'bg-gradient-to-r from-gold-400 to-yellow-500 text-navy-900'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {v === 'flow' ? '📊 Flow' : '🏢 Konglo'}
              </button>
            ))}
          </div>

          {/* Period selector */}
          <select
            value={period}
            onChange={e => setPeriod(Number(e.target.value))}
            className="bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-xs"
          >
            {WINDOW_OPTIONS.map(d => (
              <option key={d} value={d}>{d} Hari</option>
            ))}
          </select>

          {/* Export CSV */}
          <button
            onClick={exportToCSV}
            title="Export CSV"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-muted-foreground hover:text-foreground text-xs transition-colors"
          >
            ↓ CSV
          </button>

          {/* Share */}
          <button
            onClick={shareLink}
            title="Salin link"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-muted-foreground hover:text-foreground text-xs transition-colors"
          >
            {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Disalin!' : 'Share'}
          </button>

          {/* Refresh */}
          <button
            onClick={fetchFlow}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gold-400/10 border border-gold-400/30 text-gold-400 text-sm font-bold disabled:opacity-50 transition-opacity"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Presets ─────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map(p => {
          const Icon    = p.icon
          const isActive = activePreset === p.id
          return (
            <button
              key={p.id}
              onClick={() => isActive ? clearFilters() : applyPreset(p.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                isActive
                  ? 'bg-gold-400/20 border-gold-400/40 text-gold-400'
                  : 'bg-white/[0.03] border-white/[0.06] text-muted-foreground hover:text-foreground hover:border-white/20'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {p.name}
              {isActive && <X className="w-3 h-3 ml-1" />}
            </button>
          )
        })}

        {/* Custom filter search */}
        <div className="relative ml-auto">
          <input
            type="text"
            placeholder="Cari kode..."
            value={filters.search || ''}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value || undefined }))}
            className="bg-white/[0.03] border border-white/[0.08] rounded-xl pl-3 pr-3 py-1.5 text-xs focus:outline-none focus:border-gold-400/40 w-32 transition-all"
          />
        </div>
      </div>

      {/* ── Stats ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Emiten Aktif',  value: filteredFlow.length.toString(), color: 'text-foreground',   icon: Activity },
          { label: 'Total Buying',  value: formatRupiah(totalBuy),          color: 'text-emerald-400',  icon: TrendingUp },
          { label: 'Total Selling', value: formatRupiah(totalSell),         color: 'text-red-400',      icon: TrendingDown },
          { label: 'Net Flow',      value: formatRupiah(netFlow),           color: netFlow >= 0 ? 'text-emerald-400' : 'text-red-400', icon: ArrowRightLeft },
        ].map((m, i) => {
          const Icon = m.icon
          return (
            <div key={i} className="glass rounded-2xl p-5 border border-border/30 card-hover">
              <Icon className={`w-5 h-5 ${m.color} mb-3`} />
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{m.label}</p>
              <p className={`text-xl font-black mt-1 ${m.color}`}>{m.value}</p>
            </div>
          )
        })}
      </div>

      {/* Buy/Sell ratio bar */}
      <div className="glass rounded-xl p-4 border border-border/30">
        <div className="flex justify-between text-xs text-muted-foreground mb-2">
          <span>Buy Ratio</span>
          <span className="font-bold">{buyRatio.toFixed(1)}% Buying · {(100 - buyRatio).toFixed(1)}% Selling</span>
        </div>
        <div className="h-2 rounded-full bg-red-500/30 overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-700"
            style={{ width: `${buyRatio}%` }}
          />
        </div>
      </div>

      {/* ── Error ───────────────────────────────────────────── */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ── Loading skeleton ────────────────────────────────── */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="shimmer h-12 rounded-xl" />
          ))}
        </div>
      )}

      {/* ── Flow View ───────────────────────────────────────── */}
      {!loading && view === 'flow' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Top Akumulasi */}
          <div className="glass rounded-2xl overflow-hidden border border-emerald-500/20">
            <div className="p-4 border-b border-white/[0.05] flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <h3 className="font-bold text-emerald-400">Top Akumulasi ({period}D)</h3>
              <span className="ml-auto text-xs text-muted-foreground">{buyers.length} emiten</span>
            </div>
            {buyers.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-10">Tidak ada data</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] text-muted-foreground uppercase border-b border-white/[0.05]">
                    <th className="p-3 text-left">#</th>
                    <th className="p-3 text-left">Emiten</th>
                    <th className="p-3 text-right">Net Buy</th>
                    <th className="p-3 text-left hidden md:table-cell">Konglo</th>
                  </tr>
                </thead>
                <tbody>
                  {buyers.map((r, i) => (
                    <tr key={r.kode_efek} className="tr-hover border-b border-white/[0.02]">
                      <td className="p-3 text-muted-foreground text-xs w-8">{i + 1}</td>
                      <td className="p-3">
                        <Link
                          href={`/stock/${r.kode_efek}`}
                          className="font-mono font-black text-foreground hover:text-gold-400 transition-colors"
                        >
                          {r.kode_efek}
                        </Link>
                        <span className="ml-2 text-[10px] text-muted-foreground">
                          {r.transactionCount}tx
                        </span>
                      </td>
                      <td className="p-3 text-right font-bold text-emerald-400">
                        +{formatRupiah(r.net)}
                      </td>
                      <td className="p-3 hidden md:table-cell">
                        {r.konglomerasi && r.konglomerasi !== '-' ? (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-gold-400/10 text-gold-400 font-bold">
                            {r.konglomerasi.slice(0, 18)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-[10px]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Top Distribusi */}
          <div className="glass rounded-2xl overflow-hidden border border-red-500/20">
            <div className="p-4 border-b border-white/[0.05] flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-red-400" />
              <h3 className="font-bold text-red-400">Top Distribusi ({period}D)</h3>
              <span className="ml-auto text-xs text-muted-foreground">{sellers.length} emiten</span>
            </div>
            {sellers.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-10">Tidak ada data</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] text-muted-foreground uppercase border-b border-white/[0.05]">
                    <th className="p-3 text-left">#</th>
                    <th className="p-3 text-left">Emiten</th>
                    <th className="p-3 text-right">Net Sell</th>
                    <th className="p-3 text-left hidden md:table-cell">Konglo</th>
                  </tr>
                </thead>
                <tbody>
                  {sellers.map((r, i) => (
                    <tr key={r.kode_efek} className="tr-hover border-b border-white/[0.02]">
                      <td className="p-3 text-muted-foreground text-xs w-8">{i + 1}</td>
                      <td className="p-3">
                        <Link
                          href={`/stock/${r.kode_efek}`}
                          className="font-mono font-black text-foreground hover:text-gold-400 transition-colors"
                        >
                          {r.kode_efek}
                        </Link>
                        <span className="ml-2 text-[10px] text-muted-foreground">
                          {r.transactionCount}tx
                        </span>
                      </td>
                      <td className="p-3 text-right font-bold text-red-400">
                        {formatRupiah(r.net)}
                      </td>
                      <td className="p-3 hidden md:table-cell">
                        {r.konglomerasi && r.konglomerasi !== '-' ? (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-gold-400/10 text-gold-400 font-bold">
                            {r.konglomerasi.slice(0, 18)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-[10px]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Konglo View ─────────────────────────────────────── */}
      {!loading && view === 'konglo' && (
        konglo.length === 0 ? (
          <div className="glass rounded-xl p-12 text-center text-muted-foreground">
            <Building2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="font-bold">Tidak ada data konglomerasi</p>
            <p className="text-xs mt-1">Pastikan kolom `konglomerasi` sudah diisi di ksei_data5_mutasi</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {konglo.map((k) => {
              const isAccum = k.net >= 0
              const maxVal  = konglo[0] ? Math.abs(konglo[0].net) : 1
              const barPct  = Math.min((Math.abs(k.net) / maxVal) * 100, 100)
              return (
                <div
                  key={k.konglo}
                  className="glass rounded-xl p-5 border border-border/30 hover:border-gold-400/30 transition-all card-hover"
                >
                  <div className="flex items-start justify-between mb-3">
                    <p className="font-bold text-sm leading-tight">{k.konglo}</p>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${
                      isAccum ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {isAccum ? '▲ Akumulasi' : '▼ Distribusi'}
                    </span>
                  </div>

                  <p className={`text-xl font-black mb-1 ${isAccum ? 'text-emerald-400' : 'text-red-400'}`}>
                    {isAccum ? '+' : ''}{formatRupiah(k.net)}
                  </p>

                  {/* Proportional bar */}
                  <div className="h-1 rounded-full bg-white/[0.06] mb-3 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${isAccum ? 'bg-emerald-500' : 'bg-red-500'}`}
                      style={{ width: `${barPct}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                    <span className="text-emerald-400/70">B: {formatRupiah(k.buy)}</span>
                    <span className="text-red-400/70">S: {formatRupiah(k.sell)}</span>
                  </div>

                  {/* Stock list */}
                  <div className="flex flex-wrap gap-1">
                    {k.stocks.slice(0, 8).map(s => (
                      <Link
                        key={s}
                        href={`/stock/${s}`}
                        className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-white/[0.05] text-muted-foreground hover:text-gold-400 hover:bg-gold-400/10 transition-colors"
                      >
                        {s}
                      </Link>
                    ))}
                    {k.stocks.length > 8 && (
                      <span className="text-[10px] text-muted-foreground px-1">+{k.stocks.length - 8}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}
