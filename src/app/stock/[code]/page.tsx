'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { formatRupiah, formatNumber } from '@/lib/utils'
import { 
  ArrowLeft, Activity, TrendingUp, Users, PieChart, BarChart3, 
  AlertTriangle, Eye, Zap, DollarSign, Building2, TrendingDown,
  RefreshCw, Globe
} from 'lucide-react'
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  ResponsiveContainer, PieChart as RechartsPie, Pie, Cell, Legend
} from 'recharts'

// Tabs
const TABS = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'chart', label: 'Accumulation Chart', icon: TrendingUp },
  { id: 'whale-flow', label: '5% Whale Flow', icon: Eye },
  { id: 'broker', label: 'Whale Broker', icon: Users },
  { id: 'ownership', label: '1% Ownership', icon: PieChart }
]

const COLORS = ['#e7b733', '#3b82f6', '#22c55e', '#ec4899', '#f97316', '#06b6d4', '#8b5cf6', '#64748b'];

export default function StockDetailPage() {
  const params = useParams()
  const router = useRouter()
  const code = (params.code as string).toUpperCase()
  
  const [activeTab, setActiveTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Data States
  const [basicInfo, setBasicInfo] = useState<any>(null)
  const [historyData, setHistoryData] = useState<any[]>([])
  const [linesConfig, setLinesConfig] = useState<string[]>([])
  const [flowData, setFlowData] = useState<any[]>([])
  const [brokerData, setBrokerData] = useState<any[]>([])
  const [ownershipData, setOwnershipData] = useState<any[]>([])
  const [pieData, setPieData] = useState<any[]>([])

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Fetch all required data in parallel (Super Fast)
      const [
        { data: priceRes },
        { data: histRes },
        { data: flowRes },
        { data: brokerRes },
        { data: ownResLatestDate }
      ] = await Promise.all([
        // 1. Get Latest Price & Basic Info from KSEI 5%
        supabase.from('ksei_data5_mutasi').select('typical_price, tanggal_data').eq('kode_efek', code).order('tanggal_data', { ascending: false }).limit(1),
        // 2. Get 1% History for Chart
        supabase.rpc('get_stock_investor_history', { p_stock_code: code }),
        // 3. Get 5% Flow
        supabase.rpc('get_stock_5persen_flow', { p_code: code, p_limit: 50 }),
        // 4. Get 5% Broker Aggregation (30 Days)
        supabase.rpc('get_stock_5persen_brokers', { p_code: code, p_days: 30 }),
        // 5. Get Latest Date from 1% Data to fetch ownership
        supabase.from('ksei_data1persen_mutasi').select('date').eq('share_code', code).order('date', { ascending: false }).limit(1)
      ])

      // Process Basic Info
      const currentPrice = priceRes?.[0]?.typical_price || 0;
      const lastUpdate = priceRes?.[0]?.tanggal_data || '-';

      // Process Chart Data
      const datesMap = new Map<string, any>()
      const investorsSet = new Set<string>()
      if (histRes) {
        histRes.forEach((r: any) => {
          const dateStr = new Date(r.report_date).toLocaleDateString('id-ID', {day: '2-digit', month: 'short'})
          if (!datesMap.has(r.report_date)) datesMap.set(r.report_date, { date: dateStr })
          // Convert scripless to lot
          datesMap.get(r.report_date)[r.investor_name] = Number(r.holdings_scripless) / 100
          investorsSet.add(r.investor_name)
        })
      }
      setHistoryData(Array.from(datesMap.values()))
      setLinesConfig(Array.from(investorsSet))
      setFlowData(flowRes || [])
      setBrokerData(brokerRes || [])

      // Process Ownership
      if (ownResLatestDate && ownResLatestDate.length > 0) {
        const latestDate = ownResLatestDate[0].date
        const { data: ownRes } = await supabase
          .from('ksei_data1persen_mutasi')
          .select('*')
          .eq('share_code', code)
          .eq('date', latestDate)
          .order('percentage', { ascending: false })
        
        setOwnershipData(ownRes || [])

        // Process Pie Chart for ownership (by local/foreign & type)
        const typeMap = new Map<string, number>()
        let totalPct = 0;
        (ownRes || []).forEach((r: any) => {
          const key = r.investor_type || 'Unknown'
          typeMap.set(key, (typeMap.get(key) || 0) + Number(r.percentage))
          totalPct += Number(r.percentage)
        })
        setPieData(Array.from(typeMap.entries()).map(([name, value]) => ({ name, value })))
        
        setBasicInfo({
          price: currentPrice,
          last_update: lastUpdate,
          total_1pct_holders: ownRes?.length || 0,
          total_pct_controlled: totalPct,
          net_5pct_flow: (brokerRes || []).reduce((acc: number, curr: any) => acc + Number(curr.net_value), 0)
        })
      } else {
        setBasicInfo({ price: currentPrice, last_update: lastUpdate, total_1pct_holders: 0, total_pct_controlled: 0, net_5pct_flow: 0 })
      }

    } catch (err: any) {
      setError(err.message || 'Gagal memuat data saham')
    } finally {
      setLoading(false)
    }
  }, [code])

  useEffect(() => { loadData() }, [loadData])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] flex items-center justify-center">
        <RefreshCw className="w-12 h-12 text-gold-400 animate-spin" />
      </div>
    )
  }

  if (error || !basicInfo) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] flex items-center justify-center">
        <div className="text-center bg-[#1e293b] p-8 rounded-2xl border border-red-500/30">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Error Loading Data</h2>
          <p className="text-slate-400 mb-6">{error}</p>
          <button onClick={() => router.back()} className="px-6 py-2 bg-slate-800 text-white rounded-xl hover:bg-slate-700">Kembali</button>
        </div>
      </div>
    )
  }

  const isNetFlowPos = basicInfo.net_5pct_flow >= 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] pb-12">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-[#0f172a]/80 border-b border-white/[0.05]">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <div className="flex items-center space-x-4">
              <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-white/[0.05] transition-colors">
                <ArrowLeft className="w-6 h-6 text-slate-400" />
              </button>
              <div>
                <h1 className="text-3xl font-black text-white">{code}</h1>
                <p className="text-xs text-gold-400">KSEI Deep Analytics</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400 mb-1">Typical Price (Ref 5%)</p>
              <p className="text-2xl font-bold text-white">Rp {formatNumber(basicInfo.price)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* ── Tabs Navigation ─────────────────────────────────────────────────── */}
        <div className="flex space-x-2 mb-8 overflow-x-auto pb-2 scrollbar-hide">
          {TABS.map(tab => {
            const Icon = tab.icon
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 px-5 py-3 rounded-xl font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-gradient-to-r from-gold-400 to-yellow-500 text-navy-900 shadow-lg'
                    : 'glass text-slate-400 hover:text-white border border-white/[0.05]'
                }`}>
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>

        {/* ── TAB: OVERVIEW ───────────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="glass rounded-2xl p-6 border border-white/[0.05]">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="p-2 bg-blue-500/20 rounded-lg"><Users className="w-5 h-5 text-blue-400" /></div>
                  <span className="text-sm font-medium text-slate-400">Total Paus (≥ 1%)</span>
                </div>
                <p className="text-3xl font-black text-white">{basicInfo.total_1pct_holders}</p>
                <p className="text-xs text-slate-500 mt-2">Institusi/Individu Pengendali</p>
              </div>

              <div className="glass rounded-2xl p-6 border border-white/[0.05]">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="p-2 bg-purple-500/20 rounded-lg"><PieChart className="w-5 h-5 text-purple-400" /></div>
                  <span className="text-sm font-medium text-slate-400">Penguasaan (≥ 1%)</span>
                </div>
                <p className="text-3xl font-black text-white">{basicInfo.total_pct_controlled.toFixed(2)}%</p>
                <p className="text-xs text-slate-500 mt-2">Beredar di tangan Paus</p>
              </div>

              <div className="glass rounded-2xl p-6 border border-white/[0.05]">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="p-2 bg-emerald-500/20 rounded-lg"><Activity className="w-5 h-5 text-emerald-400" /></div>
                  <span className="text-sm font-medium text-slate-400">Net Flow 5% (30D)</span>
                </div>
                <p className={`text-2xl font-black ${isNetFlowPos ? 'text-emerald-400' : 'text-red-400'}`}>
                  {isNetFlowPos ? '+' : ''}{formatRupiah(basicInfo.net_5pct_flow)}
                </p>
                <p className="text-xs text-slate-500 mt-2">Akumulasi bersih 30 hari</p>
              </div>

              <div className="glass rounded-2xl p-6 border border-white/[0.05] flex flex-col justify-center items-center text-center">
                {basicInfo.net_5pct_flow > 10000000000 ? (
                  <>
                    <Zap className="w-10 h-10 text-gold-400 mb-2 animate-pulse" />
                    <p className="font-bold text-gold-400">STRONG ACCUMULATION</p>
                  </>
                ) : basicInfo.net_5pct_flow < -10000000000 ? (
                  <>
                    <TrendingDown className="w-10 h-10 text-red-500 mb-2" />
                    <p className="font-bold text-red-500">HEAVY DISTRIBUTION</p>
                  </>
                ) : (
                  <>
                    <Globe className="w-10 h-10 text-slate-500 mb-2" />
                    <p className="font-bold text-slate-400">NEUTRAL / HOLD</p>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
               {/* Mini Chart Preview */}
               <div className="glass rounded-2xl p-6 border border-white/[0.05]">
                  <h3 className="text-lg font-bold text-white mb-4">Composition by Type (1%)</h3>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPie>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                          {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                        </Pie>
                        <RechartsTooltip formatter={(v: number) => [`${v.toFixed(2)}%`, 'Porsi']} contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8 }} />
                        <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: '12px' }} />
                      </RechartsPie>
                    </ResponsiveContainer>
                  </div>
               </div>
               
               {/* Mini Whale Alert Preview */}
               <div className="glass rounded-2xl p-6 border border-white/[0.05]">
                  <h3 className="text-lg font-bold text-white mb-4">Latest Whale Activities</h3>
                  <div className="space-y-3">
                    {flowData.slice(0, 4).map((d, i) => (
                      <div key={i} className="flex justify-between items-center p-3 bg-white/[0.02] rounded-lg border border-white/[0.05]">
                        <div>
                          <p className="font-bold text-sm text-white">{d.nama_pemegang_saham}</p>
                          <p className="text-[10px] text-slate-500">{new Date(d.tanggal_data).toLocaleDateString()} • {d.aksi}</p>
                        </div>
                        <div className="text-right">
                          <p className={`font-mono font-bold text-sm ${d.transaction_value > 0 && d.aksi !== 'Reduction' ? 'text-emerald-400' : 'text-red-400'}`}>
                            {formatRupiah(d.transaction_value)}
                          </p>
                        </div>
                      </div>
                    ))}
                    {flowData.length === 0 && <p className="text-sm text-slate-500 py-4 text-center">Belum ada transaksi masif 5%.</p>}
                  </div>
               </div>
            </div>
          </div>
        )}

        {/* ── TAB: CHART (TIME SERIES) ────────────────────────────────────────── */}
        {activeTab === 'chart' && (
          <div className="glass rounded-2xl p-6 border border-white/[0.05] animate-in fade-in">
            <div className="mb-6">
              <h3 className="text-xl font-bold text-white flex items-center gap-2"><TrendingUp className="text-emerald-400" /> Scripless Accumulation Chart</h3>
              <p className="text-sm text-slate-400 mt-1">Melacak pergerakan porsi saham digital (Scripless) masing-masing Paus 1% dari hari ke hari (Satuan: Lot).</p>
            </div>
            
            {historyData.length < 2 ? (
              <div className="h-[400px] flex flex-col items-center justify-center text-slate-500 border border-dashed border-white/[0.1] rounded-xl bg-black/20">
                <BarChart3 className="w-12 h-12 mb-2 opacity-20" />
                <p>Butuh minimal 2 tanggal data KSEI untuk menggambar grafik pergerakan.</p>
              </div>
            ) : (
              <div className="h-[500px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={historyData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={formatNumber} tickLine={false} axisLine={false} width={80} />
                    <RechartsTooltip 
                      formatter={(val: any) => [`${formatNumber(val)} Lot`, 'Scripless']}
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: 8 }}
                      labelStyle={{ color: '#94a3b8', marginBottom: 8 }}
                    />
                    <Legend wrapperStyle={{ paddingTop: 20 }} />
                    {linesConfig.map((inv, idx) => (
                      <Line key={inv} type="monotone" dataKey={inv} stroke={COLORS[idx % COLORS.length]} strokeWidth={2} dot={{ r: 3, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: 5% WHALE FLOW ──────────────────────────────────────────────── */}
        {activeTab === 'whale-flow' && (
          <div className="glass rounded-2xl border border-white/[0.05] overflow-hidden animate-in fade-in">
            <div className="p-6 border-b border-white/[0.05]">
              <h3 className="text-xl font-bold text-white flex items-center gap-2"><Eye className="text-blue-400" /> Log Transaksi Pemegang 5%</h3>
              <p className="text-sm text-slate-400 mt-1">Setiap mutasi saham raksasa (Beli/Jual) direkam dan dikonversi ke Rupiah.</p>
            </div>
            <div className="overflow-x-auto bg-black/20">
              <table className="w-full text-sm text-left">
                <thead className="bg-white/[0.02] border-b border-white/[0.05] text-slate-400">
                  <tr>
                    <th className="px-6 py-4 font-medium">Tanggal</th>
                    <th className="px-6 py-4 font-medium">Nama Investor</th>
                    <th className="px-6 py-4 font-medium">Broker</th>
                    <th className="px-6 py-4 font-medium text-center">Aksi</th>
                    <th className="px-6 py-4 font-medium text-right">Vol (Lembar)</th>
                    <th className="px-6 py-4 font-medium text-right text-gold-400">Nilai (Rp)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {flowData.map((d, i) => {
                    const isAcc = d.aksi === 'Buying' || d.aksi === 'Accumulation';
                    return (
                      <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-4 text-slate-400">{new Date(d.tanggal_data).toLocaleDateString('id-ID')}</td>
                        <td className="px-6 py-4 font-bold text-white">
                          {d.nama_pemegang_saham}
                          {d.konglomerasi !== '-' && <span className="block text-[10px] text-blue-400 mt-0.5">{d.konglomerasi}</span>}
                        </td>
                        <td className="px-6 py-4 text-slate-400">{d.kode_broker}</td>
                        <td className="px-6 py-4 text-center">
                          <span className={`px-2 py-1 rounded text-[10px] font-bold ${isAcc ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                            {d.aksi}
                          </span>
                        </td>
                        <td className={`px-6 py-4 text-right font-mono ${isAcc ? 'text-emerald-400' : 'text-red-400'}`}>
                          {isAcc ? '+' : '-'}{formatNumber(d.perubahan_saham)}
                        </td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-gold-400">
                          {formatRupiah(d.transaction_value)}
                        </td>
                      </tr>
                    )
                  })}
                  {flowData.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-slate-500">Tidak ada data flow 5%.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB: WHALE BROKER ───────────────────────────────────────────────── */}
        {activeTab === 'broker' && (
          <div className="glass rounded-2xl border border-white/[0.05] overflow-hidden animate-in fade-in">
            <div className="p-6 border-b border-white/[0.05]">
              <h3 className="text-xl font-bold text-white flex items-center gap-2"><Building2 className="text-amber-400" /> Aggregasi Broker (Paus 5%)</h3>
              <p className="text-sm text-slate-400 mt-1">Total akumulasi dan distribusi per broker selama 30 Hari Terakhir.</p>
            </div>
            <div className="overflow-x-auto bg-black/20">
              <table className="w-full text-sm text-left">
                <thead className="bg-white/[0.02] border-b border-white/[0.05] text-slate-400">
                  <tr>
                    <th className="px-6 py-4 font-medium">Broker</th>
                    <th className="px-6 py-4 font-medium text-right text-emerald-400">Total Beli (Rp)</th>
                    <th className="px-6 py-4 font-medium text-right text-red-400">Total Jual (Rp)</th>
                    <th className="px-6 py-4 font-medium text-right text-gold-400">Net Value (Rp)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {brokerData.map((d, i) => {
                    const isNetPos = Number(d.net_value) >= 0;
                    return (
                      <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-4 font-bold text-white text-lg">{d.kode_broker}</td>
                        <td className="px-6 py-4 text-right font-mono text-emerald-400">{formatRupiah(d.buy_value)}</td>
                        <td className="px-6 py-4 text-right font-mono text-red-400">{formatRupiah(d.sell_value)}</td>
                        <td className={`px-6 py-4 text-right font-mono font-black ${isNetPos ? 'text-gold-400' : 'text-red-500'}`}>
                          {isNetPos ? '+' : ''}{formatRupiah(d.net_value)}
                        </td>
                      </tr>
                    )
                  })}
                  {brokerData.length === 0 && <tr><td colSpan={4} className="text-center py-8 text-slate-500">Tidak ada data broker 5%.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB: 1% OWNERSHIP ───────────────────────────────────────────────── */}
        {activeTab === 'ownership' && (
          <div className="glass rounded-2xl border border-white/[0.05] overflow-hidden animate-in fade-in">
             <div className="p-6 border-b border-white/[0.05] flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2"><PieChart className="text-purple-400" /> Komposisi Kepemilikan 1%</h3>
                <p className="text-sm text-slate-400 mt-1">Daftar lengkap entitas yang memegang saham ≥ 1%.</p>
              </div>
              <span className="px-3 py-1 bg-white/[0.05] rounded-lg text-xs font-mono text-slate-400">As of {basicInfo.last_update}</span>
            </div>
            <div className="overflow-x-auto bg-black/20">
              <table className="w-full text-sm text-left">
                <thead className="bg-white/[0.02] border-b border-white/[0.05] text-slate-400">
                  <tr>
                    <th className="px-6 py-4 font-medium">Nama Investor</th>
                    <th className="px-6 py-4 font-medium">Tipe</th>
                    <th className="px-6 py-4 font-medium text-center">Domisili</th>
                    <th className="px-6 py-4 font-medium text-right">Scrip (Warkat)</th>
                    <th className="px-6 py-4 font-medium text-right text-emerald-400">Scripless (Digital)</th>
                    <th className="px-6 py-4 font-medium text-right text-gold-400">Total %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {ownershipData.map((d, i) => (
                    <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 font-bold text-white max-w-[250px] truncate" title={d.investor_name}>{d.investor_name}</td>
                      <td className="px-6 py-4 text-slate-400 text-xs">{d.investor_type}</td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${d.local_foreign==='F' ? 'bg-blue-500/20 text-blue-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                          {d.local_foreign==='F' ? '🌏 Asing' : '🇮🇩 Lokal'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-slate-500">{formatNumber(d.holdings_scrip)}</td>
                      <td className="px-6 py-4 text-right font-mono font-bold text-emerald-400">{formatNumber(d.holdings_scripless)}</td>
                      <td className="px-6 py-4 text-right font-mono font-black text-gold-400">{Number(d.percentage).toFixed(2)}%</td>
                    </tr>
                  ))}
                  {ownershipData.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-slate-500">Tidak ada pemegang saham 1%.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
