import { NextRequest, NextResponse } from 'next/server'
import { run } from '@/lib/db'

function buildDateFilter(days: string | null, startDate: string | null, endDate: string | null) {
  if (startDate && endDate) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      throw new Error('Format tanggal tidak valid. Gunakan YYYY-MM-DD')
    }
    return { clause: `CAST(date AS DATE) BETWEEN $1::DATE AND $2::DATE`, params: [startDate, endDate] }
  }
  const d = parseInt(days || '5')
  if (isNaN(d) || d < 0) throw new Error('Parameter days harus angka positif')
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - d)
  const cutoffStr = cutoff.toISOString().split('T')[0]
  return { clause: `CAST(date AS DATE) >= $1::DATE`, params: [cutoffStr] }
}

function validateStockCode(code: string): string {
  const cleaned = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (cleaned.length < 1 || cleaned.length > 10) throw new Error('Kode saham tidak valid')
  return cleaned
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')
  const code = searchParams.get('code') || ''
  const days = searchParams.get('days')
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  const brokerCode = searchParams.get('broker_code') || ''
  const brokerCodes = searchParams.get('broker_codes') || ''
  const minTotalValue = searchParams.get('min_total_value') || '1000000000'
  const minBrokerCount = searchParams.get('min_broker_count') || '3'
  const minBuyBrokerCount = searchParams.get('min_buy_broker_count') || '2'

  let dateFilter
  try { dateFilter = buildDateFilter(days, startDate, endDate) }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }) }

  let query = ''
  let queryParams: any[] = [...dateFilter.params]
  let paramIdx = dateFilter.params.length

  try {
    if (action === 'tracker') {
      const cleanCode = validateStockCode(code)
      paramIdx++
      queryParams.push(cleanCode)
      query = `SELECT broker_code, MAX(broker_name) AS broker_name, SUM(CASE WHEN value>0 THEN value ELSE 0 END)::DOUBLE AS buy_val, SUM(CASE WHEN value>0 THEN lot ELSE 0 END)::DOUBLE AS buy_lot, SUM(CASE WHEN value>0 THEN freq ELSE 0 END)::BIGINT AS buy_freq, ABS(SUM(CASE WHEN value<0 THEN value ELSE 0 END))::DOUBLE AS sell_val, ABS(SUM(CASE WHEN value<0 THEN lot ELSE 0 END))::DOUBLE AS sell_lot, SUM(CASE WHEN value<0 THEN freq ELSE 0 END)::BIGINT AS sell_freq, SUM(value)::DOUBLE AS net_val, SUM(lot)::DOUBLE AS net_lot, (SUM(CASE WHEN value>0 THEN freq ELSE 0 END)+SUM(CASE WHEN value<0 THEN freq ELSE 0 END))::BIGINT AS total_freq, (SUM(CASE WHEN value>0 THEN value ELSE 0 END)/NULLIF(SUM(CASE WHEN value>0 THEN lot ELSE 0 END)*100.0,0))::DOUBLE AS buy_avg_price, (ABS(SUM(CASE WHEN value<0 THEN value ELSE 0 END))/NULLIF(ABS(SUM(CASE WHEN value<0 THEN lot ELSE 0 END))*100.0,0))::DOUBLE AS sell_avg_price FROM broker_activity WHERE ${dateFilter.clause} AND LEFT(stock_code,4)=$${paramIdx} GROUP BY broker_code ORDER BY net_val DESC`
    } else if (action === 'history') {
      const cleanCode = validateStockCode(code)
      paramIdx++
      queryParams.push(cleanCode)
      query = `SELECT CAST(date AS VARCHAR) AS date, SUM(value)::DOUBLE AS daily_net_val, SUM(CASE WHEN value>0 THEN value ELSE 0 END)::DOUBLE AS daily_buy_val, ABS(SUM(CASE WHEN value<0 THEN value ELSE 0 END))::DOUBLE AS daily_sell_val, SUM(lot)::DOUBLE AS daily_net_lot, SUM(CASE WHEN value>0 THEN freq ELSE 0 END)::BIGINT AS daily_buy_freq, SUM(CASE WHEN value<0 THEN freq ELSE 0 END)::BIGINT AS daily_sell_freq, (SUM(CASE WHEN value>0 THEN value ELSE 0 END)/NULLIF(SUM(CASE WHEN value>0 THEN lot ELSE 0 END)*100.0,0))::DOUBLE AS daily_avg_price FROM broker_activity WHERE ${dateFilter.clause} AND LEFT(stock_code,4)=$${paramIdx} GROUP BY date ORDER BY date ASC`
    } else if (action === 'broker_history') {
      const cleanCode = validateStockCode(code)
      const cleanBroker = brokerCode.trim().toUpperCase()
      paramIdx += 2
      queryParams.push(cleanCode, cleanBroker)
      query = `SELECT CAST(date AS VARCHAR) AS date, SUM(value)::DOUBLE AS net_val, SUM(lot)::DOUBLE AS net_lot FROM broker_activity WHERE ${dateFilter.clause} AND LEFT(stock_code,4)=$${paramIdx-1} AND broker_code=$${paramIdx} GROUP BY date ORDER BY date ASC`
    } else if (action === 'multi_broker_history') {
      const cleanCode = validateStockCode(code)
      const brokers = brokerCodes.split(',').map(b => b.trim().toUpperCase()).filter(b => b.length > 0)
      if (brokers.length === 0) return NextResponse.json({ error: 'broker_codes diperlukan' }, { status: 400 })
      if (brokers.length > 20) return NextResponse.json({ error: 'Maksimum 20 broker' }, { status: 400 })
      const placeholders = brokers.map((_, i) => `$${paramIdx + 2 + i}`).join(', ')
      paramIdx++
      queryParams.push(cleanCode, ...brokers)
      query = `SELECT CAST(date AS VARCHAR) AS date, broker_code, SUM(value)::DOUBLE AS net_val, SUM(lot)::DOUBLE AS net_lot FROM broker_activity WHERE ${dateFilter.clause} AND LEFT(stock_code,4)=$${paramIdx} AND broker_code IN (${placeholders}) GROUP BY date, broker_code ORDER BY date ASC, broker_code ASC`
    } else if (action === 'screener') {
      const minVal = parseFloat(minTotalValue)
      const minBrk = parseInt(minBrokerCount)
      const minBuyBrk = parseInt(minBuyBrokerCount)
      if (isNaN(minVal) || minVal < 0) return NextResponse.json({ error: 'min_total_value tidak valid' }, { status: 400 })
      if (isNaN(minBrk) || minBrk < 1) return NextResponse.json({ error: 'min_broker_count tidak valid' }, { status: 400 })
      if (isNaN(minBuyBrk) || minBuyBrk < 1) return NextResponse.json({ error: 'min_buy_broker_count tidak valid' }, { status: 400 })
      paramIdx += 3
      queryParams.push(minVal, minBrk, minBuyBrk)
      query = `WITH stock_agg AS (SELECT LEFT(stock_code,4) AS clean_code, SUM(CASE WHEN value>0 THEN value ELSE 0 END)::DOUBLE AS total_buy, ABS(SUM(CASE WHEN value<0 THEN value ELSE 0 END))::DOUBLE AS total_sell, SUM(value)::DOUBLE AS net_accumulation, SUM(ABS(value))::DOUBLE AS total_value, COUNT(DISTINCT broker_code) AS broker_count, COUNT(DISTINCT CASE WHEN value>0 THEN broker_code END) AS buy_broker_count, COUNT(DISTINCT CASE WHEN value<0 THEN broker_code END) AS sell_broker_count FROM broker_activity WHERE ${dateFilter.clause} GROUP BY LEFT(stock_code,4)), top_buyer AS (SELECT LEFT(stock_code,4) AS clean_code, broker_code, SUM(CASE WHEN value>0 THEN value ELSE 0 END)::DOUBLE AS buy_val, ROW_NUMBER() OVER (PARTITION BY LEFT(stock_code,4) ORDER BY SUM(CASE WHEN value>0 THEN value ELSE 0 END) DESC) AS rn FROM broker_activity WHERE ${dateFilter.clause} GROUP BY LEFT(stock_code,4), broker_code) SELECT sa.clean_code AS stock_code, sa.total_buy, sa.total_sell, sa.net_accumulation, sa.total_value, sa.broker_count, sa.buy_broker_count, sa.sell_broker_count, ROUND((sa.net_accumulation/NULLIF(sa.total_value,0))*LN(1+sa.broker_count)*CASE WHEN sa.net_accumulation>=0 THEN 1 ELSE -1 END*100,2)::DOUBLE AS power_score, ROUND(COALESCE(tb.buy_val,0)/NULLIF(sa.total_buy,0)*100,1)::DOUBLE AS top_buyer_pct FROM stock_agg sa LEFT JOIN top_buyer tb ON sa.clean_code=tb.clean_code AND tb.rn=1 WHERE sa.net_accumulation>0 AND sa.total_value>=$${paramIdx-2} AND sa.broker_count>=$${paramIdx-1} AND sa.buy_broker_count>=$${paramIdx} ORDER BY power_score DESC LIMIT 50`
    } else {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }

    const data = await run(query, queryParams)
    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('[broker-tracker]', { action, message: error.message })
    return NextResponse.json({ error: 'Gagal mengambil data.' }, { status: 500 })
  }
}
