import { useStore } from '../store/useStore'
import { PHASE_COLORS } from '../types'
import type { Phase } from '../types'

const PHASES: Phase[] = ['morning_standup', 'execution', 'review', 'planning']

const PHASE_LABELS: Record<Phase, string> = {
  morning_standup: 'STANDUP',
  execution: 'EXEC',
  review: 'REVIEW',
  planning: 'PLAN',
  done: 'DONE',
}

export function TimelineView() {
  const day = useStore(s => s.day)
  const turn = useStore(s => s.turn)
  const phase = useStore(s => s.phase)
  const maxDays = useStore(s => s.maxDays)
  const events = useStore(s => s.events)
  const done = useStore(s => s.done)

  const progress = Math.min(day / maxDays, 1) * 100

  return (
    <div className="flex items-center gap-3 px-3 h-full">
      {/* Day badge */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-faint)' }}>DAY</span>
        <span className="text-sm font-bold font-mono" style={{ color: 'var(--color-text-primary)' }}>{day}</span>
        <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-faint)' }}>/ {maxDays}</span>
      </div>

      {/* Timeline bar */}
      <div className="flex-1 relative">
        {/* Progress bar */}
        <div className="h-3 rounded overflow-hidden" style={{ border: '1px solid var(--color-border)', background: 'var(--color-card-bg)' }}>
          <div
            className="h-full rounded transition-all duration-300"
            style={{
              width: `${progress}%`,
              background: PHASE_COLORS[phase] ?? PHASE_COLORS.done,
            }}
          />
        </div>

        {/* Phase label below */}
        <div className="flex text-[8px] mt-0.5 justify-between" style={{ color: 'var(--color-text-faint)' }}>
          {PHASES.map(p => (
            <span
              key={p}
              className="truncate"
              style={{
                color: phase === p ? PHASE_COLORS[p] : undefined,
                fontWeight: phase === p ? 700 : 400,
              }}
            >
              {PHASE_LABELS[p]}
            </span>
          ))}
        </div>
      </div>

      {/* Turn counter */}
      <div className="shrink-0 text-right font-mono">
        <span className="text-xs font-bold" style={{ color: 'var(--color-text-primary)' }}>T{turn}</span>
      </div>

      {/* Current phase badge */}
      <div
        className="shrink-0 text-[9px] px-2 py-0.5 rounded-full font-semibold uppercase"
        style={{
          background: `${PHASE_COLORS[phase] ?? PHASE_COLORS.done}18`,
          color: PHASE_COLORS[phase] ?? PHASE_COLORS.done,
          border: `1px solid ${PHASE_COLORS[phase] ?? PHASE_COLORS.done}40`,
        }}
      >
        {PHASE_LABELS[phase] ?? phase}
      </div>
    </div>
  )
}
