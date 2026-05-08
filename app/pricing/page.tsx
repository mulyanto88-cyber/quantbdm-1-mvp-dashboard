import Link from 'next/link'
import { Crown } from 'lucide-react'

const PLANS = [
  {
    name: 'Free',
    price: 'Gratis',
    color: 'border-border/30',
    badge: '',
    features: ['Market Overview real-time','Stock Detail dasar','5 pencarian/hari'],
    cta: 'Aktif Sekarang', ctaStyle: 'glass border border-border/30 text-foreground hover:border-gold-400/30',
  },
  {
    name: 'Pro',
    price: 'Rp 299K',
    sub: '/bulan',
    color: 'border-gold-400/40',
    badge: '🔥 Populer',
    features: ['Semua fitur Free','Screener Pro unlimited','Big Player Radar','5% & 1% Flow Tracker','Smart Money Score','Whale Tracker KSEI'],
    cta: 'Mulai 7 Hari Gratis', ctaStyle: 'bg-gradient-to-r from-gold-400 to-yellow-500 text-navy-900 font-bold shadow-lg shadow-amber-500/20',
  },
  {
    name: 'Institutional',
    price: 'Custom',
    color: 'border-purple-500/30',
    badge: '💎 Enterprise',
    features: ['Semua fitur Pro','API access','Multi-user dashboard','Dedicated support','Custom alert & screening'],
    cta: 'Hubungi Kami', ctaStyle: 'glass border border-purple-500/30 text-purple-400 hover:bg-purple-500/10',
  },
]

export default function PricingPage() {
  return (
    <div className="space-y-10 animate-fade-in pb-10">
      <div className="text-center space-y-3">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gold-400 to-yellow-600 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/20">
          <Crown className="w-8 h-8 text-navy-900" />
        </div>
        <h1 className="text-4xl font-black text-foreground">Pricing</h1>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          Pilih paket yang sesuai kebutuhan analisis Anda. Batalkan kapan saja.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {PLANS.map((p, i) => (
          <div key={p.name} className={`glass rounded-2xl p-6 border ${p.color} flex flex-col relative card-hover`}>
            {p.badge && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[11px] font-bold bg-gradient-to-r from-gold-400 to-yellow-500 text-navy-900 whitespace-nowrap shadow">
                {p.badge}
              </span>
            )}
            <div className="mb-6">
              <p className="text-sm text-muted-foreground font-medium">{p.name}</p>
              <div className="flex items-end gap-1 mt-1">
                <span className="text-4xl font-black text-foreground">{p.price}</span>
                {p.sub && <span className="text-muted-foreground text-sm mb-1">{p.sub}</span>}
              </div>
            </div>
            <div className="space-y-3 flex-1 mb-6">
              {p.features.map((f, j) => (
                <div key={j} className="flex items-center gap-3">
                  <span className="w-4 h-4 rounded-full bg-gold-400/20 flex items-center justify-center text-gold-400 text-[10px] flex-shrink-0">✓</span>
                  <span className="text-sm text-muted-foreground">{f}</span>
                </div>
              ))}
            </div>
            <button className={`w-full py-3 rounded-xl text-sm transition-all ${p.ctaStyle}`}>{p.cta}</button>
          </div>
        ))}
      </div>
      <div className="text-center">
        <Link href="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors">← Kembali ke Dashboard</Link>
      </div>
    </div>
  )
}
