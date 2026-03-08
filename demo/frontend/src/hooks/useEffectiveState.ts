import { useStore } from '../store/useStore'
import type { AgentId, GTMAgent, KPISnapshot, Phase } from '../types'

export interface EffectiveState {
  agents: Record<AgentId, GTMAgent>
  kpis: KPISnapshot
  activeAgent: AgentId | null
  phase: Phase
  step: number
  globalReward: number
  cooperationScore: number
  reasoning: string
  task: string
  handoffTo: AgentId | null
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
  const globalReward = useStore(s => s.globalReward)
  const cooperationScore = useStore(s => s.cooperationScore)

  if (timelineStep !== null && stateHistory[timelineStep]) {
    const snap = stateHistory[timelineStep]
    return {
      agents: snap.agents,
      kpis: snap.kpis,
      activeAgent: snap.activeAgent,
      phase: snap.phase,
      step: snap.step,
      globalReward: snap.globalReward,
      cooperationScore: snap.cooperationScore,
      reasoning: snap.reasoning,
      task: snap.task,
      handoffTo: snap.handoffTo,
      isHistorical: true,
    }
  }

  return {
    agents,
    kpis,
    activeAgent,
    phase,
    step,
    globalReward,
    cooperationScore,
    reasoning: '',
    task: '',
    handoffTo: null,
    isHistorical: false,
  }
}
