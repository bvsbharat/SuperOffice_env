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
import { ScenarioSelector } from './components/ScenarioSelector'
import { ViewToggle } from './components/ViewToggle'
import { PlaygroundView } from './components/PlaygroundView'
import { ThreeDView } from './components/ThreeDView'
import type { AgentId, ScenarioKey } from './types'
import { AGENT_ORDER } from './types'

export default function App() {
  useWebSocket()

  const agents = useStore(s => s.agents)
  const scenario = useStore(s => s.scenario)
  const episode = useStore(s => s.episode)
  const step = useStore(s => s.step)
  const phase = useStore(s => s.phase)
  const lastError = useStore(s => s.lastError)
  const setError = useStore(s => s.setError)
  const applyFullState = useStore(s => s.applyFullState)
  const viewMode = useStore(s => s.viewMode)
  const theme = useStore(s => s.theme)
  const toggleTheme = useStore(s => s.toggleTheme)
  const panelVisibility = useStore(s => s.panelVisibility)
  const togglePanel = useStore(s => s.togglePanel)

  const [showScenario, setShowScenario] = useState(false)
  const [rightTab, setRightTab] = useState<'dashboard' | 'agents'>('dashboard')
  const [bottomTab, setBottomTab] = useState<'log' | 'reward'>('log')

  // Load initial state on mount
  useEffect(() => {
    fetch('/api/state')
      .then(r => r.json())
      .then(applyFullState)
      .catch(() => {})
  }, [applyFullState])

  const handleScenarioSelect = async (s: ScenarioKey) => {
    try {
      const res = await fetch(`/api/scenario/${s}`, { method: 'POST' })
      if (res.ok) applyFullState(await res.json())
    } catch {}
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden select-none" style={{ background: 'var(--color-surface)' }}>
      {/* Header */}
      <header className="shrink-0 h-10 flex items-center px-4 gap-4" style={{ background: 'var(--color-panel)', borderBottom: '1px solid var(--color-border)', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
        <div className="flex items-center gap-2">
          <span className="text-base">🏢</span>
          <span className="text-xs font-bold tracking-wide" style={{ color: 'var(--color-text-primary)' }}>SUPEROFFICE GTM</span>
          <span className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--color-text-faint)' }}>RL Simulation</span>
        </div>

        <div className="w-px h-5" style={{ background: 'var(--color-border)' }} />

        <button
          onClick={() => setShowScenario(true)}
          className="text-[10px] px-2 py-0.5 rounded transition-colors"
          style={{ color: '#4f46e5', border: '1px solid #c7d2fe', background: theme === 'dark' ? '#312e81' : '#eef2ff' }}
        >
          {scenario.replace(/_/g, ' ')}
        </button>

        <ViewToggle />

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="text-sm leading-none px-1.5 py-0.5 rounded transition-colors"
          style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)' }}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? '\u{263D}' : '\u{2600}'}
        </button>

        <div className="flex items-center gap-3 ml-2 text-[10px] font-mono" style={{ color: 'var(--color-text-faint)' }}>
          <span>EP <span style={{ color: 'var(--color-text-secondary)' }}>{episode}</span></span>
          <span>STEP <span style={{ color: 'var(--color-text-secondary)' }}>{Math.min(step, 24)}/24</span></span>
          <span className="capitalize" style={{ color: 'var(--color-text-muted)' }}>{phase}</span>
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
      ) : (
        <>
          {/* Main Content */}
          <div className="flex-1 min-h-0 relative">
            {/* Office Map — always full width */}
            <div
              className="absolute inset-0 flex flex-col"
              style={{ background: 'var(--color-panel)' }}
            >
              <div className="flex-1 min-h-0 p-1">
                <OfficeMap />
              </div>
            </div>

            {/* Right sidebar toggle button — floats at right edge */}
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

            {/* Right sidebar — absolute overlay */}
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
                  {/* Tab bar */}
                  <div className="flex shrink-0" style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-panel)' }}>
                    <button
                      onClick={() => setRightTab('dashboard')}
                      className="text-[10px] px-4 py-2 font-semibold transition-colors"
                      style={{
                        color: rightTab === 'dashboard' ? 'var(--color-text-primary)' : 'var(--color-text-faint)',
                        borderBottom: rightTab === 'dashboard' ? '2px solid #6366f1' : '2px solid transparent',
                      }}
                    >
                      MARKET DASHBOARD
                    </button>
                    <button
                      onClick={() => setRightTab('agents')}
                      className="text-[10px] px-4 py-2 font-semibold transition-colors"
                      style={{
                        color: rightTab === 'agents' ? 'var(--color-text-primary)' : 'var(--color-text-faint)',
                        borderBottom: rightTab === 'agents' ? '2px solid #6366f1' : '2px solid transparent',
                      }}
                    >
                      AGENTS (8)
                    </button>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto p-2">
                    {rightTab === 'dashboard' ? (
                      <MarketDashboard />
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {AGENT_ORDER.map(aid => (
                          <AgentCard key={aid} agent={agents[aid as AgentId]} />
                        ))}
                      </div>
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

          {/* Bottom Bar collapse toggle */}
          <button
            onClick={() => togglePanel('bottomPanel')}
            className="shrink-0 flex items-center justify-center transition-colors"
            style={{
              height: 14,
              background: 'var(--color-panel)',
              borderTop: '1px solid var(--color-border)',
              color: 'var(--color-text-faint)',
              fontSize: 10,
              cursor: 'pointer',
            }}
          >
            {panelVisibility.bottomPanel ? '\u2304' : '\u2303'}
          </button>

          {/* Bottom Bar */}
          <AnimatePresence initial={false}>
            {panelVisibility.bottomPanel && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 220, opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="shrink-0 flex overflow-hidden"
                style={{ borderTop: '1px solid var(--color-border)' }}
              >
                {/* Conversation Log (60%) */}
                <div className="flex flex-col" style={{ width: '60%', borderRight: '1px solid var(--color-border)', background: 'var(--color-panel)' }}>
                  <div className="flex items-center" style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <button
                      onClick={() => setBottomTab('log')}
                      className="text-[10px] px-3 py-1.5 font-semibold transition-colors"
                      style={{
                        color: bottomTab === 'log' ? 'var(--color-text-primary)' : 'var(--color-text-faint)',
                        borderBottom: bottomTab === 'log' ? '2px solid #6366f1' : '2px solid transparent',
                      }}
                    >
                      CONVERSATION LOG
                    </button>
                  </div>
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <ConversationLog />
                  </div>
                </div>

                {/* Reward Panel (40%) */}
                <div className="flex flex-col" style={{ width: '40%', background: 'var(--color-surface)' }}>
                  <div className="text-[10px] px-3 py-1.5 font-semibold" style={{ color: 'var(--color-text-faint)', borderBottom: '1px solid var(--color-border)' }}>
                    REWARD PANEL
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    <RewardPanel />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* Scenario modal */}
      {showScenario && (
        <ScenarioSelector
          current={scenario}
          onSelect={handleScenarioSelect}
          onClose={() => setShowScenario(false)}
        />
      )}
    </div>
  )
}
