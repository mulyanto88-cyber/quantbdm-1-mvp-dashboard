'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatRupiah, formatShares, formatPercent, formatNumber } from '@/lib/utils'
import {
  Building2, TrendingUp, TrendingDown, Search, RefreshCw,
  ChevronRight, Target, ArrowRightLeft, Zap, Globe,
  AlertTriangle, X, BarChart3, Eye
} from 'lucide-react'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend
} from 'recharts'

const COLORS = ['#e7b733','#22c55e','#8b5cf6','#ef4444','#06b6d4','#ec4899','#f97316','#14b8a6']

type ViewMode = 'overview' | 'detail'

export default function KonglomerasiPage() {
  const [kongloList, setKongloList]     = useState<any[]>([])
  const [selected, setSelected]         = useState<string | null>(null)
  const [clusterData, setClusterData]   = useState<any[]>([])
  const [viewMode, setViewMode]         = useState<ViewMode>('overview')
  const [loading, setLoading]           = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [searchTerm, setSearchTerm]     = useState('')
  const [error, setError]               = useState<string | null>(null)
  const [window30, setWindow30]         = useState(30)

  // ── FETCH OVERVIEW: semua konglomerat aktif ──────────────────────────
  const fetchOverview = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Ambil summary konglomerat via get_ksei5_konglo_summary
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - 30)
      const { data, error: rpcErr } = await supabase.rpc('get_ksei5_konglo_summary', {
        start_date: startDate.toISOString().split('T')[0],
      })
      if (rpcErr) throw rpcErr

      // Group by konglo, aggregate stats
      const grouped: Record<string, {
        name: string
        stocks: string[]
        totalBuy: number
        totalSell: number
        netChange: number
        entities: string[]
      }> = {}

      ;(data || []).forEach((row: any) => {
        const k = row.konglo as string
        if (!k || k === '-') return
        if (!grouped[k]) grouped[k] = { name: k, stocks: [], totalBuy: 0, totalSell: 0, netChange: 0, entities: [] }
        const g = grouped[k]
        if (!g.stocks.includes(row.stock)) g.stocks.push(row.stock)
        if (!g.entities.includes(row.entity)) g.entities.push(row.entity)
        const net = Number(row.net_change) || 0
        if (net > 0) g.totalBuy += net
        else g.totalSell += Math.abs(net)
        g.netChange += net
      })

      const list = Object.values(grouped)
        .filter(g => g.stocks.length > 0)
        .sort((a, b) => Math.abs(b.netChange) - Math.abs(a.netChange))

      setKongloList(list)
    } catch (err: any) {
      setError(err.message || 'Failed to fetch konglomerasi data')
    } finally {
      setLoading(false)
    }
  }, [])

  // ── FETCH DETAIL: per konglomerat ────────────────────────────────────
  const fetchDetail = useCallback(async (kongloName: string) => {
    setLoadingDetail(true)
    setError(null)
    try {
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - window30)
      const { data, error: rpcErr } = await supabase.rpc('get_konglomerat_cluster', {
        p_konglo_name: kongloName,
        p_start_date: startDate.toISOString().split('T')[0],
      })
      if (rpcErr) throw rpcErr
      setClusterData(data || [])
    } catch (err: any) {
      setError(err.message || 'Failed to fetch cluster data')
    } finally {
      setLoadingDetail(false)
    }
  }, [window30])

  useEffect(() => { fetchOverview() }, [fetchOverview])

  const handleSelectKonglo = (name: string) => {
    setSelected(name)
    setViewMode('detail')
    fetchDetail(name)
  }

  // ── FILTER ───────────────────────────────────────────────────────────
  const filteredList = kongloList.filter(k =>
    k.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // ── AGGREGATE STATS ──────────────────────────────────────────────────
  const stats = {
    totalKonglo: kongloList.length,
    netBuyers: kongloList.filter(k => k.netChange > 0).length,
    netSellers: kongloList.filter(k => k.netChange < 0).length,
    totalStocks: new Set(kongloList.flatMap(k => k.stocks)).size,
  }

  // ── CLUSTER STATS ────────────────────────────────────────────────────
  const clusterStats = {
    buying: clusterData.filter(c => (Number(c.net_change) || 0) > 0).length,
    selling: clusterData.filter(c => (Number(c.net_change) || 0) < 0).length,
    totalNet: clusterData.reduce((sum, c) => sum + (Number(c.net_change) || 0), 0),
    totalValue: clusterData.reduce((sum, c) => sum + (Number(c.net_value) || 0), 0),
  }

  const clusterChartData = clusterData
    .sort((a, b) => Math.abs(Number(b.net_change)) - Math.abs(Number(a.net_change)))
    .slice(0, 10)
    .map(c => ({
      name: c.kode_efek,
      net: Number(c.net_change) || 0,
      buy: Number(c.total_shares_curr) || 0,
      value: Number(c.net_value) || 0,
      action: c.action,
    }))

  return (
    <div className="space-y-6 animate-fade-in pb-10">

      {/* ── HEADER ───────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-foreground tracking-tight">
            <Building2 className="w-8 h-8 text-gold-400 inline mr-2" />
            <span className="gradient-gold">Konglomerasi</span>{' '}
            <span className="text-foreground">Tracker</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Track pergerakan grup konglomerasi lintas emiten IDX
          </p>
        </div>
        <div className="flex items-center gap-3">
          {viewMode === 'detail' && (
            <button
              onClick={() => { setViewMode('overview'); setSelected(null) }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-sm text-muted-foreground hover:text-foreground transition-all"
            >
              ← Back to Overview
            </button>
          )}
          <div className="flex items-center gap-3 px-4 py-2 glass rounded-full border border-green-500/30">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs font-bold text-green-400 uppercase">Live</span>
          </div>
        </div>
      </div>

      {/* ── STATS ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Konglomerat', value: stats.totalKonglo, icon: Building2, color: 'text-gold-400' },
          { label: 'Net Buyers', value: stats.netBuyers, icon: TrendingUp, color: 'text-emerald-400' },
          { label: 'Net Sellers', value: stats.netSellers, icon: TrendingDown, color: 'text-red-400' },
          { label: 'Emiten Aktif', value: stats.totalStocks, icon: Target, color: 'text-blue-400' },
        ].map((m, i) => {
          const Icon = m.icon
          return (
            <div key={i} className="glass rounded-2xl p-5 border border-border/30 card-hover hover:border-gold-400/30 transition-all">
              <Icon className={`w-5 h-5 ${m.color} mb-3`} />
              <p className="text-xs text-muted-foreground uppercase">{m.label}</p>
              <p className={`text-2xl font-black mt-1 ${m.color}`}>{m.value}</p>
            </div>
          )
        })}
      </div>

      {/* ── ERROR ────────────────────────────────────────────────────── */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* OVERVIEW MODE */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {viewMode === 'overview' && (
        <div className="space-y-6">

          {/* Search */}
          <div className="glass rounded-xl p-4 border border-border/30 flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Cari konglomerat..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-xl text-sm focus:outline-none focus:border-gold-400/30"
              />
            </div>
            <button
              onClick={fetchOverview}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gold-400/10 border border-gold-400/30 text-gold-400 hover:bg-gold-400/20 text-sm font-bold"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {/* Bar Chart — Top 10 Konglomerat by Net Change */}
          {kongloList.length > 0 && (
            <div className="glass rounded-2xl p-6 border border-border/30">
              <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-gold-400" />
                Top Konglomerat — Net Position (30D)
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={kongloList.slice(0, 10).map(k => ({ name: k.name.slice(0, 15), net: k.netChange }))}
                  margin={{ top: 0, right: 10, bottom: 60, left: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} angle={-35} textAnchor="end" />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip
                    formatter={(v: any) => [formatShares(Number(v)), 'Net Saham']}
                    contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                  />
                  <Bar dataKey="net" radius={[4, 4, 0, 0]}>
                    {kongloList.slice(0, 10).map((k, i) => (
                      <Cell key={i} fill={k.netChange >= 0 ? '#22c55e' : '#ef4444'} opacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Konglo Grid */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="glass rounded-xl p-5 border border-border/30">
                  <div className="shimmer h-6 w-40 rounded mb-3" />
                  <div className="shimmer h-4 w-24 rounded mb-2" />
                  <div className="shimmer h-4 w-32 rounded" />
                </div>
              ))}
            </div>
          ) : filteredList.length === 0 ? (
            <div className="glass rounded-xl p-16 text-center text-muted-foreground">
              <Building2 className="w-16 h-16 mx-auto mb-4 opacity-20" />
              <p className="font-bold">Tidak ada data konglomerasi</p>
              <p className="text-xs mt-1">Pastikan kolom `konglomerasi` sudah diisi di ksei_data5_mutasi</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
              {filteredList.map((konglo, i) => (
                <button
                  key={konglo.name}
                  onClick={() => handleSelectKonglo(konglo.name)}
                  className="glass rounded-xl p-5 border border-border/30 hover:border-gold-400/40 transition-all text-left group card-hover"
                  style={{ animationDelay: `${i * 0.05}s` }}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="font-bold text-foreground group-hover:text-gold-400 transition-colors text-sm leading-tight">
                        {konglo.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {konglo.stocks.length} emiten • {konglo.entities.length} entitas
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-gold-400 mt-0.5 flex-shrink-0" />
                  </div>

                  {/* Net indicator */}
                  <div className={`flex items-center gap-2 mb-3 px-3 py-1.5 rounded-lg ${
                    konglo.netChange > 0 ? 'bg-emerald-500/10' : konglo.netChange < 0 ? 'bg-red-500/10' : 'bg-accent/20'
                  }`}>
                    {konglo.netChange > 0
                      ? <TrendingUp className="w-4 h-4 text-emerald-400" />
                      : konglo.netChange < 0
                        ? <TrendingDown className="w-4 h-4 text-red-400" />
                        : <ArrowRightLeft className="w-4 h-4 text-muted-foreground" />
                    }
                    <span className={`text-sm font-bold ${
                      konglo.netChange > 0 ? 'text-emerald-400' : konglo.netChange < 0 ? 'text-red-400' : 'text-muted-foreground'
                    }`}>
                      {konglo.netChange > 0 ? '+' : ''}{formatShares(konglo.netChange)} lot
                    </span>
                  </div>

                  {/* Stocks list */}
                  <div className="flex flex-wrap gap-1">
                    {konglo.stocks.slice(0, 6).map((s: string) => (
                      <span key={s} className="text-[10px] px-2 py-0.5 rounded bg-accent/40 text-muted-foreground font-mono">
                        {s}
                      </span>
                    ))}
                    {konglo.stocks.length > 6 && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-gold-400/10 text-gold-400">
                        +{konglo.stocks.length - 6}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* DETAIL MODE */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {viewMode === 'detail' && selected && (
        <div className="space-y-6">

          {/* Detail Header */}
          <div className="glass rounded-2xl p-6 border border-gold-400/20">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h2 className="text-2xl font-black gradient-gold">{selected}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Cluster Analysis — {window30} hari terakhir
                </p>
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={window30}
                  onChange={e => { setWindow30(Number(e.target.value)); fetchDetail(selected) }}
                  className="bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-sm"
                >
                  <option value={14}>14 Hari</option>
                  <option value={30}>30 Hari</option>
                  <option value={60}>60 Hari</option>
                  <option value={90}>90 Hari</option>
                </select>
                <button
                  onClick={() => fetchDetail(selected)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gold-400/10 border border-gold-400/30 text-gold-400 text-sm font-bold"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingDetail ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Mini Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
              {[
                { label: 'Emiten Buying', value: clusterStats.buying, color: 'text-emerald-400' },
                { label: 'Emiten Selling', value: clusterStats.selling, color: 'text-red-400' },
                { label: 'Net Saham', value: formatShares(clusterStats.totalNet), color: clusterStats.totalNet >= 0 ? 'text-emerald-400' : 'text-red-400' },
                { label: 'Est. Net Value', value: formatRupiah(clusterStats.totalValue), color: 'text-gold-400' },
              ].map((m, i) => (
                <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">{m.label}</p>
                  <p className={`text-xl font-black mt-1 ${m.color}`}>{m.value}</p>
                </div>
              ))}
            </div>
          </div>

          {loadingDetail ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="w-8 h-8 text-gold-400 animate-spin" />
            </div>
          ) : clusterData.length === 0 ? (
            <div className="glass rounded-xl p-12 text-center text-muted-foreground">
              <Building2 className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="font-bold">Tidak ada aktivitas untuk {selected}</p>
              <p className="text-xs mt-1">Coba extend window ke 60 atau 90 hari</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Chart */}
              <div className="glass rounded-2xl p-6 border border-border/30">
                <h3 className="font-bold mb-4 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-gold-400" /> Net Saham per Emiten
                </h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={clusterChartData} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.08} horizontal={true} vertical={false} />
                    <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 10 }} hide />
                    <YAxis dataKey="name" type="category" tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 'bold' }} width={50} />
                    <Tooltip
                      formatter={(v: any) => [formatShares(Number(v)), 'Net']}
                      contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                    />
                    <Bar dataKey="net" radius={[0, 4, 4, 0]}>
                      {clusterChartData.map((c, i) => (
                        <Cell key={i} fill={c.net >= 0 ? '#22c55e' : '#ef4444'} opacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Pie: buy vs sell split */}
              <div className="glass rounded-2xl p-6 border border-border/30">
                <h3 className="font-bold mb-4 flex items-center gap-2">
                  <Target className="w-4 h-4 text-gold-400" /> Komposisi Aksi
                </h3>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Buying', value: clusterStats.buying },
                        { name: 'Selling', value: clusterStats.selling },
                        { name: 'Holding', value: clusterData.length - clusterStats.buying - clusterStats.selling },
                      ].filter(d => d.value > 0)}
                      cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                      paddingAngle={3} dataKey="value"
                    >
                      <Cell fill="#22c55e" /><Cell fill="#ef4444" /><Cell fill="#64748b" />
                    </Pie>
                    <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>

                {/* Summary */}
                <div className="mt-4 space-y-2">
                  {clusterData
                    .filter(c => (Number(c.net_change) || 0) !== 0)
                    .sort((a, b) => Math.abs(Number(b.net_change)) - Math.abs(Number(a.net_change)))
                    .slice(0, 5)
                    .map((c: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-accent/20 hover:bg-accent/30 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${(Number(c.net_change) || 0) > 0 ? 'bg-emerald-400' : 'bg-red-400'}`} />
                          <Link href={`/stock/${c.kode_efek}`} className="font-mono font-bold text-sm hover:text-gold-400">
                            {c.kode_efek}
                          </Link>
                        </div>
                        <div className="text-right">
                          <span className={`text-xs font-bold ${(Number(c.net_change) || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {(Number(c.net_change) || 0) > 0 ? '+' : ''}{formatShares(Number(c.net_change))}
                          </span>
                          {c.whale_signal && <span className="ml-1 text-xs">🐋</span>}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* Full Table */}
          {!loadingDetail && clusterData.length > 0 && (
            <div className="glass rounded-2xl overflow-hidden border border-border/30">
              <div className="p-4 border-b border-white/[0.05] flex items-center justify-between">
                <h3 className="font-bold flex items-center gap-2">
                  <Eye className="w-4 h-4 text-gold-400" /> Detail per Emiten
                </h3>
                <span className="text-xs text-muted-foreground">{clusterData.length} emiten</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white/[0.02] border-b border-white/[0.05] text-[10px] text-muted-foreground uppercase">
                      <th className="p-4 text-left">Emiten</th>
                      <th className="p-4 text-right hidden md:table-cell">Harga</th>
                      <th className="p-4 text-right">Net Saham</th>
                      <th className="p-4 text-right hidden lg:table-cell">Est. Value</th>
                      <th className="p-4 text-center">Aksi</th>
                      <th className="p-4 text-center hidden md:table-cell">Signal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clusterData
                      .sort((a, b) => Math.abs(Number(b.net_change)) - Math.abs(Number(a.net_change)))
                      .map((c: any, i: number) => (
                        <tr key={i} className="tr-hover border-b border-white/[0.02]">
                          <td className="p-4">
                            <Link href={`/stock/${c.kode_efek}`}
                              className="font-bold text-foreground hover:text-gold-400 transition-colors font-mono">
                              {c.kode_efek}
                            </Link>
                            <p className="text-[10px] text-muted-foreground">{c.broker_name?.slice(0, 30)}</p>
                          </td>
                          <td className="p-4 text-right hidden md:table-cell">
                            <div>
                              <span className="font-semibold">{formatNumber(Number(c.current_price))}</span>
                              {c.price_change_pct != null && (
                                <p className={`text-[10px] ${Number(c.price_change_pct) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {formatPercent(Number(c.price_change_pct))}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className={`p-4 text-right font-bold ${Number(c.net_change) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {Number(c.net_change) > 0 ? '+' : ''}{formatShares(Number(c.net_change))}
                          </td>
                          <td className="p-4 text-right hidden lg:table-cell">
                            <span className={`text-sm ${Number(c.net_value) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {formatRupiah(Number(c.net_value))}
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                              c.action === 'BUYING'   ? 'signal-strong-buy' :
                              c.action === 'SELLING'  ? 'signal-avoid' :
                              c.action === 'HOLDING'  ? 'bg-blue-500/20 text-blue-400' : 'signal-neutral'
                            }`}>
                              {c.action}
                            </span>
                          </td>
                          <td className="p-4 text-center hidden md:table-cell">
                            <div className="flex items-center justify-center gap-1">
                              {c.whale_signal && <span title="Whale Signal">🐋</span>}
                              {c.market_signal && (
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                  c.market_signal === 'BULLISH' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'
                                }`}>{c.market_signal}</span>
                              )}
                            </div>
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
    </div>
  )
}
