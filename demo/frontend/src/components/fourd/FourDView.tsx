import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Office3D from './Office3D'
import { TimelineScrubber } from './TimelineScrubber'
import { EpisodeControls } from '../EpisodeControls'
import { AgentCard } from '../AgentCard'
import { MarketDashboard } from '../MarketDashboard'
import { ConversationLog } from '../ConversationLog'
import { RewardPanel } from '../RewardPanel'
import { useEffectiveState } from '../../hooks/useEffectiveState'
import { useStore } from '../../store/useStore'
import { AGENT_ORDER, PHASE_COLORS } from '../../types'
import type { AgentId } from '../../types'
import { gtmAgentToFourdAgent } from '../../types/fourd'

const CONFETTI_COLORS = ['#6366f1', '#ec4899', '#22d3ee', '#fbbf24', '#34d399', '#f97316', '#a78bfa', '#f472b6']

interface Particle {
  x: number; y: number; vx: number; vy: number
  color: string; size: number; rotation: number
  rotationSpeed: number; opacity: number
}

function ConfettiOverlay({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particles = useRef<Particle[]>([])
  const animFrame = useRef<number>(0)
  const [visible, setVisible] = useState(false)

  const spawn = useCallback(() => {
    const ps: Particle[] = []
    for (let i = 0; i < 200; i++) {
      ps.push({
        x: Math.random() * window.innerWidth,
        y: -20 - Math.random() * 300,
        vx: (Math.random() - 0.5) * 5,
        vy: Math.random() * 4 + 2,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        size: Math.random() * 10 + 4,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.2,
        opacity: 1,
      })
    }
    particles.current = ps
  }, [])

  useEffect(() => {
    if (!active) return
    setVisible(true)
    spawn()

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      let alive = 0
      for (const p of particles.current) {
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.05
        p.rotation += p.rotationSpeed
        p.opacity -= 0.002
        if (p.opacity <= 0) continue
        alive++
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)
        ctx.globalAlpha = p.opacity
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
        ctx.restore()
      }
      if (alive > 0) {
        animFrame.current = requestAnimationFrame(animate)
      } else {
        setVisible(false)
      }
    }
    animFrame.current = requestAnimationFrame(animate)

    return () => cancelAnimationFrame(animFrame.current)
  }, [active, spawn])

  if (!visible) return null
  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, zIndex: 60, pointerEvents: 'none' }}
    />
  )
}

export function FourDView() {
  const state = useEffectiveState()
  const done = useStore(s => s.done)
  const panelVisibility = useStore(s => s.panelVisibility)
  const togglePanel = useStore(s => s.togglePanel)
  const leftOpen = panelVisibility.bottomPanel
  const rightOpen = panelVisibility.rightSidebar
  const [rightTab, setRightTab] = useState<'agents' | 'dashboard' | 'rewards'>('agents')
  const [showConfetti, setShowConfetti] = useState(false)
  const prevDone = useRef(false)

  useEffect(() => {
    if (done && !prevDone.current) {
      setShowConfetti(true)
      const timer = setTimeout(() => setShowConfetti(false), 100)
      return () => clearTimeout(timer)
    }
    prevDone.current = done
  }, [done])

  const fourdAgents = useMemo(() => {
    return AGENT_ORDER.map(id =>
      gtmAgentToFourdAgent(
        state.agents[id],
        state.reasoning,
        state.activeAgent === id,
      )
    )
  }, [state.agents, state.reasoning, state.activeAgent])

  const phaseColor = PHASE_COLORS[state.phase] || '#6b7280'

  return (
    <div className="flex-1 flex flex-col min-h-0 relative" style={{ background: 'var(--color-surface)' }}>
      {/* Confetti on episode completion */}
      <ConfettiOverlay active={showConfetti} />

      {/* Main area: 3D canvas + left/right sidebars */}
      <div className="flex-1 min-h-0 flex relative">
        {/* 3D Canvas */}
        <div className="flex-1 min-h-0 relative">
          <Office3D
            agents={fourdAgents}
            viewMode="3d"
            zoomLevel={1}
          />

          {/* Historical mode banner */}
          {state.isHistorical && (
            <div
              className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-bold tracking-wider"
              style={{
                background: 'rgba(234,179,8,0.2)',
                border: '1px solid rgba(234,179,8,0.5)',
                color: '#fbbf24',
              }}
            >
              VIEWING STEP {state.step} (HISTORICAL)
            </div>
          )}
        </div>

        {/* ── Left sidebar toggle ── */}
        <motion.button
          onClick={() => togglePanel('bottomPanel')}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="absolute top-2 z-30 flex items-center justify-center"
          style={{
            left: leftOpen ? 340 : 0,
            width: 20,
            height: 36,
            background: 'var(--color-panel)',
            border: '1px solid var(--color-border)',
            borderLeft: leftOpen ? 'none' : '1px solid var(--color-border)',
            borderRadius: '0 4px 4px 0',
            color: 'var(--color-text-faint)',
            cursor: 'pointer',
            transition: 'left 0.3s ease-in-out',
          }}
        >
          {leftOpen ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
        </motion.button>

        {/* ── Left sidebar — Conversation Log ── */}
        <AnimatePresence initial={false}>
          {leftOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 340, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="absolute left-0 top-0 bottom-0 z-20 flex flex-col overflow-hidden"
              style={{ borderRight: '1px solid var(--color-border)', background: 'var(--color-panel)' }}
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

        {/* ── Right sidebar toggle ── */}
        <motion.button
          onClick={() => togglePanel('rightSidebar')}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="absolute top-2 z-30 flex items-center justify-center"
          style={{
            right: rightOpen ? 384 : 0,
            width: 20,
            height: 36,
            background: 'var(--color-panel)',
            border: '1px solid var(--color-border)',
            borderRight: rightOpen ? 'none' : '1px solid var(--color-border)',
            borderRadius: '4px 0 0 4px',
            color: 'var(--color-text-faint)',
            cursor: 'pointer',
            transition: 'right 0.3s ease-in-out',
          }}
        >
          {rightOpen ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </motion.button>

        {/* ── Right sidebar — Agents / KPIs / Rewards ── */}
        <AnimatePresence initial={false}>
          {rightOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 384, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="absolute right-0 top-0 bottom-0 z-20 flex flex-col overflow-hidden"
              style={{ borderLeft: '1px solid var(--color-border)', background: 'var(--color-panel)' }}
            >
              <div className="flex shrink-0 relative" style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-panel)' }}>
                {([['agents', 'AGENTS'], ['dashboard', 'KPIs'], ['rewards', 'REWARDS']] as const).map(([tab, label]) => (
                  <button
                    key={tab}
                    onClick={() => setRightTab(tab)}
                    className="flex-1 text-[10px] px-3 py-2 font-semibold transition-colors relative"
                    style={{
                      color: rightTab === tab ? 'var(--color-text-primary)' : 'var(--color-text-faint)',
                    }}
                  >
                    {label}
                    {rightTab === tab && (
                      <motion.div
                        layoutId="fourdRightTabIndicator"
                        className="absolute bottom-0 left-0 right-0"
                        style={{ height: 2, background: '#6366f1' }}
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                      />
                    )}
                  </button>
                ))}
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-2">
                {rightTab === 'agents' ? (
                  <div className="grid grid-cols-1 gap-2">
                    {AGENT_ORDER.map(aid => (
                      <AgentCard key={aid} agent={state.agents[aid as AgentId]} compact />
                    ))}
                  </div>
                ) : rightTab === 'dashboard' ? (
                  <MarketDashboard />
                ) : (
                  <RewardPanel />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Timeline Scrubber — above sidebars */}
      <div className="relative" style={{ zIndex: 30 }}>
        <TimelineScrubber />
      </div>

      {/* Info Bar — above sidebars */}
      <div
        className="shrink-0 flex items-center gap-3 px-3 py-1.5 relative"
        style={{
          background: 'var(--color-panel)',
          borderTop: '1px solid var(--color-border)',
          zIndex: 30,
        }}
      >
        {/* Phase badge */}
        <span
          className="text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider shrink-0"
          style={{ background: `${phaseColor}30`, color: phaseColor, border: `1px solid ${phaseColor}50` }}
        >
          {state.phase}
        </span>

        {/* Active agent */}
        {state.activeAgent && (
          <span className="text-[10px] font-semibold shrink-0" style={{ color: 'var(--color-text-primary)' }}>
            {state.agents[state.activeAgent]?.emoji} {state.agents[state.activeAgent]?.name}
          </span>
        )}

        {/* Action */}
        {state.action && (
          <span className="text-[10px] truncate" style={{ color: 'var(--color-text-secondary)' }}>
            {state.action}{state.target ? ` -> ${state.target}` : ''}
          </span>
        )}

        {/* Reasoning */}
        {state.reasoning && (
          <span className="text-[10px] truncate italic" style={{ color: 'var(--color-text-muted)' }}>
            {state.reasoning}
          </span>
        )}

        {/* Rewards */}
        <div className="ml-auto flex items-center gap-3 shrink-0">
          <span className="text-[9px] font-mono" style={{ color: state.globalReward >= 0 ? '#a6e22e' : '#f92672' }}>
            R: {state.globalReward.toFixed(2)}
          </span>
          <span className="text-[9px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
            Day {state.day}
          </span>
        </div>
      </div>

      {/* Episode Controls Bar — full width */}
      <div
        className="shrink-0 h-10 relative"
        style={{
          background: 'var(--color-panel)',
          borderTop: '1px solid var(--color-border)',
          zIndex: 30,
        }}
      >
        <EpisodeControls />
      </div>
    </div>
  )
}
