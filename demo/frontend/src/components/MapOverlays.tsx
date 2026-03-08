import { useEffect, useRef, useState, useCallback } from 'react'
import type { PhaserBridge } from '../game/OfficeScene'
import { useStore } from '../store/useStore'
import { AGENT_ORDER, ROOM_LABELS } from '../types'
import { ROOM_LABEL_POSITIONS, tileToPixel } from '../game/officeLayout'

interface MapOverlaysProps {
  bridge: PhaserBridge | null
}

interface ScreenPositions {
  agents: Record<string, { x: number; y: number }>
  roomLabels: Record<string, { x: number; y: number }>
}

const STATUS_COLORS: Record<string, string> = {
  idle: '#cbd5e1',
  active: '#22c55e',
  done: '#6366f1',
}

export function MapOverlays({ bridge }: MapOverlaysProps) {
  const [positions, setPositions] = useState<ScreenPositions | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)
  const frameCount = useRef(0)

  const agents = useStore((s) => s.agents)

  const updatePositions = useCallback(() => {
    if (!bridge || !overlayRef.current) {
      rafRef.current = requestAnimationFrame(updatePositions)
      return
    }

    frameCount.current++
    // Update every 2 frames (~30fps)
    if (frameCount.current % 2 === 0) {
      const agentWorld = bridge.getAgentWorldPositions()
      const agentScreen: Record<string, { x: number; y: number }> = {}
      for (const aid of AGENT_ORDER) {
        const wp = agentWorld[aid]
        if (wp) {
          const sp = bridge.worldToScreen(wp.x, wp.y)
          if (sp) agentScreen[aid] = sp
        }
      }

      const roomLabelScreen: Record<string, { x: number; y: number }> = {}
      for (const aid of AGENT_ORDER) {
        const lp = ROOM_LABEL_POSITIONS[aid]
        const { x: wx, y: wy } = tileToPixel(lp.tx, lp.ty)
        const sp = bridge.worldToScreen(wx, wy)
        if (sp) roomLabelScreen[aid] = sp
      }

      setPositions({ agents: agentScreen, roomLabels: roomLabelScreen })
    }

    rafRef.current = requestAnimationFrame(updatePositions)
  }, [bridge])

  useEffect(() => {
    if (!bridge) return
    rafRef.current = requestAnimationFrame(updatePositions)
    return () => cancelAnimationFrame(rafRef.current)
  }, [bridge, updatePositions])

  if (!positions) return null

  return (
    <div ref={overlayRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 100, overflow: 'visible', transform: 'translateZ(1px)' }}>
      {/* Room Labels */}
      {AGENT_ORDER.map((aid) => {
        const pos = positions.roomLabels[aid]
        if (!pos) return null
        return (
          <div
            key={`label-${aid}`}
            className="room-label absolute"
            style={{
              left: pos.x,
              top: pos.y,
              transform: 'translate(-50%, -50%)',
            }}
          >
            {ROOM_LABELS[aid]}
          </div>
        )
      })}

      {/* Status Badges */}
      {AGENT_ORDER.map((aid) => {
        const pos = positions.agents[aid]
        if (!pos) return null
        const agent = agents[aid]
        if (!agent) return null
        const dotColor = STATUS_COLORS[agent.status] ?? STATUS_COLORS.idle
        return (
          <div
            key={`badge-${aid}`}
            className="status-badge absolute"
            style={{
              left: pos.x,
              top: pos.y + 45,
              transform: 'translate(-50%, 0)',
            }}
          >
            <span
              className="inline-block w-[6px] h-[6px] rounded-full flex-shrink-0"
              style={{ backgroundColor: dotColor }}
            />
            {agent.status === 'active' && (
              <span>Working...</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
