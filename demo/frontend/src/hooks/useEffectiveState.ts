import { useStore } from '../store/useStore'
import type { AgentId, GTMAgent, KPISnapshot, Phase } from '../types'

export interface EffectiveState {
  agents: Record<AgentId, GTMAgent>
  kpis: KPISnapshot
  activeAgent: AgentId | null
  phase: Phase
  step: number
  day: number
  globalReward: number
  reasoning: string
  action: string
  target: string
  isHistorical: boolean
}

export function useEffectiveState(): EffectiveState {
  const timelineStep = useStore(s => s.timelineStep)
  const stateHistory = useStore(s => s.stateHistory)

  // Live state
  const agents = useStore(s => s.agents)
  const kpis = useStore(s => s.kpis)
  const activeAgent = useStore(s => s.activeAgent)
  const phase = useStore(s => s.phase)
  const step = useStore(s => s.step)
  const day = useStore(s => s.day)
  const globalReward = useStore(s => s.globalReward)

  if (timelineStep !== null && stateHistory[timelineStep]) {
    const snap = stateHistory[timelineStep]
    return {
      agents: snap.agents,
      kpis: snap.kpis,
      activeAgent: snap.activeAgent,
      phase: snap.phase,
      step: snap.step,
      day: snap.day,
      globalReward: snap.globalReward,
      reasoning: snap.reasoning,
      action: snap.action,
      target: snap.target,
      isHistorical: true,
    }
  }

  return {
    agents,
    kpis,
    activeAgent,
    phase,
    step,
    day,
    globalReward,
    reasoning: '',
    action: '',
    target: '',
    isHistorical: false,
  }
}
