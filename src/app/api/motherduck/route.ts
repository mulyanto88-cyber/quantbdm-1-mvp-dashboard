import { NextRequest, NextResponse } from 'next/server'

const MOTHERDUCK_TOKEN = process.env.MOTHERDUCK_TOKEN!
const MOTHERDUCK_API = 'https://api.motherduck.com/v1'

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json()
    
    if (!query) {
      return NextResponse.json({ error: 'Query diperlukan' }, { status: 400 })
    }

    // Gunakan MotherDuck REST API (bukan DuckDB package)
    const res = await fetch(`${MOTHERDUCK_API}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MOTHERDUCK_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        database: 'my_db',
        query: query,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(err)
    }

    const json = await res.json()
    
    // MotherDuck returns { results: [{ columns: [...], rows: [...] }] }
    const result = json.results?.[0]
    if (!result) {
      return NextResponse.json({ data: [] })
    }

    const columns = result.columns?.map((c: any) => c.name) || []
    const rows = result.rows || []

    const data = rows.map((row: any[]) => {
      const obj: Record<string, any> = {}
      columns.forEach((col: string, i: number) => {
        obj[col] = row[i]
      })
      return obj
    })

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('[motherduck]', error.message)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
