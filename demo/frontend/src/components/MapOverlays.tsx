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

interface HoverState {
  agent: string | null
  x: number
  y: number
}

const STATUS_COLORS: Record<string, string> = {
  idle: '#cbd5e1',
  active: '#22c55e',
  done: '#6366f1',
}

export function MapOverlays({ bridge }: MapOverlaysProps) {
  const [positions, setPositions] = useState<ScreenPositions | null>(null)
  const [hover, setHover] = useState<HoverState>({ agent: null, x: 0, y: 0 })
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

      {/* Status Badges with Hover Interaction */}
      {AGENT_ORDER.map((aid) => {
        const pos = positions.agents[aid]
        if (!pos) return null
        const agent = agents[aid]
        if (!agent) return null
        const dotColor = STATUS_COLORS[agent.status] ?? STATUS_COLORS.idle
        const isHovered = hover.agent === aid
        return (
          <div
            key={`badge-${aid}`}
            className="status-badge absolute group cursor-pointer pointer-events-auto"
            style={{
              left: pos.x,
              top: pos.y + 45,
              transform: 'translate(-50%, 0)',
              transition: 'transform 200ms ease-out',
              ...( isHovered && {transform: 'translate(-50%, -5px) scale(1.1)' })
            }}
            onMouseEnter={() => setHover({ agent: aid, x: pos.x, y: pos.y })}
            onMouseLeave={() => setHover({ agent: null, x: 0, y: 0 })}
          >
            <span
              className="inline-block w-[6px] h-[6px] rounded-full flex-shrink-0"
              style={{ backgroundColor: dotColor }}
            />
            {agent.status === 'active' && (
              <span className="ml-1 text-xs text-green-400">Working...</span>
            )}
          </div>
        )
      })}

      {/* Hover Tooltip */}
      {hover.agent && (agents as any)[hover.agent] && (
        <div
          className="absolute bg-slate-900 text-white text-xs rounded px-2 py-1.5 pointer-events-none z-50 border border-slate-700 shadow-lg"
          style={{
            left: hover.x,
            top: hover.y - 60,
            transform: 'translateX(-50%)',
            animation: 'fadeIn 200ms ease-out',
            whiteSpace: 'nowrap',
          }}
        >
          <div className="font-semibold">{((agents as any)[hover.agent] as any)?.name || hover.agent}</div>
          <div className="text-slate-400">{((agents as any)[hover.agent] as any)?.current_task || 'Idle'}</div>
          <div className="text-slate-500 mt-1">Status: {((agents as any)[hover.agent] as any)?.status}</div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(4px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  )
}
