import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({
  host: 'pg.us-east-1-aws.motherduck.com',
  port: 5432,
  user: 'postgres',
  password: process.env.MOTHERDUCK_TOKEN,
  database: 'my_db',
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
})

// ⭐ Tambah GET handler untuk health check
export async function GET() {
  return NextResponse.json({ status: 'ok', message: 'MotherDuck API is running' })
}

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json()
    
    if (!query) {
      return NextResponse.json({ error: 'Query diperlukan' }, { status: 400 })
    }

    const client = await pool.connect()
    const result = await client.query(query)
    client.release()

    return NextResponse.json({ data: result.rows })
  } catch (error: any) {
    console.error('[motherduck]', error.message)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
