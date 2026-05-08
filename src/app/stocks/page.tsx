'use client'

import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatRupiah, formatPercent, formatNumber, formatShares } from '@/lib/utils'
import { Search, TrendingUp, TrendingDown, Activity, Globe, Zap, Eye, RefreshCw, ChevronRight } from 'lucide-react'
import Link from 'next/link'

interface StockRow {
  stock_code: string; sector: string; close: number; change_percent: number
  value: number; net_foreign_value: number; whale_signal: boolean; big_player_anomaly: boolean; signal: string; aov_ratio_ma20: number
}

export default function StocksPage() {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState<StockRow[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [latestDate, setLatestDate] = useState('')

  const doSearch = useCallback(async (q: string) => {
    if (!q || q.length < 1) return
    setLoading(true); setSearched(true)
    try {
      const { data: dd } = await supabase.from('daily_transactions')
        .select('trading_date').order('trading_date', { ascending: false }).limit(1)
      const date = dd?.[0]?.trading_date
      setLatestDate(date || '')

      const { data } = await supabase.from('daily_transactions')
        .select('stock_code,sector,close,change_percent,value,net_foreign_value,whale_signal,big_player_anomaly,signal,aov_ratio_ma20')
        .eq('trading_date', date)
        .ilike('stock_code', `${q.toUpperCase()}%`)
        .order('value', { ascending: false })
        .limit(30)
      setResults((data || []).map((r: any) => ({
        ...r, close: Number(r.close), change_percent: Number(r.change_percent),
        value: Number(r.value), net_foreign_value: Number(r.net_foreign_value),
      })))
    } finally { setLoading(false) }
  }, [])

  const SIGNAL_STYLE: Record<string, string> = {
    Akumulasi: 'bg-emerald-500/20 text-emerald-400', STRONG_BUY: 'bg-emerald-500/20 text-emerald-400',
    Distribusi: 'bg-red-500/20 text-red-400', AVOID: 'bg-red-500/20 text-red-400',
    WATCH: 'bg-amber-500/20 text-amber-400', Netral: 'bg-slate-500/20 text-slate-400', NEUTRAL: 'bg-slate-500/20 text-slate-400',
  }

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight">
          <Eye className="w-8 h-8 text-gold-400 inline mr-2" />
          <span className="gradient-gold">Stock</span> <span className="text-foreground">Intelligence</span>
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">Cari & analisis saham IDX secara individual · Data {latestDate}</p>
      </div>

      {/* Search Box */}
      <div className="glass rounded-2xl p-6 border border-border/30">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === 'Enter') doSearch(query) }}
              placeholder="Ketik kode saham... (contoh: BBCA, AADI, TLKM)"
              maxLength={6}
              className="w-full pl-12 pr-4 py-3.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-sm uppercase focus:outline-none focus:border-gold-400/40 transition-all text-lg font-bold"
            />
          </div>
          <button onClick={() => doSearch(query)} disabled={loading || !query}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-gold-400 to-yellow-500 text-navy-900 font-bold text-sm disabled:opacity-50 shadow-lg shadow-amber-500/20">
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Cari
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">
          💡 Tips: Ketik minimal 1 huruf. Tekan Enter untuk cari. Klik nama saham untuk analisis lengkap.
        </p>
      </div>

      {/* Results */}
      {!searched && (
        <div className="glass rounded-2xl p-10 text-center border border-border/30">
          <Search className="w-16 h-16 mx-auto mb-4 opacity-10" />
          <p className="font-bold text-foreground">Cari saham di atas</p>
          <p className="text-xs text-muted-foreground mt-1">Masukkan kode saham untuk melihat data real-time + Smart Money analysis</p>
          <div className="flex flex-wrap justify-center gap-2 mt-5">
            {['BBCA','AADI','TLKM','BMRI','GOTO','BYAN','ADRO','ASII'].map(c => (
              <button key={c} onClick={() => { setQuery(c); doSearch(c) }}
                className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs font-mono font-bold text-muted-foreground hover:text-gold-400 hover:border-gold-400/30 transition-all">
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {searched && !loading && results.length === 0 && (
        <div className="glass rounded-xl p-10 text-center text-muted-foreground">
          <p className="font-bold">Saham "{query}" tidak ditemukan</p>
          <p className="text-xs mt-1">Pastikan kode sudah benar. Data dari hari trading terakhir.</p>
        </div>
      )}

      {loading && (
        <div className="space-y-2">{Array.from({length:5}).map((_,i)=><div key={i} className="shimmer h-16 rounded-xl"/>)}</div>
      )}

      {results.length > 0 && (
        <div className="glass rounded-2xl overflow-hidden border border-border/30">
          <div className="p-4 border-b border-white/[0.05] flex items-center justify-between">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <Activity className="w-4 h-4 text-gold-400" /> {results.length} hasil untuk &quot;{query}&quot;
            </h3>
            <span className="text-xs text-muted-foreground">{latestDate}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-white/[0.02] border-b border-white/[0.05] text-[10px] text-muted-foreground uppercase">
                <th className="p-4 text-left">Saham</th>
                <th className="p-4 text-right">Harga</th>
                <th className="p-4 text-right">Chg%</th>
                <th className="p-4 text-right hidden md:table-cell">Value</th>
                <th className="p-4 text-right hidden lg:table-cell">Foreign</th>
                <th className="p-4 text-center">Flags</th>
                <th className="p-4 text-center">Signal</th>
                <th className="p-4 text-center">Detail</th>
              </tr></thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.stock_code} className="tr-hover border-b border-white/[0.02]">
                    <td className="p-4">
                      <p className="font-black font-mono text-base text-foreground">{r.stock_code}</p>
                      <p className="text-[10px] text-muted-foreground truncate max-w-[140px]">{r.sector || '—'}</p>
                    </td>
                    <td className="p-4 text-right font-bold text-lg">{formatNumber(r.close)}</td>
                    <td className={`p-4 text-right font-bold ${r.change_percent>=0?'text-emerald-400':'text-red-400'}`}>
                      {r.change_percent>=0?'▲':'▼'} {Math.abs(r.change_percent).toFixed(2)}%
                    </td>
                    <td className="p-4 text-right hidden md:table-cell text-muted-foreground text-xs">{formatRupiah(r.value)}</td>
                    <td className={`p-4 text-right hidden lg:table-cell font-semibold text-xs ${r.net_foreign_value>=0?'text-emerald-400':'text-red-400'}`}>
                      {formatRupiah(r.net_foreign_value)}
                    </td>
                    <td className="p-4 text-center">
                      {r.whale_signal && <span title="Whale">🐋</span>}
                      {r.big_player_anomaly && <span title="Big Player">⚡</span>}
                      {r.net_foreign_value>0 && <span title="Foreign Buy">🌏</span>}
                      {!r.whale_signal && !r.big_player_anomaly && r.net_foreign_value<=0 && <span className="text-muted-foreground/30">—</span>}
                    </td>
                    <td className="p-4 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${SIGNAL_STYLE[r.signal]||'bg-slate-500/20 text-slate-400'}`}>
                        {r.signal||'—'}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <Link href={`/stock/${r.stock_code}`}
                        className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-gold-400/10 border border-gold-400/30 text-gold-400 text-xs font-bold hover:bg-gold-400/20 transition-colors">
                        Analisis <ChevronRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
