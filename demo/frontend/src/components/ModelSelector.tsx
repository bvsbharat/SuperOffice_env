import { useEffect } from 'react'
import { Brain } from 'lucide-react'
import { useStore } from '../store/useStore'

export function ModelSelector() {
  const setCurrentModel = useStore(s => s.setCurrentModel)

  // Fetch model from backend on mount
  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(d => { if (d.model && d.model !== 'unknown') setCurrentModel(d.model, d.provider ?? 'art') })
      .catch(() => {})
  }, [setCurrentModel])

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '2px 10px',
        height: 32,
        flex: 1,
        minWidth: 0,
        borderRadius: 5,
        background: 'var(--color-card-bg)',
        border: '1px solid var(--color-border)',
      }}
    >
      <span style={{ color: '#8b5cf6', flexShrink: 0 }}><Brain size={16} /></span>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        Qwen 2.5 14B (Trained)
      </span>
      <span style={{
        fontSize: 8, padding: '1px 5px', borderRadius: 3, fontWeight: 700, flexShrink: 0,
        background: '#ef444422', color: '#ef4444',
      }}>
        TRAINED
      </span>
    </div>
  )
}
