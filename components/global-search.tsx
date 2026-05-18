'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface Suggestion {
  stock_code: string
  sector: string
  close: number
  change_percent: number
}

async function searchStocks(q: string): Promise<Suggestion[]> {
  const res = await fetch('/api/motherduck', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `
        SELECT stock_code, sector, close, change_percent
        FROM market.vw_stock_latest
        WHERE stock_code ILIKE $1
        ORDER BY value DESC
        LIMIT 8
      `,
      params: [`${q.toUpperCase()}%`],
    }),
  })
  const json = await res.json()
  return json.data || []
}

export default function GlobalSearch() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 2) { setSuggestions([]); return }
    setLoading(true)
    try {
      const data = await searchStocks(q)
      setSuggestions(data)
      setOpen(true)
      setHighlighted(-1)
    } catch { setSuggestions([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query) { setSuggestions([]); setOpen(false); return }
    debounceRef.current = setTimeout(() => fetchSuggestions(query), 220)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, fetchSuggestions])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted(h => Math.max(h - 1, -1)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      const target = highlighted >= 0 ? suggestions[highlighted]?.stock_code : query.toUpperCase()
      if (target && target.length >= 2) navigate(target)
    }
    else if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur() }
  }

  const navigate = (code: string) => {
    setQuery(''); setOpen(false); setSuggestions([])
    router.push(`/stock/${code.toUpperCase()}`)
  }

  const chgColor = (chg: number) => chg >= 0 ? 'text-emerald-400' : 'text-red-400'

  return (
    <div ref={containerRef} className="relative flex-1 md:flex-none md:w-72">
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none z-10" fill="none" viewBox="0 0 16 16">
        <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M11 11L14.5 14.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
      {loading && (
        <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gold-400 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25"/>
          <path d="M12 2C6.48 2 2 6.48 2 12" stroke="currentColor" strokeWidth="2"/>
        </svg>
      )}
      <input ref={inputRef} type="text" value={query} onChange={e => setQuery(e.target.value.toUpperCase())}
        onFocus={() => query.length >= 2 && setOpen(true)} onKeyDown={handleKeyDown}
        placeholder="Cari saham... (BBCA, TLKM)" maxLength={6} autoComplete="off"
        className="w-full pl-9 pr-9 py-2 bg-white/[0.04] border border-white/[0.07] rounded-xl text-xs focus:outline-none focus:border-gold-400/40 focus:bg-white/[0.06] transition-all placeholder:text-muted-foreground/60 uppercase" />
      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 z-50 glass border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl">
          {suggestions.map((s, i) => (
            <button key={s.stock_code} onMouseDown={e => { e.preventDefault(); navigate(s.stock_code) }}
              onMouseEnter={() => setHighlighted(i)}
              className={`w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors ${highlighted === i ? 'bg-gold-400/10' : 'hover:bg-white/[0.04]'}`}>
              <div>
                <span className="font-mono font-black text-sm text-foreground">{s.stock_code}</span>
                {s.sector && <span className="text-[10px] text-muted-foreground ml-2">{s.sector}</span>}
              </div>
              <div className="text-right flex-shrink-0 ml-3">
                <span className="text-xs font-semibold text-foreground">{Number(s.close).toLocaleString('id-ID')}</span>
                <span className={`text-[10px] font-bold ml-1.5 ${chgColor(Number(s.change_percent))}`}>
                  {Number(s.change_percent) >= 0 ? '▲' : '▼'}{Math.abs(Number(s.change_percent)).toFixed(2)}%
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
