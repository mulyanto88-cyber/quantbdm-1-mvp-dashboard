import { Pool } from 'pg'

const pool = new Pool({
  host: 'pg.us-east-1-aws.motherduck.com',
  port: 5432,
  user: 'postgres',
  password: process.env.MOTHERDUCK_TOKEN,
  database: 'md:',
  ssl: { rejectUnauthorized: true },
  max: 8,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
})

export async function run(query: string, params: any[] = []): Promise<any[]> {
  const client = await pool.connect()
  try {
    const result = await client.query(query, params)
    return result.rows
  } finally {
    client.release()
  }
}
