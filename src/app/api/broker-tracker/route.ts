import { NextRequest, NextResponse } from 'next/server';
import { Client } from 'pg';

function buildDateFilter(days: string | null, startDate: string | null, endDate: string | null): string {
  if (startDate && endDate) {
    return `date BETWEEN '${startDate}' AND '${endDate}'`;
  }
  const d = parseInt(days || '5');
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - d);
  return `date >= '${cutoff.toISOString().split('T')[0]}'`;
}

async function getClient(): Promise<Client> {
  const token = process.env.MOTHERDUCK_TOKEN;
  const client = new Client({
    host: 'pg.us-east-1-aws.motherduck.com',
    port: 5432,
    user: 'postgres',
    password: token,
    database: 'md:',
    ssl: { rejectUnauthorized: true },
  });
  await client.connect();
  return client;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action     = searchParams.get('action');
  const code       = searchParams.get('code')?.toUpperCase() || '';
  const days       = searchParams.get('days');
  const startDate  = searchParams.get('startDate');
  const endDate    = searchParams.get('endDate');
  const brokerCode = searchParams.get('broker_code')?.toUpperCase() || '';

  const dateFilter = buildDateFilter(days, startDate, endDate);

  let query = '';

  // ── 1. TRACKER ──────────────────────────────────────────────────────────────
  if (action === 'tracker') {
    query = `
      SELECT
        broker_code,
        MAX(broker_name)                                                              AS broker_name,

        -- Buy side
        SUM(CASE WHEN value > 0 THEN value ELSE 0 END)::DOUBLE                       AS buy_val,
        SUM(CASE WHEN value > 0 THEN lot   ELSE 0 END)::DOUBLE                       AS buy_lot,
        SUM(CASE WHEN value > 0 THEN freq  ELSE 0 END)::BIGINT                       AS buy_freq,

        -- Sell side  (lot stored as negative in DB for SELL rows → use ABS)
        ABS(SUM(CASE WHEN value < 0 THEN value ELSE 0 END))::DOUBLE                  AS sell_val,
        ABS(SUM(CASE WHEN value < 0 THEN lot   ELSE 0 END))::DOUBLE                  AS sell_lot,
        SUM(CASE WHEN value < 0 THEN freq  ELSE 0 END)::BIGINT                       AS sell_freq,

        -- Net
        SUM(value)::DOUBLE                                                            AS net_val,
        SUM(lot)::DOUBLE                                                              AS net_lot,
        (SUM(CASE WHEN value > 0 THEN freq ELSE 0 END) +
         SUM(CASE WHEN value < 0 THEN freq ELSE 0 END))::BIGINT                      AS total_freq,

        -- Avg prices (weighted): use ABS so denominator is always positive
        (SUM(CASE WHEN value > 0 THEN value ELSE 0 END) /
          NULLIF(SUM(CASE WHEN value > 0 THEN lot ELSE 0 END), 0))::DOUBLE           AS buy_avg_price,
        (ABS(SUM(CASE WHEN value < 0 THEN value ELSE 0 END)) /
          NULLIF(ABS(SUM(CASE WHEN value < 0 THEN lot ELSE 0 END)), 0))::DOUBLE      AS sell_avg_price

      FROM my_db.main.broker_activity
      WHERE ${dateFilter}
        AND stock_code = '${code}'
      GROUP BY broker_code
      ORDER BY net_val DESC
    `;

  // ── 2. HISTORY (market-wide for a stock) ────────────────────────────────────
  } else if (action === 'history') {
    query = `
      SELECT
        CAST(date AS VARCHAR)                                              AS date,
        SUM(value)::DOUBLE                                                 AS daily_net_val,
        SUM(CASE WHEN value > 0 THEN value ELSE 0 END)::DOUBLE            AS daily_buy_val,
        ABS(SUM(CASE WHEN value < 0 THEN value ELSE 0 END))::DOUBLE       AS daily_sell_val,
        (SUM(CASE WHEN value > 0 THEN value ELSE 0 END) /
          NULLIF(SUM(CASE WHEN value > 0 THEN lot ELSE 0 END), 0))::DOUBLE AS daily_avg_price
      FROM my_db.main.broker_activity
      WHERE ${dateFilter}
        AND stock_code = '${code}'
      GROUP BY date
      ORDER BY date ASC
    `;

  // ── 3. BROKER HISTORY (single broker flow over time) ─────────────────────
  } else if (action === 'broker_history') {
    query = `
      SELECT
        CAST(date AS VARCHAR) AS date,
        SUM(value)::DOUBLE    AS net_val,
        SUM(lot)::DOUBLE      AS net_lot
      FROM my_db.main.broker_activity
      WHERE ${dateFilter}
        AND stock_code   = '${code}'
        AND broker_code  = '${brokerCode}'
      GROUP BY date
      ORDER BY date ASC
    `;

  // ── 4. SCREENER ──────────────────────────────────────────────────────────────
  } else if (action === 'screener') {
    query = `
      SELECT
        stock_code,
        SUM(CASE WHEN value > 0 THEN value ELSE 0 END)::DOUBLE            AS total_buy,
        ABS(SUM(CASE WHEN value < 0 THEN value ELSE 0 END))::DOUBLE       AS total_sell,
        SUM(value)::DOUBLE                                                 AS net_accumulation,
        COUNT(DISTINCT broker_code)                                        AS broker_count,
        COUNT(DISTINCT CASE WHEN value > 0 THEN broker_code END)          AS buy_broker_count,
        COUNT(DISTINCT CASE WHEN value < 0 THEN broker_code END)          AS sell_broker_count,
        -- Power score: net accumulation relative to # of unique buying brokers
        (SUM(value) / NULLIF(COUNT(DISTINCT CASE WHEN value > 0 THEN broker_code END), 0))::DOUBLE AS power_score
      FROM my_db.main.broker_activity
      WHERE ${dateFilter}
        AND stock_code ~ '^[A-Z]{4}$'
      GROUP BY stock_code
      HAVING SUM(value) > 0
      ORDER BY net_accumulation DESC
      LIMIT 50
    `;

  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  try {
    const client = await getClient();
    const result = await client.query(query);
    await client.end();
    return NextResponse.json({ data: result.rows });
  } catch (error: any) {
    console.error('[broker-tracker]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
