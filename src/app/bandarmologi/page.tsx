'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import * as duckdb from '@duckdb/duckdb-wasm';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts';
import { 
  RefreshCw, Database, Zap, TrendingUp, TrendingDown, 
  AlertTriangle, X, Clock, CheckCircle2, Maximize2, Minimize2,
  Search, Filter, ArrowUpDown, Download, Loader2, BarChart3,
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
  accumulation_score: number; // -100 to 100
}

interface CacheEntry {
  rows: BrokerRow[];
  topBrokers: string[];
  fetchedAt: number;
  code: string;
  days: string;
}

interface ScreenerCache {
  results: AccumulationResult[];
  fetchedAt: number;
  period: string;
}

// ── Cache Config ──────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 jam
const CACHE_PREFIX = 'bdmflow_broker_v3_';

// ── Utils ─────────────────────────────────────────────────────────────────────
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
  if (s < 60) return `${s} detik lalu`;
  if (s < 3600) return `${Math.floor(s / 60)} menit lalu`;
  return `${Math.floor(s / 3600)} jam lalu`;
}

// ── DuckDB Singleton ──────────────────────────────────────────────────────────
let _db: duckdb.AsyncDuckDB | null = null;

async function getDB() {
  if (_db) return _db;
  const BUNDLES: duckdb.DuckDBBundles = {
    mvp: {
      mainModule: 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-mvp.wasm',
      mainWorker: 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-browser-mvp.worker.js',
    },
    eh: {
      mainModule: 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-eh.wasm',
      mainWorker: 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-browser-eh.worker.js',
    },
  };
  const bundle = await duckdb.selectBundle(BUNDLES);
  const blob = await fetch(bundle.mainWorker!).then(r => r.blob());
  const worker = new Worker(URL.createObjectURL(blob));
  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
  await db.instantiate(bundle.mainModule!);
  _db = db;
  return db;
}

// ── Validasi ──────────────────────────────────────────────────────────────────
const VALID_CODE = /^[A-Z0-9]{1,6}$/;
const STORAGE_BASE = 'https://ifdbelggvxyimqyowczn.supabase.co/storage/v1/object/public/broker_parquet';

// ── Helper: Dapatkan URL Parquet yang valid ─────────────────────────────────
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
    candidates.map(url => 
      fetch(url, { method: 'HEAD' })
        .then(r => r.ok ? url : null)
        .catch(() => null)
    )
  );
  
  return checks.filter(Boolean) as string[];
}

// ── Query DB untuk satu saham ────────────────────────────────────────────────
async function queryBroker(urls: string[], code: string): Promise<BrokerRow[]> {
  if (!VALID_CODE.test(code)) throw new Error('Kode saham tidak valid');
  
  const db = await getDB();
  const conn = await db.connect();
  const list = urls.map(u => `'${u}'`).join(', ');
  
  // ✅ IMPROVED: Konversi date di level SQL, prepared statement via string literal
  const result = await conn.query(`
    SELECT 
      strftime(date, '%Y-%m-%d') as date,
      broker_code,
      SUM(CASE WHEN side = 'BUY' THEN value ELSE 0 END)::BIGINT AS buy_value,
      SUM(CASE WHEN side = 'SELL' THEN value ELSE 0 END)::BIGINT AS sell_value,
      SUM(value)::BIGINT AS net_value,
      SUM(lot)::BIGINT AS net_lot
    FROM read_parquet([${list}])
    WHERE UPPER(stock_code) = '${code.toUpperCase()}'
    GROUP BY date, broker_code
    ORDER BY date DESC, net_value DESC
  `);
  
  await conn.close();
  
  return result.toArray()
    .map((r: any) => ({
      date: String(r.date),
      broker_code: String(r.broker_code),
      buy_value: Number(r.buy_value),
      sell_value: Number(r.sell_value),
      net_value: Number(r.net_value),
      net_lot: Number(r.net_lot),
    }))
    .filter(r => r.date !== '' && r.date !== 'null' && r.date !== 'undefined');
}

// ── Query Screener: Analisa akumulasi untuk SEMUA saham ─────────────────────
async function queryAccumulationScreener(
  urls: string[], 
  period: string,
  onProgress?: (msg: string) => void
): Promise<AccumulationResult[]> {
  const db = await getDB();
  const conn = await db.connect();
  const list = urls.map(u => `'${u}'`).join(', ');
  
  onProgress?.('Menjalankan analisa akumulasi...');
  
  const result = await conn.query(`
    WITH broker_stats AS (
      SELECT 
        stock_code,
        broker_code,
        SUM(CASE WHEN side = 'BUY' THEN value ELSE 0 END)::BIGINT AS buy_value,
        SUM(CASE WHEN side = 'SELL' THEN value ELSE 0 END)::BIGINT AS sell_value,
        SUM(value)::BIGINT AS net_value,
        SUM(lot)::BIGINT AS net_lot
      FROM read_parquet([${list}])
      GROUP BY stock_code, broker_code
    ),
    stock_analysis AS (
      SELECT 
        stock_code,
        SUM(net_value) AS total_net_value,
        SUM(net_lot) AS total_net_lot,
        SUM(buy_value) AS total_buy_value,
        SUM(sell_value) AS total_sell_value,
        COUNT(DISTINCT broker_code) AS broker_count,
        FIRST(broker_code ORDER BY net_value DESC) AS top_buyer,
        FIRST(broker_code ORDER BY net_value ASC) AS top_seller,
        CASE 
          WHEN SUM(buy_value + ABS(sell_value)) > 0 
          THEN ROUND((SUM(net_value)::FLOAT / SUM(buy_value + ABS(sell_value))) * 100, 2)
          ELSE 0 
        END AS accumulation_score
      FROM broker_stats
      GROUP BY stock_code
    )
    SELECT * FROM stock_analysis
    WHERE ABS(total_net_value) > 0
    ORDER BY accumulation_score DESC, ABS(total_net_value) DESC
  `);
  
  await conn.close();
  
  return result.toArray().map((r: any) => ({
    stock_code: String(r.stock_code),
    total_net_value: Number(r.total_net_value),
    total_net_lot: Number(r.total_net_lot),
    buy_value: Number(r.total_buy_value),
    sell_value: Number(r.total_sell_value),
    broker_count: Number(r.broker_count),
    top_buyer: String(r.top_buyer),
    top_seller: String(r.top_seller),
    accumulation_score: Number(r.accumulation_score),
  }));
}

// ── Formatter ─────────────────────────────────────────────────────────────────
function fmt(v: number): string {
  if (v == null || isNaN(v)) return '0';
  const a = Math.abs(v);
  if (a >= 1e11) return `${(v / 1e12).toFixed(2)}T`; // Triliun
  if (a >= 1e9)  return `${(v / 1e9).toFixed(2)}B`;  // Miliar
  if (a >= 1e6)  return `${(v / 1e6).toFixed(0)}M`;  // Juta
  if (a >= 1e3)  return `${(v / 1e3).toFixed(0)}K`;  // Ribu
  return v.toFixed(0);
}

const BROKER_COLORS = [
  '#e7b733', '#22c55e', '#3b82f6', '#a855f7', '#ef4444',
  '#06b6d4', '#f97316', '#ec4899', '#84cc16', '#64748b',
];

const PAGE_SIZE = 50;

// ── SCREENER PERIODS ──────────────────────────────────────────────────────────
const PERIODS = [
  { label: '7 Hari', value: '7', days: 7, color: 'text-blue-400' },
  { label: '15 Hari', value: '15', days: 15, color: 'text-cyan-400' },
  { label: '1 Bulan', value: '30', days: 30, color: 'text-emerald-400' },
  { label: '3 Bulan', value: '90', days: 90, color: 'text-yellow-400' },
  { label: '6 Bulan', value: '180', days: 180, color: 'text-orange-400' },
  { label: 'Terakhir', value: 'last', days: 7, color: 'text-purple-400' },
];

// ── KOMPONEN UTAMA ────────────────────────────────────────────────────────────
export default function BandarmologiPage() {
  // Tab management
  const [activeTab, setActiveTab] = useState<'tracker' | 'screener'>('tracker');
  
  // Tracker State
  const [code, setCode] = useState('BBCA');
  const [days, setDays] = useState('30');
  const [data, setData] = useState<BrokerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [topBrokers, setTopBrokers] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [fromCache, setFromCache] = useState(false);
  const [cacheAge, setCacheAge] = useState('');
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [chartMode, setChartMode] = useState<'daily' | 'cumulative'>('daily');

  // Screener State
  const [screenerPeriod, setScreenerPeriod] = useState('30');
  const [screenerData, setScreenerData] = useState<AccumulationResult[]>([]);
  const [screenerLoading, setScreenerLoading] = useState(false);
  const [screenerMsg, setScreenerMsg] = useState('');
  const [screenerError, setScreenerError] = useState('');
  const [screenerSort, setScreenerSort] = useState<'score' | 'value'>('score');
  const [screenerFilter, setScreenerFilter] = useState<'all' | 'accumulation' | 'distribution'>('all');
  const [screenerPage, setScreenerPage] = useState(0);

  // ── Load Tracker Data ─────────────────────────────────────────────────────
  const loadData = async (forceRefresh = false) => {
    const codeUpper = code.toUpperCase();
    if (!VALID_CODE.test(codeUpper)) {
      setError('Kode saham tidak valid (maks 6 huruf/angka)');
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
        setFetchedAt(cached.fetchedAt);
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
      setMsg('Mencari file yang tersedia...');
      const urls = await fetchParquetUrls(days);
      if (!urls.length) throw new Error('Tidak ada file parquet tersedia. Coba kurangi rentang hari.');

      setMsg(`Memproses ${urls.length} file dengan DuckDB...`);
      const rows = await queryBroker(urls, codeUpper);
      if (!rows.length) throw new Error(`Tidak ada data untuk ${codeUpper}. Coba kode saham lain.`);

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

  // ── Load Screener Data ────────────────────────────────────────────────────
  const loadScreener = async () => {
    setScreenerLoading(true);
    setScreenerError('');
    setScreenerMsg('Menyiapkan analisa...');

    try {
      const daysToFetch = screenerPeriod === 'last' ? '7' : screenerPeriod;
      const urls = await fetchParquetUrls(daysToFetch);
      
      if (!urls.length) {
        throw new Error('Tidak ada data tersedia untuk periode ini');
      }

      const results = await queryAccumulationScreener(
        urls, 
        screenerPeriod,
        (progress) => setScreenerMsg(progress)
      );

      // Simpan ke cache screener
      try {
        const cache: ScreenerCache = {
          results,
          fetchedAt: Date.now(),
          period: screenerPeriod,
        };
        sessionStorage.setItem(`screener_${screenerPeriod}`, JSON.stringify(cache));
      } catch {}

      setScreenerData(results);
      setScreenerMsg('');
    } catch (e: any) {
      setScreenerError(e.message ?? 'Analisa gagal');
    } finally {
      setScreenerLoading(false);
    }
  };

  // ── Tracker Stats ─────────────────────────────────────────────────────────
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

  // ── Chart Data (Support Cumulative) ───────────────────────────────────────
  const chartData = useMemo(() => {
    const map: Record<string, any> = {};
    const dailyData: any[] = [];
    
    // Build daily pivot
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
      // Hitung running sum
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

  // ── Screener Filtered & Sorted ────────────────────────────────────────────
  const screenerFiltered = useMemo(() => {
    let filtered = [...screenerData];
    
    // Filter
    if (screenerFilter === 'accumulation') {
      filtered = filtered.filter(r => r.accumulation_score > 10);
    } else if (screenerFilter === 'distribution') {
      filtered = filtered.filter(r => r.accumulation_score < -10);
    }
    
    // Sort
    if (screenerSort === 'score') {
      filtered.sort((a, b) => b.accumulation_score - a.accumulation_score);
    } else {
      filtered.sort((a, b) => Math.abs(b.total_net_value) - Math.abs(a.total_net_value));
    }
    
    return filtered;
  }, [screenerData, screenerFilter, screenerSort]);

  const totalPages = Math.ceil(data.length / PAGE_SIZE);
  const pageData = data.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const screenerPages = Math.ceil(screenerFiltered.length / PAGE_SIZE);
  const screenerPageData = screenerFiltered.slice(screenerPage * PAGE_SIZE, (screenerPage + 1) * PAGE_SIZE);

  // ── RENDER ─────────────────────────────────────────────────────────────────
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
            Analisa broker & screener akumulasi · DuckDB WASM + Supabase Storage
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex rounded-xl glass border border-border/30 p-1">
          <button
            onClick={() => setActiveTab('tracker')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'tracker'
                ? 'bg-gold-400/20 text-gold-400 shadow-lg'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Zap className="w-4 h-4 inline mr-2" />
            Individual
          </button>
          <button
            onClick={() => setActiveTab('screener')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'screener'
                ? 'bg-gold-400/20 text-gold-400 shadow-lg'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Search className="w-4 h-4 inline mr-2" />
            Screener Akumulasi
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: TRACKER INDIVIDUAL */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'tracker' && (
        <>
          {/* Controls */}
          <div className="glass rounded-2xl p-5 border border-border/30 space-y-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  Kode Saham
                </label>
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
                <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  Lookback
                </label>
                <select
                  value={days}
                  onChange={e => setDays(e.target.value)}
                  className="bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gold-400/40 text-foreground"
                >
                  <option value="7">7 Hari</option>
                  <option value="15">15 Hari</option>
                  <option value="30">30 Hari</option>
                  <option value="60">60 Hari</option>
                  <option value="90">90 Hari</option>
                  <option value="180">180 Hari</option>
                  <option value="360">360 Hari</option>
                </select>
              </div>

              <div className="flex gap-2 pb-0.5">
                <button
                  onClick={() => loadData(false)}
                  disabled={loading}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gold-400/10 border border-gold-400/30 text-gold-400 text-sm font-bold hover:bg-gold-400/20 disabled:opacity-50 transition-all"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4" />
                  )}
                  {loading ? msg || 'Loading...' : 'Lacak'}
                </button>

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

            {/* Toggle Chart Mode */}
            {chartData.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={() => setChartMode('daily')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    chartMode === 'daily' ? 'bg-gold-400/20 text-gold-400' : 'text-muted-foreground'
                  }`}
                >
                  Harian
                </button>
                <button
                  onClick={() => setChartMode('cumulative')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    chartMode === 'cumulative' ? 'bg-gold-400/20 text-gold-400' : 'text-muted-foreground'
                  }`}
                >
                  Kumulatif
                </button>
              </div>
            )}

            {/* Loading progress */}
            {loading && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin text-gold-400" />
                  {msg}
                </p>
                <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-gold-400 to-yellow-500 rounded-full animate-pulse w-3/4" />
                </div>
              </div>
            )}

            {/* Cache status */}
            {data.length > 0 && (
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                fromCache
                  ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              }`}>
                {fromCache ? (
                  <><Clock className="w-3 h-3" /> Cache · {cacheAge}</>
                ) : (
                  <><CheckCircle2 className="w-3 h-3" /> Fresh data</>
                )}
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
            </div>
          )}

          {/* Stats Cards */}
          {stats && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                {
                  label: 'Top Akumulator',
                  value: stats.topBuy[0],
                  sub: `+${fmt(stats.topBuy[1])}`,
                  color: 'text-emerald-400',
                  icon: TrendingUp,
                },
                {
                  label: 'Top Distributor',
                  value: stats.topSell[0],
                  sub: `${fmt(stats.topSell[1])}`,
                  color: 'text-red-400',
                  icon: TrendingDown,
                },
                {
                  label: 'Net Flow Semua Broker',
                  value: fmt(stats.totalNet),
                  sub: stats.totalNet >= 0 ? 'Net Buy' : 'Net Sell',
                  color: stats.totalNet >= 0 ? 'text-emerald-400' : 'text-red-400',
                  icon: Database,
                },
              ].map((m, i) => {
                const Icon = m.icon;
                return (
                  <div key={i} className="glass rounded-xl p-4 border border-border/30 hover:border-gold-400/30 transition-all group">
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

          {/* Broker Pills */}
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
                      color: selected.has(c) ? '#0B0F19' : BROKER_COLORS[i % BROKER_COLORS.length],
                      borderColor: BROKER_COLORS[i % BROKER_COLORS.length],
                      opacity: selected.has(c) ? 1 : 0.7,
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chart */}
          {chartData.length > 0 && (
            <div className={`glass rounded-2xl border border-border/30 p-5 transition-all duration-300 ${
              isFullScreen ? 'fixed inset-0 z-[100] bg-background/95 backdrop-blur-xl flex flex-col p-8' : 'relative'
            }`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-bold text-foreground text-lg">
                    {chartMode === 'cumulative' ? 'Akumulasi Kumulatif' : 'Net Value Harian'} —{' '}
                    <span className="gradient-gold">{code.toUpperCase()}</span>
                    <span className="text-muted-foreground font-normal text-sm ml-2">({days} hari)</span>
                  </h2>
                </div>
                <button
                  onClick={() => setIsFullScreen(!isFullScreen)}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                >
                  {isFullScreen ? <Minimize2 className="w-5 h-5 text-gold-400" /> : <Maximize2 className="w-4 h-4 text-muted-foreground" />}
                </button>
              </div>

              <div className={isFullScreen ? 'flex-1' : ''}>
                <ResponsiveContainer width="100%" height={isFullScreen ? '100%' : 380}>
                  <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      tickFormatter={v => v.slice(5)}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      tickFormatter={fmt}
                      width={55}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'rgba(11,15,25,0.95)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '16px',
                        fontSize: '12px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
                      }}
                      labelStyle={{ marginBottom: '8px', color: '#94a3b8', fontWeight: 'bold' }}
                      formatter={(v: any, n: any) => {
                        const val = Number(v);
                        const formatted = `Rp ${val.toLocaleString('id-ID')}`;
                        const sign = val > 0 ? '▲ +' : val < 0 ? '▼ ' : '';
                        const color = val > 0 ? '#10b981' : val < 0 ? '#ef4444' : '#94a3b8';
                        return [<span style={{ color }}>{sign}{formatted}</span>, n];
                      }}
                    />
                    <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
                    
                    {Array.from(selected).map(c => (
                      <Line
                        key={c}
                        type="monotone"
                        dataKey={c}
                        stroke={BROKER_COLORS[topBrokers.indexOf(c) % BROKER_COLORS.length]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 6, strokeWidth: 0 }}
                        connectNulls
                        animationDuration={1000}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Tabel Detail */}
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

              {totalPages > 1 && (
                <div className="p-4 border-t border-white/[0.05] flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Halaman <span className="text-gold-400 font-bold">{page + 1}</span> dari {totalPages}
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
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: SCREENER AKUMULASI */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'screener' && (
        <>
          {/* Screener Controls */}
          <div className="glass rounded-2xl p-5 border border-border/30 space-y-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  Periode Analisa
                </label>
                <select
                  value={screenerPeriod}
                  onChange={e => setScreenerPeriod(e.target.value)}
                  className="bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gold-400/40 text-foreground"
                >
                  {PERIODS.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  Filter
                </label>
                <select
                  value={screenerFilter}
                  onChange={e => setScreenerFilter(e.target.value as any)}
                  className="bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gold-400/40 text-foreground"
                >
                  <option value="all">Semua</option>
                  <option value="accumulation">Akumulasi (Score &gt; 10)</option>
                  <option value="distribution">Distribusi (Score &lt; -10)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  Urutkan
                </label>
                <select
                  value={screenerSort}
                  onChange={e => setScreenerSort(e.target.value as any)}
                  className="bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gold-400/40 text-foreground"
                >
                  <option value="score">Berdasarkan Score</option>
                  <option value="value">Berdasarkan Net Value</option>
                </select>
              </div>

              <button
                onClick={loadScreener}
                disabled={screenerLoading}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-400/30 text-purple-400 text-sm font-bold hover:from-purple-500/30 hover:to-pink-500/30 disabled:opacity-50 transition-all"
              >
                {screenerLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <BarChart3 className="w-4 h-4" />
                )}
                {screenerLoading ? screenerMsg || 'Analyzing...' : 'Analisa Akumulasi'}
              </button>
            </div>

            {screenerLoading && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin text-purple-400" />
                  {screenerMsg}
                </p>
                <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-purple-400 to-pink-500 rounded-full animate-pulse w-3/4" />
                </div>
              </div>
            )}

            {screenerError && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm">
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                <span className="flex-1">{screenerError}</span>
                <button onClick={() => setScreenerError('')}><X className="w-4 h-4" /></button>
              </div>
            )}
          </div>

          {/* Screener Results */}
          {screenerData.length > 0 && (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="glass rounded-xl p-4 border border-emerald-400/20">
                  <p className="text-[10px] text-muted-foreground uppercase mb-1">Total Saham</p>
                  <p className="text-2xl font-black text-foreground">{screenerData.length}</p>
                </div>
                <div className="glass rounded-xl p-4 border border-emerald-400/20">
                  <p className="text-[10px] text-muted-foreground uppercase mb-1">Akumulasi</p>
                  <p className="text-2xl font-black text-emerald-400">
                    {screenerData.filter(r => r.accumulation_score > 10).length}
                  </p>
                </div>
                <div className="glass rounded-xl p-4 border border-red-400/20">
                  <p className="text-[10px] text-muted-foreground uppercase mb-1">Distribusi</p>
                  <p className="text-2xl font-black text-red-400">
                    {screenerData.filter(r => r.accumulation_score < -10).length}
                  </p>
                </div>
                <div className="glass rounded-xl p-4 border border-yellow-400/20">
                  <p className="text-[10px] text-muted-foreground uppercase mb-1">Rata2 Score</p>
                  <p className="text-2xl font-black text-yellow-400">
                    {(screenerData.reduce((s, r) => s + r.accumulation_score, 0) / screenerData.length).toFixed(1)}%
                  </p>
                </div>
              </div>

              {/* Screener Table with SORTABLE HEADERS */}
              <div className="glass rounded-2xl overflow-hidden border border-border/30">
                <div className="p-4 border-b border-white/[0.05]">
                  <h2 className="font-bold text-foreground text-lg">
                    <BarChart3 className="w-5 h-5 text-purple-400 inline mr-2" />
                    Hasil Screener —{' '}
                    <span className="text-purple-400">
                      {PERIODS.find(p => p.value === screenerPeriod)?.label || screenerPeriod}
                    </span>
                  </h2>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-white/[0.02] border-b border-white/[0.05] text-[10px] text-muted-foreground uppercase tracking-wider">
                        {/* Kode */}
                        <th 
                          className="p-3 text-left cursor-pointer hover:text-foreground transition-colors"
                          onClick={() => {
                            if (screenerSort === 'code_asc') setScreenerSort('code_desc' as any);
                            else setScreenerSort('code_asc' as any);
                          }}
                        >
                          Kode {screenerSort === 'code_asc' ? '↑' : screenerSort === 'code_desc' ? '↓' : ''}
                        </th>
                        {/* Net Value */}
                        <th 
                          className="p-3 text-right cursor-pointer hover:text-foreground transition-colors"
                          onClick={() => {
                            if (screenerSort === 'value') setScreenerSort('value_desc' as any);
                            else setScreenerSort('value' as any);
                          }}
                        >
                          Net Value {screenerSort === 'value' ? '↑' : screenerSort === 'value_desc' ? '↓' : ''}
                        </th>
                        {/* Net Lot */}
                        <th className="p-3 text-right">Net Lot</th>
                        {/* Buy Value */}
                        <th className="p-3 text-right">Buy Value</th>
                        {/* Sell Value */}
                        <th className="p-3 text-right">Sell Value</th>
                        {/* Score */}
                        <th 
                          className="p-3 text-center cursor-pointer hover:text-foreground transition-colors"
                          onClick={() => {
                            if (screenerSort === 'score') setScreenerSort('score_desc' as any);
                            else setScreenerSort('score' as any);
                          }}
                        >
                          Score {screenerSort === 'score' ? '↑' : screenerSort === 'score_desc' ? '↓' : ''}
                        </th>
                        <th className="p-3 text-left">Top Buyer</th>
                        <th className="p-3 text-left">Top Seller</th>
                        <th className="p-3 text-center">#Broker</th>
                      </tr>
                    </thead>
                    <tbody>
                      {screenerPageData.map((r, i) => (
                        <tr key={i} className="tr-hover border-b border-white/[0.02] cursor-pointer hover:bg-white/[0.02]"
                          onClick={() => {
                            setCode(r.stock_code);
                            const daysMap: Record<string, string> = {
                              '7': '7', '15': '15', '30': '30', '90': '90', '180': '180', 'last': '7'
                            };
                            setDays(daysMap[screenerPeriod] || '30');
                            setActiveTab('tracker');
                            setTimeout(() => loadData(), 100);
                          }}
                        >
                          <td className="p-3 font-mono font-bold text-foreground">
                            {r.stock_code}
                          </td>
                          <td className={`p-3 text-right font-bold font-mono ${r.total_net_value >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {r.total_net_value >= 0 ? '+' : ''}{fmt(r.total_net_value)}
                          </td>
                          <td className={`p-3 text-right font-mono text-xs ${r.total_net_lot >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {r.total_net_lot >= 0 ? '+' : ''}{r.total_net_lot.toLocaleString('id-ID')}
                          </td>
                          <td className="p-3 text-right text-emerald-400/80 font-mono text-xs">{fmt(r.buy_value)}</td>
                          <td className="p-3 text-right text-red-400/80 font-mono text-xs">{fmt(r.sell_value)}</td>
                          <td className="p-3 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${
                              r.accumulation_score > 20
                                ? 'bg-emerald-400/20 text-emerald-400'
                                : r.accumulation_score < -20
                                ? 'bg-red-400/20 text-red-400'
                                : 'bg-gray-400/20 text-gray-400'
                            }`}>
                              {r.accumulation_score > 0 ? '+' : ''}{r.accumulation_score.toFixed(1)}%
                            </span>
                          </td>
                          <td className="p-3 text-xs text-muted-foreground">{r.top_buyer}</td>
                          <td className="p-3 text-xs text-muted-foreground">{r.top_seller}</td>
                          <td className="p-3 text-center text-xs text-muted-foreground">{r.broker_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {screenerPages > 1 && (
                  <div className="p-4 border-t border-white/[0.05] flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Halaman <span className="text-purple-400 font-bold">{screenerPage + 1}</span> dari {screenerPages} · {screenerFiltered.length} saham
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setScreenerPage(p => Math.max(0, p - 1))}
                        disabled={screenerPage === 0}
                        className="px-3 py-1.5 text-xs glass border border-border/30 rounded-xl disabled:opacity-40 transition-all"
                      >
                        ← Prev
                      </button>
                      <button
                        onClick={() => setScreenerPage(p => Math.min(screenerPages - 1, p + 1))}
                        disabled={screenerPage === screenerPages - 1}
                        className="px-3 py-1.5 text-xs glass border border-border/30 rounded-xl disabled:opacity-40 transition-all"
                      >
                        Next →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

      {/* Footer info */}
      <div className="text-center text-[10px] text-muted-foreground pt-4">
        💡 Klik hasil screener untuk langsung analisa detail · Data dari Supabase Storage (Parquet) via DuckDB WASM
      </div>
    </div>
  );
}
