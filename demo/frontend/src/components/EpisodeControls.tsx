import { useCallback, useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import { ModelSelector } from './ModelSelector'
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

  // Refs so the interval callback always reads the latest values without
  // being a dep of the interval effect (which would restart the timer on
  // every isLoading toggle, causing races with the done state).
  const isLoadingRef = useRef(isLoading)
  const doneRef = useRef(done)
  useEffect(() => { isLoadingRef.current = isLoading }, [isLoading])
  useEffect(() => { doneRef.current = done }, [done])

  const apiStep = useCallback(async () => {
    if (isLoadingRef.current || doneRef.current) return
    setIsLoading(true)
    try {
      const res = await fetch('/api/step', { method: 'POST' })
      if (!res.ok) throw new Error(`step failed: ${res.status}`)
      const data = await res.json()
      applyStepResult(data)
      if (data.done || data.state?.done) {
        setIsRunning(false)
      }
    } catch (e: any) {
      setError(e.message)
      setIsRunning(false)
    } finally {
      setIsLoading(false)
    }
  }, [setIsLoading, setError, applyStepResult, setIsRunning])

  // Keep a ref to the latest apiStep so the interval never holds a stale copy
  const apiStepRef = useRef(apiStep)
  useEffect(() => { apiStepRef.current = apiStep }, [apiStep])

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

  // Auto-play loop — only re-runs on isRunning / done / speed changes,
  // NOT on isLoading or apiStep changes (those would restart the timer mid-run).
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (!isRunning || done) return
    intervalRef.current = setInterval(() => apiStepRef.current(), SPEED_INTERVALS[speed])
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isRunning, done, speed])

  const canStep = !done && !isLoading

  return (
    <div className="flex items-center gap-3 px-3 h-full">
      {/* Model Selector */}
      <ModelSelector />

      <div className="w-px h-5" style={{ background: 'var(--color-border)' }} />

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
