'use client';

import { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import {
  BarChart3, Loader2, Search, Activity,
  TrendingUp, TrendingDown, RefreshCw, AlertCircle,
  ChevronDown, ChevronUp, Users, Calendar,
} from 'lucide-react';

// ─── Formatters ──────────────────────────────────────────────────────────────
const fmt = (v: number, short = true) => {
  if (v == null || isNaN(v)) return '—';
  const a = Math.abs(v);
  if (short) {
    if (a >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
    if (a >= 1e9)  return `${(v / 1e9).toFixed(2)}B`;
    if (a >= 1e6)  return `${(v / 1e6).toFixed(1)}M`;
    if (a >= 1e3)  return `${(v / 1e3).toFixed(0)}K`;
  }
  return v.toLocaleString('id-ID');
};
const fmtPrice = (v: number) => (v ? Math.round(v).toLocaleString('id-ID') : '—');
const fmtLot   = (v: number) => (v ? Math.abs(v).toLocaleString('id-ID') : '—');
const fmtFreq  = (v: number) => (v ? v.toLocaleString('id-ID') : '—');

// ─── Types ───────────────────────────────────────────────────────────────────
interface TrackerRow {
  broker_code: string;
  broker_name: string;
  buy_val: number;
  sell_val: number;
  buy_lot: number;
  sell_lot: number;
  buy_freq: number;
  sell_freq: number;
  net_val: number;
  net_lot: number;
  total_freq: number;
  buy_avg_price: number;
  sell_avg_price: number;
}

interface ScreenerRow {
  stock_code: string;
  total_buy: number;
  total_sell: number;
  net_accumulation: number;
  broker_count: number;
  buy_broker_count: number;
  sell_broker_count: number;
  power_score: number;
}

// ─── Broker Chart Tooltip ────────────────────────────────────────────────────
const BrokerChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value ?? 0;
  const isBuy = val >= 0;
  return (
    <div className="bg-[#111827] border border-white/10 rounded-xl p-3 text-[11px] shadow-2xl min-w-[140px]">
      <p className="text-white font-black mb-1">{label}</p>
      <p className={`font-mono font-bold ${isBuy ? 'text-emerald-400' : 'text-red-400'}`}>
        {isBuy ? '+' : ''}{fmt(val)}
      </p>
      <p className={`text-[9px] mt-0.5 ${isBuy ? 'text-emerald-600' : 'text-red-600'}`}>
        {isBuy ? '▲ Net Buyer' : '▼ Net Seller'}
      </p>
    </div>
  );
};

// ─── Buy/Sell bar visualiser ─────────────────────────────────────────────────
const FlowBar = ({ buy, sell }: { buy: number; sell: number }) => {
  const total = buy + sell;
  const buyPct = total > 0 ? (buy / total) * 100 : 50;
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden w-20 bg-[#0B0F19]">
      <div style={{ width: `${buyPct}%` }} className="bg-emerald-500" />
      <div style={{ width: `${100 - buyPct}%` }} className="bg-red-500" />
    </div>
  );
};

// ─── Top-3 broker summary — simplified, code only ────────────────────────────
const TopBrokerCards = ({
  rows, side, totalBrokers,
}: { rows: TrackerRow[]; side: 'buy' | 'sell'; totalBrokers: number }) => {
  const isBuy  = side === 'buy';
  const top3   = rows.slice(0, 3);
  const accent = isBuy ? 'emerald' : 'red';
  const total  = rows.reduce((s, r) => s + Math.abs(r.net_val), 0);

  return (
    <div className={`bg-[#151C2C] rounded-2xl border border-${accent}-500/20 p-4`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {isBuy
            ? <TrendingUp  className="w-3.5 h-3.5 text-emerald-400" />
            : <TrendingDown className="w-3.5 h-3.5 text-red-400"    />}
          <span className={`text-[10px] uppercase tracking-widest font-black text-${accent}-400`}>
            Top 3 Net {isBuy ? 'Buyers' : 'Sellers'}
          </span>
        </div>
        <span className="text-[10px] text-gray-500">{totalBrokers} brokers</span>
      </div>

      <div className="space-y-3">
        {top3.length === 0 && (
          <p className="text-[10px] text-gray-600 text-center py-2">No data</p>
        )}
        {top3.map((r, i) => {
          const netAbs = Math.abs(r.net_val);
          const barPct = total > 0 ? (netAbs / total) * 100 : 0;
          return (
            <div key={r.broker_code} className="flex items-center gap-3">
              <span className={`text-xs font-black w-4 text-center ${
                i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : 'text-amber-700'
              }`}>{i + 1}</span>

              <span className="text-sm font-black text-white w-14 shrink-0 tracking-wide">
                {r.broker_code}
              </span>

              <div className="flex-1 h-2 bg-[#0B0F19] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${isBuy ? 'bg-emerald-500' : 'bg-red-500'}`}
                  style={{ width: `${barPct}%` }}
                />
              </div>

              <span className={`text-[10px] font-bold shrink-0 ${isBuy ? 'text-emerald-500' : 'text-red-500'}`}>
                {Math.round(barPct)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function BandarmologiPage() {
  const [activeTab, setActiveTab]       = useState<'tracker' | 'screener'>('tracker');
  const [code, setCode]                 = useState('BBCA');
  const [trackerData, setTrackerData]   = useState<TrackerRow[]>([]);
  const [screenerData, setScreenerData] = useState<ScreenerRow[]>([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [sortCol, setSortCol]           = useState<keyof TrackerRow>('net_val');
  const [sortDir, setSortDir]           = useState<'asc' | 'desc'>('desc');

  // ── Date range — always explicit dates ────────────────────────────────────
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 5);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate]         = useState<string>(new Date().toISOString().split('T')[0]);
  const [activePreset, setActivePreset] = useState<string>('5d');

  const presets = [
    { label: 'Hari Ini', days: 0,  id: '1d'  },
    { label: '1 Minggu', days: 5,  id: '5d'  },
    { label: '1 Bulan',  days: 20, id: '20d' },
    { label: '3 Bulan',  days: 60, id: '60d' },
  ];

  const applyPreset = (days: number, id: string) => {
    const end   = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    setEndDate(end.toISOString().split('T')[0]);
    setStartDate(start.toISOString().split('T')[0]);
    setActivePreset(id);
  };

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadData = async (overrideCode?: string, overrideTab?: 'tracker' | 'screener') => {
    const tab  = overrideTab ?? activeTab;
    const tick = (overrideCode ?? code).trim().toUpperCase();
    setLoading(true);
    setError(null);
    const params = `startDate=${startDate}&endDate=${endDate}`;
    try {
      if (tab === 'tracker') {
        const res  = await fetch(`/api/broker-tracker?action=tracker&code=${tick}&${params}`);
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        setTrackerData(json.data || []);
        setScreenerData([]);
      } else {
        const res  = await fetch(`/api/broker-tracker?action=screener&${params}`);
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        setScreenerData(json.data || []);
        setTrackerData([]);
      }
    } catch (e: any) {
      setError(e.message ?? 'Terjadi kesalahan.');
    }
    setLoading(false);
  };

  // ── Sort: buyers by net_val DESC, sellers by net_val ASC (most negative = biggest seller first) ──
  const buyers = useMemo(() =>
    [...trackerData]
      .filter(r => r.net_val > 0)
      .sort((a, b) => {
        if (sortCol === 'net_val')
          return sortDir === 'desc' ? b.net_val - a.net_val : a.net_val - b.net_val;
        const va = a[sortCol] as number;
        const vb = b[sortCol] as number;
        return sortDir === 'desc' ? vb - va : va - vb;
      }),
    [trackerData, sortCol, sortDir],
  );

  const sellers = useMemo(() =>
    [...trackerData]
      .filter(r => r.net_val < 0)
      .sort((a, b) => {
        if (sortCol === 'net_val')
          // DESC = most negative first (a.net_val - b.net_val puts most negative first)
          return sortDir === 'desc' ? a.net_val - b.net_val : b.net_val - a.net_val;
        // Other cols: sort by absolute magnitude
        const va = Math.abs(a[sortCol] as number);
        const vb = Math.abs(b[sortCol] as number);
        return sortDir === 'desc' ? vb - va : va - vb;
      }),
    [trackerData, sortCol, sortDir],
  );

  // ── Per-broker net flow chart data ─────────────────────────────────────────
  const brokerChartData = useMemo(() =>
    [...trackerData]
      .sort((a, b) => b.net_val - a.net_val)
      .map(r => ({ broker: r.broker_code, net_val: r.net_val })),
    [trackerData],
  );

  const toggleSort = (col: keyof TrackerRow) => {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortCol(col); setSortDir('desc'); }
  };
  const SortIcon = ({ col }: { col: keyof TrackerRow }) => {
    if (sortCol !== col) return <ChevronDown className="w-3 h-3 opacity-20" />;
    return sortDir === 'desc'
      ? <ChevronDown className="w-3 h-3 text-yellow-400" />
      : <ChevronUp   className="w-3 h-3 text-yellow-400" />;
  };

  // ─── Tracker table ─────────────────────────────────────────────────────────
  const TrackerTable = ({
    rows, side,
  }: { rows: TrackerRow[]; side: 'buy' | 'sell' }) => {
    const isBuy  = side === 'buy';
    const accent = isBuy ? 'emerald' : 'red';
    const label  = isBuy ? 'Top Buyers' : 'Top Sellers';
    const slice  = rows.slice(0, 15);

    return (
      <div className={`bg-[#151C2C] rounded-2xl border border-${accent}-500/20 overflow-hidden shadow-xl`}>
        <div className={`px-4 py-3 bg-${accent}-500/10 border-b border-${accent}-500/20 flex items-center gap-2`}>
          {isBuy
            ? <TrendingUp  className="w-3.5 h-3.5 text-emerald-400" />
            : <TrendingDown className="w-3.5 h-3.5 text-red-400"    />}
          <span className={`text-[10px] uppercase tracking-widest font-black text-${accent}-400`}>{label}</span>
          <span className="ml-auto text-[10px] text-gray-500 font-mono">{slice.length} brokers</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-[#1a2235] text-gray-500 text-left">
              <tr>
                <th className="px-4 py-2.5">#</th>
                <th className="px-4 py-2.5">Broker</th>
                <th className="px-4 py-2.5 text-right cursor-pointer select-none hover:text-white"
                    onClick={() => toggleSort('net_val')}>
                  <span className="flex items-center justify-end gap-1">NET VAL <SortIcon col="net_val" /></span>
                </th>
                <th className="px-4 py-2.5 text-right cursor-pointer select-none hover:text-white"
                    onClick={() => toggleSort(isBuy ? 'buy_lot' : 'sell_lot')}>
                  <span className="flex items-center justify-end gap-1">
                    LOT <SortIcon col={isBuy ? 'buy_lot' : 'sell_lot'} />
                  </span>
                </th>
                <th className="px-4 py-2.5 text-right">AVG PRICE</th>
                <th className="px-4 py-2.5 text-right cursor-pointer select-none hover:text-white"
                    onClick={() => toggleSort('total_freq')}>
                  <span className="flex items-center justify-end gap-1">FREQ <SortIcon col="total_freq" /></span>
                </th>
                <th className="px-4 py-2.5 text-right">BALANCE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {slice.map((r, i) => {
                const netColor = r.net_val > 0 ? 'text-emerald-400' : 'text-red-400';
                const avgPx    = isBuy ? r.buy_avg_price : r.sell_avg_price;
                const lot      = isBuy ? r.buy_lot       : r.sell_lot;
                const freq     = isBuy ? r.buy_freq      : r.sell_freq;
                return (
                  <tr key={r.broker_code} className="hover:bg-white/[0.03] transition-colors group">
                    <td className="px-4 py-3 text-gray-600 font-mono text-[10px]">{i + 1}</td>
                    <td className="px-4 py-3">
                      <span className="font-black text-white text-xs">{r.broker_code}</span>
                      {r.broker_name && (
                        <p className="text-[10px] text-gray-500 mt-0.5 truncate max-w-[140px]">{r.broker_name}</p>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-right font-bold ${netColor}`}>{fmt(Math.abs(r.net_val))}</td>
                    <td className="px-4 py-3 text-right text-gray-300 font-mono">{fmtLot(lot)}</td>
                    <td className="px-4 py-3 text-right text-yellow-400 font-mono">{fmtPrice(avgPx)}</td>
                    <td className="px-4 py-3 text-right text-gray-400 font-mono">{fmtFreq(freq)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <FlowBar buy={r.buy_val} sell={r.sell_val} />
                        <span className="text-[9px] text-gray-600 font-mono">
                          {r.buy_val + r.sell_val > 0
                            ? `${Math.round(r.buy_val / (r.buy_val + r.sell_val) * 100)}% B`
                            : '—'}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 space-y-5 bg-[#0B0F19] min-h-screen text-white font-sans">

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-[#151C2C]
                      p-4 rounded-2xl border border-white/5 gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-yellow-400/10 rounded-xl">
            <BarChart3 className="text-yellow-400 w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight">Bandarmologi Engine</h1>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Smart Money Analytics</p>
          </div>
        </div>
        <div className="flex bg-[#1F2937] p-1 rounded-xl w-full md:w-auto">
          {(['tracker', 'screener'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setError(null); }}
              className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-xs font-black transition-all capitalize ${
                activeTab === tab ? 'bg-[#0B0F19] text-yellow-400 shadow' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab === 'tracker' ? 'Broker Tracker' : 'Whale Screener'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Control Panel ── */}
      <div className="bg-[#151C2C] p-4 rounded-2xl border border-white/5 shadow-lg">
        <div className="flex flex-wrap gap-4 items-end">
          {/* Stock Ticker */}
          {activeTab === 'tracker' && (
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-gray-500 ml-1">Stock Ticker</label>
              <div className="relative">
                <Search className="w-3 h-3 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && loadData()}
                  className="w-28 bg-[#0B0F19] border border-white/5 rounded-lg pl-8 pr-3 py-2
                             text-sm font-black text-yellow-400 focus:ring-1 focus:ring-yellow-400
                             outline-none placeholder:text-gray-600"
                  placeholder="BBCA"
                />
              </div>
            </div>
          )}

          {/* Time Horizon — preset buttons + always-visible date pickers */}
          <div className="space-y-1.5 flex-1 min-w-0">
            <label className="text-[10px] uppercase font-bold text-gray-500 ml-1 flex items-center gap-1.5">
              <Calendar className="w-3 h-3" /> Time Horizon
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {/* Quick presets */}
              <div className="flex gap-1 bg-[#0B0F19] rounded-lg p-1 shrink-0">
                {presets.map(p => (
                  <button
                    key={p.id}
                    onClick={() => applyPreset(p.days, p.id)}
                    className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all whitespace-nowrap ${
                      activePreset === p.id
                        ? 'bg-yellow-400 text-black shadow'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Date pickers — always visible, editable */}
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={e => { setStartDate(e.target.value); setActivePreset('custom'); }}
                  className="bg-[#0B0F19] border border-white/10 rounded-lg px-3 py-1.5
                             text-[11px] text-gray-300 outline-none cursor-pointer
                             focus:border-yellow-400/40 focus:ring-1 focus:ring-yellow-400/20 transition-all"
                />
                <span className="text-gray-600 text-xs select-none">→</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => { setEndDate(e.target.value); setActivePreset('custom'); }}
                  className="bg-[#0B0F19] border border-white/10 rounded-lg px-3 py-1.5
                             text-[11px] text-gray-300 outline-none cursor-pointer
                             focus:border-yellow-400/40 focus:ring-1 focus:ring-yellow-400/20 transition-all"
                />
              </div>
            </div>
          </div>

          {/* Run button */}
          <button
            onClick={() => loadData()}
            disabled={loading}
            className="bg-yellow-400 text-black px-7 py-2 rounded-lg font-black text-xs
                       hover:bg-yellow-300 active:scale-95 transition-all flex items-center gap-2
                       disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-yellow-400/20"
          >
            {loading
              ? <Loader2 className="animate-spin w-3.5 h-3.5" />
              : <RefreshCw className="w-3.5 h-3.5" />}
            {activeTab === 'tracker' ? 'RUN TRACKER' : 'SCAN ACCUM'}
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TRACKER TAB
      ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'tracker' && trackerData.length > 0 && (
        <div className="space-y-5">

          {/* Top 3 summary cards — broker code only */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TopBrokerCards rows={buyers}  side="buy"  totalBrokers={buyers.length}  />
            <TopBrokerCards rows={sellers} side="sell" totalBrokers={sellers.length} />
          </div>

          {/* ── Per-Broker Net Flow Chart ── */}
          <div className="bg-[#151C2C] p-5 rounded-2xl border border-white/5 shadow-xl">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-4 h-4 text-yellow-400" />
              <h3 className="text-sm font-black text-white">Broker Net Flow</h3>
              <span className="ml-auto text-[10px] text-gray-500">
                {code} · {trackerData.length} brokers · {startDate} → {endDate}
              </span>
            </div>
            <p className="text-[10px] text-gray-600 mb-5">
              <span className="text-emerald-600">■</span> Net Buyer &nbsp;·&nbsp;
              <span className="text-red-600">■</span> Net Seller &nbsp;·&nbsp;
              Diurutkan dari net buy terbesar → net sell terbesar
            </p>

            <div className="h-[300px] w-full">
              <ResponsiveContainer>
                <BarChart
                  data={brokerChartData}
                  margin={{ left: 0, right: 8, bottom: brokerChartData.length > 20 ? 36 : 24, top: 4 }}
                  barCategoryGap={brokerChartData.length > 30 ? '8%' : '18%'}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                  <XAxis
                    dataKey="broker"
                    stroke="#374151"
                    fontSize={9}
                    tick={{ fill: '#6b7280' }}
                    interval={0}
                    angle={-45}
                    textAnchor="end"
                    height={brokerChartData.length > 20 ? 46 : 32}
                  />
                  <YAxis
                    stroke="#374151"
                    fontSize={10}
                    tickFormatter={v => fmt(v)}
                    width={64}
                    tick={{ fill: '#6b7280' }}
                  />
                  <Tooltip content={<BrokerChartTooltip />} cursor={{ fill: '#ffffff06' }} />
                  <ReferenceLine y={0} stroke="#ffffff25" strokeWidth={1} />
                  <Bar dataKey="net_val" maxBarSize={30} radius={[2, 2, 0, 0]}>
                    {brokerChartData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry.net_val >= 0 ? '#10b981' : '#ef4444'}
                        opacity={0.82}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Buyer / Seller tables */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <TrackerTable rows={buyers}  side="buy"  />
            <TrackerTable rows={sellers} side="sell" />
          </div>
        </div>
      )}

      {/* Tracker empty state */}
      {activeTab === 'tracker' && !loading && trackerData.length === 0 && !error && (
        <div className="text-center py-16 text-gray-600">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-bold">Masukkan kode saham dan klik RUN TRACKER</p>
          <p className="text-xs mt-1 opacity-60">Contoh: BBCA, TLKM, AADI, GOTO</p>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          SCREENER TAB
      ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'screener' && screenerData.length > 0 && (
        <div className="bg-[#151C2C] rounded-2xl border border-white/5 overflow-hidden shadow-2xl">
          <div className="px-5 py-4 bg-yellow-400/5 border-b border-white/5 flex items-center gap-3">
            <Activity className="w-4 h-4 text-yellow-400" />
            <span className="text-yellow-400 font-black text-xs uppercase tracking-wider">
              Top {screenerData.length} Accumulation Candidates
            </span>
            <span className="ml-auto text-[10px] text-gray-500 flex items-center gap-1">
              <Users className="w-3 h-3" /> Sorted by Net Accumulation
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="bg-[#1a2235] text-gray-500 text-left text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">#</th>
                  <th className="px-5 py-3">Stock</th>
                  <th className="px-5 py-3 text-right">Net Accum</th>
                  <th className="px-5 py-3 text-right">Total Buy</th>
                  <th className="px-5 py-3 text-right">Total Sell</th>
                  <th className="px-5 py-3 text-center">Buy Brokers</th>
                  <th className="px-5 py-3 text-right text-yellow-400">Power Score</th>
                  <th className="px-5 py-3 text-center">B/S Ratio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {screenerData.map((r, i) => {
                  const pct = (r.net_accumulation / (r.total_buy || 1)) * 100;
                  return (
                    <tr
                      key={r.stock_code}
                      className="hover:bg-yellow-400/5 cursor-pointer transition-colors group"
                      onClick={() => {
                        setCode(r.stock_code);
                        setActiveTab('tracker');
                        setTimeout(() => loadData(r.stock_code, 'tracker'), 0);
                      }}
                    >
                      <td className="px-5 py-3 text-gray-600 font-mono">{i + 1}</td>
                      <td className="px-5 py-3">
                        <span className="font-black text-white text-sm group-hover:text-yellow-400 transition-colors">
                          {r.stock_code}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-emerald-400 font-bold">{fmt(r.net_accumulation)}</td>
                      <td className="px-5 py-3 text-right text-emerald-300 font-mono">{fmt(r.total_buy)}</td>
                      <td className="px-5 py-3 text-right text-red-300 font-mono">{fmt(r.total_sell)}</td>
                      <td className="px-5 py-3 text-center">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-bold text-[10px]">
                          {r.buy_broker_count}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className="font-black text-yellow-400">{fmt(r.power_score)}</span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-col items-center gap-1">
                          <FlowBar buy={r.total_buy} sell={r.total_sell} />
                          <span className="text-[9px] text-gray-500 font-mono">{Math.round(pct)}% net</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Screener empty state */}
      {activeTab === 'screener' && !loading && screenerData.length === 0 && !error && (
        <div className="text-center py-16 text-gray-600">
          <Activity className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-bold">Klik SCAN ACCUM untuk mencari saham dengan akumulasi terbesar</p>
          <p className="text-xs mt-1 opacity-60">Klik baris hasil untuk langsung melihat Broker Tracker</p>
        </div>
      )}
    </div>
  );
}
