import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, Zap, Rocket, Cloud, Wind, Gem, Search, Brain, Moon, Sparkles, Bot, Settings, ChevronUp, ChevronDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useStore } from '../store/useStore'

const MODELS: { id: string; name: string; badge: string; badgeColor: string }[] = [
  { id: 'global.anthropic.claude-haiku-4-5-20251001-v1:0', name: 'Claude Haiku 4.5',  badge: 'DEFAULT',  badgeColor: '#22c55e' },
  { id: 'us.anthropic.claude-sonnet-4-6[1m]',              name: 'Claude Sonnet 4.6', badge: 'BALANCED', badgeColor: '#6366f1' },
  { id: 'us.anthropic.claude-opus-4-6-v1',                  name: 'Claude Opus 4.6',   badge: 'APEX',     badgeColor: '#a855f7' },
  { id: 'mistral.ministral-3-14b-instruct',                 name: 'Ministral 3 14B',   badge: 'EU',       badgeColor: '#eab308' },
  { id: 'qwen.qwen3-next-80b-a3b',                          name: 'Qwen3 80B',         badge: 'NEW',      badgeColor: '#d97706' },
  { id: 'openai.gpt-oss-safeguard-120b',                    name: 'GPT OSS 120B',      badge: 'OPEN',     badgeColor: '#10b981' },
  { id: 'minimax.minimax-m2',                               name: 'MiniMax M2',        badge: 'NEW',      badgeColor: '#8b5cf6' },
  { id: 'meta.llama3-3-70b-instruct-v1:0',                  name: 'Llama 3.3 70B',     badge: 'OPEN',     badgeColor: '#0ea5e9' },
  { id: 'google.gemma-3-4b-it',                             name: 'Gemma 3 4B',        badge: 'OPEN',     badgeColor: '#4285f4' },
]

function normalizeId(id: string): string {
  return id.replace(/^(global|us|eu)\./i, '')
}

function shortModelName(modelId: string): string {
  const norm = normalizeId(modelId)
  const known = MODELS.find(m => normalizeId(m.id) === norm || m.id === modelId)
  if (known) return known.name
  const parts = norm.split('.')
  return parts[parts.length - 1]
    .replace(/-v\d+:\d+$/, '')
    .replace(/-20\d{6}/, '')
    .replace(/-instruct$/, '')
}

function providerIcon(modelId: string): LucideIcon {
  const norm = normalizeId(modelId).toLowerCase()
  if (norm.includes('claude')) {
    if (norm.includes('opus')) return Trophy
    if (norm.includes('sonnet')) return Zap
    return Rocket
  }
  if (norm.includes('nova')) return Cloud
  if (norm.includes('llama')) return Rocket
  if (norm.includes('mistral') || norm.includes('ministral')) return Wind
  if (norm.includes('gemma')) return Gem
  if (norm.includes('deepseek')) return Search
  if (norm.includes('qwen')) return Brain
  if (norm.includes('kimi') || norm.includes('moonshot')) return Moon
  if (norm.includes('minimax')) return Sparkles
  if (norm.includes('gpt') || norm.includes('openai')) return Bot
  return Settings
}

export function ModelSelector() {
  const currentModel = useStore(s => s.currentModel)
  const setCurrentModel = useStore(s => s.setCurrentModel)
  const episode = useStore(s => s.episode)

  const [open, setOpen] = useState(false)
  const [modelChanged, setModelChanged] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [prevEpisode, setPrevEpisode] = useState(episode)
  const btnRef = useRef<HTMLButtonElement>(null)

  // Fetch model from backend on mount
  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(d => { if (d.model && d.model !== 'unknown') setCurrentModel(d.model, d.provider ?? 'bedrock') })
      .catch(() => {})
  }, [setCurrentModel])

  // Clear amber dot on new episode
  useEffect(() => {
    if (episode !== prevEpisode) { setModelChanged(false); setPrevEpisode(episode) }
  }, [episode, prevEpisode])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    // Use setTimeout so the handler isn't added until after the current event completes
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handler) }
  }, [open])

  function handleButtonClick() {
    if (btnRef.current) setRect(btnRef.current.getBoundingClientRect())
    setOpen(v => !v)
  }

  async function selectModel(id: string) {
    setOpen(false)
    if (normalizeId(id) === normalizeId(currentModel)) return
    setCurrentModel(id, 'bedrock')
    setModelChanged(true)
    try {
      await fetch('/api/reconfigure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: id, provider: 'bedrock' }),
      })
    } catch { /* best-effort */ }
  }

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
        minWidth: 280,
        zIndex: 99999,
        borderRadius: 6,
        background: '#000000',
        border: '1px solid var(--color-border)',
        boxShadow: '0 -8px 24px rgba(0,0,0,0.5)',
        maxHeight: '70vh',
        overflowY: 'auto',
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
        position: 'sticky',
        top: 0,
        background: '#000000',
      }}>
        Select Model — applies on next Reset
      </div>
      {MODELS.map(m => {
        const isActive = normalizeId(m.id) === normalizeId(currentModel)
        return (
          <button
            key={m.id}
            onMouseDown={e => { e.stopPropagation(); selectModel(m.id) }}
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
            <span style={{ flexShrink: 0, color: isActive ? '#6366f1' : 'var(--color-text-secondary)' }}>{(() => { const Icon = providerIcon(m.id); return <Icon size={14} /> })()}</span>
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
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

  const currentKnown = MODELS.find(m => normalizeId(m.id) === normalizeId(currentModel))
  const CurrentIcon = providerIcon(currentModel)

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleButtonClick}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '2px 10px',
          height: 32,
          flex: 1,
          minWidth: 0,
          borderRadius: 5,
          background: 'var(--color-card-bg)',
          border: open ? '1px solid #6366f1' : '1px solid var(--color-border)',
          cursor: 'pointer',
        }}
        title="Switch model (takes effect on next Reset)"
      >
        <span style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }}><CurrentIcon size={16} /></span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {shortModelName(currentModel)}
        </span>
        {currentKnown && (
          <span style={{
            fontSize: 8, padding: '1px 5px', borderRadius: 3, fontWeight: 700, flexShrink: 0,
            background: `${currentKnown.badgeColor}22`, color: currentKnown.badgeColor,
          }}>
            {currentKnown.badge}
          </span>
        )}
        <span style={{ marginLeft: 'auto', color: 'var(--color-text-faint)', flexShrink: 0 }}>{open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</span>
        {modelChanged && (
          <span style={{
            position: 'absolute',
            top: -3,
            right: -3,
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: '#f59e0b',
          }} title="Model changed — Reset to apply" />
        )}
      </button>
      {dropdown}
    </>
  )
}
