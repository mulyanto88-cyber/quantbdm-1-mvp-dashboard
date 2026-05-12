import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const STORAGE_BASE  = `${SUPABASE_URL}/storage/v1/object/public/broker_parquet`;
const STORAGE_API   = `${SUPABASE_URL}/storage/v1/object/list/broker_parquet`;

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
    const rawFolders = await res.json();

    // ── DEBUG: kembalikan raw response supaya bisa dilihat ──
    // Hapus blok ini setelah masalah teridentifikasi
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const allNames = Array.isArray(rawFolders) ? rawFolders.map((f: any) => f.name) : [];
    const passRegex = allNames.filter((n: string) => /^\d{8}$/.test(n));
    const passDate  = passRegex.filter((name: string) => {
      const d = new Date(`${name.slice(0,4)}-${name.slice(4,6)}-${name.slice(6,8)}`);
      return d >= cutoff;
    });

    const urls = passDate
      .sort((a: string, b: string) => b.localeCompare(a))
      .map((name: string) => ({
        date: `${name.slice(0,4)}-${name.slice(4,6)}-${name.slice(6,8)}`,
        url: `${STORAGE_BASE}/${name}/broker_activity_${name}.parquet`,
      }));

    return NextResponse.json({
      urls,
      // ── debug fields (hapus setelah fix) ──
      _debug: {
        supabase_url_used: SUPABASE_URL,
        key_present: !!SUPABASE_KEY,
        raw_count: Array.isArray(rawFolders) ? rawFolders.length : 'NOT_ARRAY',
        raw_first5: Array.isArray(rawFolders) ? rawFolders.slice(0, 5) : rawFolders,
        all_names: allNames.slice(0, 20),
        pass_regex: passRegex,
        pass_date: passDate,
        cutoff_used: cutoff.toISOString(),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
