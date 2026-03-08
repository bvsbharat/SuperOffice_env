import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, X, BarChart3, Medal } from 'lucide-react'
import { useStore } from '../store/useStore'
import type { BenchmarkRun } from '../store/useStore'

// Real AWS Bedrock cross-region inference profile IDs.
// Claude 4.x models use us.anthropic.claude-{model}[1m] format.
// Claude 3.x models use us.anthropic.claude-{model}-{date}-v1:0 format.
const KNOWN_MODELS: { id: string; name: string; provider: string; badge: string; badgeColor: string }[] = [
  { id: 'global.anthropic.claude-haiku-4-5-20251001-v1:0', name: 'Claude Haiku 4.5',  provider: 'bedrock', badge: 'DEFAULT',  badgeColor: '#22c55e' },
  { id: 'us.anthropic.claude-sonnet-4-6[1m]',              name: 'Claude Sonnet 4.6', provider: 'bedrock', badge: 'BALANCED', badgeColor: '#6366f1' },
  { id: 'us.anthropic.claude-opus-4-6-v1',                  name: 'Claude Opus 4.6',   provider: 'bedrock', badge: 'APEX',     badgeColor: '#a855f7' },
  { id: 'mistral.ministral-3-14b-instruct',                 name: 'Ministral 3 14B',   provider: 'bedrock', badge: 'EU',       badgeColor: '#eab308' },
  { id: 'qwen.qwen3-next-80b-a3b',                          name: 'Qwen3 80B',         provider: 'bedrock', badge: 'NEW',      badgeColor: '#d97706' },
  { id: 'openai.gpt-oss-safeguard-120b',                    name: 'GPT OSS 120B',      provider: 'bedrock', badge: 'OPEN',     badgeColor: '#10b981' },
  { id: 'minimax.minimax-m2',                               name: 'MiniMax M2',        provider: 'bedrock', badge: 'NEW',      badgeColor: '#8b5cf6' },
  { id: 'meta.llama3-3-70b-instruct-v1:0',                  name: 'Llama 3.3 70B',     provider: 'bedrock', badge: 'OPEN',     badgeColor: '#0ea5e9' },
  { id: 'google.gemma-3-4b-it',                             name: 'Gemma 3 4B',        provider: 'bedrock', badge: 'OPEN',     badgeColor: '#4285f4' },
]

function normalizeId(id: string): string {
  // Strip cross-region prefix like "global." or "us."
  return id.replace(/^(global|us|eu)\./i, '')
}

function shortModelName(modelName: string): string {
  const norm = normalizeId(modelName)
  const known = KNOWN_MODELS.find(m => normalizeId(m.id) === norm || m.id === modelName)
  if (known) return known.name
  // Fallback: strip vendor prefix and version noise
  const parts = norm.split('.')
  return parts[parts.length - 1]
    .replace(/-v\d+:\d+$/, '')
    .replace(/-20\d{6}/, '')
    .replace(/-instruct$/, '')
}

function medalColor(rank: number): string {
  if (rank === 1) return '#fbbf24'
  if (rank === 2) return '#9ca3af'
  if (rank === 3) return '#d97706'
  return 'var(--color-text-faint)'
}

interface LogoInfo {
  src: string
  alt: string
  size?: number
}

function getProviderLogo(provider: string, modelId: string): LogoInfo | null {
  const norm = normalizeId(modelId).toLowerCase()

  // Anthropic/Claude models
  if (provider === 'bedrock' && norm.includes('claude')) {
    return {
      src: 'https://img.icons8.com/fluent/1200/claude.jpg',
      alt: 'Claude',
      size: 20,
    }
  }

  // Amazon Nova
  if (norm.includes('nova')) {
    return {
      src: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHJ4PSI0IiBmaWxsPSIjRkY5OTAwIi8+PHRleHQgeD0iMTAiIHk9IjE0IiBmb250LXNpemU9IjEyIiBmb250LXdlaWdodD0iYm9sZCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiPk48L3RleHQ+PC9zdmc+',
      alt: 'Nova',
      size: 20,
    }
  }

  // Meta Llama
  if (norm.includes('llama')) {
    return {
      src: 'https://pngimg.com/d/meta_PNG12.png',
      alt: 'Meta',
      size: 24,
    }
  }

  // Mistral
  if (norm.includes('mistral')) {
    return {
      src: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHJ4PSI0IiBmaWxsPSIjRkY3MDAwIi8+PHRleHQgeD0iMTAiIHk9IjE0IiBmb250LXNpemU9IjEyIiBmb250LXdlaWdodD0iYm9sZCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiPk08L3RleHQ+PC9zdmc+',
      alt: 'Mistral',
      size: 20,
    }
  }

  // Pixtral (vision)
  if (norm.includes('pixtral')) {
    return {
      src: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHJ4PSI0IiBmaWxsPSIjRkY3MDAwIi8+PHRleHQgeD0iMTAiIHk9IjE0IiBmb250LXNpemU9IjEyIiBmb250LXdlaWdodD0iYm9sZCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiPlA8L3RleHQ+PC9zdmc+',
      alt: 'Pixtral',
      size: 20,
    }
  }

  // Google Gemma
  if (norm.includes('gemma')) {
    return {
      src: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHJ4PSI0IiBmaWxsPSIjNDI4NUY0Ii8+PHRleHQgeD0iMTAiIHk9IjE0IiBmb250LXNpemU9IjEyIiBmb250LXdlaWdodD0iYm9sZCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiPkc8L3RleHQ+PC9zdmc+',
      alt: 'Gemma',
      size: 20,
    }
  }

  // DeepSeek
  if (norm.includes('deepseek')) {
    return {
      src: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHJ4PSI0IiBmaWxsPSIjMDAwMDAwIi8+PHRleHQgeD0iMTAiIHk9IjE0IiBmb250LXNpemU9IjEyIiBmb250LXdlaWdodD0iYm9sZCIgZmlsbD0iI0ZGODAwMCIgdGV4dC1hbmNob3I9Im1pZGRsZSI+RDwvdGV4dD48L3N2Zz4=',
      alt: 'DeepSeek',
      size: 20,
    }
  }

  // Qwen
  if (norm.includes('qwen')) {
    return {
      src: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHJ4PSI0IiBmaWxsPSIjRkY2NDAwIi8+PHRleHQgeD0iMTAiIHk9IjE0IiBmb250LXNpemU9IjEyIiBmb250LXdlaWdodD0iYm9sZCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiPlE8L3RleHQ+PC9zdmc+',
      alt: 'Qwen',
      size: 20,
    }
  }

  // Kimi/Moonshot
  if (norm.includes('kimi') || norm.includes('moonshot')) {
    return {
      src: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHJ4PSI0IiBmaWxsPSIjNDI0MjQyIi8+PHRleHQgeD0iMTAiIHk9IjE0IiBmb250LXNpemU9IjEyIiBmb250LXdlaWdodD0iYm9sZCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiPk08L3RleHQ+PC9zdmc+',
      alt: 'Moonshot',
      size: 20,
    }
  }

  // Default
  return null
}

function scoreBar(value: number, max: number, color: string) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div className="relative h-1 rounded-full overflow-hidden" style={{ width: 48, background: 'var(--color-card-bg)' }}>
      <div className="absolute left-0 top-0 h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

interface LeaderboardEntry {
  rank: number
  modelName: string
  provider: string
  run: BenchmarkRun | null
  isKnown: boolean
  badge: string
  badgeColor: string
  isActive: boolean
}

export function BenchmarkPanel() {
  const benchmarkPanelOpen = useStore(s => s.benchmarkPanelOpen)
  const toggleBenchmarkPanel = useStore(s => s.toggleBenchmarkPanel)
  const benchmarkRuns = useStore(s => s.benchmarkRuns)
  const currentModel = useStore(s => s.currentModel)
  const currentProvider = useStore(s => s.currentProvider)
  const setCurrentModel = useStore(s => s.setCurrentModel)

  // Fetch model config from backend on mount
  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(d => setCurrentModel(d.model ?? 'unknown', d.provider ?? 'bedrock'))
      .catch(() => {})
  }, [setCurrentModel])

  // Sort: full runs first → then by revenue desc → then by totalReward desc
  const sortedRuns = [...benchmarkRuns].sort((a, b) => {
    if (a.isComplete !== b.isComplete) return a.isComplete ? -1 : 1
    if (b.revenue !== a.revenue) return b.revenue - a.revenue
    return b.totalReward - a.totalReward
  })

  const scoredModelIds = new Set(benchmarkRuns.map(r => r.modelName))

  const entries: LeaderboardEntry[] = []

  sortedRuns.forEach((run, i) => {
    const known = KNOWN_MODELS.find(m => normalizeId(m.id) === normalizeId(run.modelName))
    entries.push({
      rank: i + 1,
      modelName: run.modelName,
      provider: run.provider,
      run,
      isKnown: !!known,
      badge: known?.badge ?? '',
      badgeColor: known?.badgeColor ?? '#6366f1',
      isActive: normalizeId(run.modelName) === normalizeId(currentModel),
    })
  })

  // Add known models without runs
  KNOWN_MODELS.forEach(m => {
    const alreadyScored = [...scoredModelIds].some(id => normalizeId(id) === normalizeId(m.id))
    if (!alreadyScored) {
      entries.push({
        rank: entries.length + 1,
        modelName: m.id,
        provider: m.provider,
        run: null,
        isKnown: true,
        badge: m.badge,
        badgeColor: m.badgeColor,
        isActive: normalizeId(m.id) === normalizeId(currentModel),
      })
    }
  })

  const maxReward = Math.max(...benchmarkRuns.map(r => r.totalReward), 1)
  const maxRevenue = Math.max(...benchmarkRuns.map(r => r.revenue), 1)

  return (
    <>
      {/* Backdrop */}
      <AnimatePresence>
        {benchmarkPanelOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.75)' }}
            onClick={toggleBenchmarkPanel}
          />
        )}
      </AnimatePresence>

      {/* Slide-in panel from the right */}
      <AnimatePresence>
        {benchmarkPanelOpen && (
          <motion.div
            initial={{ x: 420 }}
            animate={{ x: 0 }}
            exit={{ x: 420 }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            className="fixed right-0 top-0 bottom-0 z-50 flex flex-col"
            style={{
              width: 400,
              background: 'var(--color-panel)',
              borderLeft: '1px solid var(--color-border)',
              boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
            }}
          >
            {/* Header */}
            <div
              className="shrink-0 flex items-center justify-between px-4 py-3"
              style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-panel)' }}
            >
              <div className="flex items-center gap-2">
                <Trophy size={18} style={{ color: '#fbbf24' }} />
                <div>
                  <div className="text-xs font-bold tracking-wide" style={{ color: 'var(--color-text-primary)' }}>MODEL LEADERBOARD</div>
                  <div className="text-[9px]" style={{ color: 'var(--color-text-faint)' }}>
                    Benchmark scores from GTM simulations
                  </div>
                </div>
              </div>

              <button
                onClick={toggleBenchmarkPanel}
                className="w-6 h-6 flex items-center justify-center rounded transition-colors"
                style={{ color: 'var(--color-text-faint)' }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Active model badge */}
            {currentModel !== 'unknown' && (
              <div
                className="shrink-0 flex items-center gap-2 px-4 py-2"
                style={{ background: 'var(--color-card-bg)', borderBottom: '1px solid var(--color-border)' }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-[10px]" style={{ color: 'var(--color-text-faint)' }}>Active:</span>
                <span className="text-[10px] font-mono font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  {shortModelName(currentModel)}
                </span>
                <span
                  className="text-[8px] px-1 py-0.5 rounded font-semibold ml-auto"
                  style={{ background: '#6366f118', color: '#6366f1' }}
                >
                  {currentProvider.toUpperCase()}
                </span>
              </div>
            )}

            {/* Column headers */}
            <div
              className="shrink-0 grid px-4 py-1.5 text-[9px] font-semibold uppercase tracking-wider"
              style={{
                gridTemplateColumns: '28px 1fr 60px 60px 48px',
                color: 'var(--color-text-faint)',
                borderBottom: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
              }}
            >
              <span>#</span>
              <span>Model</span>
              <span className="text-right" style={{ color: '#22c55e' }}>Revenue ↓</span>
              <span className="text-right" style={{ color: '#6366f1' }}>Reward ↓</span>
              <span className="text-right">Steps</span>
            </div>

            {/* Entries */}
            <div className="flex-1 overflow-y-auto">
              {entries.map((entry, idx) => (
                <motion.div
                  key={entry.modelName}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05, duration: 0.3, ease: 'easeOut' }}
                  className="grid items-center px-4 py-2.5 transition-colors"
                  style={{
                    gridTemplateColumns: '28px 1fr 60px 60px 48px',
                    borderBottom: '1px solid var(--color-border)',
                    background: entry.isActive
                      ? 'var(--color-card-bg)'
                      : idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)',
                  }}
                >
                  {/* Rank / Logo */}
                  <div className="flex items-center justify-center" style={{ paddingRight: 4 }}>
                    {entry.run ? (
                      <span
                        className="text-sm font-bold"
                        style={{ color: medalColor(entry.rank) }}
                      >
                        {entry.rank}
                      </span>
                    ) : (
                      (() => {
                        const logo = getProviderLogo(entry.provider, entry.modelName)
                        return logo ? (
                          <div
                            className="flex items-center justify-center rounded"
                            style={{
                              width: 28,
                              height: 28,
                              background: 'white',
                              padding: 2,
                            }}
                            title={logo.alt}
                          >
                            <img
                              src={logo.src}
                              alt={logo.alt}
                              style={{
                                width: logo.size || 20,
                                height: logo.size || 20,
                                objectFit: 'contain',
                              }}
                            />
                          </div>
                        ) : (
                          <span style={{ color: 'var(--color-text-faint)', fontSize: 12 }}>—</span>
                        )
                      })()
                    )}
                  </div>

                  {/* Model name + badge */}
                  <div className="min-w-0 flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="text-[11px] font-semibold truncate"
                        style={{ color: 'var(--color-text-primary)' }}
                      >
                        {shortModelName(entry.modelName)}
                      </span>
                      {entry.isActive && (
                        <span className="text-[7px] px-1 py-0.5 rounded-full font-bold shrink-0" style={{ background: '#22c55e20', color: '#22c55e' }}>
                          LIVE
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {entry.badge && (
                        <span
                          className="text-[8px] px-1 py-0.5 rounded font-semibold"
                          style={{ background: `${entry.badgeColor}18`, color: entry.badgeColor }}
                        >
                          {entry.badge}
                        </span>
                      )}
                      {entry.run && (
                        <span className="text-[8px]" style={{ color: 'var(--color-text-faint)' }}>
                          {entry.run.isComplete ? 'full run' : 'partial'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Revenue — primary sort key */}
                  <div className="flex flex-col items-end gap-1">
                    {entry.run ? (
                      <>
                        <span className="text-[11px] font-mono font-semibold" style={{ color: '#22c55e' }}>
                          ${(entry.run.revenue / 1000).toFixed(1)}k
                        </span>
                        {scoreBar(entry.run.revenue, maxRevenue, '#22c55e')}
                      </>
                    ) : (
                      <span className="text-[10px]" style={{ color: 'var(--color-text-faint)' }}>N/A</span>
                    )}
                  </div>

                  {/* Reward — secondary sort key */}
                  <div className="flex flex-col items-end gap-1">
                    {entry.run ? (
                      <>
                        <span className="text-[11px] font-mono font-semibold" style={{ color: '#6366f1' }}>
                          {entry.run.totalReward.toFixed(1)}
                        </span>
                        {scoreBar(entry.run.totalReward, maxReward, '#6366f1')}
                      </>
                    ) : (
                      <span className="text-[10px]" style={{ color: 'var(--color-text-faint)' }}>N/A</span>
                    )}
                  </div>

                  {/* Steps */}
                  <div className="text-right">
                    {entry.run ? (
                      <span className="text-[11px] font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                        {entry.run.steps}
                      </span>
                    ) : (
                      <span className="text-[10px]" style={{ color: 'var(--color-text-faint)' }}>—</span>
                    )}
                  </div>
                </motion.div>
              ))}

              {entries.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                  <BarChart3 size={28} style={{ color: 'var(--color-text-faint)' }} />
                  <span className="text-xs" style={{ color: 'var(--color-text-faint)' }}>
                    Run a simulation to record the first score
                  </span>
                </div>
              )}
            </div>

            {/* Footer stats */}
            {benchmarkRuns.length > 0 && (
              <div
                className="shrink-0 grid grid-cols-3 divide-x px-0 py-2"
                style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
              >
                <div className="flex flex-col items-center py-1">
                  <span className="text-xs font-bold" style={{ color: '#6366f1' }}>
                    {benchmarkRuns[0]?.totalReward.toFixed(1) ?? '—'}
                  </span>
                  <span className="text-[8px]" style={{ color: 'var(--color-text-faint)' }}>TOP REWARD</span>
                </div>
                <div className="flex flex-col items-center py-1">
                  <span className="text-xs font-bold" style={{ color: '#22c55e' }}>
                    {benchmarkRuns.length}
                  </span>
                  <span className="text-[8px]" style={{ color: 'var(--color-text-faint)' }}>MODELS RUN</span>
                </div>
                <div className="flex flex-col items-center py-1">
                  <span className="text-xs font-bold" style={{ color: '#f97316' }}>
                    {benchmarkRuns.filter(r => r.isComplete).length}
                  </span>
                  <span className="text-[8px]" style={{ color: 'var(--color-text-faint)' }}>FULL RUNS</span>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
