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
        state.handoffTo,
        state.reasoning,
        state.activeAgent === id,
      )
    )
  }, [state.agents, state.handoffTo, state.reasoning, state.activeAgent])

  const phaseColor = PHASE_COLORS[state.phase] || '#6b7280'

  return (
    <div className="flex-1 flex flex-col min-h-0 relative" style={{ background: '#0f172a' }}>
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
              background: 'rgba(15,23,42,0.8)',
              border: '1px solid rgba(99,102,241,0.4)',
              color: '#c7d2fe',
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
                background: 'rgba(15,23,42,0.95)',
                backdropFilter: 'blur(12px)',
                borderLeft: '1px solid rgba(99,102,241,0.3)',
              }}
            >
              {/* Tabs */}
              <div className="flex shrink-0" style={{ borderBottom: '1px solid rgba(99,102,241,0.2)' }}>
                <button
                  onClick={() => setSidebarTab('agents')}
                  className="flex-1 text-[10px] px-3 py-2 font-semibold transition-colors"
                  style={{
                    color: sidebarTab === 'agents' ? '#e2e8f0' : '#64748b',
                    borderBottom: sidebarTab === 'agents' ? '2px solid #6366f1' : '2px solid transparent',
                  }}
                >
                  AGENTS
                </button>
                <button
                  onClick={() => setSidebarTab('dashboard')}
                  className="flex-1 text-[10px] px-3 py-2 font-semibold transition-colors"
                  style={{
                    color: sidebarTab === 'dashboard' ? '#e2e8f0' : '#64748b',
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

      {/* Timeline Scrubber */}
      <TimelineScrubber />

      {/* Info Bar + Episode Controls */}
      <div
        className="shrink-0 flex items-center"
        style={{
          background: 'rgba(15,23,42,0.95)',
          borderTop: '1px solid rgba(51,65,85,0.6)',
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
            <span className="text-[10px] font-semibold shrink-0" style={{ color: '#c7d2fe' }}>
              {state.agents[state.activeAgent]?.emoji} {state.agents[state.activeAgent]?.name}
            </span>
          )}

          {/* Task */}
          {state.task && (
            <span className="text-[10px] truncate" style={{ color: '#94a3b8' }}>
              {state.task}
            </span>
          )}

          {/* Reasoning */}
          {state.reasoning && (
            <span className="text-[10px] truncate italic" style={{ color: '#64748b' }}>
              {state.reasoning}
            </span>
          )}

          {/* Rewards */}
          <div className="ml-auto flex items-center gap-3 shrink-0">
            <span className="text-[9px] font-mono" style={{ color: state.globalReward >= 0 ? '#22c55e' : '#ef4444' }}>
              R: {state.globalReward.toFixed(2)}
            </span>
            <span className="text-[9px] font-mono" style={{ color: '#94a3b8' }}>
              COOP: {(state.cooperationScore * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Divider */}
        <div className="w-px h-8" style={{ background: 'rgba(51,65,85,0.6)' }} />

        {/* Episode Controls */}
        <div className="shrink-0" style={{ width: 420 }}>
          <EpisodeControls />
        </div>
      </div>
    </div>
  )
}
