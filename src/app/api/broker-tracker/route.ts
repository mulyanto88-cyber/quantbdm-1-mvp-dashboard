import { NextRequest, NextResponse } from 'next/server';
import { Client } from 'pg';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action'); 
  const code = searchParams.get('code')?.toUpperCase() || '';
  const days = parseInt(searchParams.get('days') || '30');

  try {
    const token = process.env.MOTHERDUCK_TOKEN;
    if (!token) throw new Error("MOTHERDUCK_TOKEN belum diset di .env.local");

    // Koneksi ke MotherDuck menggunakan driver Postgres (Sangat ramah Vercel!)
    const client = new Client({
      host: "pg.us-east-1-aws.motherduck.com",
      port: 5432,
      user: "postgres",
      password: token,
      database: "md:",
      ssl: { rejectUnauthorized: true },
    });

    await client.connect();

    // Hitung tanggal batas (cutoff)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    let query = '';

    if (action === 'tracker') {
      if (!code) throw new Error("Kode saham diperlukan");
      query = `
        SELECT 
          strftime(date, '%Y-%m-%d') as date,
          broker_code,
          SUM(CASE WHEN side = 'BUY' THEN value ELSE 0 END)::DOUBLE AS buy_value,
          SUM(CASE WHEN side = 'SELL' THEN value ELSE 0 END)::DOUBLE AS sell_value,
          SUM(CASE WHEN side = 'BUY' THEN value ELSE -value END)::DOUBLE AS net_value,
          SUM(CASE WHEN side = 'BUY' THEN lot ELSE -lot END)::DOUBLE AS net_lot
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
            SUM(CASE WHEN side = 'BUY' THEN value ELSE 0 END)::DOUBLE AS buy_value,
            SUM(CASE WHEN side = 'SELL' THEN value ELSE 0 END)::DOUBLE AS sell_value,
            SUM(CASE WHEN side = 'BUY' THEN value ELSE -value END)::DOUBLE AS net_value,
            SUM(CASE WHEN side = 'BUY' THEN lot ELSE -lot END)::DOUBLE AS net_lot
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
            COUNT(DISTINCT broker_code)::DOUBLE AS broker_count,
            FIRST(broker_code ORDER BY net_value DESC) AS top_buyer,
            FIRST(broker_code ORDER BY net_value ASC) AS top_seller,
            CASE 
              WHEN SUM(buy_value + ABS(sell_value)) > 0 
              THEN ROUND((SUM(net_value)::FLOAT / SUM(buy_value + ABS(sell_value))) * 100, 2)::DOUBLE
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
      throw new Error("Action tidak valid.");
    }

    // Eksekusi Query
    const result = await client.query(query);
    
    // Tutup koneksi agar tidak memory leak
    await client.end(); 

    return NextResponse.json({ data: result.rows });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
