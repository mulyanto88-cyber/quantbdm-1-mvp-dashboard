import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-[70vh]">
      <div className="text-center space-y-6 animate-fade-in">
        {/* Big number */}
        <div className="relative">
          <p className="text-[10rem] font-black text-white/[0.04] leading-none select-none">404</p>
          <div className="absolute inset-0 flex items-center justify-center">
            <div>
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-yellow-600 flex items-center justify-center shadow-lg shadow-amber-500/20 mx-auto mb-4">
                <span className="text-black font-black text-2xl">B</span>
              </div>
            </div>
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-black text-foreground">Halaman tidak ditemukan</h1>
          <p className="text-muted-foreground mt-2 text-sm max-w-xs mx-auto">
            Halaman yang Anda cari tidak ada atau sudah dipindahkan.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3">
          <Link href="/"
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-gold-400 to-yellow-500 text-navy-900 font-bold text-sm hover:shadow-lg hover:shadow-amber-500/20 transition-all">
            ← Kembali ke Dashboard
          </Link>
          <Link href="/screener"
            className="px-6 py-3 rounded-xl glass border border-border/30 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">
            Buka Screener
          </Link>
        </div>

        <div className="pt-4">
          <p className="text-[11px] text-muted-foreground">
            Bandarmology • Smart Money Radar
          </p>
        </div>
      </div>
    </div>
  )
}
