import { Html } from '@react-three/drei'
import type { AgentId } from '../../types'
import { AGENT_3D_CONFIG } from '../../types'

interface AgentLabelProps {
  agentId: AgentId
  position: [number, number, number]
  text: string
}

export function AgentLabel({ agentId, position, text }: AgentLabelProps) {
  const config = AGENT_3D_CONFIG[agentId]
  const truncated = text.length > 200 ? text.slice(0, 197) + '...' : text

  return (
    <Html
      position={[position[0] + 1.6, position[1] + 0.5, position[2]]}
      center
      distanceFactor={6}
      style={{ pointerEvents: 'none' }}
    >
      <div style={{
        background: 'rgba(10, 15, 30, 0.88)',
        backdropFilter: 'blur(10px)',
        border: `1px solid ${config.color}`,
        borderLeft: `3px solid ${config.color}`,
        borderRadius: 8,
        padding: '8px 12px',
        width: 280,
        fontFamily: 'monospace',
        boxShadow: `0 0 12px ${config.color}33`,
      }}>
        <div style={{
          fontSize: 10,
          fontWeight: 700,
          color: config.color,
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: 4,
        }}>
          {agentId}
        </div>
        <div style={{
          fontSize: 11,
          color: '#e0e7ff',
          lineHeight: 1.4,
        }}>
          {truncated}
        </div>
      </div>
    </Html>
  )
}
