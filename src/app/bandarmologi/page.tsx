'use client';

import { useState, useMemo } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from 'recharts';
import { 
  BarChart3, Loader2, ArrowRightLeft, Search, Activity
} from 'lucide-react';

const fmt = (v: number) => {
  if (!v) return '0';
  const a = Math.abs(v);
  if (a >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
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

  // Logic pemisah data pembeli dan penjual (Classic Broksum)
  const broksum = useMemo(() => {
    if (activeTab !== 'tracker') return { buyers: [], sellers: [] };
    const buyers = data.filter(r => r.net_val > 0).slice(0, 10);
    const sellers = data.filter(r => r.net_val < 0).sort((a, b) => a.net_val - b.net_val).slice(0, 10);
    return { buyers, sellers };
  }, [data, activeTab]);

  return (
    <div className="p-6 space-y-6 bg-[#0B0F19] min-h-screen text-white">
      {/* Header & Tabs */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-[#151C2C] p-4 rounded-2xl border border-white/5 gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gold-400/20 rounded-lg">
            <BarChart3 className="text-gold-400 w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Bandarmologi Engine</h1>
            <p className="text-xs text-gray-400">Analisa Broker & Deteksi Akumulasi</p>
          </div>
        </div>
        <div className="flex bg-[#1F2937] p-1 rounded-xl w-full md:w-auto">
          <button 
            onClick={() => { setActiveTab('tracker'); setData([]); }} 
            className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'tracker' ? 'bg-[#0B0F19] text-gold-400 shadow' : 'text-gray-400 hover:text-white'}`}
          >
            Broker Tracker
          </button>
          <button 
            onClick={() => { setActiveTab('screener'); setData([]); }} 
            className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'screener' ? 'bg-[#0B0F19] text-gold-400 shadow' : 'text-gray-400 hover:text-white'}`}
          >
            Whale Screener
          </button>
        </div>
      </div>

      {/* Global Controls (Range) */}
      <div className="bg-[#151C2C] p-5 rounded-2xl border border-white/5 flex flex-wrap gap-4 items-end">
        {/* Input Stock HANYA TAMPIL di Tab Tracker */}
        {activeTab === 'tracker' && (
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-gray-500">Stock Code</label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input 
                value={code} 
                onChange={e => setCode(e.target.value.toUpperCase())} 
                placeholder="BBCA"
                className="w-32 bg-[#1F2937] border-none rounded-lg pl-9 pr-3 py-2.5 font-bold text-gold-400 focus:ring-1 focus:ring-gold-400 outline-none" 
              />
            </div>
          </div>
        )}

        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold text-gray-500">Time Range</label>
          <select 
            value={rangeType} 
            onChange={e => setRangeType(e.target.value)} 
            className="bg-[#1F2937] border-none rounded-lg px-4 py-2.5 text-xs font-bold text-white outline-none"
          >
            <option value="1">Hari Ini</option>
            <option value="5">1 Minggu</option>
            <option value="20">1 Bulan</option>
            <option value="60">3 Bulan</option>
            <option value="custom">Custom Date</option>
          </select>
        </div>

        {rangeType === 'custom' && (
          <div className="flex gap-2">
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-[#1F2937] border-none rounded-lg px-3 py-2 text-xs text-gray-300" />
            <span className="text-gray-500 self-center">-</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-[#1F2937] border-none rounded-lg px-3 py-2 text-xs text-gray-300" />
          </div>
        )}

        <button 
          onClick={loadData} 
          disabled={loading}
          className="bg-gold-400 text-black px-8 py-2.5 rounded-lg font-bold text-xs hover:bg-yellow-500 transition-all flex items-center gap-2 disabled:opacity-50"
        >
          {loading ? <Loader2 className="animate-spin w-4 h-4" /> : <Activity className="w-4 h-4" />} 
          {activeTab === 'tracker' ? 'ANALYZE BROKER' : 'SCAN MARKET'}
        </button>
      </div>

      {/* ══════════════ TAB: TRACKER ══════════════ */}
      {activeTab === 'tracker' && data.length > 0 && (
        <div className="space-y-6 animate-in fade-in duration-500">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-[#151C2C] rounded-2xl border border-emerald-500/20 overflow-hidden shadow-lg">
              <div className="p-4 bg-emerald-500/10 text-emerald-400 font-bold text-[11px] uppercase tracking-wider border-b border-emerald-500/20 flex justify-between">
                <span>Top Net Buyers</span>
                <span>{broksum.buyers.length} Brokers</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[#1F2937]/50 text-gray-400 text-left">
                    <tr><th className="p-3">BRK</th><th className="p-3 text-right">NET VAL</th><th className="p-3 text-right">QTY LOT</th><th className="p-3 text-right">AVG BUY</th></tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {broksum.buyers.map((r, i) => (
                      <tr key={i} className="hover:bg-white/5 transition-colors">
                        <td className="p-3 font-bold text-white">{r.broker_code}</td>
                        <td className="p-3 text-right text-emerald-400 font-bold">{fmt(r.net_val)}</td>
                        <td className="p-3 text-right text-gray-300">{r.buy_lot.toLocaleString('id-ID')}</td>
                        <td className="p-3 text-right text-gold-400 font-mono">{Math.round(r.buy_avg_price).toLocaleString('id-ID')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-[#151C2C] rounded-2xl border border-red-500/20 overflow-hidden shadow-lg">
              <div className="p-4 bg-red-500/10 text-red-400 font-bold text-[11px] uppercase tracking-wider border-b border-red-500/20 flex justify-between">
                <span>Top Net Sellers</span>
                <span>{broksum.sellers.length} Brokers</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[#1F2937]/50 text-gray-400 text-left">
                    <tr><th className="p-3">BRK</th><th className="p-3 text-right">NET VAL</th><th className="p-3 text-right">QTY LOT</th><th className="p-3 text-right">AVG SELL</th></tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {broksum.sellers.map((r, i) => (
                      <tr key={i} className="hover:bg-white/5 transition-colors">
                        <td className="p-3 font-bold text-white">{r.broker_code}</td>
                        <td className="p-3 text-right text-red-400 font-bold">{fmt(r.net_val)}</td>
                        <td className="p-3 text-right text-gray-300">{Math.abs(r.sell_lot).toLocaleString('id-ID')}</td>
                        <td className="p-3 text-right text-gold-400 font-mono">{Math.round(Math.abs(r.sell_avg_price)).toLocaleString('id-ID')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {historyData.length > 0 && (
            <div className="bg-[#151C2C] p-6 rounded-2xl border border-white/5 shadow-lg">
              <h3 className="text-sm font-bold mb-6 text-white flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-gold-400" /> 
                Historical Net Value vs Average Price
              </h3>
              <div className="h-[380px] w-full">
                <ResponsiveContainer>
                  <LineChart data={historyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                    <XAxis dataKey="date" stroke="#6b7280" fontSize={10} tickMargin={10} />
                    <YAxis yAxisId="left" stroke="#10b981" fontSize={10} tickFormatter={fmt} />
                    <YAxis yAxisId="right" orientation="right" stroke="#facc15" fontSize={10} tickFormatter={v => Math.round(v).toString()} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '12px', color: '#fff' }} 
                      itemStyle={{ fontWeight: 'bold' }}
                    />
                    <Legend wrapperStyle={{ paddingTop: '20px' }} />
                    <Line yAxisId="left" type="monotone" name="Net Accumulation (Rp)" dataKey="daily_net_val" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981', strokeWidth: 0 }} />
                    <Line yAxisId="right" type="monotone" name="VWAP Price" dataKey="daily_avg_price" stroke="#facc15" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════ TAB: SCREENER ══════════════ */}
      {activeTab === 'screener' && data.length > 0 && (
        <div className="space-y-6 animate-in fade-in duration-500">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[#151C2C] p-4 rounded-xl border border-white/5">
              <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">Total Signals</p>
              <p className="text-2xl font-black text-white">{data.length}</p>
            </div>
            <div className="bg-[#151C2C] p-4 rounded-xl border border-emerald-500/20">
              <p className="text-[10px] text-emerald-500/70 uppercase font-bold mb-1">Highest Power Score</p>
              <p className="text-2xl font-black text-emerald-400">{data[0]?.stock_code || '-'}</p>
            </div>
          </div>

          <div className="bg-[#151C2C] rounded-2xl border border-white/5 overflow-hidden shadow-lg">
            <div className="p-4 border-b border-white/5 bg-[#1F2937]/30 text-white font-bold flex justify-between items-center">
              <span>Top 50 Accumulation Power</span>
              <span className="text-xs text-gray-400 font-normal">Click a row to open Tracker</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#1F2937] text-gray-400 text-left text-xs uppercase tracking-wider">
                  <tr>
                    <th className="p-4 font-bold">Stock</th>
                    <th className="p-4 text-right font-bold">Total Accumulation</th>
                    <th className="p-4 text-center font-bold">Accumulator Brokers</th>
                    <th className="p-4 text-right font-bold text-gold-400">Power Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data.map((r, i) => (
                    <tr 
                      key={i} 
                      className="border-b border-white/5 hover:bg-gold-400/5 cursor-pointer transition-colors group" 
                      onClick={() => { 
                        setCode(r.stock_code); 
                        setActiveTab('tracker'); 
                        setTimeout(() => loadData(), 50); 
                      }}
                    >
                      <td className="p-4 font-black text-white group-hover:text-gold-400 transition-colors">{r.stock_code}</td>
                      <td className="p-4 text-right text-emerald-400 font-bold">{fmt(r.total_accumulation)}</td>
                      <td className="p-4 text-center font-mono text-gray-400">
                        <span className="bg-[#1F2937] px-3 py-1 rounded-full">{r.broker_count}</span>
                      </td>
                      <td className="p-4 text-right font-black text-lg text-emerald-500">{fmt(r.power_score)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
