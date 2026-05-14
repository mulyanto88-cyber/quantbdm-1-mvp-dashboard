import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

// ─── Connection Pool ──────────────────────────────────────────────────────────
const pool = new Pool({
  host: 'pg.us-east-1-aws.motherduck.com',
  port: 5432,
  user: 'postgres',
  password: process.env.MOTHERDUCK_TOKEN,
  database: 'md:',
  ssl: { rejectUnauthorized: true },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// ─── Build parameterized date filter ──────────────────────────────────────────
function buildDateFilter(
  days: string | null,
  startDate: string | null,
  endDate: string | null
): { clause: string; params: (string | number)[] } {
  if (startDate && endDate) {
    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      throw new Error('Format tanggal tidak valid. Gunakan YYYY-MM-DD');
    }
    return {
      clause: `date BETWEEN $1::DATE AND $2::DATE`,
      params: [startDate, endDate],
    };
  }
  const d = parseInt(days || '5');
  if (isNaN(d) || d < 0) {
    throw new Error('Parameter days harus angka positif');
  }
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - d);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  return {
    clause: `date >= $1::DATE`,
    params: [cutoffStr],
  };
}

// ─── Validate stock code ─────────────────────────────────────────────────────
function validateStockCode(code: string): string {
  const cleaned = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleaned.length < 1 || cleaned.length > 10) {
    throw new Error('Kode saham tidak valid');
  }
  return cleaned;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const code = searchParams.get('code') || '';
  const days = searchParams.get('days');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const brokerCode = searchParams.get('broker_code') || '';
  const minTotalValue = searchParams.get('min_total_value') || '1000000000'; // Default 1B
  const minBrokerCount = searchParams.get('min_broker_count') || '3';
  const minBuyBrokerCount = searchParams.get('min_buy_broker_count') || '2';

  let dateFilter: { clause: string; params: (string | number)[] };
  try {
    dateFilter = buildDateFilter(days, startDate, endDate);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }

  let query = '';
  let queryParams: any[] = [...dateFilter.params];
  let paramIndex = dateFilter.params.length + 1;

  try {
    // ── 1. TRACKER ────────────────────────────────────────────────────────────
    if (action === 'tracker') {
      const cleanCode = validateStockCode(code);
      queryParams.push(cleanCode);
      
      query = `
        SELECT
          broker_code,
          MAX(broker_name)                                                              AS broker_name,

          -- Buy side
          SUM(CASE WHEN value > 0 THEN value ELSE 0 END)::DOUBLE                       AS buy_val,
          SUM(CASE WHEN value > 0 THEN lot   ELSE 0 END)::DOUBLE                       AS buy_lot,
          SUM(CASE WHEN value > 0 THEN freq  ELSE 0 END)::BIGINT                       AS buy_freq,

          -- Sell side (lot stored as negative in DB for SELL rows → use ABS)
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
            NULLIF(SUM(CASE WHEN value > 0 THEN lot ELSE 0 END) * 100.0, 0))::DOUBLE       AS buy_avg_price,
          (ABS(SUM(CASE WHEN value < 0 THEN value ELSE 0 END)) /
            NULLIF(ABS(SUM(CASE WHEN value < 0 THEN lot ELSE 0 END)) * 100.0, 0))::DOUBLE  AS sell_avg_price

        FROM my_db.main.broker_activity
        WHERE ${dateFilter.clause}
          AND LEFT(stock_code, 4) = $${paramIndex}
        GROUP BY broker_code
        ORDER BY net_val DESC
      `;

    // ── 2. HISTORY (market-wide for a stock) ──────────────────────────────────
    } else if (action === 'history') {
      const cleanCode = validateStockCode(code);
      queryParams.push(cleanCode);

      query = `
        SELECT
          CAST(date AS VARCHAR)                                              AS date,
          SUM(value)::DOUBLE                                                 AS daily_net_val,
          SUM(CASE WHEN value > 0 THEN value ELSE 0 END)::DOUBLE            AS daily_buy_val,
          ABS(SUM(CASE WHEN value < 0 THEN value ELSE 0 END))::DOUBLE       AS daily_sell_val,
          SUM(lot)::DOUBLE                                                   AS daily_net_lot,
          SUM(CASE WHEN value > 0 THEN freq ELSE 0 END)::BIGINT             AS daily_buy_freq,
          SUM(CASE WHEN value < 0 THEN freq ELSE 0 END)::BIGINT             AS daily_sell_freq,
          (SUM(CASE WHEN value > 0 THEN value ELSE 0 END) /
            NULLIF(SUM(CASE WHEN value > 0 THEN lot ELSE 0 END) * 100.0, 0))::DOUBLE AS daily_avg_price
        FROM my_db.main.broker_activity
        WHERE ${dateFilter.clause}
          AND LEFT(stock_code, 4) = $${paramIndex}
        GROUP BY date
        ORDER BY date ASC
      `;

    // ── 3. BROKER HISTORY (single broker flow over time) ──────────────────────
    } else if (action === 'broker_history') {
      const cleanCode = validateStockCode(code);
      const cleanBroker = brokerCode.trim().toUpperCase();
      queryParams.push(cleanCode, cleanBroker);

      query = `
        SELECT
          CAST(date AS VARCHAR) AS date,
          SUM(value)::DOUBLE    AS net_val,
          SUM(lot)::DOUBLE      AS net_lot
        FROM my_db.main.broker_activity
        WHERE ${dateFilter.clause}
          AND LEFT(stock_code, 4) = $${paramIndex}
          AND broker_code = $${paramIndex + 1}
        GROUP BY date
        ORDER BY date ASC
      `;

    // ── 4. SCREENER (IMPROVED) ────────────────────────────────────────────────
    } else if (action === 'screener') {
      const minVal = parseFloat(minTotalValue);
      const minBrk = parseInt(minBrokerCount);
      const minBuyBrk = parseInt(minBuyBrokerCount);

      if (isNaN(minVal) || minVal < 0) {
        return NextResponse.json({ error: 'min_total_value tidak valid' }, { status: 400 });
      }
      if (isNaN(minBrk) || minBrk < 1) {
        return NextResponse.json({ error: 'min_broker_count tidak valid' }, { status: 400 });
      }
      if (isNaN(minBuyBrk) || minBuyBrk < 1) {
        return NextResponse.json({ error: 'min_buy_broker_count tidak valid' }, { status: 400 });
      }

      queryParams.push(minVal, minBrk, minBuyBrk);

      query = `
        WITH stock_agg AS (
          SELECT
            LEFT(stock_code, 4)                                            AS clean_code,
            SUM(CASE WHEN value > 0 THEN value ELSE 0 END)::DOUBLE        AS total_buy,
            ABS(SUM(CASE WHEN value < 0 THEN value ELSE 0 END))::DOUBLE   AS total_sell,
            SUM(value)::DOUBLE                                             AS net_accumulation,
            SUM(ABS(value))::DOUBLE                                        AS total_value,
            COUNT(DISTINCT broker_code)                                    AS broker_count,
            COUNT(DISTINCT CASE WHEN value > 0 THEN broker_code END)      AS buy_broker_count,
            COUNT(DISTINCT CASE WHEN value < 0 THEN broker_code END)      AS sell_broker_count,
            -- Top broker concentration
            MAX(
              SUM(CASE WHEN value > 0 THEN value ELSE 0 END) 
              OVER (PARTITION BY broker_code)
            )::DOUBLE / NULLIF(SUM(CASE WHEN value > 0 THEN value ELSE 0 END), 0) 
              AS top_buyer_concentration
          FROM my_db.main.broker_activity
          WHERE ${dateFilter.clause}
            AND LENGTH(REGEXP_REPLACE(stock_code, '[^A-Z0-9]', '', 'g')) >= 3
          GROUP BY LEFT(stock_code, 4)
        )
        SELECT
          clean_code                                                       AS stock_code,
          total_buy,
          total_sell,
          net_accumulation,
          total_value,
          broker_count,
          buy_broker_count,
          sell_broker_count,
          -- NEW Power Score:
          -- (Net / Total) × LN(1 + Broker Count) × SIGN(Net)
          -- Range: -1 to 1, higher = stronger accumulation with broker diversity
          ROUND(
            (net_accumulation / NULLIF(total_value, 0)) 
            * LN(1 + broker_count)
            * CASE WHEN net_accumulation >= 0 THEN 1 ELSE -1 END
            * 100, 2
          )::DOUBLE                                                        AS power_score,
          ROUND(top_buyer_concentration * 100, 1)::DOUBLE                 AS top_buyer_pct
        FROM stock_agg
        WHERE net_accumulation > 0
          AND total_value >= $${paramIndex}
          AND broker_count >= $${paramIndex + 1}
          AND buy_broker_count >= $${paramIndex + 2}
        ORDER BY power_score DESC
        LIMIT 50
      `;

    } else {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    const result = await pool.query(query, queryParams);
    return NextResponse.json({ data: result.rows });

  } catch (error: any) {
    console.error('[broker-tracker]', {
      action,
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join('\n'),
    });
    
    // Safe error message
    return NextResponse.json(
      { error: 'Gagal mengambil data. Silakan coba lagi atau hubungi admin.' },
      { status: 500 }
    );
  }
}
