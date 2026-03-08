import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronUp, ChevronDown, Cpu, GraduationCap, Brain } from 'lucide-react'
import { useStore } from '../store/useStore'
import type { SimMode } from '../types'

const MODES: { id: SimMode; name: string; badge: string; badgeColor: string; icon: typeof Cpu }[] = [
  { id: 'llm',       name: 'LLM Simulation',  badge: 'DEFAULT', badgeColor: '#22c55e', icon: Cpu },
  { id: 'training',  name: 'Training Sim',     badge: 'TRAIN',   badgeColor: '#f59e0b', icon: GraduationCap },
  { id: 'inference', name: 'Trained Model',    badge: 'LORA',    badgeColor: '#8b5cf6', icon: Brain },
]

export function ModeSelector() {
  const simMode = useStore(s => s.simMode)
  const setSimMode = useStore(s => s.setSimMode)
  const trainingStatus = useStore(s => s.trainingStatus)
  const episode = useStore(s => s.episode)

  const [open, setOpen] = useState(false)
  const [modeChanged, setModeChanged] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [prevEpisode, setPrevEpisode] = useState(episode)
  const btnRef = useRef<HTMLButtonElement>(null)

  // Fetch mode from backend on mount
  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(d => { if (d.mode && d.mode !== simMode) setSimMode(d.mode) })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Clear amber dot on new episode
  useEffect(() => {
    if (episode !== prevEpisode) { setModeChanged(false); setPrevEpisode(episode) }
  }, [episode, prevEpisode])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handler) }
  }, [open])

  function handleButtonClick() {
    if (btnRef.current) setRect(btnRef.current.getBoundingClientRect())
    setOpen(v => !v)
  }

  function selectMode(id: SimMode) {
    setOpen(false)
    if (id === simMode) return
    setSimMode(id)
    setModeChanged(true)
  }

  const currentMode = MODES.find(m => m.id === simMode) || MODES[0]
  const CurrentIcon = currentMode.icon

  const dropdown = rect ? createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            bottom: window.innerHeight - rect.top + 4,
            left: rect.left,
            minWidth: 220,
            zIndex: 99999,
            borderRadius: 6,
            background: '#000000',
            border: '1px solid var(--color-border)',
            boxShadow: '0 -8px 24px rgba(0,0,0,0.5)',
          }}
        >
          <div style={{
            padding: '6px 12px',
            fontSize: 9,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--color-text-faint)',
            borderBottom: '1px solid var(--color-border)',
          }}>
            Sim Mode — applies on Reset
          </div>
          {MODES.map(m => {
            const isActive = m.id === simMode
            const Icon = m.icon
            return (
              <button
                key={m.id}
                onMouseDown={e => { e.stopPropagation(); selectMode(m.id) }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '8px 12px',
                  background: isActive ? 'var(--color-card-bg)' : 'transparent',
                  border: 'none',
                  borderLeft: isActive ? '2px solid #6366f1' : '2px solid transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ flexShrink: 0, color: isActive ? '#6366f1' : 'var(--color-text-secondary)' }}>
                  <Icon size={14} />
                </span>
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  flex: 1,
                  color: isActive ? '#6366f1' : 'var(--color-text-primary)',
                }}>
                  {m.name}
                </span>
                <span style={{
                  fontSize: 8,
                  padding: '2px 4px',
                  borderRadius: 3,
                  fontWeight: 700,
                  flexShrink: 0,
                  background: `${m.badgeColor}22`,
                  color: m.badgeColor,
                }}>
                  {m.badge}
                </span>
              </button>
            )
          })}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  ) : null

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleButtonClick}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '2px 8px',
          height: 32,
          minWidth: 0,
          borderRadius: 5,
          background: 'var(--color-card-bg)',
          border: open ? '1px solid #6366f1' : '1px solid var(--color-border)',
          cursor: 'pointer',
        }}
        title="Switch simulation mode (takes effect on next Reset)"
      >
        <span style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }}><CurrentIcon size={14} /></span>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-primary)', whiteSpace: 'nowrap' }}>
          {currentMode.name}
        </span>
        {simMode === 'training' && trainingStatus && (
          <span style={{
            fontSize: 8,
            padding: '1px 4px',
            borderRadius: 3,
            fontWeight: 700,
            background: '#f59e0b22',
            color: '#f59e0b',
          }}>
            {trainingStatus.totalTrajectories}
          </span>
        )}
        <span style={{ color: 'var(--color-text-faint)', flexShrink: 0 }}>
          {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </span>
        {modeChanged && (
          <span style={{
            position: 'absolute',
            top: -3,
            right: -3,
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: '#f59e0b',
          }} title="Mode changed — Reset to apply" />
        )}
      </button>
      {dropdown}
    </>
  )
}
