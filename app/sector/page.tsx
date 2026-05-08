'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatRupiah, formatNumber } from '@/lib/utils'
import { BarChart2, RefreshCw, TrendingUp, TrendingDown, Globe, Zap } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ScatterChart, Scatter, ZAxis
} from 'recharts'

const MOMENTUM_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  STRONG_INFLOW:   { color: '#22c55e', bg: 'bg-emerald-500/15 border-emerald-500/30', label: '🔥 Strong In' },
  MILD_INFLOW:     { color: '#86efac', bg: 'bg-emerald-500/8 border-emerald-500/20',  label: '↑ Mild In' },
  NEUTRAL:         { color: '#94a3b8', bg: 'bg-slate-500/10 border-slate-500/20',      label: '→ Neutral' },
  MILD_OUTFLOW:    { color: '#fca5a5', bg: 'bg-red-500/8 border-red-500/20',           label: '↓ Mild Out' },
  STRONG_OUTFLOW:  { color: '#ef4444', bg: 'bg-red-500/15 border-red-500/30',          label: '❄️ Strong Out' },
}

export default function SectorRotationPage() {
  const [data, setData]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [windowDays, setWindowDays]   = useState(20)
  const [sortBy, setSortBy]   = useState<'foreign' | 'delta' | 'value'>('foreign')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const { data: rpcData, error } = await supabase.rpc('get_sector_rotation', {
        p_date:   new Date().toISOString().split('T')[0],
        p_window: windowDays,
      })
      if (error) throw error
      setData(rpcData || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [windowDays])

  useEffect(() => { fetchData() }, [fetchData])

  const sorted = [...data].sort((a, b) => {
    if (sortBy === 'foreign') return Number(b.total_net_foreign) - Number(a.total_net_foreign)
    if (sortBy === 'delta')   return Number(b.flow_delta) - Number(a.flow_delta)
    return Number(b.total_value) - Number(a.total_value)
  })

  const maxAbsForeign = Math.max(...data.map(d => Math.abs(Number(d.total_net_foreign))), 1)
  const totalInflow  = data.filter(d => Number(d.total_net_foreign) > 0).reduce((s, d) => s + Number(d.total_net_foreign), 0)
  const totalOutflow = data.filter(d => Number(d.total_net_foreign) < 0).reduce((s, d) => s + Number(d.total_net_foreign), 0)
  const strongIn     = data.filter(d => d.momentum === 'STRONG_INFLOW').length
  const strongOut    = data.filter(d => d.momentum === 'STRONG_OUTFLOW').length

  const barData = sorted
    .filter(d => d.sector !== 'No Sector')
    .slice(0, 12)
    .map(d => ({
      sector: (d.sector as string).replace('Properties & Real Estate', 'Properties').slice(0, 14),
      foreign: Number(d.total_net_foreign),
      delta:   Number(d.flow_delta),
      value:   Number(d.total_value),
    }))

  return (
    <div className="space-y-6 animate-fade-in pb-10">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-foreground">
            <BarChart2 className="w-8 h-8 text-gold-400 inline mr-2" />
            <span className="gradient-gold">Sector Rotation</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Foreign flow heatmap & momentum sektor IDX
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select value={windowDays} onChange={e => setWindowDays(Number(e.target.value))}
            className="bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-sm">
            <option value={10}>10 Hari</option>
            <option value={20}>20 Hari</option>
            <option value={30}>30 Hari</option>
          </select>
          <button onClick={fetchData} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gold-400/10 border border-gold-400/30 text-gold-400 text-sm font-bold">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Inflow',  value: formatRupiah(totalInflow),   icon: TrendingUp,   color: 'text-emerald-400' },
          { label: 'Total Outflow', value: formatRupiah(Math.abs(totalOutflow)), icon: TrendingDown, color: 'text-red-400' },
          { label: 'Strong Inflow', value: `${strongIn} sektor`,  icon: Zap,    color: 'text-emerald-400' },
          { label: 'Strong Outflow',value: `${strongOut} sektor`, icon: Globe,  color: 'text-red-400' },
        ].map((m, i) => {
          const Icon = m.icon
          return (
            <div key={i} className="glass rounded-2xl p-5 border border-border/30 card-hover">
              <Icon className={`w-5 h-5 ${m.color} mb-3`} />
              <p className="text-xs text-muted-foreground uppercase">{m.label}</p>
              <p className={`text-xl font-black mt-1 ${m.color}`}>{m.value}</p>
            </div>
          )
        })}
      </div>

      {/* BAR CHART */}
      <div className="glass rounded-2xl p-6 border border-border/30">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold flex items-center gap-2">
            <Globe className="w-5 h-5 text-blue-400" />
            Net Foreign per Sektor ({windowDays} hari)
          </h3>
          <div className="flex gap-2">
            {[
              { key: 'foreign', label: 'Net Foreign' },
              { key: 'delta',   label: 'Flow Delta' },
              { key: 'value',   label: 'Total Value' },
            ].map(s => (
              <button key={s.key} onClick={() => setSortBy(s.key as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  sortBy === s.key ? 'bg-gold-400/20 text-gold-400 border border-gold-400/30'
                    : 'bg-white/[0.03] text-muted-foreground border border-white/[0.06]'
                }`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="h-[300px] flex items-center justify-center">
            <RefreshCw className="w-8 h-8 text-gold-400 animate-spin" />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={barData} margin={{ bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
              <XAxis dataKey="sector" tick={{ fill: '#94a3b8', fontSize: 10 }} angle={-30} textAnchor="end" />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <Tooltip
                formatter={(v: any, name: string) => [
                  name === 'value' ? formatRupiah(Number(v)) : formatRupiah(Number(v)),
                  name === 'foreign' ? 'Net Foreign' : name === 'delta' ? 'Flow Delta' : 'Total Value'
                ]}
                contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
              />
              <Bar dataKey={sortBy} radius={[4, 4, 0, 0]}>
                {barData.map((d, i) => (
                  <Cell key={i}
                    fill={Number(d[sortBy as keyof typeof d]) >= 0 ? '#22c55e' : '#ef4444'}
                    opacity={0.85}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* HEATMAP GRID */}
      <div>
        <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-gold-400" /> Sector Heatmap
        </h3>
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="glass rounded-xl p-4 border border-border/30">
                <div className="shimmer h-5 w-28 rounded mb-2" />
                <div className="shimmer h-8 w-20 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 stagger">
            {sorted
              .filter(d => d.sector !== 'No Sector')
              .map((d: any, i: number) => {
              const cfg = MOMENTUM_CONFIG[d.momentum] || MOMENTUM_CONFIG.NEUTRAL
              const pct = Math.abs(Number(d.total_net_foreign)) / maxAbsForeign * 100
              const isInflow = Number(d.total_net_foreign) >= 0

              return (
                <div key={i}
                  className={`glass rounded-xl p-4 border ${cfg.bg} transition-all card-hover`}
                  style={{ animationDelay: `${i * 0.04}s` }}
                >
                  {/* Sector Name */}
                  <p className="text-xs font-bold text-foreground leading-tight truncate mb-3"
                    title={d.sector}>
                    {d.sector}
                  </p>

                  {/* Momentum badge */}
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: cfg.color + '20', color: cfg.color }}>
                    {cfg.label}
                  </span>

                  {/* Net Foreign */}
                  <p className={`text-lg font-black mt-2 ${isInflow ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatRupiah(Number(d.total_net_foreign))}
                  </p>

                  {/* Flow bar */}
                  <div className="mt-2 h-1.5 bg-accent rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${pct}%`,
                        background: `linear-gradient(90deg, ${cfg.color}80, ${cfg.color})`,
                      }}
                    />
                  </div>

                  {/* Stats row */}
                  <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{Number(d.stock_count)} emiten</span>
                    <span className={`font-bold ${Number(d.flow_delta_pct) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      Δ {Number(d.flow_delta_pct) >= 0 ? '+' : ''}{Number(d.flow_delta_pct)?.toFixed(0)}%
                    </span>
                  </div>

                  {/* Signal icons */}
                  {(Number(d.whale_count) > 0 || Number(d.anomaly_count) > 0) && (
                    <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                      {Number(d.whale_count) > 0 && <span>🐋 {d.whale_count}</span>}
                      {Number(d.anomaly_count) > 0 && <span>⚡ {d.anomaly_count}</span>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
