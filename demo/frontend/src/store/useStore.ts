import { create } from 'zustand'
import type {
  AgentId, GTMAgent, KPISnapshot, Message, SimEvent,
  EpisodeResult, Phase, ScenarioKey, Speed, GTMState, StepResult,
  ViewMode, PanelVisibility, Theme, StateSnapshot,
} from '../types'
import { AGENT_ORDER, ROOM_3D_POSITIONS } from '../types'

interface SpeechBubble {
  agentId: AgentId
  text: string
  expiresAt: number
}

interface CoordArrow {
  from: AgentId
  to: AgentId
  expiresAt: number
}

interface GTMStore {
  // RL State
  episode: number
  step: number
  phase: Phase
  isRunning: boolean
  speed: Speed
  scenario: ScenarioKey
  globalReward: number
  cooperationScore: number
  episodeHistory: EpisodeResult[]
  done: boolean

  // Agents
  agents: Record<AgentId, GTMAgent>
  selectedAgent: AgentId | null
  activeAgent: AgentId | null

  // KPIs
  kpis: KPISnapshot
  kpiHistory: KPISnapshot[]

  // Conversation & Events
  conversations: Message[]
  events: SimEvent[]

  // Agent movement positions (for 3D animated handoffs)
  agentPositions: Record<AgentId, [number, number, number]>

  // Dedup
  lastProcessedStep: number

  // 4D Timeline state
  stateHistory: StateSnapshot[]
  timelineStep: number | null
  isTimelinePlaying: boolean
  timelineSpeed: Speed

  // UI state
  speechBubbles: SpeechBubble[]
  coordArrows: CoordArrow[]
  wsConnected: boolean
  isLoading: boolean
  lastError: string | null
  theme: Theme
  viewMode: ViewMode
  panelVisibility: PanelVisibility

  // Actions
  applyStepResult: (result: StepResult) => void
  applyFullState: (state: GTMState) => void
  setWsConnected: (v: boolean) => void
  selectAgent: (id: AgentId | null) => void
  setIsRunning: (v: boolean) => void
  setSpeed: (s: Speed) => void
  setIsLoading: (v: boolean) => void
  setError: (e: string | null) => void
  clearBubble: (agentId: AgentId) => void
  clearArrow: (from: AgentId, to: AgentId) => void
  setViewMode: (mode: ViewMode) => void
  togglePanel: (panel: keyof PanelVisibility) => void
  toggleTheme: () => void
  pushSnapshot: (snapshot: StateSnapshot) => void
  setTimelineStep: (step: number | null) => void
  setTimelinePlaying: (v: boolean) => void
  setTimelineSpeed: (s: Speed) => void
  clearHistory: () => void
}

const DEFAULT_AGENT = (id: AgentId): GTMAgent => ({
  agent_id: id,
  name: id,
  emoji: '🤖',
  color: '#888',
  role: '',
  room: '',
  status: 'idle',
  current_task: '',
  reward: 0,
  reward_history: [],
  last_message: '',
})

const defaultAgents = (): Record<AgentId, GTMAgent> =>
  Object.fromEntries(AGENT_ORDER.map(id => [id, DEFAULT_AGENT(id)])) as Record<AgentId, GTMAgent>

const defaultKPIs = (): KPISnapshot => ({
  step: 0, mrr: 50000, cac: 800, mql: 10, nps: 25, win_rate: 0.18, burn_rate: 85000,
})

export const useStore = create<GTMStore>((set, get) => ({
  episode: 0,
  step: 0,
  phase: 'standup',
  isRunning: false,
  speed: 1,
  scenario: 'baseline',
  globalReward: 0,
  cooperationScore: 0.5,
  episodeHistory: [],
  done: false,

  agents: defaultAgents(),
  selectedAgent: null,
  activeAgent: null,

  kpis: defaultKPIs(),
  kpiHistory: [],

  conversations: [],
  events: [],

  agentPositions: Object.fromEntries(
    AGENT_ORDER.map(id => {
      const rp = ROOM_3D_POSITIONS[id]
      return [id, [rp[0] + 0.4, rp[1], rp[2] + 0.3] as [number, number, number]]
    })
  ) as Record<AgentId, [number, number, number]>,

  stateHistory: [],
  timelineStep: null,
  isTimelinePlaying: false,
  timelineSpeed: 1,

  lastProcessedStep: -1,
  speechBubbles: [],
  coordArrows: [],
  wsConnected: false,
  isLoading: false,
  lastError: null,
  theme: (typeof window !== 'undefined' && localStorage.getItem('theme') === 'dark') ? 'dark' : 'light',
  viewMode: 'tabular',
  panelVisibility: { rightSidebar: false, bottomPanel: true },

  applyStepResult: (result) => set((state) => {
    const stepKey = result.state.step
    if (stepKey === state.lastProcessedStep) return {}

    const fullState = result.state
    const now = Date.now()

    // Speech bubble for active agent
    const newBubbles = state.speechBubbles.filter(b => b.expiresAt > now)
    const reasoningText = result.reasoning || `Working on: ${result.task || 'current task'}`
    if (result.activeAgent) {
      newBubbles.push({
        agentId: result.activeAgent,
        text: reasoningText,
        expiresAt: now + 8000,
      })
    }

    // Coordination arrows for handoffs
    const newArrows = state.coordArrows.filter(a => a.expiresAt > now)
    if (result.handoffTo && result.activeAgent) {
      newArrows.push({
        from: result.activeAgent,
        to: result.handoffTo,
        expiresAt: now + 2500,
      })
    }

    // Agent movement: move active agent toward handoff target's room
    const newPositions = { ...state.agentPositions }
    if (result.handoffTo && result.activeAgent) {
      const targetRoom = ROOM_3D_POSITIONS[result.handoffTo]
      newPositions[result.activeAgent] = [targetRoom[0] + 0.4, targetRoom[1], targetRoom[2] + 0.3]
      // Schedule return to home room after 2.5s
      const agent = result.activeAgent
      setTimeout(() => {
        const homeRoom = ROOM_3D_POSITIONS[agent]
        useStore.setState((s) => ({
          agentPositions: {
            ...s.agentPositions,
            [agent]: [homeRoom[0] + 0.4, homeRoom[1], homeRoom[2] + 0.3],
          },
        }))
      }, 2500)
    }

    // Push snapshot for 4D timeline
    const snapshot: StateSnapshot = {
      step: fullState.step,
      phase: fullState.phase,
      activeAgent: result.activeAgent,
      agents: { ...fullState.agents },
      kpis: { ...fullState.kpis },
      globalReward: fullState.global_reward,
      cooperationScore: fullState.cooperation_score,
      reasoning: result.reasoning || '',
      task: result.task || '',
      handoffTo: result.handoffTo,
    }

    return {
      episode: fullState.episode,
      step: fullState.step,
      phase: fullState.phase,
      scenario: fullState.scenario,
      globalReward: fullState.global_reward,
      cooperationScore: fullState.cooperation_score,
      episodeHistory: fullState.episode_history,
      done: fullState.done,
      agents: fullState.agents,
      activeAgent: result.activeAgent,
      kpis: fullState.kpis,
      kpiHistory: fullState.kpi_history,
      conversations: fullState.conversations,
      events: fullState.events,
      agentPositions: newPositions,
      lastProcessedStep: stepKey,
      speechBubbles: newBubbles,
      coordArrows: newArrows,
      stateHistory: [...state.stateHistory, snapshot],
    }
  }),

  applyFullState: (s) => set({
    episode: s.episode,
    step: s.step,
    phase: s.phase,
    scenario: s.scenario,
    globalReward: s.global_reward,
    cooperationScore: s.cooperation_score,
    episodeHistory: s.episode_history,
    done: s.done,
    agents: s.agents,
    activeAgent: s.active_agent,
    kpis: s.kpis,
    kpiHistory: s.kpi_history,
    conversations: s.conversations,
    events: s.events,
    speechBubbles: [],
    coordArrows: [],
    stateHistory: [],
    timelineStep: null,
    isTimelinePlaying: false,
  }),

  setWsConnected: (v) => set({ wsConnected: v }),
  selectAgent: (id) => set({ selectedAgent: id }),
  setIsRunning: (v) => set({ isRunning: v }),
  setSpeed: (s) => set({ speed: s }),
  setIsLoading: (v) => set({ isLoading: v }),
  setError: (e) => set({ lastError: e }),

  clearBubble: (agentId) => set(s => ({
    speechBubbles: s.speechBubbles.filter(b => b.agentId !== agentId),
  })),

  clearArrow: (from, to) => set(s => ({
    coordArrows: s.coordArrows.filter(a => !(a.from === from && a.to === to)),
  })),

  setViewMode: (mode) => set({
    viewMode: mode,
    panelVisibility: (mode === 'playground' || mode === '3d' || mode === '4d')
      ? { rightSidebar: false, bottomPanel: false }
      : { rightSidebar: false, bottomPanel: true },
  }),

  togglePanel: (panel) => set(s => ({
    panelVisibility: { ...s.panelVisibility, [panel]: !s.panelVisibility[panel] },
  })),

  toggleTheme: () => set(s => {
    const next = s.theme === 'light' ? 'dark' : 'light'
    localStorage.setItem('theme', next)
    document.documentElement.classList.toggle('dark', next === 'dark')
    return { theme: next }
  }),

  pushSnapshot: (snapshot) => set(s => ({
    stateHistory: [...s.stateHistory, snapshot],
  })),

  setTimelineStep: (step) => set({ timelineStep: step }),
  setTimelinePlaying: (v) => set({ isTimelinePlaying: v }),
  setTimelineSpeed: (s) => set({ timelineSpeed: s }),
  clearHistory: () => set({ stateHistory: [], timelineStep: null, isTimelinePlaying: false }),
}))
