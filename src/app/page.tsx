import React from 'react'
import { ArrowRightLeft, ShieldCheck, Zap, Globe, Target } from 'lucide-react'
import Link from 'next/link'
import { formatRupiah, formatNumber } from '@/lib/utils'
import SectorRotationWidget from './_components/SectorRotationWidget'
import { run } from '@/lib/db'

export const revalidate = 60


// ── Data Fetching ──────────────────────────────────────────────────────────
async function getMarketBreadth() {
  const rows = await run(`
    SELECT 
      MAX(trading_date)::VARCHAR AS date,
      SUM(total_value)::BIGINT AS total_value,
      SUM(total_volume)::BIGINT AS total_volume,
      SUM(total_foreign_flow)::BIGINT AS total_foreign,
      SUM(gainers)::BIGINT AS gainers,
      SUM(losers)::BIGINT AS losers,
      SUM(stock_count - gainers - losers)::BIGINT AS unchanged,
      SUM(whale_count)::BIGINT AS whale_count,
      SUM(stock_count)::BIGINT AS total
    FROM market.vw_market_summary
    WHERE trading_date = (SELECT MAX(trading_date) FROM market.vw_market_summary)
  `)
  
  if (!rows || rows.length === 0) return null
  const r = rows[0]
  return {
    date: r.date,
    totalForeign: Number(r.total_foreign),
    totalValue: Number(r.total_value),
    totalVolume: Number(r.total_volume),
    up: Number(r.gainers),
    down: Number(r.losers),
    unchanged: Number(r.unchanged),
    whaleCount: Number(r.whale_count),
    total: Number(r.total),
  }
}

async function getHighConviction() {
  return run(`
    SELECT 
      stock_code,
      sector,
      close AS price,
      change_percent AS price_chg_pct,
      smart_money_score AS conviction_score,
      foreign_30d + COALESCE(broker_net, 0) AS institutional_flow,
      false AS is_stealth
    FROM market.vw_smart_money_score
    WHERE signal = '🚀 STRONG BUY'
    ORDER BY smart_money_score DESC
    LIMIT 10
  `)
}

async function getBigPlayerActivity() {
  const [brokers, insiders, kseiMovers] = await Promise.all([
    run(`
      SELECT 
        broker_name AS nama_broker,
        total_stocks AS saham_count,
        total_buy_value,
        total_sell_value,
        net_value AS total_net_value
      FROM main.vw_broker_summary
      ORDER BY ABS(net_value) DESC
      LIMIT 5
    `),
    run(`
      SELECT * FROM ksei.vw_insider_alerts
      WHERE alert_level = 'HIGH'
      ORDER BY ABS(pct_point_change) DESC
      LIMIT 5
    `),
    run(`
      SELECT 
        Code AS share_code,
        Top_Buyer AS investor_name,
        Top_Buyer_Val AS scripless_diff
      FROM ksei.monthly_snapshot
      WHERE Date = (SELECT MAX(Date) FROM ksei.monthly_snapshot)
        AND Top_Buyer_Val > 0
      ORDER BY Top_Buyer_Val DESC
      LIMIT 5
    `),
  ])

  return { brokers, insiders, kseiAlerts: kseiMovers }
}

// ── Sub-components ─────────────────────────────────────────────────────────
function ScoreRing({ score, size = 48 }: { score: number; size?: number }) {
  const clamped = Math.min(Math.max(score, 0), 100)
  const strokeWidth = 3
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (clamped / 100) * circumference
  const color = clamped >= 80 ? '#22c55e' : clamped >= 60 ? '#eab308' : '#ef4444'

  return (
    <svg width={size} height={size} className="shrink-0" style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={radius} fill="transparent" stroke="currentColor" strokeWidth={strokeWidth} className="text-white/5" />
      <circle cx={size/2} cy={size/2} r={radius} fill="transparent" stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
        className="transition-all duration-1000" />
    </svg>
  )
}

// ── Page Component ─────────────────────────────────────────────────────────
export default async function MarketOverview() {
  const [breadth, highConviction, bigPlayers] = await Promise.all([
    getMarketBreadth(),
    getHighConviction(),
    getBigPlayerActivity(),
  ])

  if (!breadth) {
    return <div className="p-10 text-center text-muted-foreground">Failed to load market data.</div>
  }

  const { date, totalForeign, totalValue, up, down, unchanged, whaleCount, total } = breadth
  const foreignSentiment = totalForeign > 5e9 ? 'ACCUMULATION' : totalForeign < -5e9 ? 'DISTRIBUTION' : 'NEUTRAL'

  return (
    <div className="space-y-4 pb-8 animate-fade-in">

      {/* ════════════════════════════════════════════════════════════
          BLOK 1: COMMAND STRIP — Market Breadth & Flow
          ════════════════════════════════════════════════════════════ */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-r from-[#0d1117] via-[#0f172a] to-[#0d1117] shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-r from-gold-500/5 via-transparent to-emerald-500/5 pointer-events-none" />
        <div className="relative z-10 flex flex-wrap items-stretch divide-x divide-white/[0.05]">
          <div className="flex items-center gap-3 px-5 py-4 shrink-0">
            <div className="relative">
              <svg className="w-16 h-16 -rotate-90">
                <circle cx="32" cy="32" r="26" fill="transparent" stroke="currentColor" strokeWidth="4" className="text-white/[0.04]" />
                <circle cx="32" cy="32" r="26" fill="transparent" stroke={foreignSentiment === 'ACCUMULATION' ? '#22c55e' : foreignSentiment === 'DISTRIBUTION' ? '#ef4444' : '#eab308'}
                  strokeWidth="4" strokeDasharray={163} strokeDashoffset={163 - (163 * (foreignSentiment === 'ACCUMULATION' ? 78 : foreignSentiment === 'DISTRIBUTION' ? 35 : 55)) / 100}
                  strokeLinecap="round" className="transition-all duration-1000" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[10px] font-black text-white tracking-tighter">
                  {foreignSentiment === 'ACCUMULATION' ? 'BULL' : foreignSentiment === 'DISTRIBUTION' ? 'BEAR' : 'NEUT'}
                </span>
              </div>
            </div>
            <div>
              <p className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-widest">Market Sentiment</p>
              <p className={`text-xs font-black ${foreignSentiment === 'ACCUMULATION' ? 'text-emerald-400' : foreignSentiment === 'DISTRIBUTION' ? 'text-red-400' : 'text-amber-400'}`}>
                {foreignSentiment === 'ACCUMULATION' ? '▲ Institutional Buying' : foreignSentiment === 'DISTRIBUTION' ? '▼ Institutional Selling' : '⏸ Wait & See'}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[9px] text-muted-foreground/40 uppercase tracking-widest">Live · {date}</span>
              </div>
            </div>
          </div>

          {[
            { label: 'Turnover', value: formatRupiah(Number(totalValue)), sub: 'Total Value', color: 'text-gold-400' },
            { label: 'Foreign Net', value: formatRupiah(totalForeign), sub: foreignSentiment === 'ACCUMULATION' ? '▲ inflow' : foreignSentiment === 'DISTRIBUTION' ? '▼ outflow' : '⏸ flat', color: foreignSentiment === 'ACCUMULATION' ? 'text-emerald-400' : foreignSentiment === 'DISTRIBUTION' ? 'text-red-400' : 'text-amber-400' },
            { label: 'Breadth', value: `${up}↑ ${down}↓`, sub: `${unchanged} unch · ${((up/total)*100).toFixed(0)}% up`, color: up > down ? 'text-emerald-400' : 'text-red-400' },
            { label: 'Whale Signals', value: String(whaleCount), sub: 'AOV anomalies', color: 'text-purple-400' },
          ].map((s, i) => (
            <div key={i} className="flex flex-col justify-center px-5 py-4 min-w-[120px]">
              <p className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest">{s.label}</p>
              <p className={`text-lg font-black ${s.color} leading-none mt-0.5 whitespace-nowrap`}>{s.value}</p>
              <p className="text-[9px] text-muted-foreground/30 mt-0.5 uppercase tracking-widest">{s.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          BLOK 2: SECTOR ROTATION
          ════════════════════════════════════════════════════════════ */}
      <SectorRotationWidget />

      {/* ════════════════════════════════════════════════════════════
          BLOK 3: SMART MONEY RADAR
          ════════════════════════════════════════════════════════════ */}
      <div className="glass rounded-2xl p-5 border border-white/[0.06]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-black text-white uppercase tracking-widest">Smart Money Radar</h2>
            <span className="text-[9px] text-muted-foreground/40 hidden sm:inline">· High conviction</span>
          </div>
          <Link href="/screener" className="text-[9px] font-black text-gold-400 hover:text-white transition-colors uppercase tracking-widest">
            Screener Pro →
          </Link>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-2 -mx-2 px-2">
          {highConviction.map((s: any, i: number) => (
            <Link key={i} href={`/stock/${s.stock_code}`}
              className="flex-shrink-0 w-52 glass rounded-xl p-4 border border-white/[0.06] hover:border-gold-400/30 hover:shadow-lg transition-all group">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-mono font-black text-sm text-foreground group-hover:text-gold-400 transition-colors">{s.stock_code}</p>
                  <p className="text-[9px] text-muted-foreground/50 uppercase truncate max-w-[100px]">{s.sector}</p>
                </div>
              </div>
              <div className="flex items-end justify-between mb-3">
                <div className="relative flex items-center gap-2">
                  <ScoreRing score={Number(s.conviction_score)} size={36} />
                  <span className="absolute top-1/2 left-[18px] -translate-y-1/2 -translate-x-1/2 text-[9px] font-black text-white">
                    {Math.round(Number(s.conviction_score))}
                  </span>
                  <div>
                    <p className="font-black text-lg text-foreground">{formatRupiah(Number(s.price))}</p>
                    <p className={`text-[10px] font-bold ${Number(s.price_chg_pct) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {Number(s.price_chg_pct) > 0 ? '+' : ''}{Number(s.price_chg_pct).toFixed(2)}%
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-white/[0.04]">
                <span className="text-[9px] text-muted-foreground/60">Inst. Flow</span>
                <span className="text-[10px] font-bold text-foreground">{Number(s.institutional_flow).toFixed(1)}</span>
              </div>
            </Link>
          ))}
          {highConviction.length === 0 && (
            <div className="w-full text-center py-8 text-muted-foreground text-sm">
              No high conviction signals at the moment.
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          BLOK 4: BIG PLAYER ACTIVITY
          ════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Broker Top Movers */}
        <div className="glass rounded-xl p-4 border border-white/[0.06]">
          <div className="flex items-center gap-1.5 mb-3">
            <ArrowRightLeft className="w-3.5 h-3.5 text-blue-400" />
            <h3 className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Broker Movers</h3>
          </div>
          <div className="space-y-2">
            {bigPlayers.brokers.map((b: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-1 border-b border-white/[0.03] last:border-0">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-foreground truncate">{b.nama_broker?.slice(0, 20)}</p>
                  <p className="text-[8px] text-muted-foreground/50">{b.saham_count} saham</p>
                </div>
                <span className={`text-[10px] font-black shrink-0 ml-2 ${Number(b.total_net_value) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatRupiah(Number(b.total_net_value))}
                </span>
              </div>
            ))}
            {bigPlayers.brokers.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No data</p>}
          </div>
        </div>

        {/* Insider Alerts */}
        <div className="glass rounded-xl p-4 border border-white/[0.06]">
          <div className="flex items-center gap-1.5 mb-3">
            <ShieldCheck className="w-3.5 h-3.5 text-red-400" />
            <h3 className="text-[10px] font-black text-red-400 uppercase tracking-widest">Insider Alerts</h3>
          </div>
          <div className="space-y-2">
            {bigPlayers.insiders.map((ins: any, i: number) => (
              <Link key={i} href={`/stock/${ins.share_code}`}
                className="flex items-center justify-between py-1 border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02] -mx-2 px-2 rounded transition-colors group">
                <div className="min-w-0">
                  <p className="text-[10px] font-mono font-black text-foreground group-hover:text-gold-400">{ins.share_code}</p>
                  <p className="text-[8px] text-muted-foreground/50 truncate max-w-[130px]">{ins.investor_name?.slice(0, 18)}</p>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className={`text-[9px] font-black ${ins.action === 'BUYING' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {ins.action === 'BUYING' ? '▲' : '▼'} {Number(ins.pct_point_change).toFixed(2)}%
                  </p>
                  <p className="text-[7px] text-muted-foreground">{ins.alert_level}</p>
                </div>
              </Link>
            ))}
            {bigPlayers.insiders.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No alerts</p>}
          </div>
        </div>

        {/* KSEI Movers */}
        <div className="glass rounded-xl p-4 border border-white/[0.06]">
          <div className="flex items-center gap-1.5 mb-3">
            <Globe className="w-3.5 h-3.5 text-purple-400" />
            <h3 className="text-[10px] font-black text-purple-400 uppercase tracking-widest">KSEI Top Buyers</h3>
          </div>
          <div className="space-y-2">
            {bigPlayers.kseiAlerts.map((k: any, i: number) => {
              const isAccum = Number(k.scripless_diff) > 0
              return (
                <Link key={i} href={`/stock/${k.share_code}`}
                  className="flex items-center justify-between py-1 border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02] -mx-2 px-2 rounded transition-colors group">
                  <div className="min-w-0">
                    <p className="text-[10px] font-mono font-black text-foreground group-hover:text-gold-400">{k.share_code}</p>
                    <p className="text-[8px] text-muted-foreground/50 truncate max-w-[130px]">{k.investor_name?.slice(0, 18)}</p>
                  </div>
                  <span className={`text-[9px] font-black shrink-0 ml-2 ${isAccum ? 'text-emerald-400' : 'text-red-400'}`}>
                    {isAccum ? '▲' : '▼'} {formatRupiah(Math.abs(Number(k.scripless_diff)))}
                  </span>
                </Link>
              )
            })}
            {bigPlayers.kseiAlerts.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No data</p>}
          </div>
        </div>
      </div>

    </div>
  )
}
