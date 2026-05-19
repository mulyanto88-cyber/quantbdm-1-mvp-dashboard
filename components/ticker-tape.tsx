'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface TickerItem {
  stock_code: string
  close: number
  change_percent: number
}

async function fetchTickers(): Promise<TickerItem[]> {
  const res = await fetch('/api/motherduck', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `
        SELECT stock_code, close, change_percent
        FROM market.vw_stock_latest
        WHERE value > 1000000000
        ORDER BY ABS(change_percent) DESC
        LIMIT 20
      `,
    }),
  })
  const json = await res.json()
  return json.data || []
}

export default function TickerTape() {
  const [tickers, setTickers] = useState<TickerItem[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    fetchTickers().then(data => {
      if (data.length > 0) { setTickers(data); setReady(true) }
    })
    const interval = setInterval(() => {
      fetchTickers().then(data => { if (data.length > 0) setTickers(data) })
    }, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  if (!ready) {
    return (
      <div className="ticker-container h-8 flex items-center overflow-hidden">
        <div className="ticker-track">
          {['BBCA','TLKM','BMRI','BBRI','ASII','GOTO','BYAN','ADRO'].map((code, i) => (
            <span key={i} className="ticker-item opacity-40">
              <span className="font-mono font-bold text-[11px] text-foreground">{code}</span>
            </span>
          ))}
        </div>
      </div>
    )
  }

  const doubled = [...tickers, ...tickers]
  return (
    <div className="ticker-container h-8 flex items-center overflow-hidden">
      <div className="ticker-track">
        {doubled.map((t, i) => {
          const chg = Number(t.change_percent) || 0
          return (
            <Link key={i} href={`/stock/${t.stock_code}`} className="ticker-item hover:opacity-70 transition-opacity cursor-pointer">
              <span className="font-mono font-bold text-[11px] text-foreground">{t.stock_code}</span>
              <span className="font-mono text-[11px] font-semibold ml-1 text-muted-foreground">{Number(t.close).toLocaleString('id-ID')}</span>
              <span className={`text-[10px] font-bold ml-1 ${chg >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {chg >= 0 ? '▲' : '▼'} {Math.abs(chg).toFixed(2)}%
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
