import Link from 'next/link'
import { FlaskConical } from 'lucide-react'

export default function BacktestPage() {
  return (
    <div className="flex items-center justify-center min-h-[65vh]">
      <div className="text-center space-y-6 animate-fade-in">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shadow-lg shadow-purple-500/20 mx-auto">
          <FlaskConical className="w-10 h-10 text-white" />
        </div>
        <div>
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-500/20 text-purple-400 border border-purple-500/20">Coming Soon</span>
          <h1 className="text-3xl font-black text-foreground mt-3">Backtest Lab</h1>
          <p className="text-muted-foreground mt-2 text-sm max-w-sm mx-auto">
            Uji strategi Smart Money berbasis data historis KSEI. Fitur sedang dalam pengembangan.
          </p>
        </div>
        <div className="glass rounded-2xl p-6 border border-border/30 max-w-sm mx-auto text-left space-y-3">
          <p className="text-xs font-bold text-muted-foreground uppercase">Fitur yang akan datang:</p>
          {['Strategy tester berbasis signal KSEI','Walk-forward validation','Risk/reward analysis per sektor','Export hasil ke CSV'].map((f,i)=>(
            <div key={i} className="flex items-center gap-3 text-sm">
              <span className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 text-xs flex-shrink-0">✓</span>
              <span className="text-muted-foreground">{f}</span>
            </div>
          ))}
        </div>
        <Link href="/" className="inline-block px-6 py-3 rounded-xl bg-gradient-to-r from-gold-400 to-yellow-500 text-navy-900 font-bold text-sm">
          ← Kembali ke Dashboard
        </Link>
      </div>
    </div>
  )
}
