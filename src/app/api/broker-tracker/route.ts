import { NextRequest, NextResponse } from 'next/server';
import duckdb from 'duckdb';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get('days') || '30');

  try {
    const token = process.env.MOTHERDUCK_TOKEN;
    if (!token) {
      throw new Error("Token MotherDuck tidak ditemukan di environment");
    }

    // Menghitung tanggal cutoff (batas hari)
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    // Format YYYY-MM-DD
    const cutoffStr = cutoff.toISOString().split('T')[0]; 

    // Koneksi ke MotherDuck menggunakan token
    const db = new duckdb.Database(`md:?motherduck_token=${token}`);

    // Query data langsung dari tabel sesuai gambar Bapak
    const query = `
      SELECT *
      FROM my_db.main.broker_activity
      WHERE date >= '${cutoffStr}'
      ORDER BY date DESC
    `;

    // Eksekusi Query
    const data = await new Promise((resolve, reject) => {
      db.all(query, (err: any, res: any) => {
        if (err) reject(err);
        else resolve(res);
      });
    });

    // Mengembalikan data JSON ke Frontend (bukan URL Parquet lagi)
    return NextResponse.json(
      { data },
      { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate' } }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
