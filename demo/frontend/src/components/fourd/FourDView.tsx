import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Office3D from './Office3D'
import { TimelineScrubber } from './TimelineScrubber'
import { EpisodeControls } from '../EpisodeControls'
import { AgentCard } from '../AgentCard'
import { MarketDashboard } from '../MarketDashboard'
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
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarTab, setSidebarTab] = useState<'agents' | 'dashboard'>('agents')
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

      {/* Main area: 3D canvas + optional sidebar */}
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

          {/* Sidebar toggle */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="absolute top-2 right-2 z-20 text-[10px] font-bold px-2 py-1 rounded transition-colors"
            style={{
              background: 'var(--color-card-bg)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-secondary)',
              backdropFilter: 'blur(8px)',
            }}
          >
            {sidebarOpen ? 'CLOSE' : 'PANEL'}
          </button>
        </div>

        {/* Side Panel */}
        <AnimatePresence initial={false}>
          {sidebarOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="shrink-0 flex flex-col overflow-hidden"
              style={{
                background: 'var(--color-surface)',
                backdropFilter: 'blur(16px)',
                borderLeft: '1px solid var(--color-border)',
              }}
            >
              {/* Tabs */}
              <div className="flex shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
                <button
                  onClick={() => setSidebarTab('agents')}
                  className="flex-1 text-[10px] px-3 py-2 font-semibold transition-colors"
                  style={{
                    color: sidebarTab === 'agents' ? 'var(--color-text-primary)' : 'var(--color-text-faint)',
                    borderBottom: sidebarTab === 'agents' ? '2px solid #6366f1' : '2px solid transparent',
                  }}
                >
                  AGENTS
                </button>
                <button
                  onClick={() => setSidebarTab('dashboard')}
                  className="flex-1 text-[10px] px-3 py-2 font-semibold transition-colors"
                  style={{
                    color: sidebarTab === 'dashboard' ? 'var(--color-text-primary)' : 'var(--color-text-faint)',
                    borderBottom: sidebarTab === 'dashboard' ? '2px solid #6366f1' : '2px solid transparent',
                  }}
                >
                  KPIs
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-2">
                {sidebarTab === 'agents' ? (
                  <div className="grid grid-cols-1 gap-2">
                    {AGENT_ORDER.map(aid => (
                      <AgentCard key={aid} agent={state.agents[aid as AgentId]} compact />
                    ))}
                  </div>
                ) : (
                  <MarketDashboard />
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

      {/* Info Bar + Episode Controls — above sidebars */}
      <div
        className="shrink-0 flex items-center relative"
        style={{
          background: 'var(--color-panel)',
          borderTop: '1px solid var(--color-border)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          zIndex: 30,
        }}
      >
        {/* Info */}
        <div className="flex-1 flex items-center gap-3 px-3 py-1.5 min-w-0">
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

        {/* Divider */}
        <div className="w-px h-8" style={{ background: 'var(--color-border)' }} />

        {/* Episode Controls */}
        <div className="shrink-0" style={{ width: 420 }}>
          <EpisodeControls />
        </div>
      </div>
    </div>
  )
}
