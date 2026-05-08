'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

interface TickerItem {
  stock_code:     string
  close:          number
  change_percent: number
  value:          number
}

export default function TickerTape() {
  const [tickers, setTickers] = useState<TickerItem[]>([])
  const [ready, setReady]     = useState(false)

  useEffect(() => {
    async function fetchTickers() {
      try {
        // Get latest trading date
        const { data: dateData } = await supabase
          .from('daily_transactions')
          .select('trading_date')
          .order('trading_date', { ascending: false })
          .limit(1)
        const date = dateData?.[0]?.trading_date
        if (!date) return

        // Get top movers by value (mix gainers & losers for a balanced tape)
        const { data } = await supabase
          .from('daily_transactions')
          .select('stock_code,close,change_percent,value')
          .eq('trading_date', date)
          .gt('value', 1_000_000_000) // >1M value — liquid stocks only
          .order('value', { ascending: false })
          .limit(40)

        if (data && data.length > 0) {
          // Sort by abs change_percent to show most volatile first
          const sorted = [...data].sort(
            (a, b) => Math.abs(Number(b.change_percent)) - Math.abs(Number(a.change_percent))
          ).slice(0, 20)
          setTickers(sorted)
          setReady(true)
        }
      } catch (e) {
        console.error('Ticker fetch error:', e)
      }
    }
    fetchTickers()
    // Refresh every 5 minutes
    const interval = setInterval(fetchTickers, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  if (!ready || tickers.length === 0) {
    // Fallback placeholders while loading
    const placeholders = ['BBCA','TLKM','BMRI','BBRI','ASII','GOTO','BYAN','ADRO','ICBP','UNVR']
    return (
      <div className="ticker-container h-8 flex items-center overflow-hidden">
        <div className="ticker-track">
          {[...placeholders, ...placeholders].map((code, i) => (
            <span key={i} className="ticker-item opacity-40">
              <span className="font-mono font-bold text-[11px] text-foreground">{code}</span>
              <span className="w-8 h-2 rounded bg-white/10 inline-block ml-1" />
            </span>
          ))}
        </div>
      </div>
    )
  }

  // Duplicate for seamless loop
  const doubled = [...tickers, ...tickers]

  return (
    <div className="ticker-container h-8 flex items-center overflow-hidden">
      <div className="ticker-track">
        {doubled.map((t, i) => {
          const chg = Number(t.change_percent) || 0
          return (
            <Link
              key={i}
              href={`/stock/${t.stock_code}`}
              className="ticker-item hover:opacity-70 transition-opacity cursor-pointer"
            >
              <span className="font-mono font-bold text-[11px] text-foreground">{t.stock_code}</span>
              <span className="font-mono text-[11px] font-semibold ml-1 text-muted-foreground">
                {Number(t.close).toLocaleString('id-ID')}
              </span>
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
