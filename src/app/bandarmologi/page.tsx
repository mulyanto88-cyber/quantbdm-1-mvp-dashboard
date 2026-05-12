'use client';

import { useState, useMemo } from 'react';
import * as duckdb from '@duckdb/duckdb-wasm';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { RefreshCw, Database, Zap, TrendingUp, TrendingDown, AlertTriangle, X, Clock, CheckCircle2, Maximize2, Minimize2 } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface BrokerRow {
  date: string;
  broker_code: string;
  buy_value: number;
  sell_value: number;
  net_value: number;
  net_lot: number;
}

interface CacheEntry {
  rows: BrokerRow[];
  topBrokers: string[];
  fetchedAt: number;
  code: string;
  days: string;
}

// ── Cache Config ──────────────────────────────────────────────────────────────
const CACHE_TTL_MS  = 4 * 60 * 60 * 1000; // 4 jam
const CACHE_PREFIX  = 'bdmflow_broker_v2_';

function getCacheKey(code: string, days: string) {
  return `${CACHE_PREFIX}${code.toUpperCase()}_${days}d`;
}

function saveCache(code: string, days: string, rows: BrokerRow[], topBrokers: string[]) {
  try {
    const entry: CacheEntry = { rows, topBrokers, fetchedAt: Date.now(), code, days };
    sessionStorage.setItem(getCacheKey(code, days), JSON.stringify(entry));
  } catch (e) {
    console.warn('Cache write gagal (mungkin penuh):', e);
  }
}

function loadCache(code: string, days: string): CacheEntry | null {
  try {
    const raw = sessionStorage.getItem(getCacheKey(code, days));
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
      sessionStorage.removeItem(getCacheKey(code, days));
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

function clearCache(code: string, days: string) {
  try { sessionStorage.removeItem(getCacheKey(code, days)); } catch { /* ignore */ }
}

function formatAge(fetchedAt: number): string {
  const s = Math.floor((Date.now() - fetchedAt) / 1000);
  if (s < 60)   return `${s} detik lalu`;
  if (s < 3600) return `${Math.floor(s / 60)} menit lalu`;
  return `${Math.floor(s / 3600)} jam lalu`;
}

// ── DuckDB singleton ──────────────────────────────────────────────────────────
let _db: duckdb.AsyncDuckDB | null = null;

async function getDB() {
  if (_db) return _db;
  const BUNDLES: duckdb.DuckDBBundles = {
    mvp: {
      mainModule:  'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-mvp.wasm',
      mainWorker:  'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-browser-mvp.worker.js',
    },
    eh: {
      mainModule:  'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-eh.wasm',
      mainWorker:  'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-browser-eh.worker.js',
    },
  };
  const bundle = await duckdb.selectBundle(BUNDLES);
  const blob   = await fetch(bundle.mainWorker!).then(r => r.blob());
  const worker = new Worker(URL.createObjectURL(blob));
  const db     = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
  await db.instantiate(bundle.mainModule!);
  _db = db;
  return db;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const VALID_CODE = /^[A-Z0-9]{1,6}$/;
const STORAGE_BASE = 'https://ifdbelggvxyimqyowczn.supabase.co/storage/v1/object/public/broker_parquet';

// Build candidate URLs (skip weekends), then HEAD-check which actually exist
async function fetchParquetUrls(days: string): Promise<string[]> {
  const numDays = parseInt(days);
  const candidates: string[] = [];
  const today = new Date();
  for (let i = 0; candidates.length < numDays && i < numDays + 14; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (d.getDay() === 0 || d.getDay() === 6) continue; // skip weekend
    const ds = d.toISOString().split('T')[0].replace(/-/g, '');
    candidates.push(`${STORAGE_BASE}/${ds}/broker_activity_${ds}.parquet`);
  }
  const checks = await Promise.all(
    candidates.map(url => fetch(url, { method: 'HEAD' }).then(r => r.ok ? url : null).catch(() => null))
  );
  return checks.filter(Boolean) as string[];
}

// Arrow date → "YYYY-MM-DD"
// Treats number as MILLISECONDS (not Date32 days) based on actual parquet output
function arrowDateToStr(val: any): string {
  if (val == null) return '';
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    return val.toISOString().split('T')[0];
  }
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return '';
    return new Date(val).toISOString().split('T')[0]; // ms since epoch
  }
  if (typeof val === 'bigint') {
    const ms = Number(val);
    if (!Number.isFinite(ms)) return '';
    return new Date(ms).toISOString().split('T')[0];
  }
  return String(val).slice(0, 10);
}

async function queryBroker(urls: string[], code: string): Promise<BrokerRow[]> {
  if (!VALID_CODE.test(code)) throw new Error('Kode saham tidak valid');
  const db   = await getDB();
  const conn = await db.connect();
  const list = urls.map(u => `'${u}'`).join(', ');
  const result = await conn.query(`
    SELECT date, broker_code,
      SUM(CASE WHEN side = 'BUY'  THEN value ELSE 0 END)::BIGINT AS buy_value,
      SUM(CASE WHEN side = 'SELL' THEN value ELSE 0 END)::BIGINT AS sell_value,
      SUM(value)::BIGINT AS net_value,
      SUM(lot)::BIGINT AS net_lot
    FROM read_parquet([${list}])
    WHERE stock_code = '${code}'
    GROUP BY date, broker_code
    ORDER BY date DESC, net_value DESC
  `);
  await conn.close();
  return result.toArray()
    .map((r: any) => ({
      date:        arrowDateToStr(r.date),
      broker_code: String(r.broker_code),
      buy_value:   Number(r.buy_value),
      sell_value:  Number(r.sell_value),
      net_value:   Number(r.net_value),
      net_lot:     Number(r.net_lot),
    }))
    .filter(r => r.date !== '');
}

function fmt(v: number) {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
  return v.toLocaleString('id-ID');
}

const BROKER_COLORS = [
  '#e7b733','#22c55e','#3b82f6','#a855f7','#ef4444',
  '#06b6d4','#f97316','#ec4899','#84cc16','#64748b',
];

const PAGE_SIZE = 50;

// ── Component ─────────────────────────────────────────────────────────────────
export default function BandarmologiPage() {
  const [code,        setCode]        = useState('BBCA');
  const [days,        setDays]        = useState('30');
  const [data,        setData]        = useState<BrokerRow[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [msg,         setMsg]         = useState('');
  const [error,       setError]       = useState('');
  const [topBrokers,  setTopBrokers]  = useState<string[]>([]);
  const [selected,    setSelected]    = useState<Set<string>>(new Set());
  const [page,        setPage]        = useState(0);
  const [fromCache,   setFromCache]   = useState(false);
  const [cacheAge,    setCacheAge]    = useState('');
  const [fetchedAt,   setFetchedAt]   = useState<number | null>(null);

  const [isFullScreen, setIsFullScreen] = useState(false);

  // ── Load dari cache atau fetch fresh ──────────────────────────────────────
  const loadData = async (forceRefresh = false) => {
    const codeUpper = code.toUpperCase();
    if (!VALID_CODE.test(codeUpper)) {
      setError('Kode saham tidak valid (maks 6 huruf/angka)');
      return;
    }

    // Cek cache dulu
    if (!forceRefresh) {
      const cached = loadCache(codeUpper, days);
      if (cached) {
        setData(cached.rows);
        setTopBrokers(cached.topBrokers);
        setSelected(new Set(cached.topBrokers.slice(0, 5)));
        setFromCache(true);
        setCacheAge(formatAge(cached.fetchedAt));
        setFetchedAt(cached.fetchedAt);
        setPage(0);
        setError('');
        return;
      }
    }

    // Fetch fresh
    setLoading(true);
    setError('');
    setData([]);
    setFromCache(false);

    try {
      setMsg('Menyiapkan file list...');
      const urls = await fetchParquetUrls(days);
      if (!urls.length) throw new Error('Tidak ada file parquet tersedia. Coba kurangi rentang hari.');

      setMsg(`Query DuckDB — ${urls.length} file...`);
      const rows = await queryBroker(urls, codeUpper);
      if (!rows.length) throw new Error(`Tidak ada data untuk ${codeUpper}. Coba kode saham lain.`);

      // Hitung top 10 broker
      const brokerMap = new Map<string, number>();
      rows.forEach(r => brokerMap.set(r.broker_code, (brokerMap.get(r.broker_code) ?? 0) + Math.abs(r.net_value)));
      const top10 = Array.from(brokerMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([c]) => c);

      // Simpan ke cache
      saveCache(codeUpper, days, rows, top10);

      setData(rows);
      setTopBrokers(top10);
      setSelected(new Set(top10.slice(0, 5)));
      setPage(0);
      setFetchedAt(Date.now());
      setCacheAge('baru saja');
    } catch (e: any) {
      setError(e.message ?? 'Terjadi kesalahan');
    } finally {
      setLoading(false);
      setMsg('');
    }
  };

  const handleForceRefresh = () => {
    clearCache(code.toUpperCase(), days);
    loadData(true);
  };

  const toggle = (c: string) => {
    const s = new Set(selected);
    s.has(c) ? s.delete(c) : s.add(c);
    setSelected(s);
  };

  // Stats ringkasan
  const stats = useMemo(() => {
    if (!data.length) return null;
    const brokerTotals = new Map<string, number>();
    data.forEach(r => brokerTotals.set(r.broker_code, (brokerTotals.get(r.broker_code) ?? 0) + r.net_value));
    const topBuy  = Array.from(brokerTotals.entries()).sort((a, b) => b[1] - a[1])[0];
    const topSell = Array.from(brokerTotals.entries()).sort((a, b) => a[1] - b[1])[0];
    const totalNet = data.reduce((s, r) => s + r.net_value, 0);
    return { topBuy, topSell, totalNet };
  }, [data]);

  // Pivot untuk chart
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
    return Object.values(map).sort((a: any, b: any) => a.date.localeCompare(b.date));
  }, [data, selected, topBrokers]);

  const totalPages = Math.ceil(data.length / PAGE_SIZE);
  const pageData   = data.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-fade-in pb-10">

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">
            <Database className="w-8 h-8 text-gold-400 inline mr-2" />
            <span className="gradient-gold">Broker</span>{' '}
            <span className="text-foreground">Tracker</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Net value broker per saham · DuckDB WASM + Supabase Storage
          </p>
        </div>

        {/* Cache status badge */}
        {data.length > 0 && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border ${
            fromCache
              ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
              : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
          }`}>
            {fromCache
              ? <><Clock className="w-3.5 h-3.5" /> Cache · {cacheAge}</>
              : <><CheckCircle2 className="w-3.5 h-3.5" /> Fresh data</>
            }
          </div>
        )}
      </div>

      {/* ── Controls ── */}
      <div className="glass rounded-2xl p-5 border border-border/30 space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Kode Saham</label>
            <input
              type="text"
              value={code}
              maxLength={6}
              placeholder="BBCA"
              onChange={e => setCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && loadData()}
              className="bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-2.5 w-32 uppercase font-mono font-bold text-sm focus:outline-none focus:border-gold-400/40 text-foreground transition-colors"
            />
          </div>

          <div>
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Lookback</label>
            <select
              value={days}
              onChange={e => setDays(e.target.value)}
              className="bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gold-400/40 text-foreground"
            >
              <option value="7">7 Hari</option>
              <option value="14">14 Hari</option>
              <option value="30">30 Hari</option>
              <option value="60">60 Hari</option>
              <option value="90">90 Hari</option>
            </select>
          </div>

          <div className="flex gap-2 pb-0.5">
            {/* Lacak (cache-aware) */}
            <button
              onClick={() => loadData(false)}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gold-400/10 border border-gold-400/30 text-gold-400 text-sm font-bold hover:bg-gold-400/20 disabled:opacity-50 transition-all"
            >
              <Zap className={`w-4 h-4 ${loading ? 'animate-pulse' : ''}`} />
              {loading ? msg || 'Loading...' : 'Lacak'}
            </button>

            {/* Force Refresh — bypass cache */}
            {data.length > 0 && (
              <button
                onClick={handleForceRefresh}
                disabled={loading}
                title="Paksa ambil data baru (abaikan cache)"
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl glass border border-border/30 text-muted-foreground text-sm hover:text-foreground hover:border-gold-400/30 disabled:opacity-50 transition-all"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            )}
          </div>
        </div>

        {/* Loading progress bar */}
        {loading && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-gold-400 animate-pulse" />
              {msg}
            </p>
            <div className="h-1 rounded-full bg-white/[0.05] overflow-hidden">
              <div className="h-full bg-gradient-to-r from-gold-400 to-yellow-500 rounded-full animate-pulse" style={{ width: '60%' }} />
            </div>
          </div>
        )}
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ── Stats Cards ── */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              label: 'Top Akumulator',
              value: stats.topBuy[0],
              sub: `+${fmt(stats.topBuy[1])}`,
              color: 'text-emerald-400',
              icon: TrendingUp,
              border: 'hover:border-emerald-400/30',
            },
            {
              label: 'Top Distributor',
              value: stats.topSell[0],
              sub: `${fmt(stats.topSell[1])}`,
              color: 'text-red-400',
              icon: TrendingDown,
              border: 'hover:border-red-400/30',
            },
            {
              label: 'Net Flow Semua Broker',
              value: fmt(stats.totalNet),
              sub: stats.totalNet >= 0 ? 'Net Buy' : 'Net Sell',
              color: stats.totalNet >= 0 ? 'text-emerald-400' : 'text-red-400',
              icon: Database,
              border: 'hover:border-gold-400/30',
            },
          ].map((m, i) => {
            const Icon = m.icon;
            return (
              <div key={i} className={`glass rounded-xl p-4 border border-border/30 ${m.border} transition-all group`}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{m.label}</p>
                  <Icon className={`w-4 h-4 ${m.color}`} />
                </div>
                <p className={`text-2xl font-black ${m.color}`}>{m.value}</p>
                <p className="text-[11px] text-muted-foreground mt-1">{m.sub}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Broker Pills ── */}
      {topBrokers.length > 0 && (
        <div className="glass rounded-xl p-4 border border-border/30 space-y-2">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider">
            Top 10 Broker — klik untuk tampil/sembunyikan di chart
          </p>
          <div className="flex flex-wrap gap-2">
            {topBrokers.map((c, i) => (
              <button
                key={c}
                onClick={() => toggle(c)}
                className="px-3 py-1.5 rounded-full text-xs font-bold border transition-all hover:scale-105"
                style={{
                  backgroundColor: selected.has(c) ? BROKER_COLORS[i % BROKER_COLORS.length] : 'transparent',
                  color:           selected.has(c) ? '#0B0F19' : BROKER_COLORS[i % BROKER_COLORS.length],
                  borderColor:     BROKER_COLORS[i % BROKER_COLORS.length],
                  opacity:         selected.has(c) ? 1 : 0.7,
                }}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Chart ── */}
      {chartData.length > 0 && (
        <div className={`glass rounded-2xl border border-border/30 p-5 transition-all duration-300 ${
          isFullScreen ? 'fixed inset-0 z-[100] bg-background/95 backdrop-blur-xl flex flex-col p-8' : 'relative'
        }`}>
          <div className={`flex items-center justify-between mb-4 ${isFullScreen ? 'flex-col gap-6' : ''}`}>
            <h2 className={`font-bold text-foreground ${isFullScreen ? 'text-5xl text-center' : ''}`}>
              {isFullScreen ? (
                <span className="gradient-gold">{code.toUpperCase()}</span>
              ) : (
                <>
                  Net Value Broker — <span className="gradient-gold">{code.toUpperCase()}</span>
                  <span className="text-muted-foreground font-normal text-sm ml-2">({days} hari)</span>
                </>
              )}
            </h2>
            
            <div className={`flex items-center gap-4 ${isFullScreen ? 'mt-4' : ''}`}>
              {!isFullScreen && fromCache && fetchedAt && (
                <span className="text-[10px] text-muted-foreground">
                  📦 cache · {formatAge(fetchedAt)}
                </span>
              )}
              <button
                onClick={() => setIsFullScreen(!isFullScreen)}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                title={isFullScreen ? "Exit Fullscreen" : "Fullscreen View"}
              >
                {isFullScreen ? <Minimize2 className="w-5 h-5 text-gold-400" /> : <Maximize2 className="w-4 h-4 text-muted-foreground" />}
              </button>
            </div>
          </div>

          <div className={`flex-1 w-full ${isFullScreen ? 'min-h-0' : ''}`}>
            <ResponsiveContainer width="100%" height={isFullScreen ? '100%' : 380}>
              <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: isFullScreen ? 12 : 10, fill: '#64748b' }}
                  tickFormatter={v => v.slice(5)}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: isFullScreen ? 12 : 10, fill: '#64748b' }}
                  tickFormatter={fmt}
                  width={isFullScreen ? 80 : 55}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(11,15,25,0.95)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '16px',
                    fontSize: isFullScreen ? '14px' : '12px',
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
                  }}
                  itemStyle={{ padding: '2px 0' }}
                  labelStyle={{ marginBottom: '8px', color: '#94a3b8', fontWeight: 'bold' }}
                  formatter={(v: any, n: any) => {
                    const val = Number(v);
                    const formatted = `Rp ${val.toLocaleString('id-ID')}`;
                    const sign = val > 0 ? '▲ +' : val < 0 ? '▼ ' : '';
                    const color = val > 0 ? '#10b981' : val < 0 ? '#ef4444' : '#94a3b8';
                    return [<span style={{ color }}>{sign}{formatted}</span>, n];
                  }}
                />
                {!isFullScreen && <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />}
                {/* 0 Reference Line */}
                <path d={`M 0,${380/2} L 1000,${380/2}`} stroke="rgba(255,255,255,0.1)" strokeDasharray="5 5" />
                
                {Array.from(selected).map(c => (
                  <Line
                    key={c}
                    type="monotone"
                    dataKey={c}
                    stroke={BROKER_COLORS[topBrokers.indexOf(c) % BROKER_COLORS.length]}
                    strokeWidth={isFullScreen ? 3 : 2}
                    dot={isFullScreen ? { r: 4, strokeWidth: 2, fill: '#0B0F19' } : { r: 3 }}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                    connectNulls
                    animationDuration={1000}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          
          {isFullScreen && (
            <div className="mt-8 flex justify-center gap-6">
              {Array.from(selected).map((c, i) => (
                <div key={c} className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: BROKER_COLORS[topBrokers.indexOf(c) % BROKER_COLORS.length] }} 
                  />
                  <span className="text-lg font-bold text-foreground">{c}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tabel Detail ── */}
      {data.length > 0 && (
        <div className="glass rounded-2xl overflow-hidden border border-border/30">
          <div className="p-4 border-b border-white/[0.05] flex items-center justify-between">
            <h2 className="font-bold text-foreground">
              Detail — <span className="gradient-gold">{code.toUpperCase()}</span>
            </h2>
            <span className="text-xs text-muted-foreground">{data.length} baris</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/[0.02] border-b border-white/[0.05] text-[10px] text-muted-foreground uppercase tracking-wider">
                  <th className="p-3 text-left">Tanggal</th>
                  <th className="p-3 text-left">Broker</th>
                  <th className="p-3 text-right">Buy</th>
                  <th className="p-3 text-right">Sell</th>
                  <th className="p-3 text-right font-bold">Net</th>
                  <th className="p-3 text-right">Net Lot</th>
                </tr>
              </thead>
              <tbody>
                {pageData.map((r, i) => (
                  <tr key={i} className="tr-hover border-b border-white/[0.02]">
                    <td className="p-3 text-muted-foreground text-xs">{r.date}</td>
                    <td className="p-3 font-mono font-bold text-foreground">{r.broker_code}</td>
                    <td className="p-3 text-right text-emerald-400">{fmt(r.buy_value)}</td>
                    <td className="p-3 text-right text-red-400">{fmt(r.sell_value)}</td>
                    <td className={`p-3 text-right font-bold ${r.net_value >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {r.net_value >= 0 ? '+' : ''}{fmt(r.net_value)}
                    </td>
                    <td className={`p-3 text-right text-xs ${r.net_lot >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {r.net_lot.toLocaleString('id-ID')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-white/[0.05] flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Halaman <span className="text-gold-400 font-bold">{page + 1}</span> dari {totalPages} · {data.length} baris
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1.5 text-xs glass border border-border/30 rounded-xl disabled:opacity-40 hover:border-gold-400/30 transition-all"
                >
                  ← Prev
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page === totalPages - 1}
                  className="px-3 py-1.5 text-xs glass border border-border/30 rounded-xl disabled:opacity-40 hover:border-gold-400/30 transition-all"
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          <div className="p-3 border-t border-white/[0.05] text-[10px] text-muted-foreground bg-white/[0.01]">
            💡 Cache TTL: 4 jam per sesi · Data dari Supabase Storage (Parquet) via DuckDB WASM
          </div>
        </div>
      )}
    </div>
  );
}
