'use client';

import { useState, useMemo } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from 'recharts';
import { 
  Zap, BarChart3, Loader2, MousePointer2, Search, ArrowRightLeft 
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
  const [rangeType, setRangeType] = useState('5');
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
      
      const resAction = activeTab === 'tracker' ? 'tracker' : 'screener';
      const res = await fetch(`/api/broker-tracker?action=${resAction}&code=${code}&${urlParams}`);
      const json = await res.json();
      setData(json.data || []);

      if (activeTab === 'tracker') {
        const resHist = await fetch(`/api/broker-tracker?action=history&code=${code}&${urlParams}`);
        const jsonHist = await resHist.json();
        setHistoryData(jsonHist.data || []);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const broksum = useMemo(() => {
    const buyers = data.filter(r => r.net_val > 0).slice(0, 10);
    const sellers = data.filter(r => r.net_val < 0).sort((a, b) => a.net_val - b.net_val).slice(0, 10);
    return { buyers, sellers };
  }, [data]);

  return (
    <div className="p-6 space-y-6 bg-[#0B0F19] min-h-screen text-white">
      {/* Header & Tabs */}
      <div className="flex justify-between items-center bg-[#151C2C] p-4 rounded-2xl border border-white/5">
        <div className="flex items-center gap-3">
          <BarChart3 className="text-gold-400" />
          <h1 className="text-lg font-bold">Bandarmologi Engine</h1>
        </div>
        <div className="flex bg-[#1F2937] p-1 rounded-xl">
          <button onClick={() => setActiveTab('tracker')} className={`px-4 py-2 rounded-lg text-xs font-bold ${activeTab === 'tracker' ? 'bg-[#0B0F19] text-gold-400' : 'text-gray-400'}`}>Tracker</button>
          <button onClick={() => setActiveTab('screener')} className={`px-4 py-2 rounded-lg text-xs font-bold ${activeTab === 'screener' ? 'bg-[#0B0F19] text-gold-400' : 'text-gray-400'}`}>Screener</button>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-[#151C2C] p-5 rounded-2xl border border-white/5 flex flex-wrap gap-4 items-end">
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold text-gray-500">Stock</label>
          <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} className="w-24 bg-[#1F2937] border-none rounded-lg p-2 font-bold text-gold-400" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold text-gray-500">Range</label>
          <select value={rangeType} onChange={e => setRangeType(e.target.value)} className="bg-[#1F2937] border-none rounded-lg p-2 text-xs font-bold text-white">
            <option value="1">Hari Ini</option><option value="5">1 Minggu</option><option value="20">1 Bulan</option><option value="custom">Custom</option>
          </select>
        </div>
        {rangeType === 'custom' && (
          <div className="flex gap-2">
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-[#1F2937] border-none rounded-lg p-2 text-xs" />
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-[#1F2937] border-none rounded-lg p-2 text-xs" />
          </div>
        )}
        <button onClick={loadData} className="bg-gold-400 text-black px-6 py-2 rounded-lg font-bold text-xs hover:bg-yellow-500">
          {loading ? <Loader2 className="animate-spin" /> : 'ANALYZE'}
        </button>
      </div>

      {activeTab === 'tracker' && (
        <>
          {/* Tabel Broksum Improved */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-[#151C2C] rounded-xl border border-emerald-500/20 overflow-hidden">
              <div className="p-3 bg-emerald-500/10 text-emerald-400 font-bold text-[10px]">TOP BUYERS</div>
              <table className="w-full text-[11px]">
                <thead className="bg-[#1F2937] text-gray-400 text-left">
                  <tr><th className="p-2">BRK</th><th className="p-2 text-right">NET VAL</th><th className="p-2 text-right">QTY LOT</th><th className="p-2 text-right">AVG BUY</th><th className="p-2 text-right">L/T</th></tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {broksum.buyers.map((r, i) => (
                    <tr key={i} className="hover:bg-white/5">
                      <td className="p-2 font-bold">{r.broker_code}</td>
                      <td className="p-2 text-right text-emerald-400 font-bold">{fmt(r.net_val)}</td>
                      <td className="p-2 text-right text-gray-300">{r.buy_lot.toLocaleString()}</td>
                      <td className="p-2 text-right text-gold-400 font-mono">{Math.round(r.buy_avg_price)}</td>
                      <td className="p-2 text-right text-gray-500">{Math.round(r.avg_lot_per_trade)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-[#151C2C] rounded-xl border border-red-500/20 overflow-hidden">
              <div className="p-3 bg-red-500/10 text-red-400 font-bold text-[10px]">TOP SELLERS</div>
              <table className="w-full text-[11px]">
                <thead className="bg-[#1F2937] text-gray-400 text-left">
                  <tr><th className="p-2">BRK</th><th className="p-2 text-right">NET VAL</th><th className="p-2 text-right">QTY LOT</th><th className="p-2 text-right">AVG SELL</th><th className="p-2 text-right">L/T</th></tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {broksum.sellers.map((r, i) => (
                    <tr key={i} className="hover:bg-white/5">
                      <td className="p-2 font-bold">{r.broker_code}</td>
                      <td className="p-2 text-right text-red-400 font-bold">{fmt(r.net_val)}</td>
                      <td className="p-2 text-right text-gray-300">{Math.abs(r.sell_lot).toLocaleString()}</td>
                      <td className="p-2 text-right text-gold-400 font-mono">{Math.round(Math.abs(r.sell_avg_price))}</td>
                      <td className="p-2 text-right text-gray-500">{Math.round(r.avg_lot_per_trade)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Double Axis History Chart */}
          {historyData.length > 0 && (
            <div className="bg-[#151C2C] p-5 rounded-2xl border border-white/5">
              <h3 className="text-sm font-bold mb-6 text-gold-400 flex items-center gap-2"><ArrowRightLeft className="w-4 h-4" /> Net Value vs Avg Price Trend</h3>
              <div className="h-[350px] w-full">
                <ResponsiveContainer>
                  <LineChart data={historyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                    <XAxis dataKey="date" stroke="#6b7280" fontSize={10} />
                    <YAxis yAxisId="left" stroke="#10b981" fontSize={10} tickFormatter={fmt} />
                    {/* Perbaikan error TypeScript ada di baris ini: penambahan .toString() */}
                    <YAxis yAxisId="right" orientation="right" stroke="#facc15" fontSize={10} tickFormatter={v => Math.round(v).toString()} />
                    <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '12px' }} />
                    <Legend />
                    <Line yAxisId="left" type="monotone" name="Net Value" dataKey="daily_net_val" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} />
                    <Line yAxisId="right" type="monotone" name="Avg Price" dataKey="daily_avg_price" stroke="#facc15" strokeWidth={2} strokeDasharray="5 5" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'screener' && (
        <div className="bg-[#151C2C] rounded-2xl border border-white/5 overflow-hidden">
          <div className="p-4 border-b border-white/5 bg-gold-400/5 text-gold-400 font-bold">Accumulation Power Screener</div>
          <table className="w-full text-sm">
            <thead className="bg-[#1F2937] text-gray-400 text-left">
              <tr><th className="p-3">Stock</th><th className="p-3 text-right">Total Accum</th><th className="p-3 text-right">Brokers</th><th className="p-3 text-right font-bold">Power Score</th></tr>
            </thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={i} className="border-b border-white/5 hover:bg-white/5 cursor-pointer" onClick={() => { setCode(r.stock_code); setActiveTab('tracker'); }}>
                  <td className="p-3 font-black text-gold-400">{r.stock_code}</td>
                  <td className="p-3 text-right text-emerald-400 font-bold">{fmt(r.total_accumulation)}</td>
                  <td className="p-3 text-right font-mono text-gray-400">{r.broker_count}</td>
                  <td className="p-3 text-right font-black text-lg text-emerald-500">{fmt(r.power_score)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
