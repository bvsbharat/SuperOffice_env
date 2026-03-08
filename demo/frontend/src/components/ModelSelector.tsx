import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store/useStore'

const MODELS: { id: string; name: string; badge: string; badgeColor: string }[] = [
  { id: 'global.anthropic.claude-haiku-4-5-20251001-v1:0', name: 'Claude Haiku 4.5',  badge: 'DEFAULT',  badgeColor: '#22c55e' },
  { id: 'us.anthropic.claude-sonnet-4-6[1m]',              name: 'Claude Sonnet 4.6', badge: 'BALANCED', badgeColor: '#6366f1' },
  { id: 'us.anthropic.claude-opus-4-6-v1[1m]',             name: 'Claude Opus 4.6',   badge: 'APEX',     badgeColor: '#a855f7' },
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

function providerIcon(modelId: string): string {
  const norm = normalizeId(modelId).toLowerCase()
  if (norm.includes('claude')) {
    if (norm.includes('opus')) return '🏆'
    if (norm.includes('sonnet')) return '⚡'
    return '🚀'
  }
  if (norm.includes('nova')) return '☁️'
  if (norm.includes('llama')) return '🦙'
  if (norm.includes('mistral') || norm.includes('ministral')) return '🌬️'
  if (norm.includes('gemma')) return '💎'
  if (norm.includes('deepseek')) return '🔍'
  if (norm.includes('qwen')) return '🧠'
  if (norm.includes('kimi') || norm.includes('moonshot')) return '🌙'
  if (norm.includes('minimax')) return '🔮'
  if (norm.includes('gpt') || norm.includes('openai')) return '🤖'
  return '⚙️'
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

  const dropdown = open && rect ? createPortal(
    <div
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
            <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>{providerIcon(m.id)}</span>
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
    </div>,
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
          height: 26,
          minWidth: 148,
          borderRadius: 4,
          background: 'var(--color-card-bg)',
          border: open ? '1px solid #6366f1' : '1px solid var(--color-border)',
          cursor: 'pointer',
        }}
        title="Switch model (takes effect on next Reset)"
      >
        <span style={{ fontSize: 14, lineHeight: 1 }}>{providerIcon(currentModel)}</span>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-primary)' }}>
          {shortModelName(currentModel)}
        </span>
        <span style={{ fontSize: 8, color: 'var(--color-text-faint)' }}>{open ? '▲' : '▼'}</span>
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
