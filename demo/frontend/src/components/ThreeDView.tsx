import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { motion, AnimatePresence } from 'framer-motion'
import * as THREE from 'three'
import { useStore } from '../store/useStore'
import { OfficeScene3D } from './scene/IsometricOffice'
import { MarketDashboard } from './MarketDashboard'
import { AgentCard } from './AgentCard'
import { ConversationLog } from './ConversationLog'
import { RewardPanel } from './RewardPanel'
import { TimelineView } from './TimelineView'
import { EpisodeControls } from './EpisodeControls'
import type { AgentId } from '../types'
import { AGENT_ORDER } from '../types'

const CONFETTI_COLORS = ['#6366f1', '#ec4899', '#22d3ee', '#fbbf24', '#34d399', '#f97316', '#a78bfa', '#f472b6']

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  color: string
  size: number
  rotation: number
  rotationSpeed: number
  opacity: number
}

function ConfettiOverlay({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particles = useRef<Particle[]>([])
  const animFrame = useRef<number>(0)
  const [visible, setVisible] = useState(false)

  const spawn = useCallback(() => {
    const ps: Particle[] = []
    for (let i = 0; i < 150; i++) {
      ps.push({
        x: Math.random() * window.innerWidth,
        y: -20 - Math.random() * 200,
        vx: (Math.random() - 0.5) * 4,
        vy: Math.random() * 3 + 2,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        size: Math.random() * 8 + 4,
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
        p.opacity -= 0.003
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
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 50,
        pointerEvents: 'none',
      }}
    />
  )
}

function LoadingFallback() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#6366f1" wireframe />
    </mesh>
  )
}

export function ThreeDView() {
  const agents = useStore(s => s.agents)
  const panelVisibility = useStore(s => s.panelVisibility)
  const togglePanel = useStore(s => s.togglePanel)
  const done = useStore(s => s.done)

  const [rightTab, setRightTab] = useState<'dashboard' | 'agents'>('dashboard')
  const [bottomTab, setBottomTab] = useState<'log' | 'reward'>('log')
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

  return (
    <div className="flex-1 relative min-h-0 overflow-hidden">
      {/* Confetti on episode completion */}
      <ConfettiOverlay active={showConfetti} />

      {/* Full-screen R3F Canvas */}
      <div className="absolute inset-0">
        <Canvas
          camera={{
            position: [7, 5.5, 7],
            fov: 32,
            near: 0.1,
            far: 60,
          }}
          gl={{
            antialias: true,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 2.0,
            powerPreference: 'default',
          }}
          style={{ background: '#f5f0e8' }}
        >
          <Suspense fallback={<LoadingFallback />}>
            <OfficeScene3D />
          </Suspense>
        </Canvas>
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
