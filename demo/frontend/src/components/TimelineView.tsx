import { useStore } from '../store/useStore'
import { PHASE_COLORS, PHASE_STEP_RANGES, SCENARIO_LABELS } from '../types'
import type { Phase } from '../types'

const PHASES: Phase[] = ['standup', 'execution', 'review', 'planning']
const TOTAL_STEPS = 24

const PHASE_WIDTHS: Record<string, number> = {
  standup:   (2  / TOTAL_STEPS) * 100,
  execution: (17 / TOTAL_STEPS) * 100,
  review:    (1  / TOTAL_STEPS) * 100,
  planning:  (4  / TOTAL_STEPS) * 100,
  done:      0,
}

export function TimelineView() {
  const step = useStore(s => s.step)
  const phase = useStore(s => s.phase)
  const episode = useStore(s => s.episode)
  const scenario = useStore(s => s.scenario)
  const events = useStore(s => s.events)
  const done = useStore(s => s.done)

  const progress = Math.min(step / TOTAL_STEPS, 1) * 100

  return (
    <div className="flex items-center gap-3 px-3 h-full">
      {/* Episode + scenario badges */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-faint)' }}>EP</span>
        <span className="text-sm font-bold font-mono" style={{ color: 'var(--color-text-primary)' }}>{episode}</span>
        <span
          className="text-[9px] px-2 py-0.5 rounded-full font-semibold"
          style={{ background: 'var(--color-card-bg)', color: '#6366f1', border: '1px solid var(--color-border)' }}
        >
          {SCENARIO_LABELS[scenario]}
        </span>
      </div>

      {/* Timeline bar */}
      <div className="flex-1 relative">
        {/* Phase bands */}
        <div className="flex h-3 rounded overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
          {PHASES.map(p => (
            <div
              key={p}
              style={{
                width: `${PHASE_WIDTHS[p]}%`,
                background: phase === p ? PHASE_COLORS[p] : `${PHASE_COLORS[p]}30`,
                transition: 'background 0.3s',
              }}
            />
          ))}
        </div>

        {/* Progress overlay */}
        <div
          className="absolute top-0 left-0 h-3 rounded pointer-events-none"
          style={{
            width: `${progress}%`,
            background: 'rgba(0,0,0,0.06)',
            borderRight: done ? 'none' : '2px solid #334155',
            transition: 'width 0.3s ease',
          }}
        />

        {/* Event markers */}
        {events.map((ev, i) => {
          const pct = (ev.step / TOTAL_STEPS) * 100
          return (
            <div
              key={i}
              className="absolute -top-1"
              style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
              title={ev.description}
            >
              <span className="text-[10px]">*</span>
            </div>
          )
        })}

        {/* Phase labels */}
        <div className="flex text-[8px] mt-0.5" style={{ color: 'var(--color-text-faint)' }}>
          {PHASES.map(p => (
            <div
              key={p}
              style={{ width: `${PHASE_WIDTHS[p]}%` }}
              className="truncate text-center"
            >
              {p.slice(0, 4).toUpperCase()}
            </div>
          ))}
        </div>
      </div>

      {/* Step counter */}
      <div className="shrink-0 text-right font-mono">
        <span className="text-xs font-bold" style={{ color: 'var(--color-text-primary)' }}>{Math.min(step, 24)}</span>
        <span className="text-[10px]" style={{ color: 'var(--color-text-faint)' }}>/{TOTAL_STEPS}</span>
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
        {phase}
      </div>
    </div>
  )
}
