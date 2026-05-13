'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import {
  BarChart3, Loader2, ArrowRightLeft, Search, Activity,
  TrendingUp, TrendingDown, RefreshCw, AlertCircle,
  ChevronDown, ChevronUp, Users,
} from 'lucide-react';

// ─── Formatters ──────────────────────────────────────────────────────────────
const fmt = (v: number, short = true) => {
  if (v == null || isNaN(v)) return '—';
  const a = Math.abs(v);
  if (short) {
    if (a >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
    if (a >= 1e9)  return `${(v / 1e9).toFixed(2)}B`;
    if (a >= 1e6)  return `${(v / 1e6).toFixed(1)}M`;
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

interface HistoryRow {
  date: string;
  daily_net_val: number;
  daily_buy_val: number;
  daily_sell_val: number;
  daily_avg_price: number;
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

// ─── Custom tooltip ──────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#111827] border border-white/10 rounded-xl p-3 text-[11px] shadow-2xl min-w-[180px]">
      <p className="text-gray-400 mb-2 font-bold">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex justify-between gap-4 items-center mb-1">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-mono font-bold" style={{ color: p.color }}>
            {p.name === 'Avg Price' ? fmtPrice(p.value) : fmt(p.value)}
          </span>
        </div>
      ))}
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

// ─── Top-3 broker mini card row ──────────────────────────────────────────────
const TopBrokerCards = ({
  rows, side, totalBrokers,
}: { rows: TrackerRow[]; side: 'buy' | 'sell'; totalBrokers: number }) => {
  const isBuy  = side === 'buy';
  const top3   = rows.slice(0, 3);
  const accent = isBuy ? 'emerald' : 'red';
  const total  = rows.reduce((s, r) => s + Math.abs(r.net_val), 0);

  return (
    <div className={`bg-[#151C2C] rounded-2xl border border-${accent}-500/20 p-4 space-y-3`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isBuy
            ? <TrendingUp  className="w-3.5 h-3.5 text-emerald-400" />
            : <TrendingDown className="w-3.5 h-3.5 text-red-400"    />}
          <span className={`text-[10px] uppercase tracking-widest font-black text-${accent}-400`}>
            Top 3 Net {isBuy ? 'Buyers' : 'Sellers'}
          </span>
        </div>
        <span className="text-[10px] text-gray-500">{totalBrokers} brokers · {fmt(total)} total</span>
      </div>

      {/* 3 broker rows */}
      <div className="space-y-2">
        {top3.map((r, i) => {
          const netAbs  = Math.abs(r.net_val);
          const barPct  = total > 0 ? (netAbs / total) * 100 : 0;
          const avgPx   = isBuy ? r.buy_avg_price : r.sell_avg_price;
          return (
            <div key={r.broker_code} className="flex items-center gap-3">
              {/* Rank */}
              <span className={`text-[10px] font-black w-4 text-center ${
                i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-400' : 'text-amber-700'
              }`}>{i + 1}</span>

              {/* Code + name */}
              <div className="min-w-0 w-20">
                <p className="text-xs font-black text-white leading-tight">{r.broker_code}</p>
                <p className="text-[9px] text-gray-500 truncate leading-tight">{r.broker_name || '—'}</p>
              </div>

              {/* Bar */}
              <div className="flex-1 h-1.5 bg-[#0B0F19] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${isBuy ? 'bg-emerald-500' : 'bg-red-500'}`}
                  style={{ width: `${barPct}%` }}
                />
              </div>

              {/* Value + avg price */}
              <div className="text-right shrink-0">
                <p className={`text-xs font-black ${isBuy ? 'text-emerald-400' : 'text-red-400'}`}>
                  {fmt(netAbs)}
                </p>
                <p className="text-[9px] text-gray-500 font-mono">{fmtPrice(avgPx)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function BandarmologiPage() {
  const [activeTab, setActiveTab]     = useState<'tracker' | 'screener'>('tracker');
  const [code, setCode]               = useState('BBCA');
  const [rangeType, setRangeType]     = useState('5');
  const [startDate, setStartDate]     = useState('');
  const [endDate, setEndDate]         = useState('');
  const [trackerData, setTrackerData] = useState<TrackerRow[]>([]);
  const [historyData, setHistoryData] = useState<HistoryRow[]>([]);
  const [screenerData, setScreenerData] = useState<ScreenerRow[]>([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [sortCol, setSortCol]         = useState<keyof TrackerRow>('net_val');
  const [sortDir, setSortDir]         = useState<'asc' | 'desc'>('desc');

  const urlParams = useCallback(() =>
    rangeType === 'custom'
      ? `startDate=${startDate}&endDate=${endDate}`
      : `days=${rangeType}`,
  [rangeType, startDate, endDate]);

  const loadData = async (overrideCode?: string, overrideTab?: 'tracker' | 'screener') => {
    const tab  = overrideTab  ?? activeTab;
    const tick = (overrideCode ?? code).trim().toUpperCase();

    setLoading(true);
    setError(null);
    try {
      const params = urlParams();

      if (tab === 'tracker') {
        const [resT, resH] = await Promise.all([
          fetch(`/api/broker-tracker?action=tracker&code=${tick}&${params}`),
          fetch(`/api/broker-tracker?action=history&code=${tick}&${params}`),
        ]);
        const [jsonT, jsonH] = await Promise.all([resT.json(), resH.json()]);
        if (jsonT.error) throw new Error(jsonT.error);
        setTrackerData(jsonT.data || []);
        setHistoryData(jsonH.data || []);
        setScreenerData([]);
      } else {
        const res  = await fetch(`/api/broker-tracker?action=screener&${params}`);
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        setScreenerData(json.data || []);
        setTrackerData([]);
        setHistoryData([]);
      }
    } catch (e: any) {
      setError(e.message ?? 'Terjadi kesalahan.');
    }
    setLoading(false);
  };

  // ─── Sort tracker data ───────────────────────────────────────────────────
  const sortedTracker = useMemo(() => {
    return [...trackerData].sort((a, b) => {
      const va = a[sortCol] as number;
      const vb = b[sortCol] as number;
      return sortDir === 'desc' ? vb - va : va - vb;
    });
  }, [trackerData, sortCol, sortDir]);

  const buyers  = useMemo(() => sortedTracker.filter(r => r.net_val > 0), [sortedTracker]);
  const sellers = useMemo(() => sortedTracker.filter(r => r.net_val < 0), [sortedTracker]);

  // ─── History chart data with cumulative ────────────────────────────────
  const chartData = useMemo(() => {
    let cumulative = 0;
    return historyData.map(d => {
      cumulative += d.daily_net_val;
      return { ...d, cumulative_net: cumulative };
    });
  }, [historyData]);

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

  // ─── Tracker table (buyers or sellers) ──────────────────────────────────
  const TrackerTable = ({
    rows, side,
  }: { rows: TrackerRow[]; side: 'buy' | 'sell' }) => {
    const isBuy   = side === 'buy';
    const accent  = isBuy ? 'emerald' : 'red';
    const label   = isBuy ? 'Top Buyers' : 'Top Sellers';
    const slice   = rows.slice(0, 15);

    return (
      <div className={`bg-[#151C2C] rounded-2xl border border-${accent}-500/20 overflow-hidden shadow-xl`}>
        <div className={`px-4 py-3 bg-${accent}-500/10 border-b border-${accent}-500/20 flex items-center gap-2`}>
          {isBuy
            ? <TrendingUp  className="w-3.5 h-3.5 text-emerald-400" />
            : <TrendingDown className="w-3.5 h-3.5 text-red-400"     />}
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
      <div className="bg-[#151C2C] p-4 rounded-2xl border border-white/5 flex flex-wrap gap-3 items-end shadow-lg">
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
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold text-gray-500 ml-1">Time Horizon</label>
          <select
            value={rangeType}
            onChange={e => setRangeType(e.target.value)}
            className="bg-[#0B0F19] border border-white/5 rounded-lg px-4 py-2 text-xs font-bold text-white outline-none"
          >
            <option value="1">Hari Ini</option>
            <option value="5">1 Minggu</option>
            <option value="20">1 Bulan</option>
            <option value="60">3 Bulan</option>
            <option value="custom">Custom Date</option>
          </select>
        </div>
        {rangeType === 'custom' && (
          <div className="flex gap-2 items-center">
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="bg-[#0B0F19] border border-white/5 rounded-lg px-3 py-2 text-xs text-gray-300 outline-none" />
            <span className="text-gray-600 text-xs">→</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="bg-[#0B0F19] border border-white/5 rounded-lg px-3 py-2 text-xs text-gray-300 outline-none" />
          </div>
        )}
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


          {/* Top 3 broker summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TopBrokerCards rows={buyers}  side="buy"  totalBrokers={buyers.length}  />
            <TopBrokerCards rows={sellers} side="sell" totalBrokers={sellers.length} />
          </div>

          {/* Buyer / Seller tables */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <TrackerTable rows={buyers}  side="buy"  />
            <TrackerTable rows={sellers} side="sell" />
          </div>

          {/* History chart */}
          {chartData.length > 0 && (
            <div className="bg-[#151C2C] p-5 rounded-2xl border border-white/5 shadow-xl">
              <div className="flex items-center gap-2 mb-6">
                <ArrowRightLeft className="w-4 h-4 text-yellow-400" />
                <h3 className="text-sm font-black text-white">Daily Net Flow & Avg Price</h3>
                <span className="ml-auto text-[10px] text-gray-500">{code} · {chartData.length} trading days</span>
              </div>
              <div className="h-[360px] w-full">
                <ResponsiveContainer>
                  <ComposedChart data={chartData} margin={{ left: 0, right: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                    <XAxis dataKey="date" stroke="#374151" fontSize={10} tickMargin={8}
                           tick={{ fill: '#6b7280' }} />
                    {/* Left Y: net val bars */}
                    <YAxis yAxisId="net" stroke="#374151" fontSize={10}
                           tickFormatter={(v) => fmt(v)} width={62} tick={{ fill: '#6b7280' }} />
                    {/* Right Y: avg price */}
                    <YAxis yAxisId="price" orientation="right" stroke="#374151" fontSize={10}
                           tickFormatter={v => Math.round(v).toLocaleString()} width={52}
                           tick={{ fill: '#6b7280' }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ paddingTop: '16px', fontSize: '11px' }} />
                    <ReferenceLine yAxisId="net" y={0} stroke="#ffffff15" />
                    {/* Buy/Sell bars stacked-style */}
                    <Bar yAxisId="net" dataKey="daily_net_val" name="Net Flow"
                         fill="#10b981" opacity={0.8} radius={[2, 2, 0, 0]}
                         label={false}
                         // Dynamic color per bar
                         isAnimationActive={true}
                    />
                    {/* Avg price line */}
                    <Line yAxisId="price" type="monotone" dataKey="daily_avg_price"
                          name="Avg Price" stroke="#facc15" strokeWidth={2}
                          strokeDasharray="5 5" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
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
                        // loadData will pick up the new code via overrideCode
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
