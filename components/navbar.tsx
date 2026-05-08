'use client'

import { format } from 'date-fns'
import { id } from 'date-fns/locale'

export function Navbar() {
  const today = format(new Date(), 'EEEE, dd MMMM yyyy', { locale: id })

  return (
    <header className="h-14 border-b flex items-center justify-between px-6" 
      style={{ borderColor: 'hsl(217 33% 20%)', background: 'hsl(222 47% 14%)' }}>
      <div>
        <h2 className="text-sm font-semibold text-white">
          {format(new Date(), 'HH:mm')} WIB
        </h2>
        <p className="text-[11px] text-muted-foreground">{today}</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold"
          style={{ background: 'linear-gradient(135deg, #e7b733, #c49a1a)', color: '#0f1a36' }}>
          K
        </div>
      </div>
    </header>
  )
}
