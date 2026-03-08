import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useWebSocket } from './hooks/useWebSocket'
import { useStore } from './store/useStore'
import { OfficeMap } from './components/OfficeMap'
import { AgentCard } from './components/AgentCard'
import { MarketDashboard } from './components/MarketDashboard'
import { ConversationLog } from './components/ConversationLog'
import { RewardPanel } from './components/RewardPanel'
import { TimelineView } from './components/TimelineView'
import { EpisodeControls } from './components/EpisodeControls'
import { ViewToggle } from './components/ViewToggle'
import { ModelSelector } from './components/ModelSelector'
import { PlaygroundView } from './components/PlaygroundView'
import { FourDView } from './components/fourd/FourDView'
import { BenchmarkPanel } from './components/BenchmarkPanel'
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
  const benchmarkRuns = useStore(s => s.benchmarkRuns)
  const toggleBenchmarkPanel = useStore(s => s.toggleBenchmarkPanel)

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
      <header className="shrink-0 h-10 flex items-center px-4 gap-4" style={{ background: 'var(--color-panel)', borderBottom: '1px solid var(--color-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.4)', backdropFilter: 'blur(18px) saturate(160%)', WebkitBackdropFilter: 'blur(18px) saturate(160%)' }}>
        <div className="flex items-center gap-2.5">
          {/* O2 Logo mark */}
          <div style={{
            width: 30, height: 30, borderRadius: 8, flexShrink: 0,
            background: '#ffffff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 1px 6px rgba(0,0,0,0.3)',
            position: 'relative',
          }}>
            <span style={{
              fontSize: 15, fontWeight: 800, color: '#000',
              letterSpacing: '-1px', lineHeight: 1,
              fontFamily: '"Inter", "SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif',
            }}>O</span>
            <span style={{
              position: 'absolute', bottom: 3, right: 4,
              fontSize: 8, fontWeight: 700, color: '#000', lineHeight: 1,
              fontFamily: '"Inter", "SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif',
            }}>2</span>
          </div>
          <div className="flex flex-col" style={{ gap: 0 }}>
            <span style={{
              fontSize: 13, fontWeight: 700, letterSpacing: '-0.3px',
              color: 'var(--color-text-primary)', lineHeight: 1.1,
              fontFamily: '"Inter", "SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif',
            }}>
              OpenOffice
            </span>
            <span style={{
              fontSize: 8, letterSpacing: '0.06em', color: 'var(--color-text-faint)',
              textTransform: 'uppercase', lineHeight: 1.2,
              fontFamily: '"Inter", "SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif',
            }}>
              RL Simulation
            </span>
          </div>
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

        <div className="ml-auto flex items-center gap-2">
          {lastError && (
            <>
              <span className="text-[9px]" style={{ color: '#ef4444' }}>{lastError}</span>
              <button onClick={() => setError(null)} style={{ color: '#f87171' }}>x</button>
            </>
          )}

          {/* Leaderboard button */}
          <button
            onClick={toggleBenchmarkPanel}
            className="relative flex items-center gap-1.5 px-2 py-1 rounded transition-colors"
            style={{
              background: 'var(--color-card-bg)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-secondary)',
            }}
            title="Model Leaderboard"
          >
            <span className="text-sm leading-none">🏆</span>
            <span className="text-[9px] font-semibold uppercase tracking-wide">Leaderboard</span>
            {benchmarkRuns.length > 0 && (
              <span
                className="absolute -top-1 -right-1 min-w-[14px] h-3.5 flex items-center justify-center rounded-full text-[8px] font-bold px-0.5"
                style={{ background: '#6366f1', color: '#fff' }}
              >
                {benchmarkRuns.length}
              </span>
            )}
          </button>
        </div>
      </header>

      <BenchmarkPanel />

      {/* ── Shared main area: all views + overlaid sidebars ── */}
      <div className="flex-1 min-h-0 relative flex flex-col overflow-hidden">

        {/* View content */}
        {viewMode === 'playground' ? (
          <PlaygroundView />
        ) : viewMode === '4d' ? (
          <FourDView />
        ) : (
          <>
            {/* Office Map */}
            <div className="flex-1 min-h-0" style={{ background: 'var(--color-panel)' }}>
              <OfficeMap />
            </div>
            {/* Controls Bar */}
            <div className="shrink-0 h-12 flex" style={{ borderTop: '1px solid var(--color-border)', background: '#000000', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
              <div className="flex-1" style={{ borderRight: '1px solid var(--color-border)' }}>
                <TimelineView />
              </div>
              <div className="flex-1">
                <EpisodeControls />
              </div>
            </div>
          </>
        )}

        {/* ── Left sidebar toggle ── */}
        <button
          onClick={() => togglePanel('bottomPanel')}
          className="absolute top-2 z-30 flex items-center justify-center"
          style={{
            left: panelVisibility.bottomPanel ? 340 : 0,
            width: 20,
            height: 36,
            background: '#000000',
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

        {/* ── Left sidebar — Conversation Log ── */}
        <AnimatePresence initial={false}>
          {panelVisibility.bottomPanel && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 340, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="absolute left-0 top-0 z-20 flex flex-col overflow-hidden"
              style={{ bottom: 48, borderRight: '1px solid var(--color-border)', background: '#000000' }}
            >
              <div className="shrink-0 flex items-center px-3 py-2" style={{ borderBottom: '1px solid var(--color-border)', background: '#000000' }}>
                <span className="text-[10px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>CONVERSATION LOG</span>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <ConversationLog />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Right sidebar toggle ── */}
        <button
          onClick={() => togglePanel('rightSidebar')}
          className="absolute top-2 z-30 flex items-center justify-center"
          style={{
            right: panelVisibility.rightSidebar ? 384 : 0,
            width: 20,
            height: 36,
            background: '#000000',
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

        {/* ── Right sidebar — Dashboard / Agents / Rewards ── */}
        <AnimatePresence initial={false}>
          {panelVisibility.rightSidebar && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 384, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="absolute right-0 top-0 z-20 flex flex-col overflow-hidden"
              style={{ bottom: 48, borderLeft: '1px solid var(--color-border)', background: '#000000' }}
            >
              <div className="flex shrink-0" style={{ borderBottom: '1px solid var(--color-border)', background: '#000000' }}>
                {(['dashboard', 'agents', 'rewards'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setRightTab(tab)}
                    className="text-[10px] px-4 py-2 font-semibold transition-colors"
                    style={{
                      color: rightTab === tab ? 'var(--color-text-primary)' : 'var(--color-text-faint)',
                      borderBottom: rightTab === tab ? '2px solid #6366f1' : '2px solid transparent',
                    }}
                  >
                    {tab.toUpperCase()}
                  </button>
                ))}
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
    </div>
  )
}
