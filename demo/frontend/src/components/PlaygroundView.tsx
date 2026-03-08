import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store/useStore'
import { OfficeMap } from './OfficeMap'
import { MarketDashboard } from './MarketDashboard'
import { AgentCard } from './AgentCard'
import { ConversationLog } from './ConversationLog'
import { RewardPanel } from './RewardPanel'
import { TimelineView } from './TimelineView'
import { EpisodeControls } from './EpisodeControls'
import type { AgentId } from '../types'
import { AGENT_ORDER } from '../types'

export function PlaygroundView() {
  const agents = useStore(s => s.agents)
  const panelVisibility = useStore(s => s.panelVisibility)
  const togglePanel = useStore(s => s.togglePanel)

  const [rightTab, setRightTab] = useState<'dashboard' | 'agents'>('dashboard')
  const [bottomTab, setBottomTab] = useState<'log' | 'reward'>('log')

  return (
    <div className="flex-1 relative min-h-0 overflow-hidden">
      {/* Full-screen map */}
      <div className="absolute inset-0" style={{ background: 'var(--color-panel)' }}>
        <OfficeMap />
      </div>

      {/* Floating controls bar at bottom */}
      <div
        className="absolute left-4 right-4 frosted-glass flex rounded-xl overflow-hidden"
        style={{
          bottom: panelVisibility.bottomPanel ? 244 : 16,
          height: 48,
          border: '1px solid var(--color-border-alpha)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
          transition: 'bottom 0.3s ease-in-out',
          zIndex: 20,
        }}
      >
        <div className="flex-1" style={{ borderRight: '1px solid var(--color-border-alpha)' }}>
          <TimelineView />
        </div>
        <div className="flex-1">
          <EpisodeControls />
        </div>
      </div>

      {/* Right sidebar toggle */}
      <button
        onClick={() => togglePanel('rightSidebar')}
        className="absolute frosted-glass flex items-center justify-center rounded-l-lg"
        style={{
          right: panelVisibility.rightSidebar ? 380 : 0,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 24,
          height: 48,
          border: '1px solid var(--color-border-alpha)',
          borderRight: '0',
          zIndex: 30,
          cursor: 'pointer',
          color: 'var(--color-text-muted)',
          fontSize: 12,
          transition: 'right 0.3s ease-in-out',
        }}
      >
        {panelVisibility.rightSidebar ? '\u203A' : '\u2039'}
      </button>

      {/* Right sidebar overlay */}
      <AnimatePresence>
        {panelVisibility.rightSidebar && (
          <motion.div
            initial={{ x: 380 }}
            animate={{ x: 0 }}
            exit={{ x: 380 }}
            transition={{ type: 'spring', damping: 26, stiffness: 260 }}
            className="absolute top-0 right-0 bottom-0 frosted-glass flex flex-col"
            style={{
              width: 380,
              borderLeft: '1px solid var(--color-border-alpha)',
              boxShadow: '-4px 0 20px rgba(0,0,0,0.06)',
              zIndex: 25,
            }}
          >
            {/* Tab bar */}
            <div className="flex shrink-0" style={{ borderBottom: '1px solid var(--color-border-alpha)' }}>
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

      {/* Bottom panel toggle */}
      <button
        onClick={() => togglePanel('bottomPanel')}
        className="absolute frosted-glass flex items-center justify-center rounded-t-lg"
        style={{
          bottom: panelVisibility.bottomPanel ? 220 : 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 48,
          height: 20,
          border: '1px solid var(--color-border-alpha)',
          borderBottom: 'none',
          zIndex: 30,
          cursor: 'pointer',
          color: 'var(--color-text-muted)',
          fontSize: 10,
          transition: 'bottom 0.3s ease-in-out',
        }}
      >
        {panelVisibility.bottomPanel ? '\u2304' : '\u2303'}
      </button>

      {/* Bottom panel overlay */}
      <AnimatePresence>
        {panelVisibility.bottomPanel && (
          <motion.div
            initial={{ y: 220 }}
            animate={{ y: 0 }}
            exit={{ y: 220 }}
            transition={{ type: 'spring', damping: 26, stiffness: 260 }}
            className="absolute left-0 right-0 bottom-0 frosted-glass flex"
            style={{
              height: 220,
              borderTop: '1px solid var(--color-border-alpha)',
              boxShadow: '0 -4px 20px rgba(0,0,0,0.06)',
              zIndex: 20,
            }}
          >
            {/* Conversation Log (60%) */}
            <div className="flex flex-col" style={{ width: '60%', borderRight: '1px solid var(--color-border-alpha)' }}>
              <div className="flex items-center" style={{ borderBottom: '1px solid var(--color-border-alpha)' }}>
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
                <button
                  onClick={() => setBottomTab('reward')}
                  className="text-[10px] px-3 py-1.5 font-semibold transition-colors"
                  style={{
                    color: bottomTab === 'reward' ? 'var(--color-text-primary)' : 'var(--color-text-faint)',
                    borderBottom: bottomTab === 'reward' ? '2px solid #6366f1' : '2px solid transparent',
                  }}
                >
                  REWARDS
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                {bottomTab === 'log' ? <ConversationLog /> : <RewardPanel />}
              </div>
            </div>

            {/* Reward Panel (40%) */}
            <div className="flex flex-col" style={{ width: '40%' }}>
              <div className="text-[10px] px-3 py-1.5 font-semibold" style={{ color: 'var(--color-text-faint)', borderBottom: '1px solid var(--color-border-alpha)' }}>
                REWARD PANEL
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                <RewardPanel />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
