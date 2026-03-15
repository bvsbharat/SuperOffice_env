import { useEffect } from 'react'
import { Brain } from 'lucide-react'
import { useStore } from '../store/useStore'

export function ModeSelector() {
  const setSimMode = useStore(s => s.setSimMode)

  // Lock to inference mode on mount
  useEffect(() => {
    setSimMode('inference')
  }, [setSimMode])

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 8px',
        height: 32,
        minWidth: 0,
        borderRadius: 5,
        background: 'var(--color-card-bg)',
        border: '1px solid var(--color-border)',
      }}
    >
      <span style={{ color: '#8b5cf6', flexShrink: 0 }}><Brain size={14} /></span>
      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-primary)', whiteSpace: 'nowrap' }}>
        Trained Model
      </span>
      <span style={{
        fontSize: 8, padding: '1px 4px', borderRadius: 3, fontWeight: 700,
        background: '#8b5cf622', color: '#8b5cf6',
      }}>
        LORA
      </span>
    </div>
  )
}
