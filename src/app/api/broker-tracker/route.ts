import { NextRequest, NextResponse } from 'next/server';

// Supabase khusus broker parquet — project terpisah dari dashboard utama
// Pastikan kedua env var ini ada di .env.local
const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const STORAGE_BASE  = `${SUPABASE_URL}/storage/v1/object/public/broker_parquet`;
const STORAGE_API   = `${SUPABASE_URL}/storage/v1/object/list/broker_parquet`;

/**
 * GET /api/broker-tracker?days=30
 * Ambil daftar URL parquet dari Supabase Storage (server-side, bebas COEP).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get('days') || '30');


  try {
    const res = await fetch(STORAGE_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prefix: '',
        limit: 200,
        offset: 0,
        sortBy: { column: 'name', order: 'desc' },
      }),
    });

    if (!res.ok) throw new Error(`Storage list error: ${res.status}`);
    const folders: { name: string }[] = await res.json();

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const urls = folders
      .map(f => f.name)
      .filter(name => /^\d{8}$/.test(name))
      .filter(name => {
        const d = new Date(`${name.slice(0,4)}-${name.slice(4,6)}-${name.slice(6,8)}`);
        return d >= cutoff;
      })
      .sort((a, b) => b.localeCompare(a))
      .map(name => ({
        date: `${name.slice(0,4)}-${name.slice(4,6)}-${name.slice(6,8)}`,
        url: `${STORAGE_BASE}/${name}/broker_activity_${name}.parquet`,
      }));

    return NextResponse.json(
      { urls },
      { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate' } }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
