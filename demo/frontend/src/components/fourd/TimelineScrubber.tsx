import { useEffect, useRef, useCallback, useState } from 'react'
import { useStore } from '../../store/useStore'
import type { Speed } from '../../types'
import { PHASE_COLORS } from '../../types'

const SPEED_INTERVALS: Record<Speed, number> = { 1: 1000, 2: 500, 5: 200 }

export function TimelineScrubber() {
  const stateHistory = useStore(s => s.stateHistory)
  const timelineStep = useStore(s => s.timelineStep)
  const isTimelinePlaying = useStore(s => s.isTimelinePlaying)
  const timelineSpeed = useStore(s => s.timelineSpeed)
  const setTimelineStep = useStore(s => s.setTimelineStep)
  const setTimelinePlaying = useStore(s => s.setTimelinePlaying)
  const setTimelineSpeed = useStore(s => s.setTimelineSpeed)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [hoveredStep, setHoveredStep] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const totalSteps = stateHistory.length

  // Auto-play timeline
  useEffect(() => {
    if (isTimelinePlaying && totalSteps > 0) {
      intervalRef.current = setInterval(() => {
        const current = useStore.getState().timelineStep
        const max = useStore.getState().stateHistory.length - 1
        if (current === null) {
          setTimelineStep(0)
        } else if (current < max) {
          setTimelineStep(current + 1)
        } else {
          setTimelinePlaying(false)
        }
      }, SPEED_INTERVALS[timelineSpeed])
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [isTimelinePlaying, timelineSpeed, totalSteps, setTimelineStep, setTimelinePlaying])

  const getStepFromMouseEvent = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!trackRef.current || totalSteps === 0) return null
    const rect = trackRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
    return Math.round((x / rect.width) * (totalSteps - 1))
  }, [totalSteps])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const step = getStepFromMouseEvent(e)
    if (step !== null) {
      setTimelineStep(step)
      setIsDragging(true)
    }
  }, [getStepFromMouseEvent, setTimelineStep])

  useEffect(() => {
    if (!isDragging) return
    const handleMouseMove = (e: MouseEvent) => {
      const step = getStepFromMouseEvent(e)
      if (step !== null) setTimelineStep(step)
    }
    const handleMouseUp = () => setIsDragging(false)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, getStepFromMouseEvent, setTimelineStep])

  const goLive = () => {
    setTimelineStep(null)
    setTimelinePlaying(false)
  }

  const goFirst = () => { if (totalSteps > 0) setTimelineStep(0) }
  const goPrev = () => {
    if (timelineStep !== null && timelineStep > 0) setTimelineStep(timelineStep - 1)
  }
  const goNext = () => {
    if (timelineStep !== null && timelineStep < totalSteps - 1) setTimelineStep(timelineStep + 1)
    else if (timelineStep === null && totalSteps > 0) setTimelineStep(0)
  }
  const goLast = () => { if (totalSteps > 0) setTimelineStep(totalSteps - 1) }

  const isLive = timelineStep === null

  return (
    <div
      className="w-full flex items-center gap-2 px-3 py-2"
      style={{
        background: 'rgba(15, 23, 42, 0.9)',
        backdropFilter: 'blur(12px)',
        borderTop: '1px solid rgba(99,102,241,0.3)',
      }}
    >
      {/* Playback controls */}
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={goFirst} className="fourd-btn" title="First step">|&lt;</button>
        <button onClick={goPrev} className="fourd-btn" title="Previous step">&lt;</button>
        <button
          onClick={() => {
            if (isTimelinePlaying) {
              setTimelinePlaying(false)
            } else {
              if (timelineStep === null && totalSteps > 0) setTimelineStep(0)
              setTimelinePlaying(true)
            }
          }}
          className="fourd-btn fourd-btn-primary"
          title={isTimelinePlaying ? 'Pause' : 'Play timeline'}
          disabled={totalSteps === 0}
        >
          {isTimelinePlaying ? '||' : '\u25B6'}
        </button>
        <button onClick={goNext} className="fourd-btn" title="Next step">&gt;</button>
        <button onClick={goLast} className="fourd-btn" title="Last step">&gt;|</button>
      </div>

      {/* Speed selector */}
      <div className="flex items-center gap-0.5 shrink-0">
        {([1, 2, 5] as Speed[]).map(s => (
          <button
            key={s}
            onClick={() => setTimelineSpeed(s)}
            className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold transition-colors"
            style={timelineSpeed === s
              ? { background: '#6366f1', color: '#fff' }
              : { background: 'rgba(51,65,85,0.6)', color: '#94a3b8' }
            }
          >
            {s}x
          </button>
        ))}
      </div>

      {/* Timeline track */}
      <div
        ref={trackRef}
        className="flex-1 relative h-6 cursor-pointer rounded"
        style={{ background: 'rgba(30,41,59,0.8)' }}
        onMouseDown={handleMouseDown}
        onMouseMove={(e) => {
          const step = getStepFromMouseEvent(e)
          setHoveredStep(step)
        }}
        onMouseLeave={() => setHoveredStep(null)}
      >
        {/* Phase color bands */}
        {totalSteps > 0 && stateHistory.map((snap, i) => {
          const left = (i / (totalSteps - 1 || 1)) * 100
          const width = 100 / (totalSteps || 1)
          return (
            <div
              key={i}
              className="absolute top-0 bottom-0"
              style={{
                left: `${left - width / 2}%`,
                width: `${width}%`,
                background: PHASE_COLORS[snap.phase] || '#6b7280',
                opacity: 0.15,
              }}
            />
          )
        })}

        {/* Step dots */}
        {stateHistory.map((snap, i) => {
          const left = totalSteps <= 1 ? 50 : (i / (totalSteps - 1)) * 100
          const isActive = timelineStep === i
          const isHovered = hoveredStep === i
          return (
            <div
              key={i}
              className="absolute top-1/2 -translate-y-1/2 rounded-full transition-all"
              style={{
                left: `${left}%`,
                transform: `translateX(-50%) translateY(-50%) scale(${isActive ? 1.5 : isHovered ? 1.2 : 1})`,
                width: 8,
                height: 8,
                background: isActive ? '#fff' : PHASE_COLORS[snap.phase] || '#6b7280',
                border: isActive ? '2px solid #6366f1' : 'none',
                boxShadow: isActive ? '0 0 8px rgba(99,102,241,0.6)' : 'none',
                zIndex: isActive ? 10 : 1,
              }}
            />
          )
        })}

        {/* Hover tooltip */}
        {hoveredStep !== null && stateHistory[hoveredStep] && (
          <div
            className="absolute bottom-full mb-2 px-2 py-1 rounded text-[10px] whitespace-nowrap pointer-events-none"
            style={{
              left: `${totalSteps <= 1 ? 50 : (hoveredStep / (totalSteps - 1)) * 100}%`,
              transform: 'translateX(-50%)',
              background: 'rgba(15,23,42,0.95)',
              border: '1px solid rgba(99,102,241,0.4)',
              color: '#e2e8f0',
            }}
          >
            <div className="font-semibold">Day {(stateHistory[hoveredStep] as any).day || '?'} / Step {stateHistory[hoveredStep].step}</div>
            <div style={{ color: '#94a3b8' }}>
              {stateHistory[hoveredStep].activeAgent || 'none'} - {(stateHistory[hoveredStep] as any).action || 'idle'}
            </div>
            <div style={{ color: stateHistory[hoveredStep].globalReward >= 0 ? '#22c55e' : '#ef4444' }}>
              R: {stateHistory[hoveredStep].globalReward.toFixed(2)}
            </div>
          </div>
        )}
      </div>

      {/* Step counter */}
      <span className="text-[10px] font-mono shrink-0" style={{ color: '#94a3b8' }}>
        {timelineStep !== null ? `${timelineStep + 1}/${totalSteps}` : `${totalSteps}`}
      </span>

      {/* GO LIVE button */}
      <button
        onClick={goLive}
        className="shrink-0 text-[10px] font-bold px-2 py-1 rounded transition-colors"
        style={isLive
          ? { background: '#22c55e', color: '#fff' }
          : { background: 'rgba(51,65,85,0.6)', color: '#94a3b8', border: '1px solid rgba(99,102,241,0.3)' }
        }
      >
        {isLive ? 'LIVE' : 'GO LIVE'}
      </button>
    </div>
  )
}
