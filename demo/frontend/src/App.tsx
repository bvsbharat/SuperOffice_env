import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useWebSocket } from './hooks/useWebSocket'
import { useStore } from './store/useStore'
import { OfficeMap } from './components/OfficeMap'
import { AgentCard } from './components/AgentCard'
import { MarketDashboard } from './components/MarketDashboard'
import { ConversationLog } from './components/ConversationLog'
import { TimelineView } from './components/TimelineView'
import { EpisodeControls } from './components/EpisodeControls'
import { RewardPanel } from './components/RewardPanel'
import { ViewToggle } from './components/ViewToggle'
import { PlaygroundView } from './components/PlaygroundView'
import { ThreeDView } from './components/ThreeDView'
import { FourDView } from './components/fourd/FourDView'
import type { AgentId } from './types'
import { AGENT_ORDER, PHASE_COLORS } from './types'

const PHASE_LABELS: Record<string, string> = {
  morning_standup: 'Standup',
  execution: 'Execution',
  review: 'Review',
  planning: 'Planning',
  done: 'Done',
}

export default function App() {
  useWebSocket()

  const agents = useStore(s => s.agents)
  const episode = useStore(s => s.episode)
  const day = useStore(s => s.day)
  const turn = useStore(s => s.turn)
  const phase = useStore(s => s.phase)
  const maxDays = useStore(s => s.maxDays)
  const lastError = useStore(s => s.lastError)
  const setError = useStore(s => s.setError)
  const applyFullState = useStore(s => s.applyFullState)
  const viewMode = useStore(s => s.viewMode)
  const theme = useStore(s => s.theme)
  const toggleTheme = useStore(s => s.toggleTheme)
  const panelVisibility = useStore(s => s.panelVisibility)
  const togglePanel = useStore(s => s.togglePanel)

  const [rightTab, setRightTab] = useState<'dashboard' | 'agents' | 'rewards'>('dashboard')

  // Load initial state on mount
  useEffect(() => {
    fetch('/api/state')
      .then(r => r.json())
      .then(applyFullState)
      .catch(() => {})
  }, [applyFullState])

  return (
    <div className="h-screen flex flex-col overflow-hidden select-none" style={{ background: 'var(--color-surface)' }}>
      {/* Header */}
      <header className="shrink-0 h-10 flex items-center px-4 gap-4" style={{ background: 'var(--color-panel)', borderBottom: '1px solid var(--color-border)', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
        <div className="flex items-center gap-2">
          <span className="text-base">{'\uD83C\uDFE2'}</span>
          <span className="text-xs font-bold tracking-wide" style={{ color: 'var(--color-text-primary)' }}>SUPEROFFICE GTM</span>
          <span className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--color-text-faint)' }}>RL Simulation</span>
        </div>

        <div className="w-px h-5" style={{ background: 'var(--color-border)' }} />

        <ViewToggle />

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="text-sm leading-none px-1.5 py-0.5 rounded transition-colors"
          style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)' }}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? '\u263D' : '\u2600'}
        </button>

        <div className="flex items-center gap-3 ml-2 text-[10px] font-mono" style={{ color: 'var(--color-text-faint)' }}>
          <span>Day <span style={{ color: 'var(--color-text-secondary)' }}>{day}/{maxDays}</span></span>
          <span
            className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase"
            style={{
              background: `${PHASE_COLORS[phase] ?? '#6b7280'}18`,
              color: PHASE_COLORS[phase] ?? '#6b7280',
            }}
          >
            {PHASE_LABELS[phase] ?? phase}
          </span>
          <span>Turn <span style={{ color: 'var(--color-text-secondary)' }}>{turn}</span></span>
        </div>

        {lastError && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[9px]" style={{ color: '#ef4444' }}>{lastError}</span>
            <button onClick={() => setError(null)} style={{ color: '#f87171' }}>x</button>
          </div>
        )}
      </header>

      {viewMode === 'playground' ? (
        <PlaygroundView />
      ) : viewMode === '3d' ? (
        <ThreeDView />
      ) : viewMode === '4d' ? (
        <FourDView />
      ) : (
        <>
          {/* Main Content */}
          <div className="flex-1 min-h-0 relative">
            {/* Office Map */}
            <div
              className="absolute inset-0 flex flex-col"
              style={{ background: 'var(--color-panel)' }}
            >
              <div className="flex-1 min-h-0">
                <OfficeMap />
              </div>
            </div>

            {/* Left sidebar toggle */}
            <button
              onClick={() => togglePanel('bottomPanel')}
              className="absolute top-2 z-20 flex items-center justify-center transition-colors"
              style={{
                left: panelVisibility.bottomPanel ? 340 : 0,
                width: 20,
                height: 36,
                background: 'var(--color-panel)',
                border: '1px solid var(--color-border)',
                borderLeft: panelVisibility.bottomPanel ? 'none' : '1px solid var(--color-border)',
                borderRadius: '0 4px 4px 0',
                color: 'var(--color-text-faint)',
                fontSize: 10,
                cursor: 'pointer',
                transition: 'left 0.3s ease-in-out',
              }}
            >
              {panelVisibility.bottomPanel ? '\u2039' : '\u203A'}
            </button>

            {/* Left sidebar — Conversation Log */}
            <AnimatePresence initial={false}>
              {panelVisibility.bottomPanel && (
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 340, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                  className="absolute left-0 top-0 bottom-0 z-10 flex flex-col overflow-hidden frosted-glass"
                  style={{ borderRight: '1px solid var(--color-border)' }}
                >
                  <div className="shrink-0 flex items-center px-3 py-2" style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-panel)' }}>
                    <span className="text-[10px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>CONVERSATION LOG</span>
                  </div>
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <ConversationLog />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Right sidebar toggle */}
            <button
              onClick={() => togglePanel('rightSidebar')}
              className="absolute top-2 z-20 flex items-center justify-center transition-colors"
              style={{
                right: panelVisibility.rightSidebar ? 384 : 0,
                width: 20,
                height: 36,
                background: 'var(--color-panel)',
                border: '1px solid var(--color-border)',
                borderRight: panelVisibility.rightSidebar ? 'none' : '1px solid var(--color-border)',
                borderRadius: '4px 0 0 4px',
                color: 'var(--color-text-faint)',
                fontSize: 10,
                cursor: 'pointer',
                transition: 'right 0.3s ease-in-out',
              }}
            >
              {panelVisibility.rightSidebar ? '\u203A' : '\u2039'}
            </button>

            {/* Right sidebar — Dashboard / Agents / Rewards */}
            <AnimatePresence initial={false}>
              {panelVisibility.rightSidebar && (
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 380, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                  className="absolute right-0 top-0 bottom-0 z-10 flex flex-col overflow-hidden frosted-glass"
                  style={{ borderLeft: '1px solid var(--color-border)' }}
                >
                  <div className="flex shrink-0" style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-panel)' }}>
                    <button
                      onClick={() => setRightTab('dashboard')}
                      className="text-[10px] px-4 py-2 font-semibold transition-colors"
                      style={{
                        color: rightTab === 'dashboard' ? 'var(--color-text-primary)' : 'var(--color-text-faint)',
                        borderBottom: rightTab === 'dashboard' ? '2px solid #6366f1' : '2px solid transparent',
                      }}
                    >
                      DASHBOARD
                    </button>
                    <button
                      onClick={() => setRightTab('agents')}
                      className="text-[10px] px-4 py-2 font-semibold transition-colors"
                      style={{
                        color: rightTab === 'agents' ? 'var(--color-text-primary)' : 'var(--color-text-faint)',
                        borderBottom: rightTab === 'agents' ? '2px solid #6366f1' : '2px solid transparent',
                      }}
                    >
                      AGENTS
                    </button>
                    <button
                      onClick={() => setRightTab('rewards')}
                      className="text-[10px] px-4 py-2 font-semibold transition-colors"
                      style={{
                        color: rightTab === 'rewards' ? 'var(--color-text-primary)' : 'var(--color-text-faint)',
                        borderBottom: rightTab === 'rewards' ? '2px solid #6366f1' : '2px solid transparent',
                      }}
                    >
                      REWARDS
                    </button>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto p-2">
                    {rightTab === 'dashboard' ? (
                      <MarketDashboard />
                    ) : rightTab === 'agents' ? (
                      <div className="grid grid-cols-2 gap-2">
                        {AGENT_ORDER.map(aid => (
                          <AgentCard key={aid} agent={agents[aid as AgentId]} />
                        ))}
                      </div>
                    ) : (
                      <RewardPanel />
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Controls Bar */}
          <div className="shrink-0 h-12 flex" style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-panel)' }}>
            <div className="flex-1" style={{ borderRight: '1px solid var(--color-border)' }}>
              <TimelineView />
            </div>
            <div className="flex-1">
              <EpisodeControls />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
