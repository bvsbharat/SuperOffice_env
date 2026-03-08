import { motion, AnimatePresence } from 'framer-motion'
import type { ScenarioKey } from '../types'
import { SCENARIO_LABELS } from '../types'

const SCENARIO_DESC: Record<ScenarioKey, string> = {
  baseline:          'Standard GTM execution — no external shocks',
  competitor_launch: 'Rival product announced at step 4 — leads cool',
  series_a:          'Investor pressure from step 0 — 2x growth required',
  churn_spike:       '20% churn at step 8 — Dev shifts to damage control',
  viral_moment:      '10x traffic flood at step 12 — capacity strain',
}

const SCENARIO_MULT: Record<ScenarioKey, string> = {
  baseline:          '1.0x',
  competitor_launch: '0.7x',
  series_a:          '1.3x / -0.5',
  churn_spike:       '0.6x',
  viral_moment:      '1.5x',
}

const MULT_COLOR: Record<ScenarioKey, string> = {
  baseline:          '#16a34a',
  competitor_launch: '#dc2626',
  series_a:          '#d97706',
  churn_spike:       '#dc2626',
  viral_moment:      '#16a34a',
}

interface Props {
  current: ScenarioKey
  onSelect: (s: ScenarioKey) => void
  onClose: () => void
}

export function ScenarioSelector({ current, onSelect, onClose }: Props) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.92, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="rounded-xl p-6 w-[480px] max-w-[95vw] shadow-xl"
          style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-primary)' }}>Select Scenario</h2>
            <button onClick={onClose} className="text-lg" style={{ color: 'var(--color-text-faint)' }}>x</button>
          </div>

          <div className="space-y-2">
            {(Object.keys(SCENARIO_LABELS) as ScenarioKey[]).map(k => (
              <button
                key={k}
                onClick={() => { onSelect(k); onClose() }}
                className={`w-full text-left rounded-lg border p-3 transition-all
                  ${current === k
                    ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 dark:border-indigo-600'
                    : 'border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-500'}`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>{SCENARIO_LABELS[k]}</span>
                  <span
                    className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded"
                    style={{ color: MULT_COLOR[k], background: `${MULT_COLOR[k]}12` }}
                  >
                    {SCENARIO_MULT[k]}
                  </span>
                </div>
                <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{SCENARIO_DESC[k]}</div>
              </button>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
