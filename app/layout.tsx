// NOTE: This file is intentionally minimal.
// Next.js 14+ uses src/app/ as the primary app directory when both exist.
// The real layout is in src/app/layout.tsx
// Do NOT add imports here — this file should be a no-op.
export default function AppDirLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
