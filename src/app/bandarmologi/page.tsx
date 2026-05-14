'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
  LineChart, Line, ComposedChart, Area, Legend,
} from 'recharts';
import {
  BarChart3, Loader2, Search, Activity,
  TrendingUp, TrendingDown, RefreshCw, AlertCircle,
  ChevronDown, ChevronUp, Users, Calendar,
  BarChart2, LineChart as LineChartIcon, Layers, TrendingUpIcon,
} from 'lucide-react';

// ─── Type Guards & Interfaces ─────────────────────────────────────────────────
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
  total_value: number;
  broker_count: number;
  buy_broker_count: number;
  sell_broker_count: number;
  power_score: number;
  top_buyer_pct: number;
}

interface HistoryRow {
  date: string;
  daily_net_val: number;
  daily_buy_val: number;
  daily_sell_val: number;
  daily_net_lot: number;
  daily_buy_freq: number;
  daily_sell_freq: number;
  daily_avg_price: number;
}

interface MultiBrokerRow {
  date: string;
  broker_code: string;
  net_val: number;
  net_lot: number;
}

type TimeSeriesView = 'net' | 'stacked' | 'cumulative';
type TimeSeriesMode = 'market' | 'brokers';

// ─── Constants ────────────────────────────────────────────────────────────────
const CHART_COLORS = [
  '#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#059669', // Greens
  '#ef4444', '#f87171', '#fca5a5', '#fecaca', '#dc2626', // Reds
  '#f59e0b', '#fbbf24', '#fcd34d', '#fde68a', '#d97706', // Ambers
  '#3b82f6', '#60a5fa', '#93bbfd', '#a5b4fc', '#2563eb', // Blues
];

const COLOR_MAP = {
  emerald: {
    border: 'border-emerald-500/20',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    textDark: 'text-emerald-600',
    textBright: 'text-emerald-500',
    fill: '#10b981',
  },
  red: {
    border: 'border-red-500/20',
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    textDark: 'text-red-600',
    textBright: 'text-red-500',
    fill: '#ef4444',
  },
  yellow: {
    border: 'border-yellow-500/20',
    bg: 'bg-yellow-400/10',
    text: 'text-yellow-400',
    textDark: 'text-yellow-600',
    textBright: 'text-yellow-500',
    fill: '#eab308',
  },
} as const;

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

// ─── Tooltips ─────────────────────────────────────────────────────────────────
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
    </div>
  );
};

const TimeSeriesTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#111827] border border-white/10 rounded-xl p-3 text-[11px] shadow-2xl min-w-[180px] max-h-[300px] overflow-y-auto">
      <p className="text-white font-black mb-2 text-xs">{label}</p>
      {payload
        .filter((entry: any) => entry.value !== undefined && entry.value !== 0)
        .sort((a: any, b: any) => Math.abs(b.value) - Math.abs(a.value))
        .map((entry: any, idx: number) => (
          <div key={idx} className="flex items-center justify-between gap-4 py-0.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
              <span className="text-[10px] text-gray-400">{entry.name}</span>
            </div>
            <span className="font-mono font-bold text-[10px]" style={{ color: entry.color }}>
              {fmt(entry.value)}
            </span>
          </div>
        ))}
    </div>
  );
};

// ─── Flow Bar Component ───────────────────────────────────────────────────────
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

// ─── Top-3 Broker Summary Cards ──────────────────────────────────────────────
const TopBrokerCards = ({
  rows, side, totalBrokers,
}: { rows: TrackerRow[]; side: 'buy' | 'sell'; totalBrokers: number }) => {
  const isBuy  = side === 'buy';
  const top3   = rows.slice(0, 3);
  const colors = COLOR_MAP[isBuy ? 'emerald' : 'red'];
  const total  = rows.reduce((s, r) => s + Math.abs(r.net_val), 0);

  return (
    <div className={`bg-[#151C2C] rounded-2xl ${colors.border} p-4`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {isBuy
            ? <TrendingUp className={`w-3.5 h-3.5 ${colors.text}`} />
            : <TrendingDown className={`w-3.5 h-3.5 ${colors.text}`} />}
          <span className={`text-[10px] uppercase tracking-widest font-black ${colors.text}`}>
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
                  className="h-full rounded-full"
                  style={{ width: `${barPct}%`, backgroundColor: colors.fill }}
                />
              </div>
              <span className={`text-[10px] font-bold shrink-0 ${colors.textBright}`}>
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
  const [historyData, setHistoryData]   = useState<HistoryRow[]>([]);
  const [multiBrokerData, setMultiBrokerData] = useState<MultiBrokerRow[]>([]);
  const [timeSeriesView, setTimeSeriesView] = useState<TimeSeriesView>('net');
  const [timeSeriesMode, setTimeSeriesMode] = useState<TimeSeriesMode>('brokers');
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [sortCol, setSortCol]           = useState<keyof TrackerRow>('net_val');
  const [sortDir, setSortDir]           = useState<'asc' | 'desc'>('desc');

  // ── Date range ─────────────────────────────────────────────────────────────
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 5);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
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

  const validateCode = (input: string): string => {
    return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  };

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadData = useCallback(async (overrideCode?: string, overrideTab?: 'tracker' | 'screener') => {
    const tab  = overrideTab ?? activeTab;
    const tick = validateCode(overrideCode ?? code);
    
    if (!tick || tick.length < 1) {
      setError('Kode saham tidak valid');
      return;
    }

    setLoading(true);
    setError(null);
    
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      setError('Format tanggal tidak valid');
      setLoading(false);
      return;
    }

    const params = `startDate=${startDate}&endDate=${endDate}`;
    
    try {
      if (tab === 'tracker') {
        const [trackRes, histRes] = await Promise.all([
          fetch(`/api/broker-tracker?action=tracker&code=${tick}&${params}`),
          fetch(`/api/broker-tracker?action=history&code=${tick}&${params}`),
        ]);
        
        const trackJson = await trackRes.json();
        const histJson = await histRes.json();
        
        if (trackJson.error) throw new Error(trackJson.error);
        if (histJson.error) throw new Error(histJson.error);
        
        const trackData: TrackerRow[] = trackJson.data || [];
        setTrackerData(trackData);
        setHistoryData(histJson.data || []);
        setScreenerData([]);

        // Fetch multi-broker history for top 10B + 10S
        const topBuyers = trackData.filter(r => r.net_val > 0).slice(0, 10);
        const topSellers = trackData.filter(r => r.net_val < 0).slice(0, 10);
        const topBrokerCodes = [...topBuyers, ...topSellers].map(r => r.broker_code);
        
        if (topBrokerCodes.length > 0) {
          const multiRes = await fetch(
            `/api/broker-tracker?action=multi_broker_history&code=${tick}&broker_codes=${topBrokerCodes.join(',')}&${params}`
          );
          const multiJson = await multiRes.json();
          if (!multiJson.error) {
            setMultiBrokerData(multiJson.data || []);
          }
        } else {
          setMultiBrokerData([]);
        }
      } else {
        const res = await fetch(`/api/broker-tracker?action=screener&${params}`);
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        setScreenerData(json.data || []);
        setTrackerData([]);
        setHistoryData([]);
        setMultiBrokerData([]);
      }
    } catch (e: any) {
      setError(e.message ?? 'Terjadi kesalahan.');
    }
    setLoading(false);
  }, [activeTab, code, startDate, endDate]);

  // ── Sort functions ─────────────────────────────────────────────────────────
  const buyers = useMemo(() =>
    trackerData
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
    trackerData
      .filter(r => r.net_val < 0)
      .sort((a, b) => {
        if (sortCol === 'net_val')
          return sortDir === 'desc' ? a.net_val - b.net_val : b.net_val - a.net_val;
        const va = Math.abs(a[sortCol] as number);
        const vb = Math.abs(b[sortCol] as number);
        return sortDir === 'desc' ? vb - va : va - vb;
      }),
    [trackerData, sortCol, sortDir],
  );

  // ── Broker chart data: top 10 buyers + top 10 sellers ─────────────────────
  const brokerChartData = useMemo(() => {
    const topBuyers = buyers.slice(0, 10);
    const topSellers = sellers.slice(0, 10);
    return [...topBuyers, ...topSellers]
      .sort((a, b) => b.net_val - a.net_val)
      .map(r => ({ broker: r.broker_code, net_val: r.net_val }));
  }, [buyers, sellers]);

  // ── Cumulative net for timeseries ──────────────────────────────────────────
  const cumulativeData = useMemo(() => {
    let cum = 0;
    return historyData.map(row => {
      cum += row.daily_net_val;
      return { ...row, cumulative_net: cum };
    });
  }, [historyData]);

  // ── Multi-broker timeseries pivoted ─────────────────────────────────────────
  const brokerTimeseriesData = useMemo(() => {
    // Pivot: { date, [broker_code]: net_val, ... }
    const dateMap = new Map<string, Record<string, number>>();
    
    multiBrokerData.forEach(row => {
      if (!dateMap.has(row.date)) {
        dateMap.set(row.date, {});
      }
      const entry = dateMap.get(row.date)!;
      entry[row.broker_code] = row.net_val;
    });

    return Array.from(dateMap.entries())
      .map(([date, brokers]) => ({ date, ...brokers }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [multiBrokerData]);

  // ── Get top broker codes for line chart ────────────────────────────────────
  const topBrokerCodes = useMemo(() => {
    const topBuyers = buyers.slice(0, 10).map(r => r.broker_code);
    const topSellers = sellers.slice(0, 10).map(r => r.broker_code);
    return [...topBuyers, ...topSellers];
  }, [buyers, sellers]);

  // ── Determine broker color ─────────────────────────────────────────────────
  const getBrokerColor = useCallback((brokerCode: string, idx: number) => {
    const isBuyer = buyers.slice(0, 10).some(b => b.broker_code === brokerCode);
    if (isBuyer) {
      const buyIdx = buyers.slice(0, 10).findIndex(b => b.broker_code === brokerCode);
      return CHART_COLORS[buyIdx % 5]; // Greens
    }
    const sellIdx = sellers.slice(0, 10).findIndex(s => s.broker_code === brokerCode);
    return CHART_COLORS[5 + (sellIdx % 5)]; // Reds
  }, [buyers, sellers]);

  // ── Sort toggle ────────────────────────────────────────────────────────────
  const toggleSort = (col: keyof TrackerRow) => {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortCol(col); setSortDir('desc'); }
  };
  
  const SortIcon = ({ col }: { col: keyof TrackerRow }) => {
    if (sortCol !== col) return <ChevronDown className="w-3 h-3 opacity-20" />;
    return sortDir === 'desc'
      ? <ChevronDown className="w-3 h-3 text-yellow-400" />
      : <ChevronUp className="w-3 h-3 text-yellow-400" />;
  };

  // ─── Tracker Table ─────────────────────────────────────────────────────────
  const TrackerTable = ({ rows, side }: { rows: TrackerRow[]; side: 'buy' | 'sell' }) => {
    const isBuy  = side === 'buy';
    const colors = COLOR_MAP[isBuy ? 'emerald' : 'red'];
    const label  = isBuy ? 'Top Buyers' : 'Top Sellers';
    const slice  = rows.slice(0, 15);

    return (
      <div className={`bg-[#151C2C] rounded-2xl ${colors.border} overflow-hidden shadow-xl`}>
        <div className={`px-4 py-3 ${colors.bg} ${colors.border.replace('border', 'border-b')} flex items-center gap-2`}>
          {isBuy
            ? <TrendingUp className={`w-3.5 h-3.5 ${colors.text}`} />
            : <TrendingDown className={`w-3.5 h-3.5 ${colors.text}`} />}
          <span className={`text-[10px] uppercase tracking-widest font-black ${colors.text}`}>{label}</span>
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
                const lot      = isBuy ? r.buy_lot : r.sell_lot;
                const freq     = isBuy ? r.buy_freq : r.sell_freq;
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

  // ─── Render ─────────────────────────────────────────────────────────────────
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
                  maxLength={10}
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5 flex-1 min-w-0">
            <label className="text-[10px] uppercase font-bold text-gray-500 ml-1 flex items-center gap-1.5">
              <Calendar className="w-3 h-3" /> Time Horizon
            </label>
            <div className="flex flex-wrap items-center gap-2">
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

          {/* Top 3 summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TopBrokerCards rows={buyers} side="buy" totalBrokers={buyers.length} />
            <TopBrokerCards rows={sellers} side="sell" totalBrokers={sellers.length} />
          </div>

          {/* Buyer / Seller tables */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <TrackerTable rows={buyers} side="buy" />
            <TrackerTable rows={sellers} side="sell" />
          </div>

          {/* ── Per-Broker Net Flow Chart ── */}
          <div className="bg-[#151C2C] p-5 rounded-2xl border border-white/5 shadow-xl">
            <div className="flex items-center gap-2 mb-1">
              <BarChart2 className="w-4 h-4 text-yellow-400" />
              <h3 className="text-sm font-black text-white">Broker Net Flow (Top 20)</h3>
              <span className="ml-auto text-[10px] text-gray-500">
                {code} · {startDate} → {endDate}
              </span>
            </div>
            <p className="text-[10px] text-gray-600 mb-5">
              <span className="text-emerald-600">■</span> Net Buyer &nbsp;·&nbsp;
              <span className="text-red-600">■</span> Net Seller &nbsp;·&nbsp;
              Top 10 buyers + Top 10 sellers
            </p>

            <div className="h-[300px] w-full">
              <ResponsiveContainer>
                <BarChart
                  data={brokerChartData}
                  margin={{ left: 0, right: 8, bottom: 36, top: 4 }}
                  barCategoryGap="18%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                  <XAxis dataKey="broker" stroke="#374151" fontSize={9} tick={{ fill: '#6b7280' }}
                    interval={0} angle={-45} textAnchor="end" height={46} />
                  <YAxis stroke="#374151" fontSize={10} tickFormatter={v => fmt(v)} width={64} tick={{ fill: '#6b7280' }} />
                  <Tooltip content={<BrokerChartTooltip />} cursor={{ fill: '#ffffff06' }} />
                  <ReferenceLine y={0} stroke="#ffffff25" strokeWidth={1} />
                  <Bar dataKey="net_val" maxBarSize={30} radius={[2, 2, 0, 0]}>
                    {brokerChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.net_val >= 0 ? COLOR_MAP.emerald.fill : COLOR_MAP.red.fill} opacity={0.82} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Time Series Chart ── */}
          <div className="bg-[#151C2C] p-5 rounded-2xl border border-white/5 shadow-xl">
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <LineChartIcon className="w-4 h-4 text-yellow-400" />
              <h3 className="text-sm font-black text-white">Daily Flow Timeline</h3>
              
              <div className="flex gap-1 bg-[#0B0F19] rounded-lg p-1 ml-auto flex-wrap">
                {/* Mode toggle */}
                <button
                  onClick={() => setTimeSeriesMode('market')}
                  className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all flex items-center gap-1 ${
                    timeSeriesMode === 'market' ? 'bg-blue-500 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Users className="w-3 h-3" /> Market
                </button>
                <button
                  onClick={() => setTimeSeriesMode('brokers')}
                  className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all flex items-center gap-1 ${
                    timeSeriesMode === 'brokers' ? 'bg-purple-500 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <TrendingUpIcon className="w-3 h-3" /> Top Brokers
                </button>
                
                <span className="w-px bg-white/10 mx-1" />
                
                {/* View toggle (only for market mode) */}
                {timeSeriesMode === 'market' && (
                  <>
                    <button
                      onClick={() => setTimeSeriesView('net')}
                      className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all flex items-center gap-1 ${
                        timeSeriesView === 'net' ? 'bg-yellow-400 text-black' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <BarChart2 className="w-3 h-3" /> Net
                    </button>
                    <button
                      onClick={() => setTimeSeriesView('stacked')}
                      className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all flex items-center gap-1 ${
                        timeSeriesView === 'stacked' ? 'bg-yellow-400 text-black' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <Layers className="w-3 h-3" /> Buy/Sell
                    </button>
                    <button
                      onClick={() => setTimeSeriesView('cumulative')}
                      className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all flex items-center gap-1 ${
                        timeSeriesView === 'cumulative' ? 'bg-yellow-400 text-black' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <TrendingUpIcon className="w-3 h-3" /> Cumulative
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="h-[400px] w-full">
              <ResponsiveContainer>
                {timeSeriesMode === 'market' ? (
                  <>
                    {timeSeriesView === 'net' && (
                      <BarChart data={historyData} margin={{ left: 0, right: 8, bottom: 24, top: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                        <XAxis dataKey="date" stroke="#374151" fontSize={10} tick={{ fill: '#6b7280' }} />
                        <YAxis stroke="#374151" fontSize={10} tickFormatter={v => fmt(v)} width={64} tick={{ fill: '#6b7280' }} />
                        <Tooltip content={<TimeSeriesTooltip />} cursor={{ fill: '#ffffff06' }} />
                        <ReferenceLine y={0} stroke="#ffffff25" />
                        <Bar dataKey="daily_net_val" name="Net Flow" maxBarSize={25} radius={[2, 2, 0, 0]}>
                          {historyData.map((entry, i) => (
                            <Cell key={i} fill={entry.daily_net_val >= 0 ? COLOR_MAP.emerald.fill : COLOR_MAP.red.fill} opacity={0.85} />
                          ))}
                        </Bar>
                      </BarChart>
                    )}
                    {timeSeriesView === 'stacked' && (
                      <BarChart data={historyData} margin={{ left: 0, right: 8, bottom: 24, top: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                        <XAxis dataKey="date" stroke="#374151" fontSize={10} tick={{ fill: '#6b7280' }} />
                        <YAxis stroke="#374151" fontSize={10} tickFormatter={v => fmt(v)} width={64} tick={{ fill: '#6b7280' }} />
                        <Tooltip content={<TimeSeriesTooltip />} cursor={{ fill: '#ffffff06' }} />
                        <Bar dataKey="daily_buy_val" name="Buy" stackId="flow" fill={COLOR_MAP.emerald.fill} opacity={0.8} radius={[2, 2, 0, 0]} />
                        <Bar dataKey="daily_sell_val" name="Sell" stackId="flow" fill={COLOR_MAP.red.fill} opacity={0.8} radius={[0, 0, 0, 0]} />
                      </BarChart>
                    )}
                    {timeSeriesView === 'cumulative' && (
                      <ComposedChart data={cumulativeData} margin={{ left: 0, right: 8, bottom: 24, top: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                        <XAxis dataKey="date" stroke="#374151" fontSize={10} tick={{ fill: '#6b7280' }} />
                        <YAxis stroke="#374151" fontSize={10} tickFormatter={v => fmt(v)} width={64} tick={{ fill: '#6b7280' }} />
                        <Tooltip content={<TimeSeriesTooltip />} cursor={{ fill: '#ffffff06' }} />
                        <ReferenceLine y={0} stroke="#ffffff25" />
                        <Area type="monotone" dataKey="cumulative_net" name="Cumulative Net"
                          fill={COLOR_MAP.yellow.fill} fillOpacity={0.15}
                          stroke={COLOR_MAP.yellow.fill} strokeWidth={2} />
                      </ComposedChart>
                    )}
                  </>
                ) : (
                  /* Top Brokers Multi-Line Chart */
                  <LineChart data={brokerTimeseriesData} margin={{ left: 0, right: 8, bottom: 24, top: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                    <XAxis dataKey="date" stroke="#374151" fontSize={10} tick={{ fill: '#6b7280' }} />
                    <YAxis stroke="#374151" fontSize={10} tickFormatter={v => fmt(v)} width={64} tick={{ fill: '#6b7280' }} />
                    <Tooltip content={<TimeSeriesTooltip />} cursor={{ fill: '#ffffff06' }} />
                    <ReferenceLine y={0} stroke="#ffffff25" />
                    <Legend 
                      wrapperStyle={{ fontSize: '9px', color: '#6b7280' }}
                      iconType="circle"
                      iconSize={6}
                    />
                    {topBrokerCodes.map((bc, idx) => (
                      <Line
                        key={bc}
                        type="monotone"
                        dataKey={bc}
                        name={bc}
                        stroke={getBrokerColor(bc, idx)}
                        strokeWidth={1.5}
                        dot={false}
                        activeDot={{ r: 3 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
            
            {timeSeriesMode === 'brokers' && multiBrokerData.length === 0 && (
              <p className="text-[10px] text-gray-600 text-center mt-2">
                Data timeseries broker tidak tersedia untuk rentang ini
              </p>
            )}
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
              <Users className="w-3 h-3" /> Sorted by Power Score
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="bg-[#1a2235] text-gray-500 text-left text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">#</th>
                  <th className="px-5 py-3">Stock</th>
                  <th className="px-5 py-3 text-right">Power Score</th>
                  <th className="px-5 py-3 text-right">Net Accum</th>
                  <th className="px-5 py-3 text-right">Total Value</th>
                  <th className="px-5 py-3 text-right">Total Buy</th>
                  <th className="px-5 py-3 text-right">Total Sell</th>
                  <th className="px-5 py-3 text-center">Buy Brk</th>
                  <th className="px-5 py-3 text-center">Total Brk</th>
                  <th className="px-5 py-3 text-center">Top Buyer</th>
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
                      <td className="px-5 py-3 text-right">
                        <span className="font-black text-yellow-400">
                          {r.power_score.toFixed(1)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-emerald-400 font-bold">{fmt(r.net_accumulation)}</td>
                      <td className="px-5 py-3 text-right text-gray-300 font-mono">{fmt(r.total_value)}</td>
                      <td className="px-5 py-3 text-right text-emerald-300 font-mono">{fmt(r.total_buy)}</td>
                      <td className="px-5 py-3 text-right text-red-300 font-mono">{fmt(r.total_sell)}</td>
                      <td className="px-5 py-3 text-center">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-bold text-[10px]">
                          {r.buy_broker_count}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-center text-gray-400">{r.broker_count}</td>
                      <td className="px-5 py-3 text-center">
                        <span className="text-[10px] text-gray-500">{r.top_buyer_pct}%</span>
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
