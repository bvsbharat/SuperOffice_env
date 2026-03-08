import { useStore } from '../store/useStore'
import type { ViewMode } from '../types'

const modes: { key: ViewMode; label: string }[] = [
  { key: 'playground', label: 'MAP' },
  { key: '3d', label: '3D' },
  { key: '4d', label: '4D' },
  { key: 'tabular', label: 'DASH' },
]

export function ViewToggle() {
  const viewMode = useStore(s => s.viewMode)
  const setViewMode = useStore(s => s.setViewMode)

  return (
    <div className="flex rounded-md overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
      {modes.map(m => (
        <button
          key={m.key}
          onClick={() => setViewMode(m.key)}
          className="text-[10px] font-semibold px-3 py-0.5 transition-colors"
          style={{
            background: viewMode === m.key ? '#4f46e5' : 'var(--color-panel)',
            color: viewMode === m.key ? '#ffffff' : 'var(--color-text-faint)',
          }}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}
