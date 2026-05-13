'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { 
  RefreshCw, Database, Zap, TrendingUp, TrendingDown, 
  AlertTriangle, X, Clock, CheckCircle2, Maximize2, Minimize2,
  Search, BarChart3, Loader2
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface BrokerRow {
  date: string;
  broker_code: string;
  buy_value: number;
  sell_value: number;
  net_value: number;
  net_lot: number;
}

interface AccumulationResult {
  stock_code: string;
  total_net_value: number;
  total_net_lot: number;
  buy_value: number;
  sell_value: number;
  broker_count: number;
  top_buyer: string;
  top_seller: string;
  accumulation_score: number;
}

interface CacheEntry {
  rows: BrokerRow[];
  topBrokers: string[];
  fetchedAt: number;
  code: string;
  days: string;
}

// ── Cache Config ──────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 4 * 60 * 60 * 1000;
const CACHE_PREFIX = 'bdm_motherduck_v1_';

function getCacheKey(code: string, days: string) {
  return `${CACHE_PREFIX}${code.toUpperCase()}_${days}d`;
}

function saveCache(code: string, days: string, rows: BrokerRow[], topBrokers: string[]) {
  try {
    sessionStorage.setItem(getCacheKey(code, days), JSON.stringify({ rows, topBrokers, fetchedAt: Date.now(), code, days }));
  } catch (e) {}
}

function loadCache(code: string, days: string): CacheEntry | null {
  try {
    const raw = sessionStorage.getItem(getCacheKey(code, days));
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
      sessionStorage.removeItem(getCacheKey(code, days));
      return null;
    }
    return entry;
  } catch { return null; }
}

function formatAge(fetchedAt: number): string {
  const s = Math.floor((Date.now() - fetchedAt) / 1000);
  if (s < 60) return `${s} detik lalu`;
  if (s < 3600) return `${Math.floor(s / 60)} menit lalu`;
  return `${Math.floor(s / 3600)} jam lalu`;
}

// ── Utils ──────────────────────────────────────────────────────────────────
const VALID_CODE = /^[A-Z0-9]{1,6}$/;
const PAGE_SIZE = 50;

function fmt(v: number): string {
  if (v == null || isNaN(v)) return '0';
  const a = Math.abs(v);
  if (a >= 1e11) return `${(v / 1e12).toFixed(2)}T`;
  if (a >= 1e9)  return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6)  return `${(v / 1e6).toFixed(0)}M`;
  if (a >= 1e3)  return `${(v / 1e3).toFixed(0)}K`;
  return v.toFixed(0);
}

const BROKER_COLORS = [
  '#e7b733', '#22c55e', '#3b82f6', '#a855f7', '#ef4444',
  '#06b6d4', '#f97316', '#ec4899', '#84cc16', '#64748b',
];

const PERIODS = [
  { label: '7 Hari', value: '7' },
  { label: '15 Hari', value: '15' },
  { label: '1 Bulan', value: '30' },
  { label: '3 Bulan', value: '90' },
  { label: '6 Bulan', value: '180' },
];

// ── KOMPONEN UTAMA ────────────────────────────────────────────────────────────
export default function BandarmologiPage() {
  const [activeTab, setActiveTab] = useState<'tracker' | 'screener'>('tracker');
  
  // Tracker State
  const [code, setCode] = useState('BBCA');
  const [days, setDays] = useState('30');
  const [data, setData] = useState<BrokerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [topBrokers, setTopBrokers] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [fromCache, setFromCache] = useState(false);
  const [cacheAge, setCacheAge] = useState('');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [chartMode, setChartMode] = useState<'daily' | 'cumulative'>('daily');

  // Screener State
  const [screenerPeriod, setScreenerPeriod] = useState('30');
  const [screenerData, setScreenerData] = useState<AccumulationResult[]>([]);
  const [screenerLoading, setScreenerLoading] = useState(false);
  const [screenerError, setScreenerError] = useState('');
  const [screenerSort, setScreenerSort] = useState<string>('score');
  const [screenerFilter, setScreenerFilter] = useState<'all' | 'accumulation' | 'distribution'>('all');
  const [screenerPage, setScreenerPage] = useState(0);

  // ── Load Tracker Data ─────────────────────────────────────────────────────
  const loadData = async (forceRefresh = false) => {
    const codeUpper = code.toUpperCase();
    if (!VALID_CODE.test(codeUpper)) {
      setError('Kode saham tidak valid');
      return;
    }

    if (!forceRefresh) {
      const cached = loadCache(codeUpper, days);
      if (cached) {
        setData(cached.rows);
        setTopBrokers(cached.topBrokers);
        setSelected(new Set(cached.topBrokers.slice(0, 5)));
        setFromCache(true);
        setCacheAge(formatAge(cached.fetchedAt));
        setPage(0);
        setError('');
        return;
      }
    }

    setLoading(true);
    setError('');
    setData([]);
    setFromCache(false);

    try {
      const res = await fetch(`/api/broker-tracker?action=tracker&code=${codeUpper}&days=${days}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gagal load data dari MotherDuck');
      
      const rows: BrokerRow[] = json.data || [];
      if (!rows.length) throw new Error(`Tidak ada data untuk ${codeUpper}.`);

      const brokerMap = new Map<string, number>();
      rows.forEach(r => brokerMap.set(r.broker_code, (brokerMap.get(r.broker_code) ?? 0) + Math.abs(r.net_value)));
      const top10 = Array.from(brokerMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([c]) => c);

      saveCache(codeUpper, days, rows, top10);

      setData(rows);
      setTopBrokers(top10);
      setSelected(new Set(top10.slice(0, 5)));
      setPage(0);
      setCacheAge('baru saja');
    } catch (e: any) {
      setError(e.message ?? 'Terjadi kesalahan');
    } finally {
      setLoading(false);
    }
  };

  const handleForceRefresh = () => {
    sessionStorage.removeItem(getCacheKey(code.toUpperCase(), days));
    loadData(true);
  };

  const toggle = (c: string) => {
    const s = new Set(selected);
    s.has(c) ? s.delete(c) : s.add(c);
    setSelected(s);
  };

  // ── Load Screener Data ────────────────────────────────────────────────────
  const loadScreener = async () => {
    setScreenerLoading(true);
    setScreenerError('');

    try {
      const res = await fetch(`/api/broker-tracker?action=screener&days=${screenerPeriod}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gagal load screener dari MotherDuck');
      setScreenerData(json.data || []);
    } catch (e: any) {
      setScreenerError(e.message ?? 'Analisa gagal');
    } finally {
      setScreenerLoading(false);
    }
  };

  // ── Stats & Data Memo ─────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!data.length) return null;
    const brokerTotals = new Map<string, number>();
    data.forEach(r => brokerTotals.set(r.broker_code, (brokerTotals.get(r.broker_code) ?? 0) + r.net_value));
    const sorted = Array.from(brokerTotals.entries()).sort((a, b) => b[1] - a[1]);
    const topBuy = sorted[0];
    const topSell = sorted[sorted.length - 1];
    const totalNet = data.reduce((s, r) => s + r.net_value, 0);
    return { topBuy, topSell, totalNet };
  }, [data]);

  const chartData = useMemo(() => {
    const map: Record<string, any> = {};
    data.forEach(r => {
      if (!map[r.date]) {
        map[r.date] = { date: r.date };
        topBrokers.forEach(b => { map[r.date][b] = 0; });
      }
      if (selected.has(r.broker_code)) {
        map[r.date][r.broker_code] = (map[r.date][r.broker_code] ?? 0) + r.net_value;
      }
    });
    
    const sorted = Object.values(map).sort((a: any, b: any) => a.date.localeCompare(b.date));
    
    if (chartMode === 'cumulative') {
      const runningSum: Record<string, number> = {};
      topBrokers.forEach(b => { runningSum[b] = 0; });
      return sorted.map(day => {
        const cumDay: any = { date: day.date };
        topBrokers.forEach(b => {
          if (day[b]) runningSum[b] += day[b];
          cumDay[b] = runningSum[b];
        });
        return cumDay;
      });
    }
    return sorted;
  }, [data, selected, topBrokers, chartMode]);

  const screenerFiltered = useMemo(() => {
    let filtered = [...screenerData];
    if (screenerFilter === 'accumulation') filtered = filtered.filter(r => r.accumulation_score > 10);
    else if (screenerFilter === 'distribution') filtered = filtered.filter(r => r.accumulation_score < -10);
    
    switch (screenerSort) {
      case 'code_asc': filtered.sort((a, b) => a.stock_code.localeCompare(b.stock_code)); break;
      case 'code_desc': filtered.sort((a, b) => b.stock_code.localeCompare(a.stock_code)); break;
      case 'value_desc': filtered.sort((a, b) => b.total_net_value - a.total_net_value); break;
      case 'score_desc': filtered.sort((a, b) => b.accumulation_score - a.accumulation_score); break;
      case 'score': default: filtered.sort((a, b) => a.accumulation_score - b.accumulation_score); break;
      case 'value': filtered.sort((a, b) => a.total_net_value - b.total_net_value); break;
    }
    return filtered;
  }, [screenerData, screenerFilter, screenerSort]);

  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
  const pageData = data.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  
  const screenerPages = Math.max(1, Math.ceil(screenerFiltered.length / PAGE_SIZE));
  const screenerPageData = screenerFiltered.slice(screenerPage * PAGE_SIZE, (screenerPage + 1) * PAGE_SIZE);

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">
            <Database className="w-8 h-8 text-gold-400 inline mr-2" />
            <span className="gradient-gold">Broker</span> <span className="text-foreground">Tracker</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Analisa broker & screener akumulasi · MotherDuck DB Serverless
          </p>
        </div>

        <div className="flex rounded-xl glass border border-border/30 p-1">
          <button onClick={() => setActiveTab('tracker')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'tracker' ? 'bg-gold-400/20 text-gold-400 shadow-lg' : 'text-muted-foreground hover:text-foreground'}`}>
            <Zap className="w-4 h-4 inline mr-2" /> Individual
          </button>
          <button onClick={() => setActiveTab('screener')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'screener' ? 'bg-gold-400/20 text-gold-400 shadow-lg' : 'text-muted-foreground hover:text-foreground'}`}>
            <Search className="w-4 h-4 inline mr-2" /> Screener Akumulasi
          </button>
        </div>
      </div>

      {activeTab === 'tracker' && (
        <>
          <div className="glass rounded-2xl p-5 border border-border/30 space-y-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Kode Saham</label>
                <input type="text" value={code} maxLength={6} placeholder="BBCA" onChange={e => setCode(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && loadData()} className="bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-2.5 w-32 uppercase font-mono font-bold text-sm focus:outline-none focus:border-gold-400/40 text-foreground transition-colors" />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Lookback</label>
                <select value={days} onChange={e => setDays(e.target.value)} className="bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gold-400/40 text-foreground">
                  {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div className="flex gap-2 pb-0.5">
                <button onClick={() => loadData(false)} disabled={loading} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gold-400/10 border border-gold-400/30 text-gold-400 text-sm font-bold hover:bg-gold-400/20 disabled:opacity-50 transition-all">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} Lacak
                </button>
                {data.length > 0 && (
                  <button onClick={handleForceRefresh} disabled={loading} className="flex items-center gap-2 px-3 py-2.5 rounded-xl glass border border-border/30 text-muted-foreground text-sm hover:text-foreground hover:border-gold-400/30 transition-all">
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
                  </button>
                )}
              </div>
            </div>

            {chartData.length > 0 && (
              <div className="flex gap-2">
                <button onClick={() => setChartMode('daily')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${chartMode === 'daily' ? 'bg-gold-400/20 text-gold-400' : 'text-muted-foreground'}`}>Harian</button>
                <button onClick={() => setChartMode('cumulative')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${chartMode === 'cumulative' ? 'bg-gold-400/20 text-gold-400' : 'text-muted-foreground'}`}>Kumulatif</button>
              </div>
            )}
            
            {data.length > 0 && (
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${fromCache ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}>
                {fromCache ? <><Clock className="w-3 h-3" /> Cache · {cacheAge}</> : <><CheckCircle2 className="w-3 h-3" /> Fresh data</>}
              </div>
            )}
          </div>

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" /> <span className="flex-1">{error}</span> <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
            </div>
          )}

          {stats && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { label: 'Top Akumulator', value: stats.topBuy[0], sub: `+${fmt(stats.topBuy[1])}`, color: 'text-emerald-400', icon: TrendingUp },
                { label: 'Top Distributor', value: stats.topSell[0], sub: `${fmt(stats.topSell[1])}`, color: 'text-red-400', icon: TrendingDown },
                { label: 'Net Flow Broker', value: fmt(stats.totalNet), sub: stats.totalNet >= 0 ? 'Net Buy' : 'Net Sell', color: stats.totalNet >= 0 ? 'text-emerald-400' : 'text-red-400', icon: Database },
              ].map((m, i) => (
                <div key={i} className="glass rounded-xl p-4 border border-border/30 hover:border-gold-400/30 transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{m.label}</p>
                    <m.icon className={`w-4 h-4 ${m.color}`} />
                  </div>
                  <p className={`text-2xl font-black ${m.color}`}>{m.value}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{m.sub}</p>
                </div>
              ))}
            </div>
          )}

          {topBrokers.length > 0 && (
            <div className="glass rounded-xl p-4 border border-border/30 space-y-2">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Top 10 Broker — klik untuk tampil di chart</p>
              <div className="flex flex-wrap gap-2">
                {topBrokers.map((c, i) => (
                  <button key={c} onClick={() => toggle(c)} className="px-3 py-1.5 rounded-full text-xs font-bold border transition-all hover:scale-105"
                    style={{ backgroundColor: selected.has(c) ? BROKER_COLORS[i % BROKER_COLORS.length] : 'transparent', color: selected.has(c) ? '#0B0F19' : BROKER_COLORS[i % BROKER_COLORS.length], borderColor: BROKER_COLORS[i % BROKER_COLORS.length], opacity: selected.has(c) ? 1 : 0.7 }}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          {chartData.length > 0 && (
            <div className={`glass rounded-2xl border border-border/30 p-5 transition-all duration-300 ${isFullScreen ? 'fixed inset-0 z-[100] bg-background/95 backdrop-blur-xl flex flex-col p-8' : 'relative'}`}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-foreground text-lg">{chartMode === 'cumulative' ? 'Akumulasi Kumulatif' : 'Net Value Harian'} — <span className="gradient-gold">{code.toUpperCase()}</span></h2>
                <button onClick={() => setIsFullScreen(!isFullScreen)} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors">
                  {isFullScreen ? <Minimize2 className="w-5 h-5 text-gold-400" /> : <Maximize2 className="w-4 h-4 text-muted-foreground" />}
                </button>
              </div>
              <div className={isFullScreen ? 'flex-1' : ''}>
                <ResponsiveContainer width="100%" height={isFullScreen ? '100%' : 380}>
                  <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={v => v.slice(5)} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={fmt} width={55} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: 'rgba(11,15,25,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px' }} />
                    <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
                    {Array.from(selected).map(c => (
                      <Line key={c} type="monotone" dataKey={c} stroke={BROKER_COLORS[topBrokers.indexOf(c) % BROKER_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6, strokeWidth: 0 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {data.length > 0 && (
            <div className="glass rounded-2xl overflow-hidden border border-border/30">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white/[0.02] border-b border-white/[0.05] text-[10px] text-muted-foreground uppercase tracking-wider">
                      <th className="p-3 text-left">Tanggal</th><th className="p-3 text-left">Broker</th><th className="p-3 text-right">Buy</th><th className="p-3 text-right">Sell</th><th className="p-3 text-right font-bold">Net</th><th className="p-3 text-right">Net Lot</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageData.map((r, i) => (
                      <tr key={i} className="tr-hover border-b border-white/[0.02]">
                        <td className="p-3 text-muted-foreground text-xs">{r.date}</td>
                        <td className="p-3 font-mono font-bold text-foreground">{r.broker_code}</td>
                        <td className="p-3 text-right text-emerald-400">{fmt(r.buy_value)}</td>
                        <td className="p-3 text-right text-red-400">{fmt(r.sell_value)}</td>
                        <td className={`p-3 text-right font-bold ${r.net_value >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{r.net_value >= 0 ? '+' : ''}{fmt(r.net_value)}</td>
                        <td className={`p-3 text-right text-xs ${r.net_lot >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{r.net_lot.toLocaleString('id-ID')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="p-4 border-t border-white/[0.05] flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Halaman <span className="text-gold-400 font-bold">{page + 1}</span> dari {totalPages}</span>
                  <div className="flex gap-2">
                    <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1.5 text-xs glass border border-border/30 rounded-xl transition-all">← Prev</button>
                    <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1} className="px-3 py-1.5 text-xs glass border border-border/30 rounded-xl transition-all">Next →</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {activeTab === 'screener' && (
        <>
          <div className="glass rounded-2xl p-5 border border-border/30 space-y-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Periode</label>
                <select value={screenerPeriod} onChange={e => setScreenerPeriod(e.target.value)} className="bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-foreground">
                  {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Filter</label>
                <select value={screenerFilter} onChange={e => setScreenerFilter(e.target.value as any)} className="bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-foreground">
                  <option value="all">Semua</option><option value="accumulation">Akumulasi (&gt;10)</option><option value="distribution">Distribusi (&lt;-10)</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Urutkan</label>
                <select value={screenerSort} onChange={e => setScreenerSort(e.target.value)} className="bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-foreground">
                  <option value="score">Score Akumulasi</option><option value="value">Net Value</option>
                </select>
              </div>
              <button onClick={loadScreener} disabled={screenerLoading} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-400/30 text-purple-400 text-sm font-bold transition-all">
                {screenerLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />} Analisa
              </button>
            </div>
            {screenerError && <div className="text-red-400 text-sm">{screenerError}</div>}
          </div>

          {screenerData.length > 0 && (
            <div className="glass rounded-2xl overflow-hidden border border-border/30">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white/[0.02] border-b border-white/[0.05] text-[10px] text-muted-foreground uppercase tracking-wider">
                      <th className="p-3 text-left">Kode</th><th className="p-3 text-right">Net Value</th><th className="p-3 text-right">Net Lot</th><th className="p-3 text-center">Score</th><th className="p-3 text-left">Top Buyer</th><th className="p-3 text-left">Top Seller</th>
                    </tr>
                  </thead>
                  <tbody>
                    {screenerPageData.map((r, i) => (
                      <tr key={i} className="tr-hover border-b border-white/[0.02] cursor-pointer" onClick={() => { setCode(r.stock_code); setDays(screenerPeriod); setActiveTab('tracker'); setTimeout(() => loadData(), 100); }}>
                        <td className="p-3 font-mono font-bold text-foreground">{r.stock_code}</td>
                        <td className={`p-3 text-right font-bold font-mono ${r.total_net_value >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{r.total_net_value >= 0 ? '+' : ''}{fmt(r.total_net_value)}</td>
                        <td className={`p-3 text-right font-mono text-xs ${r.total_net_lot >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{r.total_net_lot >= 0 ? '+' : ''}{r.total_net_lot.toLocaleString('id-ID')}</td>
                        <td className="p-3 text-center"><span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${r.accumulation_score > 20 ? 'bg-emerald-400/20 text-emerald-400' : r.accumulation_score < -20 ? 'bg-red-400/20 text-red-400' : 'bg-gray-400/20 text-gray-400'}`}>{r.accumulation_score.toFixed(1)}%</span></td>
                        <td className="p-3 text-xs text-muted-foreground">{r.top_buyer}</td><td className="p-3 text-xs text-muted-foreground">{r.top_seller}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {screenerPages > 1 && (
                <div className="p-4 border-t border-white/[0.05] flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Halaman <span className="text-purple-400 font-bold">{screenerPage + 1}</span> dari {screenerPages}</span>
                  <div className="flex gap-2">
                    <button onClick={() => setScreenerPage(p => Math.max(0, p - 1))} disabled={screenerPage === 0} className="px-3 py-1.5 text-xs glass border border-border/30 rounded-xl transition-all">← Prev</button>
                    <button onClick={() => setScreenerPage(p => Math.min(screenerPages - 1, p + 1))} disabled={screenerPage === screenerPages - 1} className="px-3 py-1.5 text-xs glass border border-border/30 rounded-xl transition-all">Next →</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
