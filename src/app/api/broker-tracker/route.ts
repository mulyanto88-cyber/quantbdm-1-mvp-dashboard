import { NextRequest, NextResponse } from 'next/server';
import { Client } from 'pg';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action'); 
  const code = searchParams.get('code')?.toUpperCase() || '';
  const days = searchParams.get('days');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  try {
    const token = process.env.MOTHERDUCK_TOKEN;
    const client = new Client({
      host: "pg.us-east-1-aws.motherduck.com",
      port: 5432,
      user: "postgres",
      password: token,
      database: "md:",
      ssl: { rejectUnauthorized: true },
    });
    await client.connect();

    let dateFilter = "";
    if (startDate && endDate) {
      dateFilter = `date BETWEEN '${startDate}' AND '${endDate}'`;
    } else {
      const d = parseInt(days || '5');
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - d);
      dateFilter = `date >= '${cutoff.toISOString().split('T')[0]}'`;
    }

    let query = '';
    if (action === 'tracker') {
      query = `
        SELECT 
          broker_code,
          SUM(CASE WHEN value > 0 THEN value ELSE 0 END)::DOUBLE AS buy_val,
          SUM(CASE WHEN value < 0 THEN value ELSE 0 END)::DOUBLE AS sell_val,
          SUM(CASE WHEN value > 0 THEN lot ELSE 0 END)::DOUBLE AS buy_lot,
          SUM(CASE WHEN value < 0 THEN lot ELSE 0 END)::DOUBLE AS sell_lot,
          SUM(value)::DOUBLE AS net_val,
          SUM(lot)::DOUBLE AS net_lot,
          (SUM(CASE WHEN value > 0 THEN value ELSE 0 END) / NULLIF(SUM(CASE WHEN value > 0 THEN lot ELSE 0 END), 0))::DOUBLE AS buy_avg_price,
          (SUM(CASE WHEN value < 0 THEN value ELSE 0 END) / NULLIF(SUM(CASE WHEN value < 0 THEN lot ELSE 0 END), 0))::DOUBLE AS sell_avg_price,
          (SUM(ABS(lot)) / NULLIF(SUM(freq), 0))::DOUBLE AS avg_lot_per_trade
        FROM my_db.main.broker_activity
        WHERE ${dateFilter} AND UPPER(stock_code) = '${code}'
        GROUP BY broker_code
        ORDER BY net_val DESC
      `;
    } else if (action === 'history') {
      query = `
        SELECT 
          strftime(date, '%Y-%m-%d') as date,
          (SUM(value) / NULLIF(SUM(lot), 0))::DOUBLE AS daily_avg_price,
          SUM(value)::DOUBLE AS daily_net_val
        FROM my_db.main.broker_activity
        WHERE ${dateFilter} AND UPPER(stock_code) = '${code}'
        GROUP BY date
        ORDER BY date ASC
      `;
    } else if (action === 'screener') {
      query = `
        SELECT 
          stock_code,
          SUM(value) FILTER (WHERE value > 0) AS total_accumulation,
          COUNT(DISTINCT broker_code) as broker_count,
          (SUM(value) / NULLIF(COUNT(DISTINCT broker_code), 0))::DOUBLE AS power_score
        FROM my_db.main.broker_activity
        WHERE ${dateFilter}
        GROUP BY stock_code
        HAVING SUM(value) > 0
        ORDER BY power_score DESC LIMIT 50
      `;
    }

    const result = await client.query(query);
    await client.end(); 
    return NextResponse.json({ data: result.rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
