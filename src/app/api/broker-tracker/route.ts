import { NextRequest, NextResponse } from 'next/server';
import { Client } from 'pg';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action'); 
  const code = searchParams.get('code')?.toUpperCase() || '';
  const days = parseInt(searchParams.get('days') || '30');

  try {
    const token = process.env.MOTHERDUCK_TOKEN;
    if (!token) throw new Error("MOTHERDUCK_TOKEN belum diset");

    const client = new Client({
      host: "pg.us-east-1-aws.motherduck.com",
      port: 5432,
      user: "postgres",
      password: token,
      database: "md:",
      ssl: { rejectUnauthorized: true },
    });

    await client.connect();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    let query = '';

    if (action === 'tracker') {
      // TRACKER INDIVIDUAL: Menghasilkan summary Broker & Statistik Konsentrasi
      query = `
        WITH raw_data AS (
          SELECT * FROM my_db.main.broker_activity 
          WHERE date >= '${cutoffStr}' AND UPPER(stock_code) = '${code}'
        ),
        broker_summary AS (
          SELECT 
            broker_code,
            broker_name,
            SUM(CASE WHEN side = 'BUY' THEN value ELSE 0 END)::DOUBLE AS buy_val,
            SUM(CASE WHEN side = 'SELL' THEN value ELSE 0 END)::DOUBLE AS sell_val,
            SUM(CASE WHEN side = 'BUY' THEN value ELSE -value END)::DOUBLE AS net_val,
            SUM(CASE WHEN side = 'BUY' THEN lot ELSE -lot END)::DOUBLE AS net_lot,
            SUM(lot)::DOUBLE AS total_lot,
            SUM(freq)::DOUBLE AS total_freq,
            (SUM(value) / NULLIF(SUM(lot), 0))::DOUBLE AS avg_price
          FROM raw_data
          GROUP BY broker_code, broker_name
        ),
        totals AS (
          SELECT SUM(ABS(net_val)) / 2 as total_market_net FROM broker_summary
        )
        SELECT 
          b.*,
          (b.total_lot / NULLIF(b.total_freq, 0))::DOUBLE AS avg_lot_per_trade,
          (ABS(b.net_val) / NULLIF(t.total_market_net, 0) * 100)::DOUBLE AS concentration_pct
        FROM broker_summary b, totals t
        ORDER BY b.net_val DESC
      `;
    } else if (action === 'screener') {
      // SCREENER: Mencari saham dengan Akumulasi Tinggi & Anomali Whale
      query = `
        WITH stats AS (
          SELECT 
            stock_code,
            broker_code,
            SUM(CASE WHEN side = 'BUY' THEN value ELSE -value END)::DOUBLE AS net_val,
            SUM(lot)::DOUBLE AS total_lot,
            SUM(freq)::DOUBLE AS total_freq
          FROM my_db.main.broker_activity
          WHERE date >= '${cutoffStr}'
          GROUP BY stock_code, broker_code
        ),
        aggr AS (
          SELECT 
            stock_code,
            SUM(net_val) FILTER (WHERE net_val > 0) AS total_accumulation,
            COUNT(DISTINCT broker_code) as broker_count,
            -- Rata-rata lot per trade untuk deteksi anomali
            (SUM(total_lot) / SUM(total_freq))::DOUBLE AS market_avg_lot
          FROM stats
          GROUP BY stock_code
        )
        SELECT 
          a.*,
          -- Score sederhana: Semakin sedikit broker yang mengakumulasi nilai besar, score naik
          (a.total_accumulation / NULLIF(a.broker_count, 0))::DOUBLE AS power_score
        FROM aggr a
        WHERE a.total_accumulation > 0
        ORDER BY power_score DESC
        LIMIT 100
      `;
    }

    const result = await client.query(query);
    await client.end(); 
    return NextResponse.json({ data: result.rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
