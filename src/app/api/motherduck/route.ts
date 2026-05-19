import { NextRequest, NextResponse } from 'next/server'
import { run } from '@/lib/db'

export async function GET() {
  return NextResponse.json({ status: 'ok' })
}

export async function POST(req: NextRequest) {
  try {
    const { query, params } = await req.json()
    if (!query) {
      return NextResponse.json({ error: 'Query diperlukan' }, { status: 400 })
    }
    const data = await run(query, params || [])
    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('[motherduck]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
