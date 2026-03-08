import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'

// Selectable models shown in the dropdown
const MODELS: { id: string; name: string; badge: string; badgeColor: string }[] = [
  { id: 'anthropic.claude-opus-4-6-v1',              name: 'Claude Opus 4.6',      badge: 'APEX',     badgeColor: '#a855f7' },
  { id: 'anthropic.claude-sonnet-4-6',               name: 'Claude Sonnet 4.6',    badge: 'BALANCED', badgeColor: '#6366f1' },
  { id: 'amazon.nova-premier-v1:0',                  name: 'Nova Premier',          badge: 'PREMIER',  badgeColor: '#f97316' },
  { id: 'meta.llama4-maverick-17b-instruct-v1:0',    name: 'Llama 4 Maverick',     badge: 'OPEN',     badgeColor: '#0ea5e9' },
  { id: 'mistral.mistral-large-3-675b-instruct',     name: 'Mistral Large 3',       badge: 'EU',       badgeColor: '#eab308' },
  { id: 'mistral.pixtral-large-2502-v1:0',           name: 'Pixtral Large',         badge: 'VISION',   badgeColor: '#ec4899' },
  { id: 'google.gemma-3-27b-it',                     name: 'Gemma 3 27B',           badge: 'OPEN',     badgeColor: '#0ea5e9' },
  { id: 'deepseek.v3.2',                             name: 'DeepSeek V3.2',         badge: 'NEW',      badgeColor: '#22c55e' },
  { id: 'qwen.qwen3-235b-a22b-2507-v1:0',            name: 'Qwen3 235B',            badge: 'LARGE',    badgeColor: '#d97706' },
  { id: 'moonshot.kimi-k2.5',                        name: 'Kimi K2.5',             badge: 'NEW',      badgeColor: '#22c55e' },
]

// Extended lookup including the default server model (for display only)
const ALL_KNOWN: { id: string; name: string }[] = [
  ...MODELS,
  { id: 'global.anthropic.claude-haiku-4-5-20251001-v1:0', name: 'Claude Haiku 4.5' },
  { id: 'anthropic.claude-haiku-4-5-20251001-v1:0',        name: 'Claude Haiku 4.5' },
]

function normalizeId(id: string): string {
  return id.replace(/^(global|us|eu)\./i, '')
}

function shortModelName(modelId: string): string {
  const norm = normalizeId(modelId)
  const known = ALL_KNOWN.find(m => normalizeId(m.id) === norm || m.id === modelId)
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
    if (norm.includes('haiku')) return '🚀'
  }
  if (norm.includes('nova')) return '☁️'
  if (norm.includes('llama')) return '🦙'
  if (norm.includes('pixtral')) return '👁️'
  if (norm.includes('mistral')) return '🌬️'
  if (norm.includes('gemma')) return '💎'
  if (norm.includes('deepseek')) return '🔍'
  if (norm.includes('qwen')) return '🧠'
  if (norm.includes('kimi') || norm.includes('moonshot')) return '🌙'
  return '⚙️'
}

export function ModelSelector() {
  const currentModel = useStore(s => s.currentModel)
  const currentProvider = useStore(s => s.currentProvider)
  const setCurrentModel = useStore(s => s.setCurrentModel)
  const episode = useStore(s => s.episode)

  const [open, setOpen] = useState(false)
  const [modelChanged, setModelChanged] = useState(false)
  const [prevEpisode, setPrevEpisode] = useState(episode)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 })
  const ref = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fetch current model from backend on mount
  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(d => {
        if (d.model && d.model !== 'unknown') {
          setCurrentModel(d.model, d.provider ?? 'bedrock')
        }
      })
      .catch(() => {})
  }, [setCurrentModel])

  // Reset amber dot when a new episode starts
  useEffect(() => {
    if (episode !== prevEpisode) {
      setModelChanged(false)
      setPrevEpisode(episode)
    }
  }, [episode, prevEpisode])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      const t = e.target as Node
      const inBtn = ref.current?.contains(t)
      const inDropdown = dropdownRef.current?.contains(t)
      if (!inBtn && !inDropdown) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  async function selectModel(id: string) {
    setOpen(false)
    if (normalizeId(id) === normalizeId(currentModel)) return
    // Optimistic update — show the new model immediately
    setCurrentModel(id, 'bedrock')
    setModelChanged(true)
    // Tell the backend to reconfigure for the next reset
    try {
      await fetch('/api/reconfigure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: id, provider: 'bedrock' }),
      })
    } catch {
      // best-effort — UI already updated
    }
  }

  const displayName = shortModelName(currentModel)
  const icon = providerIcon(currentModel)

  return (
    <div ref={ref} className="relative flex items-center">
      <button
        ref={btnRef}
        onClick={() => {
          if (!open && btnRef.current) {
            const r = btnRef.current.getBoundingClientRect()
            setDropdownPos({ top: r.bottom + 4, left: r.left })
          }
          setOpen(v => !v)
        }}
        className="relative flex items-center gap-1.5 px-2 py-1 rounded transition-colors"
        style={{
          background: 'var(--color-card-bg)',
          border: open ? '1px solid #6366f1' : '1px solid var(--color-border)',
          color: 'var(--color-text-secondary)',
          height: 26,
        }}
        title="Switch model (takes effect on next Reset)"
      >
        <span className="text-sm leading-none">{icon}</span>
        <span className="text-[10px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          {displayName}
        </span>
        <span className="text-[8px]" style={{ color: 'var(--color-text-faint)' }}>
          {open ? '▲' : '▼'}
        </span>
        {modelChanged && (
          <span
            className="absolute -top-1 -right-1 w-2 h-2 rounded-full"
            style={{ background: '#f59e0b' }}
            title="Model changed — Reset to apply"
          />
        )}
      </button>

      {open && (
        <div
          ref={dropdownRef}
          className="fixed z-50 rounded overflow-hidden"
          style={{
            top: dropdownPos.top,
            left: dropdownPos.left,
            minWidth: 220,
            background: 'var(--color-panel)',
            border: '1px solid var(--color-border)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.14)',
          }}
        >
          <div
            className="px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--color-text-faint)', borderBottom: '1px solid var(--color-border)' }}
          >
            Select Model (resets on next run)
          </div>
          {MODELS.map(m => {
            const isActive = normalizeId(m.id) === normalizeId(currentModel)
            return (
              <button
                key={m.id}
                onClick={() => selectModel(m.id)}
                className="w-full flex items-center gap-2 px-3 py-2 transition-colors text-left"
                style={{
                  background: isActive ? 'var(--color-card-bg)' : 'transparent',
                  border: 'none',
                  borderLeft: isActive ? '2px solid #6366f1' : '2px solid transparent',
                  cursor: 'pointer',
                }}
              >
                <span className="text-sm leading-none shrink-0">{providerIcon(m.id)}</span>
                <span
                  className="text-[11px] font-semibold flex-1 truncate"
                  style={{ color: isActive ? '#6366f1' : 'var(--color-text-primary)' }}
                >
                  {m.name}
                </span>
                <span
                  className="text-[8px] px-1 py-0.5 rounded font-semibold shrink-0"
                  style={{ background: `${m.badgeColor}18`, color: m.badgeColor }}
                >
                  {m.badge}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
