'use client'

import { useState } from 'react'
import FlowContent from './_components/FlowContent'
import Ksei1Page from '../ksei1/page'
import PlayersPage from '../players/page'
import OwnershipPage from '../ownership/page'

type TabId = 'flow5' | 'ksei1' | 'players' | 'portfolio'

export default function FlowCommandCenter() {
  const [activeTab, setActiveTab] = useState<TabId>('flow5')

  return (
    <div className="animate-fade-in min-h-screen">
      {/* ── Top Level Command Center Navigation ── */}
      <div className="sticky top-16 z-40 mb-6 bg-background/95 backdrop-blur-xl pt-4 pb-2 border-b border-border/30 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gold-400/10 border border-gold-400/20 flex items-center justify-center flex-shrink-0 shadow-[0_0_15px_rgba(231,183,51,0.15)]">
              <span className="text-2xl">🐋</span>
            </div>
            <div>
              <h1 className="text-2xl font-black text-white leading-none tracking-tight">Whale &amp; KSEI Intelligence</h1>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold-400 mt-1.5">Institutional Flow Command Center</p>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {[
              { id: 'flow5', label: '5% Flow Mutation', icon: '🔥' },
              { id: 'ksei1', label: '1% Ownership Tracker', icon: '🏛️' },
              { id: 'players', label: 'Big Player Radar', icon: '🎯' },
              { id: 'portfolio', label: 'Whale Portfolio', icon: '💼' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabId)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-gradient-to-r from-gold-400 via-yellow-500 to-gold-400 text-navy-900 shadow-lg shadow-gold-400/20 scale-[1.02]'
                    : 'bg-white/[0.02] border border-white/5 text-muted-foreground hover:text-white hover:bg-white/[0.05] hover:border-white/10'
                }`}
              >
                <span className={activeTab === tab.id ? 'animate-pulse' : ''}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content Area ── */}
      <div className="mt-2">
        {activeTab === 'flow5' && <FlowContent />}
        {activeTab === 'ksei1' && <div className="mt-[-24px]"><Ksei1Page /></div>}
        {activeTab === 'players' && <div className="mt-[-24px]"><PlayersPage /></div>}
        {activeTab === 'portfolio' && <div className="mt-[-24px]"><OwnershipPage /></div>}
      </div>
    </div>
  )
}
