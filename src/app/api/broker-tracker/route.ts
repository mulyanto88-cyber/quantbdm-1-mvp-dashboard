import { NextRequest, NextResponse } from 'next/server';
import duckdb from 'duckdb';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action'); // 'tracker' atau 'screener'
  const code = searchParams.get('code')?.toUpperCase() || '';
  const days = parseInt(searchParams.get('days') || '30');

  try {
    const token = process.env.MOTHERDUCK_TOKEN;
    if (!token) throw new Error("MOTHERDUCK_TOKEN belum diset di .env.local");

    // Hitung tanggal batas (cutoff)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    // Buka koneksi MotherDuck
    const db = new duckdb.Database(`md:?motherduck_token=${token}`);
    
    let query = '';

    if (action === 'tracker') {
      if (!code) throw new Error("Kode saham diperlukan");
      query = `
        SELECT 
          strftime(date, '%Y-%m-%d') as date,
          broker_code,
          SUM(CASE WHEN side = 'BUY' THEN value ELSE 0 END)::BIGINT AS buy_value,
          SUM(CASE WHEN side = 'SELL' THEN value ELSE 0 END)::BIGINT AS sell_value,
          SUM(CASE WHEN side = 'BUY' THEN value ELSE -value END)::BIGINT AS net_value,
          SUM(CASE WHEN side = 'BUY' THEN lot ELSE -lot END)::BIGINT AS net_lot
        FROM my_db.main.broker_activity
        WHERE date >= '${cutoffStr}' 
          AND UPPER(stock_code) = '${code}'
        GROUP BY date, broker_code
        ORDER BY date DESC, net_value DESC
      `;
    } else if (action === 'screener') {
      query = `
        WITH broker_stats AS (
          SELECT 
            stock_code,
            broker_code,
            SUM(CASE WHEN side = 'BUY' THEN value ELSE 0 END)::BIGINT AS buy_value,
            SUM(CASE WHEN side = 'SELL' THEN value ELSE 0 END)::BIGINT AS sell_value,
            SUM(CASE WHEN side = 'BUY' THEN value ELSE -value END)::BIGINT AS net_value,
            SUM(CASE WHEN side = 'BUY' THEN lot ELSE -lot END)::BIGINT AS net_lot
          FROM my_db.main.broker_activity
          WHERE date >= '${cutoffStr}'
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
      `;
    } else {
      throw new Error("Action tidak valid. Gunakan action=tracker atau action=screener");
    }

    // Eksekusi Query
    const data = await new Promise((resolve, reject) => {
      db.all(query, (err: any, res: any) => {
        if (err) reject(err);
        else resolve(res);
      });
    });

    return NextResponse.json({ data });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
