'use client';

import { useState, useMemo, useEffect } from 'react';
import { 
  Database, Zap, Search, TrendingUp, TrendingDown, 
  AlertTriangle, Loader2, BarChart3, ArrowRightLeft, MousePointer2 
} from 'lucide-react';

// --- Formatters ---
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
  const [days, setDays] = useState('5'); // Broksum biasanya short-term
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/broker-tracker?action=${activeTab === 'tracker' ? 'tracker' : 'screener'}&code=${code}&days=${days}`);
      const json = await res.json();
      setData(json.data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  // Membagi data menjadi Buyer & Seller (Classic Broksum Style)
  const broksum = useMemo(() => {
    if (activeTab !== 'tracker' || !data.length) return { buyers: [], sellers: [] };
    const buyers = data.filter(r => r.net_val > 0).slice(0, 10);
    const sellers = data.filter(r => r.net_val < 0).sort((a, b) => a.net_val - b.net_val).slice(0, 10);
    return { buyers, sellers };
  }, [data, activeTab]);

  // Statistik Konsentrasi
  const concentration = useMemo(() => {
    if (!broksum.buyers.length) return null;
    const top3Buyer = broksum.buyers.slice(0, 3).reduce((s, r) => s + r.concentration_pct, 0);
    const status = top3Buyer > 60 ? 'Big Accum' : top3Buyer > 40 ? 'Accum' : 'Neutral';
    return { top3Buyer, status };
  }, [broksum]);

  return (
    <div className="p-6 space-y-6 text-foreground bg-background min-h-screen">
      {/* Header & Tab Switcher */}
      <div className="flex justify-between items-center bg-card p-4 rounded-2xl border border-border">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gold-400/20 rounded-lg"><BarChart3 className="text-gold-400" /></div>
          <div>
            <h1 className="text-xl font-bold">Bandarmologi Engine <span className="text-[10px] bg-gold-400/20 text-gold-400 px-2 py-0.5 rounded-full ml-2">PRO</span></h1>
            <p className="text-xs text-muted-foreground">Analisa Broker Summary & Transaction Anomaly</p>
          </div>
        </div>
        <div className="flex bg-muted p-1 rounded-xl">
          <button onClick={() => setActiveTab('tracker')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'tracker' ? 'bg-background shadow-sm text-gold-400' : 'text-muted-foreground'}`}>Broker Tracker</button>
          <button onClick={() => setActiveTab('screener')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'screener' ? 'bg-background shadow-sm text-gold-400' : 'text-muted-foreground'}`}>Screener Signal</button>
        </div>
      </div>

      {activeTab === 'tracker' && (
        <>
          {/* Controls */}
          <div className="flex gap-3 items-end bg-card p-5 rounded-2xl border border-border">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-muted-foreground">Ticker</label>
              <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} className="w-24 bg-muted border-none rounded-lg p-2 font-mono font-bold focus:ring-1 ring-gold-400" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-muted-foreground">Range</label>
              <select value={days} onChange={e => setDays(e.target.value)} className="bg-muted border-none rounded-lg p-2 text-xs font-bold">
                <option value="1">Hari Ini</option><option value="5">1 Minggu</option><option value="20">1 Bulan</option>
              </select>
            </div>
            <button onClick={loadData} disabled={loading} className="bg-gold-400 text-black px-6 py-2 rounded-lg font-bold text-xs flex items-center gap-2 hover:opacity-80 transition-all disabled:opacity-50">
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />} RUN ANALYZE
            </button>
          </div>

          {/* Concentration Gauge */}
          {concentration && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-card p-4 rounded-2xl border-l-4 border-emerald-500 shadow-sm">
                <p className="text-[10px] text-muted-foreground uppercase font-bold">Status Bandarmologi</p>
                <h3 className={`text-2xl font-black ${concentration.status.includes('Accum') ? 'text-emerald-400' : 'text-red-400'}`}>{concentration.status}</h3>
                <p className="text-xs text-muted-foreground">Top 3 Concentration: {concentration.top3Buyer.toFixed(1)}%</p>
              </div>
              <div className="bg-card p-4 rounded-2xl border-l-4 border-gold-400 shadow-sm">
                <p className="text-[10px] text-muted-foreground uppercase font-bold">Anomaly Detect</p>
                <div className="flex items-center gap-2 text-gold-400 font-bold">
                  <MousePointer2 className="w-4 h-4" />
                  <span>Whale Activity Detected</span>
                </div>
                <p className="text-xs text-muted-foreground">Big Lot in Small Frequency Found</p>
              </div>
            </div>
          )}

          {/* Classic Broksum Table */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* BUYER SIDE */}
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              <div className="p-3 bg-emerald-500/10 border-b border-emerald-500/20 text-emerald-500 font-bold text-xs">TOP NET BUYERS</div>
              <table className="w-full text-[11px]">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr className="text-left"><th className="p-2">BRK</th><th className="p-2 text-right">NET VAL</th><th className="p-2 text-right">AVG</th><th className="p-2 text-right">LOT/TRD</th></tr>
                </thead>
                <tbody>
                  {broksum.buyers.map((r, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="p-2 font-bold">{r.broker_code}</td>
                      <td className="p-2 text-right text-emerald-400 font-bold">{fmt(r.net_val)}</td>
                      <td className="p-2 text-right text-muted-foreground">{Math.round(r.avg_price)}</td>
                      <td className="p-2 text-right text-gold-400 font-mono">{Math.round(r.avg_lot_per_trade)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* SELLER SIDE */}
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              <div className="p-3 bg-red-500/10 border-b border-red-500/20 text-red-500 font-bold text-xs">TOP NET SELLERS</div>
              <table className="w-full text-[11px]">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr className="text-left"><th className="p-2">BRK</th><th className="p-2 text-right">NET VAL</th><th className="p-2 text-right">AVG</th><th className="p-2 text-right">LOT/TRD</th></tr>
                </thead>
                <tbody>
                  {broksum.sellers.map((r, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="p-2 font-bold">{r.broker_code}</td>
                      <td className="p-2 text-right text-red-400 font-bold">{fmt(r.net_val)}</td>
                      <td className="p-2 text-right text-muted-foreground">{Math.round(r.avg_price)}</td>
                      <td className="p-2 text-right text-gold-400 font-mono">{Math.round(r.avg_lot_per_trade)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === 'screener' && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="p-4 border-b border-border flex justify-between items-center">
            <h2 className="font-bold">Whale Accumulation Screener</h2>
            <button onClick={loadData} className="text-xs bg-muted p-2 rounded-lg hover:bg-border transition-all">REFRESH SCREENER</button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground text-[10px] uppercase">
              <tr className="text-left"><th className="p-3">Stock</th><th className="p-3 text-right">Total Accum</th><th className="p-3 text-right"># Brokers</th><th className="p-3 text-right font-bold text-gold-400">Power Score</th></tr>
            </thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={i} className="border-b border-border hover:bg-gold-400/5 cursor-pointer" onClick={() => { setCode(r.stock_code); setActiveTab('tracker'); }}>
                  <td className="p-3 font-black text-gold-400">{r.stock_code}</td>
                  <td className="p-3 text-right text-emerald-400 font-bold">{fmt(r.total_accumulation)}</td>
                  <td className="p-3 text-right font-mono">{r.broker_count}</td>
                  <td className="p-3 text-right font-black text-lg">{fmt(r.power_score)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
