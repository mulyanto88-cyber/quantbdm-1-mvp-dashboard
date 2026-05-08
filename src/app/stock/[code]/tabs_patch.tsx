'use client'
import React from 'react'
import { formatRupiah, formatShares, formatNumber } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LineChart, Line, PieChart, Pie, Legend
} from 'recharts'


// ─── 1. TAMBAH KE type DetailTab ─────────────────────────────────────────────
// Ubah baris: type DetailTab = 'technical' | 'smart-money' | 'whale' | 'volume' | 'broker'
// Menjadi:
// type DetailTab = 'technical' | 'smart-money' | 'whale' | 'volume' | 'broker' | 'flow' | 'ownership' | 'stealth'


// ─── 2. TAMBAH STATE VARIABLES (di dalam component, setelah const [brokerData...]) ──
/*
  const [foreignFlowData, setForeignFlowData]   = useState<any[]>([])
  const [ownershipData, setOwnershipData]       = useState<any[]>([])
  const [concentrationData, setConcentrationData] = useState<any | null>(null)
  const [institutionalData, setInstitutionalData] = useState<any[]>([])
  const [stealthData, setStealthData]           = useState<any | null>(null)
  const [brokerConsistency, setBrokerConsistency] = useState<any[]>([])
*/


// ─── 3. TAMBAH FETCH CALLS (di dalam fetchAllData, setelah fetch brokerRes) ──
/*
      // 9. Foreign Flow Trend
      const { data: flowRes } = await supabase.rpc('get_foreign_flow_trend', {
        p_stock_code: code,
        p_window: 60,
      })
      if (flowRes) setForeignFlowData(flowRes)

      // 10. Ownership Structure
      const { data: ownerRes } = await supabase.rpc('get_ownership_structure', {
        p_stock_code: code,
        p_date: null,
      })
      if (ownerRes) setOwnershipData(ownerRes)

      // 11. Concentration Index
      const { data: concRes } = await supabase.rpc('get_concentration_index', {
        p_stock_code: code,
        p_date: null,
      })
      if (concRes?.length) setConcentrationData(concRes[0])

      // 12. Institutional Change
      const { data: instRes } = await supabase.rpc('get_institutional_change', {
        p_stock_code: code,
        p_months: 6,
      })
      if (instRes) setInstitutionalData(instRes)

      // 13. Stealth vs Foreign Divergence
      const { data: stealthRes } = await supabase.rpc('get_stealth_vs_foreign_divergence', {
        p_stock_code: code,
        p_window: 30,
      })
      if (stealthRes?.length) setStealthData(stealthRes[0])

      // 14. Broker Consistency
      const { data: bcRes } = await supabase.rpc('get_broker_consistency', {
        p_stock_code: code,
        p_window: 30,
        p_min_days: 3,
      })
      if (bcRes) setBrokerConsistency(bcRes)
*/


// ─── 4. TAMBAH TABS (di dalam array tabs) ────────────────────────────────────
/*
    { id: 'flow'      as DetailTab, label: 'Foreign Flow', icon: Globe,     count: foreignFlowData.length },
    { id: 'ownership' as DetailTab, label: 'Ownership',    icon: PieChart,  count: ownershipData.length },
    { id: 'stealth'   as DetailTab, label: 'Stealth',      icon: Shield,    count: stealthData ? 1 : 0 },
*/


// ─── 5. TAB CONTENT: Foreign Flow ────────────────────────────────────────────
// Paste ini setelah closing tag dari TAB 5 (Broker Intel):
export function ForeignFlowTab({ data }: { data: any[] }) {
  if (!data.length) return (
    <div className="glass rounded-xl p-12 text-center text-muted-foreground">
      No foreign flow data available
    </div>
  )

  // Recharts data
  const chartData = [...data].reverse().map(d => ({
    date: d.trading_date,
    net: Number(d.net_foreign_value),
    cumulative: Number(d.cumulative_flow),
    ma5: Number(d.flow_ma5),
    ma20: Number(d.flow_ma20),
    close: Number(d.close),
    trend: d.trend,
  }))

  const trendColor = (t: string) =>
    t === 'STRONG_ACCUMULATION' ? '#22c55e' :
    t === 'MILD_ACCUMULATION'   ? '#86efac' :
    t === 'STRONG_DISTRIBUTION' ? '#ef4444' :
    t === 'MILD_DISTRIBUTION'   ? '#fca5a5' : '#94a3b8'

  const latest = data[0]
  const totalNet = data.reduce((s, d) => s + Number(d.net_foreign_value), 0)

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Trend',        value: latest?.trend?.replace('_', ' '), color: trendColor(latest?.trend) },
          { label: 'Net 60D',      value: formatRupiah(totalNet),           color: totalNet >= 0 ? '#22c55e' : '#ef4444' },
          { label: 'Cumulative',   value: formatRupiah(Number(latest?.cumulative_flow)), color: '#e7b733' },
          { label: 'MA5 vs MA20',  value: Number(latest?.flow_ma5) > Number(latest?.flow_ma20) ? 'BULLISH ↑' : 'BEARISH ↓',
            color: Number(latest?.flow_ma5) > Number(latest?.flow_ma20) ? '#22c55e' : '#ef4444' },
        ].map((m, i) => (
          <div key={i} className="glass rounded-xl p-4 border border-border/30">
            <p className="text-[10px] text-muted-foreground uppercase mb-1">{m.label}</p>
            <p className="text-lg font-black" style={{ color: m.color }}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Net Foreign Bar Chart */}
      <div className="glass rounded-2xl p-6 border border-border/30">
        <h4 className="font-bold mb-4 text-sm">Net Foreign Flow Harian</h4>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
            <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 9 }} interval={9} angle={-30} textAnchor="end" />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={(v) => formatRupiah(v)} width={80} />
            <Tooltip formatter={(v: any) => [formatRupiah(Number(v)), 'Net Foreign']}
              contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
            <Bar dataKey="net" radius={[2, 2, 0, 0]}>
              {chartData.map((d, i) => <Cell key={i} fill={d.net >= 0 ? '#22c55e' : '#ef4444'} opacity={0.8} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Cumulative + MA lines */}
      <div className="glass rounded-2xl p-6 border border-border/30">
        <h4 className="font-bold mb-4 text-sm">Cumulative Flow & Moving Average</h4>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
            <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 9 }} interval={9} angle={-30} textAnchor="end" />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={(v) => formatRupiah(v)} width={80} />
            <Tooltip formatter={(v: any, n: string) => [formatRupiah(Number(v)), n]}
              contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
            <Line dataKey="cumulative" stroke="#e7b733" strokeWidth={2} dot={false} name="Cumulative" />
            <Line dataKey="ma5"  stroke="#22c55e" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="MA5" />
            <Line dataKey="ma20" stroke="#3b82f6" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="MA20" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}


// ─── 6. TAB CONTENT: Ownership ────────────────────────────────────────────────
export function OwnershipTab({
  ownership, concentration, institutional
}: { ownership: any[]; concentration: any | null; institutional: any[] }) {
  const ownerPieData = ownership.map(o => ({
    name: o.category,
    value: Number(o.total_percentage),
    shares: Number(o.total_shares),
    count: Number(o.investor_count),
  }))

  const OWN_COLORS = ['#e7b733','#22c55e','#8b5cf6','#ef4444','#06b6d4','#ec4899']

  const accumulating = institutional.filter(i => i.action === 'ACCUMULATING').length
  const reducing     = institutional.filter(i => i.action === 'REDUCING').length

  return (
    <div className="space-y-6">
      {/* Concentration Index */}
      {concentration && (
        <div className="glass rounded-2xl p-6 border border-gold-400/20">
          <h4 className="font-bold mb-4 text-sm gradient-gold">Concentration Index</h4>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: 'HHI Score',   value: Number(concentration.hhi_score)?.toFixed(0),    color: 'text-gold-400' },
              { label: 'Top 5 %',     value: `${Number(concentration.top5_pct)?.toFixed(1)}%`, color: 'text-purple-400' },
              { label: 'Top 10 %',    value: `${Number(concentration.top10_pct)?.toFixed(1)}%`, color: 'text-blue-400' },
              { label: 'Investors',   value: concentration.total_investor_count,               color: 'text-cyan-400' },
              { label: 'Level',       value: concentration.concentration_label,                color: 'text-foreground' },
            ].map((m, i) => (
              <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] text-center">
                <p className="text-[10px] text-muted-foreground uppercase">{m.label}</p>
                <p className={`text-lg font-black mt-1 ${m.color}`}>{m.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ownership Pie */}
        <div className="glass rounded-2xl p-6 border border-border/30">
          <h4 className="font-bold mb-4 text-sm">Ownership Structure</h4>
          {ownerPieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={ownerPieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                  paddingAngle={3} dataKey="value">
                  {ownerPieData.map((_, i) => <Cell key={i} fill={OWN_COLORS[i % OWN_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: any) => [`${Number(v).toFixed(2)}%`, 'Ownership']}
                  contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-muted-foreground text-sm py-8">No ownership data</p>
          )}
        </div>

        {/* Institutional Change Timeline */}
        <div className="glass rounded-2xl p-6 border border-border/30">
          <h4 className="font-bold mb-1 text-sm">Institutional Change (6M)</h4>
          <div className="flex gap-3 mb-4 text-xs">
            <span className="text-emerald-400 font-bold">↑ {accumulating} accumulating</span>
            <span className="text-red-400 font-bold">↓ {reducing} reducing</span>
          </div>
          <div className="space-y-2 max-h-[230px] overflow-y-auto pr-1">
            {institutional
              .filter(i => i.action !== 'HOLDING' && i.action !== 'NEW_ENTRY')
              .slice(0, 12)
              .map((item: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-accent/20 hover:bg-accent/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-foreground truncate">{item.investor_name}</p>
                    <p className="text-[10px] text-muted-foreground">{item.report_date}</p>
                  </div>
                  <div className="text-right ml-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      item.action === 'ACCUMULATING' ? 'bg-emerald-500/20 text-emerald-400' :
                      item.action === 'REDUCING'     ? 'bg-red-500/20 text-red-400' :
                      'bg-slate-500/20 text-slate-400'
                    }`}>{item.action}</span>
                    <p className={`text-[10px] mt-0.5 ${Number(item.pct_point_change) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {Number(item.pct_point_change) >= 0 ? '+' : ''}{Number(item.pct_point_change)?.toFixed(2)}%
                    </p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  )
}


// ─── 7. TAB CONTENT: Stealth ──────────────────────────────────────────────────
export function StealthTab({
  stealthData, brokerConsistency
}: { stealthData: any | null; brokerConsistency: any[] }) {
  const DIV_CONFIG: Record<string, { color: string; label: string; icon: string }> = {
    'LOCAL_BUY_FOREIGN_SELL': { color: 'text-emerald-400', label: 'Lokal Beli, Asing Jual', icon: '🕵️' },
    'LOCAL_SELL_FOREIGN_BUY': { color: 'text-red-400',     label: 'Lokal Jual, Asing Beli', icon: '⚠️' },
    'BOTH_BUYING':             { color: 'text-cyan-400',    label: 'Semua Beli',             icon: '🔥' },
    'BOTH_SELLING':            { color: 'text-orange-400',  label: 'Semua Jual',             icon: '❄️' },
    'NEUTRAL':                 { color: 'text-muted-foreground', label: 'Netral',            icon: '➖' },
  }

  const cfg = stealthData ? (DIV_CONFIG[stealthData.divergence_type] || DIV_CONFIG.NEUTRAL) : null

  const consistentBuyers  = brokerConsistency.filter(b => b.verdict === 'CONSISTENT_BUY' || b.verdict === 'STRONG_BUY')
  const consistentSellers = brokerConsistency.filter(b => b.verdict === 'CONSISTENT_SELL' || b.verdict === 'STRONG_SELL')

  return (
    <div className="space-y-6">
      {/* Stealth vs Foreign Divergence */}
      {stealthData ? (
        <div className={`glass rounded-2xl p-6 border ${
          stealthData.divergence_type === 'LOCAL_BUY_FOREIGN_SELL' ? 'border-emerald-500/30' :
          stealthData.divergence_type === 'LOCAL_SELL_FOREIGN_BUY' ? 'border-red-500/30' : 'border-border/30'
        }`}>
          <h4 className="font-bold mb-4 text-sm flex items-center gap-2">
            <span>{cfg?.icon}</span> Stealth vs Foreign Divergence
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {[
              { label: 'Divergence Type',  value: cfg?.label,              color: cfg?.color },
              { label: 'Signal Strength',  value: stealthData.signal_strength, color: 'text-gold-400' },
              { label: 'Local Net',        value: formatRupiah(Number(stealthData.local_net_change)),
                color: Number(stealthData.local_net_change) >= 0 ? 'text-emerald-400' : 'text-red-400' },
              { label: 'Foreign Net',      value: formatRupiah(Number(stealthData.foreign_net_value)),
                color: Number(stealthData.foreign_net_value) >= 0 ? 'text-emerald-400' : 'text-red-400' },
            ].map((m, i) => (
              <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <p className="text-[10px] text-muted-foreground uppercase">{m.label}</p>
                <p className={`text-sm font-bold mt-1 ${m.color}`}>{m.value}</p>
              </div>
            ))}
          </div>
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <p className="text-xs font-medium text-foreground">💡 {stealthData.interpretation}</p>
          </div>
        </div>
      ) : (
        <div className="glass rounded-xl p-8 text-center text-muted-foreground text-sm">
          No divergence data for this period
        </div>
      )}

      {/* Broker Consistency */}
      <div className="glass rounded-2xl p-6 border border-border/30">
        <h4 className="font-bold mb-4 text-sm">Broker Consistency (30D)</h4>
        {brokerConsistency.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-4">No consistent broker activity</p>
        ) : (
          <div className="space-y-4">
            {consistentBuyers.length > 0 && (
              <div>
                <p className="text-xs text-emerald-400 font-bold uppercase mb-2">🟢 Consistent Buyers</p>
                <div className="space-y-2">
                  {consistentBuyers.map((b: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                      <div>
                        <p className="font-bold text-sm text-foreground">{b.kode_broker}</p>
                        <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">{b.nama_broker}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold text-emerald-400">{Number(b.consistency_pct)?.toFixed(0)}% buy days</p>
                        <p className="text-[10px] text-muted-foreground">{b.days_net_buy}/{b.total_days} hari</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {consistentSellers.length > 0 && (
              <div>
                <p className="text-xs text-red-400 font-bold uppercase mb-2">🔴 Consistent Sellers</p>
                <div className="space-y-2">
                  {consistentSellers.map((b: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-red-500/5 border border-red-500/20">
                      <div>
                        <p className="font-bold text-sm text-foreground">{b.kode_broker}</p>
                        <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">{b.nama_broker}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold text-red-400">{Number(b.consistency_pct)?.toFixed(0)}% sell days</p>
                        <p className="text-[10px] text-muted-foreground">{b.days_net_sell}/{b.total_days} hari</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Dummy imports needed in the original file (add to existing imports):
// import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line, PieChart, Pie, Legend } from 'recharts'
// import { formatRupiah } from '@/lib/utils'  ← sudah ada
