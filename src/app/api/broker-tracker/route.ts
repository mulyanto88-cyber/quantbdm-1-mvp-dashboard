import { NextRequest, NextResponse } from 'next/server';

// Hardcode Supabase Broksum — sama persis dengan Data-Broksum yang sudah jalan
const SUPABASE_URL = 'https://ifdbelggvxyimqyowczn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmZGJlbGdndnh5aW1xeW93Y3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MTM4MDgsImV4cCI6MjA5MjM4OTgwOH0.OD5_Nft5oZGuKaw4tOLf01q6dWR700YvBw9IelyTqBE';
const STORAGE_BASE = `${SUPABASE_URL}/storage/v1/object/public/broker_parquet`;
const STORAGE_API  = `${SUPABASE_URL}/storage/v1/object/list/broker_parquet`;

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
        url:  `${STORAGE_BASE}/${name}/broker_activity_${name}.parquet`,
      }));

    return NextResponse.json(
      { urls },
      { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate' } }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
