'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatRupiah, formatShares } from '@/lib/utils'
import { TrendingUp, TrendingDown, RefreshCw, AlertTriangle, X, Building2, Activity, ArrowRightLeft } from 'lucide-react'
import Link from 'next/link'

interface FlowItem { kode_efek: string; buy: number; sell: number; net: number; konglomerasi: string | null }
interface KongloItem { konglo: string; stocks: string[]; net: number }

export default function FlowPage() {
  const [flow, setFlow]       = useState<FlowItem[]>([])
  const [konglo, setKonglo]   = useState<KongloItem[]>([])
  const [view, setView]       = useState<'flow'|'konglo'>('flow')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string|null>(null)
  const [window, setWindow]   = useState(30)
  const [latestDate, setLatestDate] = useState('')

  const fetchFlow = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      // Get date range
      const { data: dd } = await supabase.from('ksei_data5_mutasi')
        .select('tanggal_data').order('tanggal_data', { ascending: false }).limit(1)
      const latest = dd?.[0]?.tanggal_data; if (!latest) throw new Error('Tidak ada data KSEI 5%')
      setLatestDate(latest)
      const start = new Date(latest); start.setDate(start.getDate() - window)
      const startStr = start.toISOString().split('T')[0]

      const { data, error: e } = await supabase
        .from('ksei_data5_mutasi')
        .select('kode_efek,aksi,transaction_value,konglomerasi')
        .gte('tanggal_data', startStr)
        .in('aksi', ['Buying','Accumulation','Reduction','Hold'])
        .order('transaction_value', { ascending: false })
        .limit(5000)
      if (e) throw e

      // Aggregate
      const map = new Map<string, FlowItem>()
      ;(data||[]).forEach((r: any) => {
        const tv = Number(r.transaction_value)||0
        if (!map.has(r.kode_efek)) map.set(r.kode_efek, { kode_efek: r.kode_efek, buy:0, sell:0, net:0, konglomerasi: r.konglomerasi||null })
        const item = map.get(r.kode_efek)!
        if (r.aksi==='Buying'||r.aksi==='Accumulation') { item.buy+=tv; item.net+=tv }
        else if (r.aksi==='Reduction') { item.sell+=tv; item.net-=tv }
      })
      setFlow(Array.from(map.values()).sort((a,b)=>Math.abs(b.net)-Math.abs(a.net)))

      // Konglo aggregation
      const km = new Map<string, KongloItem>()
      ;(data||[]).forEach((r: any) => {
        const k = r.konglomerasi
        if (!k || k==='-'||k==='') return
        if (!km.has(k)) km.set(k, { konglo: k, stocks:[], net:0 })
        const g = km.get(k)!
        if (!g.stocks.includes(r.kode_efek)) g.stocks.push(r.kode_efek)
        const tv = Number(r.transaction_value)||0
        if (r.aksi==='Buying'||r.aksi==='Accumulation') g.net+=tv
        else if (r.aksi==='Reduction') g.net-=tv
      })
      setKonglo(Array.from(km.values()).sort((a,b)=>Math.abs(b.net)-Math.abs(a.net)))
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [window])

  useEffect(() => { fetchFlow() }, [fetchFlow])

  const buyers  = flow.filter(r=>r.net>0).slice(0,15)
  const sellers = flow.filter(r=>r.net<0).sort((a,b)=>a.net-b.net).slice(0,15)
  const totalBuy  = flow.reduce((s,r)=>s+(r.buy||0),0)
  const totalSell = flow.reduce((s,r)=>s+(r.sell||0),0)

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">
            <span className="gradient-gold">5%</span> <span className="text-foreground">Flow Tracker</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">Monitoring kepemilikan ≥5% · Latest: {latestDate}</p>
        </div>
        <div className="flex gap-3">
          <div className="glass rounded-xl p-1 flex gap-1 border border-border/30">
            {([['flow','📊 Flow'],['konglo','🏢 Konglo']] as const).map(([v,l]) => (
              <button key={v} onClick={()=>setView(v)}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${view===v?'bg-gradient-to-r from-gold-400 to-yellow-500 text-navy-900':'text-muted-foreground hover:text-foreground'}`}>{l}</button>
            ))}
          </div>
          <select value={window} onChange={e=>setWindow(Number(e.target.value))}
            className="bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-xs">
            {[7,14,30,60].map(d=><option key={d} value={d}>{d} Hari</option>)}
          </select>
          <button onClick={fetchFlow} disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gold-400/10 border border-gold-400/30 text-gold-400 text-sm font-bold">
            <RefreshCw className={`w-4 h-4 ${loading?'animate-spin':''}`}/>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label:'Emiten Aktif', value: flow.length, color:'text-foreground', icon: Activity },
          { label:'Total Buying', value: formatRupiah(totalBuy), color:'text-emerald-400', icon: TrendingUp },
          { label:'Total Selling', value: formatRupiah(totalSell), color:'text-red-400', icon: TrendingDown },
          { label:'Net Flow', value: formatRupiah(totalBuy-totalSell), color:(totalBuy-totalSell)>=0?'text-emerald-400':'text-red-400', icon: ArrowRightLeft },
        ].map((m,i)=>{ const Icon=m.icon; return (
          <div key={i} className="glass rounded-2xl p-5 border border-border/30 card-hover">
            <Icon className={`w-5 h-5 ${m.color} mb-3`}/>
            <p className="text-xs text-muted-foreground uppercase">{m.label}</p>
            <p className={`text-xl font-black mt-1 ${m.color}`}>{m.value}</p>
          </div>
        )})}
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm">
          <AlertTriangle className="w-5 h-5"/><span className="flex-1">{error}</span>
          <button onClick={()=>setError(null)}><X className="w-4 h-4"/></button>
        </div>
      )}

      {loading ? <div className="space-y-2">{Array.from({length:6}).map((_,i)=><div key={i} className="shimmer h-12 rounded-xl"/>)}</div>
      : view==='flow' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Buyers */}
          <div className="glass rounded-2xl overflow-hidden border border-emerald-500/20">
            <div className="p-4 border-b border-white/[0.05] flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400"/>
              <h3 className="font-bold text-emerald-400">Top Akumulasi ({window}D)</h3>
              <span className="ml-auto text-xs text-muted-foreground">{buyers.length} emiten</span>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="text-[10px] text-muted-foreground uppercase border-b border-white/[0.05]">
                <th className="p-3 text-left">Emiten</th>
                <th className="p-3 text-right">Net Buy</th>
                <th className="p-3 text-left hidden md:table-cell">Konglo</th>
              </tr></thead>
              <tbody>
                {buyers.map((r,i)=>(
                  <tr key={i} className="tr-hover border-b border-white/[0.02]">
                    <td className="p-3"><Link href={`/stock/${r.kode_efek}`} className="font-mono font-black text-foreground hover:text-gold-400 transition-colors">{r.kode_efek}</Link></td>
                    <td className="p-3 text-right font-bold text-emerald-400">+{formatRupiah(r.net)}</td>
                    <td className="p-3 hidden md:table-cell">
                      {r.konglomerasi&&r.konglomerasi!=='-'?<span className="text-[10px] px-2 py-0.5 rounded bg-gold-400/10 text-gold-400 font-bold">{r.konglomerasi.slice(0,18)}</span>:<span className="text-muted-foreground text-[10px]">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Sellers */}
          <div className="glass rounded-2xl overflow-hidden border border-red-500/20">
            <div className="p-4 border-b border-white/[0.05] flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-red-400"/>
              <h3 className="font-bold text-red-400">Top Distribusi ({window}D)</h3>
              <span className="ml-auto text-xs text-muted-foreground">{sellers.length} emiten</span>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="text-[10px] text-muted-foreground uppercase border-b border-white/[0.05]">
                <th className="p-3 text-left">Emiten</th>
                <th className="p-3 text-right">Net Sell</th>
                <th className="p-3 text-left hidden md:table-cell">Konglo</th>
              </tr></thead>
              <tbody>
                {sellers.map((r,i)=>(
                  <tr key={i} className="tr-hover border-b border-white/[0.02]">
                    <td className="p-3"><Link href={`/stock/${r.kode_efek}`} className="font-mono font-black text-foreground hover:text-gold-400 transition-colors">{r.kode_efek}</Link></td>
                    <td className="p-3 text-right font-bold text-red-400">{formatRupiah(r.net)}</td>
                    <td className="p-3 hidden md:table-cell">
                      {r.konglomerasi&&r.konglomerasi!=='-'?<span className="text-[10px] px-2 py-0.5 rounded bg-gold-400/10 text-gold-400 font-bold">{r.konglomerasi.slice(0,18)}</span>:<span className="text-muted-foreground text-[10px]">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Konglo View */
        konglo.length===0 ? (
          <div className="glass rounded-xl p-12 text-center text-muted-foreground">
            <Building2 className="w-12 h-12 mx-auto mb-3 opacity-20"/>
            <p className="font-bold">Tidak ada data konglomerasi</p>
            <p className="text-xs mt-1">Pastikan kolom `konglomerasi` sudah diisi di ksei_data5_mutasi</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {konglo.map((k,i)=>(
              <div key={k.konglo} className="glass rounded-xl p-5 border border-border/30 hover:border-gold-400/30 transition-all card-hover">
                <div className="flex items-start justify-between mb-3">
                  <p className="font-bold text-sm leading-tight">{k.konglo}</p>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${k.net>=0?'bg-emerald-500/20 text-emerald-400':'bg-red-500/20 text-red-400'}`}>
                    {k.net>=0?'▲ Akumulasi':'▼ Distribusi'}
                  </span>
                </div>
                <p className={`text-xl font-black mb-3 ${k.net>=0?'text-emerald-400':'text-red-400'}`}>{k.net>=0?'+':''}{formatRupiah(k.net)}</p>
                <div className="flex flex-wrap gap-1">
                  {k.stocks.slice(0,5).map(s=><span key={s} className="text-[10px] px-2 py-0.5 rounded bg-accent/40 text-muted-foreground font-mono">{s}</span>)}
                  {k.stocks.length>5&&<span className="text-[10px] px-2 py-0.5 rounded bg-gold-400/10 text-gold-400">+{k.stocks.length-5}</span>}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
