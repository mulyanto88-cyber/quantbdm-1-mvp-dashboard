import { NextRequest, NextResponse } from 'next/server'
import { run } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = (searchParams.get('code') || '').toUpperCase().trim().replace(/[^A-Z0-9]/g, '')
  const days = Math.min(parseInt(searchParams.get('days') || '90'), 1095)

  if (!code || code.length < 1 || code.length > 10) {
    return NextResponse.json({ error: 'Kode saham tidak valid' }, { status: 400 })
  }

  try {
    const [
      latestRows, smRows, histRows, brokerRows, ownerRows, whaleRows, foreignRows,
    ] = await Promise.all([
      
      // 1. Latest stock data
      run(`SELECT * FROM market.vw_stock_detail WHERE stock_code = $1 ORDER BY trading_date DESC LIMIT 1`, [code]),
      
      // 2. Smart Money Score
      run(`SELECT * FROM market.vw_smart_money_score WHERE stock_code = $1`, [code]),
      
      // 3. Chart history — FIX: CAST trading_date AS DATE
      run(`
        SELECT trading_date, open_price, high, low, close, volume,
               net_foreign_value, vwma_20d, aov_ratio_ma20,
               whale_signal, big_player_anomaly, previous
        FROM market.daily_transactions
        WHERE stock_code = $1
          AND CAST(trading_date AS DATE) >= (SELECT CAST(MAX(trading_date) AS DATE) FROM market.daily_transactions) - INTERVAL '${days} days'
        ORDER BY trading_date ASC
      `, [code]),
      
      // 4. Broker Activity — FIX: CAST date AS DATE
      run(`
        SELECT broker_code AS kode_broker, MAX(broker_name) AS nama_broker,
               SUM(CASE WHEN side='BUY' THEN value ELSE -value END)::DOUBLE AS net_value
        FROM broker_activity
        WHERE LEFT(stock_code, 4) = $1
          AND CAST(date AS DATE) >= (SELECT CAST(MAX(date) AS DATE) FROM broker_activity) - INTERVAL '90 days'
        GROUP BY broker_code
        ORDER BY ABS(SUM(CASE WHEN side='BUY' THEN value ELSE -value END)) DESC
        LIMIT 6
      `, [code]),
      
      // 5. Ownership Details
      run(`
        SELECT investor_name, investor_type, local_foreign, percentage, total_holding_shares
        FROM ksei.ownership_1pct
        WHERE share_code = $1
          AND date = (SELECT MAX(date) FROM ksei.ownership_1pct)
        ORDER BY percentage DESC
        LIMIT 100
      `, [code]),
      
      // 6. Whale Movement
      run(`SELECT * FROM ksei.whale_timing_snapshot WHERE share_code = $1`, [code]),
      
      // 7. Foreign Divergence
      run(`
        WITH ranked AS (
          SELECT trading_date, close, change_percent, net_foreign_value,
                 ROW_NUMBER() OVER (ORDER BY trading_date DESC) AS rn
          FROM market.daily_transactions
          WHERE stock_code = $1
        ),
        agg AS (
          SELECT
            SUM(net_foreign_value) AS foreign_30d_net,
            MAX(CASE WHEN rn = 1 THEN close END) AS price_now,
            MAX(CASE WHEN rn = 30 THEN close END) AS price_30d_ago,
            MAX(CASE WHEN rn = 1 THEN change_percent END) AS latest_chg_pct
          FROM ranked WHERE rn <= 30
        )
        SELECT
          foreign_30d_net,
          latest_chg_pct AS price_chg_pct,
          ROUND(((price_now - price_30d_ago) / NULLIF(price_30d_ago, 0)) * 100, 2) AS price_chg_30d,
          CASE
            WHEN foreign_30d_net > 1e9 AND latest_chg_pct BETWEEN -1 AND 1 THEN 'STEALTH ACCUMULATION'
            WHEN foreign_30d_net > 1e9 AND latest_chg_pct > 1 THEN 'BULLISH CONFIRMATION'
            WHEN foreign_30d_net < -1e9 AND latest_chg_pct > 1 THEN 'DISTRIBUTION'
            WHEN foreign_30d_net < -1e9 AND latest_chg_pct < -1 THEN 'BEARISH PRESSURE'
            ELSE 'NEUTRAL'
          END AS divergence_type,
          CASE
            WHEN ABS(foreign_30d_net) > 50e9 THEN 'STRONG'
            WHEN ABS(foreign_30d_net) > 10e9 THEN 'MODERATE'
            ELSE 'WEAK'
          END AS signal_strength,
          CASE
            WHEN foreign_30d_net > 1e9 AND latest_chg_pct BETWEEN -1 AND 1
              THEN 'Foreign akumulasi diam-diam, harga belum gerak – potensi breakout.'
            WHEN foreign_30d_net > 1e9 AND latest_chg_pct > 1
              THEN 'Foreign beli dan harga naik, konfirmasi momentum bullish.'
            WHEN foreign_30d_net < -1e9 AND latest_chg_pct > 1
              THEN 'Foreign jual tapi harga naik – waspadai distribusi terselubung.'
            WHEN foreign_30d_net < -1e9 AND latest_chg_pct < -1
              THEN 'Foreign jual dan harga turun, tekanan jual masih berlanjut.'
            ELSE 'Aliran foreign relatif netral dalam 30 hari terakhir.'
          END AS interpretation
        FROM agg
      `, [code]),
    ])

    if (!latestRows.length) {
      return NextResponse.json({ error: `Stock ${code} not found` }, { status: 404 })
    }

    return NextResponse.json({
      stockData: latestRows[0] ?? null,
      smartMoneyIndex: smRows[0] ?? null,
      historyData: histRows,
      brokerData: brokerRows,
      ownershipDetails: ownerRows,
      whaleMovement: whaleRows,
      foreignDivergence: foreignRows[0] ?? null,
    })
  } catch (err: any) {
    console.error('[stock-detail]', { code, message: err.message })
    return NextResponse.json({ error: 'Gagal mengambil data. Silakan coba lagi.' }, { status: 500 })
  }
}
