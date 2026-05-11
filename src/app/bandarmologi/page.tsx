'use client';

import { useState, useMemo } from 'react';
import * as duckdb from '@duckdb/duckdb-wasm';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// ── DuckDB singleton ─────────────────────────────────────
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
  // Blob URL workaround untuk cross-origin worker
  const blob   = await fetch(bundle.mainWorker!).then(r => r.blob());
  const worker = new Worker(URL.createObjectURL(blob));
  const db     = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
  await db.instantiate(bundle.mainModule!);
  _db = db;
  return db;
}

// ── Validasi & query ─────────────────────────────────────
const VALID_CODE = /^[A-Z0-9]{1,6}$/;
const STORAGE_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL
  + '/storage/v1/object/public/broker_parquet';

async function queryBroker(urls: string[], code: string) {
  if (!VALID_CODE.test(code)) throw new Error('Kode saham tidak valid');
  const db   = await getDB();
  const conn = await db.connect();
  const list = urls.map(u => `'${u}'`).join(', ');
  const result = await conn.query(`
    SELECT date, broker_code,
      SUM(CASE WHEN side='BUY'  THEN value ELSE 0      END)::BIGINT AS buy_value,
      SUM(CASE WHEN side='SELL' THEN value ELSE 0      END)::BIGINT AS sell_value,
      SUM(CASE WHEN side='BUY'  THEN value ELSE -value END)::BIGINT AS net_value,
      SUM(CASE WHEN side='BUY'  THEN lot   ELSE -lot   END)::BIGINT AS net_lot
    FROM read_parquet([${list}])
    WHERE stock_code = '${code}'
    GROUP BY date, broker_code
    ORDER BY date DESC, net_value DESC
  `);
  await conn.close();
  return result.toArray().map((r: any) => ({
    date:        r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date),
    broker_code: r.broker_code,
    buy_value:   Number(r.buy_value),
    sell_value:  Number(r.sell_value),
    net_value:   Number(r.net_value),
    net_lot:     Number(r.net_lot),
  }));
}

function fmt(v: number) {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v/1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(v/1e6).toFixed(0)}M`;
  return v.toLocaleString('id-ID');
}

const COLORS = ['#2563eb','#dc2626','#16a34a','#ca8a04','#9333ea',
                '#0891b2','#be123c','#4f46e5','#ea580c','#15803d'];

// ── Component ─────────────────────────────────────────────
export default function BandarmologiPage() {
  const [code,       setCode]       = useState('BBCA');
  const [days,       setDays]       = useState('30');
  const [data,       setData]       = useState<any[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [msg,        setMsg]        = useState('');
  const [error,      setError]      = useState('');
  const [topBrokers, setTopBrokers] = useState<string[]>([]);
  const [selected,   setSelected]   = useState<Set<string>>(new Set());
  const [page,       setPage]       = useState(0);
  const PAGE_SIZE = 50;

  const fetchData = async () => {
    setLoading(true); setError(''); setData([]);
    try {
      setMsg('Menyiapkan file list...');
      const urls: string[] = [];
      const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
      for (let i = 0, added = 0; added < parseInt(days) && i < parseInt(days) + 14; i++) {
        const d = new Date(today); d.setDate(d.getDate() - i);
        if (d.getDay() === 0 || d.getDay() === 6) continue;
        const ds = d.toISOString().split('T')[0].replace(/-/g, '');
        urls.push(`${STORAGE_BASE}/${ds}/broker_activity_${ds}.parquet`);
        added++;
      }
      setMsg('Mengecek file tersedia...');
      const valid = (await Promise.all(
        urls.map(url => fetch(url, { method: 'HEAD' }).then(r => r.ok ? url : null).catch(() => null))
      )).filter(Boolean) as string[];
      if (!valid.length) throw new Error('Tidak ada file tersedia untuk rentang ini.');

      setMsg(`Query DuckDB — ${valid.length} file...`);
      const rows = await queryBroker(valid, code.toUpperCase());
      if (!rows.length) throw new Error(`Tidak ada data untuk ${code.toUpperCase()}.`);
      setData(rows);

      const map = new Map<string, number>();
      rows.forEach(r => map.set(r.broker_code, (map.get(r.broker_code) || 0) + Math.abs(r.net_value)));
      const top10 = [...map.entries()].sort((a,b) => b[1]-a[1]).slice(0,10).map(([c]) => c);
      setTopBrokers(top10);
      setSelected(new Set(top10.slice(0, 5)));
      setPage(0);
    } catch(e: any) {
      setError(e.message);
    } finally { setLoading(false); setMsg(''); }
  };

  const toggle = (c: string) => {
    const s = new Set(selected);
    s.has(c) ? s.delete(c) : s.add(c);
    setSelected(s);
  };

  // Memoized pivot untuk chart
  const chartData = useMemo(() => {
    const map: Record<string, any> = {};
    data.forEach(r => {
      if (!map[r.date]) { map[r.date] = { date: r.date }; topBrokers.forEach(b => { map[r.date][b] = 0; }); }
      if (selected.has(r.broker_code)) map[r.date][r.broker_code] = (map[r.date][r.broker_code] || 0) + r.net_value;
    });
    return Object.values(map).sort((a: any, b: any) => a.date.localeCompare(b.date));
  }, [data, selected, topBrokers]);

  const totalPages = Math.ceil(data.length / PAGE_SIZE);
  const pageData   = data.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Broker Tracker</h1>
        <p className="text-sm text-gray-500 mt-1">Net value broker per saham — DuckDB WASM + Supabase Storage</p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text" value={code} maxLength={6} placeholder="Kode saham"
          onChange={e => setCode(e.target.value.toUpperCase())}
          className="border dark:border-gray-700 rounded-lg px-4 py-2 w-32 uppercase font-mono text-sm bg-white dark:bg-gray-800 dark:text-white"
        />
        <select value={days} onChange={e => setDays(e.target.value)}
          className="border dark:border-gray-700 rounded-lg px-4 py-2 text-sm bg-white dark:bg-gray-800 dark:text-white">
          <option value="7">7 hari</option>
          <option value="14">14 hari</option>
          <option value="30">30 hari</option>
          <option value="60">60 hari</option>
        </select>
        <button onClick={fetchData} disabled={loading}
          className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">
          {loading ? `⏳ ${msg}` : 'Lacak'}
        </button>
      </div>

      {error && <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">{error}</div>}

      {/* Broker pills */}
      {topBrokers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {topBrokers.map((c, i) => (
            <button key={c} onClick={() => toggle(c)}
              className="px-3 py-1 rounded-full text-xs font-semibold border transition-all"
              style={{ backgroundColor: selected.has(c) ? COLORS[i] : 'transparent', color: selected.has(c) ? '#fff' : undefined, borderColor: COLORS[i] }}>
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-4">
          <h2 className="font-medium mb-4 text-gray-900 dark:text-white">Net Value — {code}</h2>
          <ResponsiveContainer width="100%" height={380}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={v => v.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={fmt} />
              <Tooltip formatter={(v: any, n: any) => [`Rp ${Number(v).toLocaleString('id-ID')}`, n]} />
              <Legend />
              {[...selected].map((c, i) => (
                <Line key={c} type="monotone" dataKey={c}
                  stroke={COLORS[topBrokers.indexOf(c) % COLORS.length]}
                  strokeWidth={2} dot={{ r: 3 }} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table dengan paginasi */}
      {data.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-4">
          <h2 className="font-medium mb-3 text-gray-900 dark:text-white">Detail — {code}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b dark:border-gray-700 text-gray-500 text-left">
                  <th className="py-2 px-3">Tanggal</th><th className="py-2 px-3">Broker</th>
                  <th className="py-2 px-3 text-right">Buy</th><th className="py-2 px-3 text-right">Sell</th>
                  <th className="py-2 px-3 text-right font-bold">Net</th><th className="py-2 px-3 text-right">Net Lot</th>
                </tr>
              </thead>
              <tbody>
                {pageData.map((r, i) => (
                  <tr key={i} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{r.date}</td>
                    <td className="py-2 px-3 font-medium dark:text-white">{r.broker_code}</td>
                    <td className="py-2 px-3 text-right text-green-600">{fmt(r.buy_value)}</td>
                    <td className="py-2 px-3 text-right text-red-600">{fmt(r.sell_value)}</td>
                    <td className={`py-2 px-3 text-right font-bold ${r.net_value > 0 ? 'text-green-700' : 'text-red-600'}`}>{fmt(r.net_value)}</td>
                    <td className={`py-2 px-3 text-right ${r.net_lot > 0 ? 'text-green-700' : 'text-red-600'}`}>{r.net_lot.toLocaleString('id-ID')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3 px-1">
              <span className="text-xs text-gray-400">Halaman {page+1} dari {totalPages} ({data.length} baris)</span>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0}
                  className="px-3 py-1 text-xs border rounded disabled:opacity-40 dark:border-gray-600 dark:text-gray-300">← Sebelumnya</button>
                <button onClick={() => setPage(p => Math.min(totalPages-1, p+1))} disabled={page === totalPages-1}
                  className="px-3 py-1 text-xs border rounded disabled:opacity-40 dark:border-gray-600 dark:text-gray-300">Berikutnya →</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
