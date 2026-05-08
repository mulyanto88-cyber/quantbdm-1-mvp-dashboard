import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
  db: {
    schema: 'public',
  },
})

// Helper types untuk response RPC
export interface SmartMoneyStock {
  stock_code: string
  sector: string
  current_price: number
  price_chg_pct: number
  smart_money_score: number
  conviction_score: number
  is_stealth: boolean
  net_foreign_30d: number
  broker_net_change: number
  whale_signal: boolean
  big_player_anomaly: boolean
  signal: 'STRONG_BUY' | 'WATCH' | 'NEUTRAL' | 'AVOID'
}

export interface InsiderAlert {
  report_date: string
  share_code: string
  investor_name: string
  investor_type: string
  nationality: string
  prev_percentage: number
  curr_percentage: number
  pct_point_change: number
  share_change: number
  action: 'BUYING' | 'SELLING' | 'HOLDING'
  alert_level: 'HIGH' | 'MEDIUM' | 'LOW'
}

export interface WhalePosition {
  investor_name: string
  investor_type: string
  local_foreign: string
  first_seen_date: string
  latest_date: string
  first_percentage: number
  latest_percentage: number
  latest_shares: number
  est_entry_price: number
  current_price: number
  return_since_entry: number
  holding_days: number
  position_trend: 'INCREASING' | 'DECREASING' | 'STABLE'
  whale_verdict: string
}
