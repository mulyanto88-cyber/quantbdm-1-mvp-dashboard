'use client';

import { useState, useMemo } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import { 
  Zap, Calendar, BarChart3, Loader2, MousePointer2 
} from 'lucide-react';

const fmt = (v: number) => {
  if (!v) return '0';
  const a = Math.abs(v);
  if (a >= 1e9)  return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6)  return `${(v / 1e6).toFixed(1)}M`;
  return v.toLocaleString('id-ID');
};

export default function BandarmologiPage() {
  const [activeTab, setActiveTab] = useState<'tracker' | 'screener'>('tracker');
  const [code, setCode] = useState('BBCA');
  const [rangeType, setRangeType] = useState('5'); // 'custom' atau angka hari
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [data, setData] = useState<any[]>([]);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const urlParams = rangeType === 'custom' 
        ? `startDate=${startDate}&endDate=${endDate}` 
        : `days=${rangeType}`;
      
      // Load Summary
      const res = await fetch(`/api/broker-tracker?action=tracker&code=${code}&${urlParams}`);
      const json = await res.json();
      setData(json.data || []);

      // Load History for Chart
      const resHist = await fetch(`/api/broker-tracker?action=history&code=${code}&${urlParams}`);
      const jsonHist = await resHist.json();
      setHistoryData(jsonHist.data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  // Logic Tabel Broksum (Sellers sekarang akan muncul karena net_val < 0)
  const broksum = useMemo(() => {
    const buyers = data.filter(r => r.net_val > 0).slice(0, 10);
    const sellers = data.filter(r => r.net_val < 0).sort((a, b) => a.net_val - b.net_val).slice(0, 10);
    return { buyers, sellers };
  }, [data]);

  // Pivot data historis untuk Recharts
  const chartProcessed = useMemo(() => {
    const top5Codes = broksum.buyers.slice(0, 5).map(b => b.broker_code);
    const grouped = historyData.reduce((acc: any, curr) => {
      if (!acc[curr.date]) acc[curr.date] = { date: curr.date };
      if (top5Codes.includes(curr.broker_code)) acc[curr.date][curr.broker_code] = curr.net_val;
      return acc;
    }, {});
    return Object.values(grouped);
  }, [historyData, broksum]);

  return (
    <div className="p-6 space-y-6 bg-[#0B0F19] min-h-screen text-white">
      {/* Search & Range Controls */}
      <div className="bg-[#151C2C] p-5 rounded-2xl border border-white/5 flex flex-wrap gap-4 items-end">
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold text-gray-500">Stock Code</label>
          <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} className="w-24 bg-[#1F2937] border-none rounded-lg p-2 font-bold text-gold-400" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold text-gray-500">Range Type</label>
          <select value={rangeType} onChange={e => setRangeType(e.target.value)} className="bg-[#1F2937] border-none rounded-lg p-2 text-xs font-bold">
            <option value="1">Hari Ini</option><option value="5">1 Minggu</option><option value="20">1 Bulan</option><option value="custom">Custom Date</option>
          </select>
        </div>
        {rangeType === 'custom' && (
          <>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-gray-500">From</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-[#1F2937] border-none rounded-lg p-2 text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-gray-500">To</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-[#1F2937] border-none rounded-lg p-2 text-xs" />
            </div>
          </>
        )}
        <button onClick={loadData} className="bg-gold-400 text-black px-6 py-2 rounded-lg font-bold text-xs hover:bg-yellow-500 transition-all">
          {loading ? <Loader2 className="animate-spin" /> : 'ANALYZE NOW'}
        </button>
      </div>

      {/* Tabel Broksum */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#151C2C] rounded-xl border border-emerald-500/20 overflow-hidden">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 font-bold text-[10px]">TOP BUYERS</div>
          <table className="w-full text-xs">
            <tbody className="divide-y divide-white/5">
              {broksum.buyers.map((r, i) => (
                <tr key={i} className="hover:bg-white/5"><td className="p-2 font-bold">{r.broker_code}</td><td className="p-2 text-right text-emerald-400">{fmt(r.net_val)}</td><td className="p-2 text-right text-gray-400 font-mono">{Math.round(r.avg_lot_per_trade)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="bg-[#151C2C] rounded-xl border border-red-500/20 overflow-hidden">
          <div className="p-3 bg-red-500/10 text-red-400 font-bold text-[10px]">TOP SELLERS</div>
          <table className="w-full text-xs">
            <tbody className="divide-y divide-white/5">
              {broksum.sellers.map((r, i) => (
                <tr key={i} className="hover:bg-white/5"><td className="p-2 font-bold">{r.broker_code}</td><td className="p-2 text-right text-red-400">{fmt(r.net_val)}</td><td className="p-2 text-right text-gray-400 font-mono">{Math.round(r.avg_lot_per_trade)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Accumulation Chart */}
      {chartProcessed.length > 0 && (
        <div className="bg-[#151C2C] p-5 rounded-2xl border border-white/5">
          <h3 className="text-sm font-bold mb-4 flex items-center gap-2 text-gold-400">
            <BarChart3 className="w-4 h-4" /> Top Broker Accumulation Trend
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer>
              <LineChart data={chartProcessed}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis dataKey="date" stroke="#6b7280" fontSize={10} />
                <YAxis stroke="#6b7280" fontSize={10} tickFormatter={fmt} />
                <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '8px', fontSize: '12px' }} />
                {broksum.buyers.slice(0, 5).map((b, idx) => (
                  <Line key={b.broker_code} type="monotone" dataKey={b.broker_code} stroke={['#facc15', '#2dd4bf', '#a78bfa', '#fb7185', '#60a5fa'][idx]} strokeWidth={2} dot={{ r: 4 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
