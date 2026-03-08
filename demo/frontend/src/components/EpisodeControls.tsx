import { useCallback, useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import type { Speed, ScenarioKey } from '../types'
import { SCENARIO_LABELS } from '../types'

const SPEED_INTERVALS: Record<Speed, number> = { 1: 1800, 2: 900, 5: 360 }

export function EpisodeControls() {
  const isRunning = useStore(s => s.isRunning)
  const speed = useStore(s => s.speed)
  const scenario = useStore(s => s.scenario)
  const done = useStore(s => s.done)
  const isLoading = useStore(s => s.isLoading)
  const step = useStore(s => s.step)
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
      const res = await fetch('/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario }),
      })
      if (!res.ok) throw new Error(`reset failed: ${res.status}`)
      const data = await res.json()
      applyFullState(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setIsLoading(false)
    }
  }, [scenario, setIsRunning, setIsLoading, setError, applyFullState])

  const apiSetScenario = useCallback(async (s: ScenarioKey) => {
    setIsRunning(false)
    try {
      const res = await fetch(`/api/scenario/${s}`, { method: 'POST' })
      if (!res.ok) return
      const data = await res.json()
      applyFullState(data)
    } catch {}
  }, [setIsRunning, applyFullState])

  // Auto-play loop
  useEffect(() => {
    if (isRunning && !done) {
      intervalRef.current = setInterval(apiStep, SPEED_INTERVALS[speed])
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [isRunning, done, speed, apiStep])

  const canStep = !done && !isLoading && step < 24

  return (
    <div className="flex items-center gap-3 px-3 h-full">
      {/* Play / Pause */}
      <button
        onClick={() => setIsRunning(!isRunning)}
        disabled={!canStep}
        className={`text-lg leading-none transition-opacity ${!canStep ? 'opacity-30 cursor-not-allowed' : 'hover:scale-110'}`}
        title={isRunning ? 'Pause' : 'Play'}
      >
        {isRunning ? '⏸' : '▶️'}
      </button>

      {/* Step */}
      <button
        onClick={apiStep}
        disabled={!canStep || isRunning}
        className={`text-lg leading-none transition-opacity ${(!canStep || isRunning) ? 'opacity-30 cursor-not-allowed' : 'hover:scale-110'}`}
        title="Step"
      >
        ⏭
      </button>

      {/* Reset */}
      <button
        onClick={apiReset}
        disabled={isLoading}
        className={`text-lg leading-none transition-opacity ${isLoading ? 'opacity-30' : 'hover:scale-110'}`}
        title="Reset"
      >
        🔄
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

      {/* Scenario */}
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] shrink-0" style={{ color: 'var(--color-text-faint)' }}>SCENARIO</span>
        <select
          value={scenario}
          onChange={e => apiSetScenario(e.target.value as ScenarioKey)}
          className="text-[10px] rounded px-1.5 py-0.5 focus:outline-none"
          style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          {(Object.entries(SCENARIO_LABELS) as [ScenarioKey, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
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
