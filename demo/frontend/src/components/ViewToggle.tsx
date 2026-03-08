import { motion } from 'framer-motion'
import { useStore } from '../store/useStore'
import type { ViewMode } from '../types'

const modes: { key: ViewMode; label: string }[] = [
  { key: 'playground', label: '2D' },
  { key: '4d', label: '4D' },
  { key: 'tabular', label: 'DASH' },
]

export function ViewToggle() {
  const viewMode = useStore(s => s.viewMode)
  const setViewMode = useStore(s => s.setViewMode)

  return (
    <div className="flex rounded-md overflow-hidden relative" style={{ border: '1px solid var(--color-border)' }}>
      {modes.map(m => (
        <button
          key={m.key}
          onClick={() => setViewMode(m.key)}
          className="text-[10px] font-semibold px-3 py-0.5 transition-colors relative z-10"
          style={{
            background: 'transparent',
            color: viewMode === m.key ? '#ffffff' : 'var(--color-text-faint)',
          }}
        >
          {viewMode === m.key && (
            <motion.div
              layoutId="viewToggleBg"
              className="absolute inset-0"
              style={{ background: '#4f46e5', borderRadius: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
          )}
          <span className="relative z-10">{m.label}</span>
        </button>
      ))}
    </div>
  )
}
