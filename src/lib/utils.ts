import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Format Rupiah
export function formatRupiah(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000_000) {
    return `${(value / 1_000_000_000_000).toFixed(1)}T`
  }
  if (abs >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}M`
  }
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}Jt`
  }
  return value.toLocaleString('id-ID')
}

// Format percentage
export function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

// Format number with commas
export function formatNumber(value: number): string {
  return value.toLocaleString('id-ID')
}

// Format shares
export function formatShares(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}M`
  }
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}Jt`
  }
  return value.toLocaleString('id-ID')
}

// Get signal color
export function getSignalColor(signal: string): string {
  switch (signal) {
    case 'STRONG_BUY':
      return 'bg-emerald-500'
    case 'WATCH':
      return 'bg-amber-500'
    case 'NEUTRAL':
      return 'bg-slate-500'
    case 'AVOID':
      return 'bg-red-500'
    default:
      return 'bg-slate-500'
  }
}

export function getSignalTextColor(signal: string): string {
  switch (signal) {
    case 'STRONG_BUY':
      return 'text-emerald-400'
    case 'WATCH':
      return 'text-amber-400'
    case 'NEUTRAL':
      return 'text-slate-400'
    case 'AVOID':
      return 'text-red-400'
    default:
      return 'text-slate-400'
  }
}

// Get alert level color
export function getAlertColor(level: string): string {
  switch (level) {
    case 'HIGH':
      return 'bg-red-500'
    case 'MEDIUM':
      return 'bg-amber-500'
    case 'LOW':
      return 'bg-blue-500'
    default:
      return 'bg-slate-500'
  }
}
