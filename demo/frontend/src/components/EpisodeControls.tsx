import { useCallback, useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import type { Speed } from '../types'

const SPEED_INTERVALS: Record<Speed, number> = { 1: 3000, 2: 1500, 5: 600 }

export function EpisodeControls() {
  const isRunning = useStore(s => s.isRunning)
  const speed = useStore(s => s.speed)
  const done = useStore(s => s.done)
  const isLoading = useStore(s => s.isLoading)
  const day = useStore(s => s.day)
  const turn = useStore(s => s.turn)
  const maxDays = useStore(s => s.maxDays)
  const wsConnected = useStore(s => s.wsConnected)
  const { setIsRunning, setSpeed, setIsLoading, setError, applyStepResult, applyFullState } = useStore()

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const apiStep = useCallback(async () => {
    if (isLoading) return
    setIsLoading(true)
    try {
      const res = await fetch('/api/step', { method: 'POST' })
      if (!res.ok) throw new Error(`step failed: ${res.status}`)
      const data = await res.json()
      applyStepResult(data)
      if (data.done) setIsRunning(false)
    } catch (e: any) {
      setError(e.message)
      setIsRunning(false)
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, setIsLoading, setError, applyStepResult, setIsRunning])

  const apiReset = useCallback(async () => {
    setIsRunning(false)
    setIsLoading(true)
    try {
      const res = await fetch('/api/reset', { method: 'POST' })
      if (!res.ok) throw new Error(`reset failed: ${res.status}`)
      const data = await res.json()
      applyFullState(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setIsLoading(false)
    }
  }, [setIsRunning, setIsLoading, setError, applyFullState])

  // Auto-play loop
  useEffect(() => {
    if (isRunning && !done) {
      intervalRef.current = setInterval(apiStep, SPEED_INTERVALS[speed])
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [isRunning, done, speed, apiStep])

  const canStep = !done && !isLoading

  return (
    <div className="flex items-center gap-3 px-3 h-full">
      {/* Play / Pause */}
      <button
        onClick={() => setIsRunning(!isRunning)}
        disabled={!canStep}
        className={`text-lg leading-none transition-opacity ${!canStep ? 'opacity-30 cursor-not-allowed' : 'hover:scale-110'}`}
        title={isRunning ? 'Pause' : 'Play'}
      >
        {isRunning ? '\u23F8' : '\u25B6\uFE0F'}
      </button>

      {/* Step */}
      <button
        onClick={apiStep}
        disabled={!canStep || isRunning}
        className={`text-lg leading-none transition-opacity ${(!canStep || isRunning) ? 'opacity-30 cursor-not-allowed' : 'hover:scale-110'}`}
        title="Step"
      >
        {'\u23ED'}
      </button>

      {/* Reset */}
      <button
        onClick={apiReset}
        disabled={isLoading}
        className={`text-lg leading-none transition-opacity ${isLoading ? 'opacity-30' : 'hover:scale-110'}`}
        title="Reset"
      >
        {'\uD83D\uDD04'}
      </button>

      <div className="w-px h-5" style={{ background: 'var(--color-border)' }} />

      {/* Speed */}
      <div className="flex items-center gap-1">
        <span className="text-[9px]" style={{ color: 'var(--color-text-faint)' }}>SPEED</span>
        {([1, 2, 5] as Speed[]).map(s => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold transition-colors"
            style={speed === s
              ? { background: '#6366f1', color: '#ffffff' }
              : { background: 'var(--color-card-bg)', color: 'var(--color-text-muted)' }
            }
          >
            {s}x
          </button>
        ))}
      </div>

      <div className="w-px h-5" style={{ background: 'var(--color-border)' }} />

      {/* Day / Turn info */}
      <div className="flex items-center gap-2 text-[10px] font-mono" style={{ color: 'var(--color-text-faint)' }}>
        <span>Day <span style={{ color: 'var(--color-text-secondary)' }}>{day}/{maxDays}</span></span>
        <span>Turn <span style={{ color: 'var(--color-text-secondary)' }}>{turn}</span></span>
      </div>

      {/* WS status */}
      <div className="ml-auto flex items-center gap-1.5">
        <div
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: wsConnected ? '#22c55e' : '#ef4444' }}
        />
        <span className="text-[9px]" style={{ color: 'var(--color-text-faint)' }}>{wsConnected ? 'LIVE' : 'OFFLINE'}</span>
      </div>

      {isLoading && (
        <div className="w-1 h-1 rounded-full bg-indigo-400 animate-ping" />
      )}
    </div>
  )
}
