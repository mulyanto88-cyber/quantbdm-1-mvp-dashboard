import { NextRequest, NextResponse } from 'next/server'
import duckdb from 'duckdb'

const MOTHERDUCK_TOKEN = process.env.MOTHERDUCK_TOKEN!

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json()
    
    if (!query) {
      return NextResponse.json({ error: 'Query diperlukan' }, { status: 400 })
    }

    const db = new duckdb.Database(`md:my_db?motherduck_token=${MOTHERDUCK_TOKEN}`)
    const conn = db.connect()
    
    const result = conn.execute(query)
    const rows = result.fetchall()
    const columns = result.columns().map((c: any) => c.name)
    
    conn.close()
    db.close()

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
