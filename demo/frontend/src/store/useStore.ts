import { create } from 'zustand'
import type {
  AgentId, GTMAgent, KPISnapshot, Message, SimEvent,
  Phase, Speed, GTMState, StepResult,
  ViewMode, PanelVisibility, Theme, StateSnapshot,
  PipelineCustomer, FeatureStatus, ContentPiece, SharedMemoryEntry,
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

interface Collaboration {
  from: AgentId
  to: AgentId
  type: 'message' | 'coordinate' | 'handoff'
  startTime: number
  duration: number
  meetPoint: { x: number; y: number }
  active: boolean
}

export interface BenchmarkRun {
  id: string
  modelName: string
  provider: string
  steps: number
  totalReward: number
  isComplete: boolean
  revenue: number
  conversionRate: number
  featuresShipped: number
  contentPublished: number
  npsScore: number
  timestamp: number
}

interface GTMStore {
  // RL State
  episode: number
  step: number
  day: number
  turn: number
  phase: Phase
  isRunning: boolean
  speed: Speed
  globalReward: number
  rewardTotals: Record<AgentId, number>
  done: boolean
  maxDays: number

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

  // Real env data
  pipeline: PipelineCustomer[]
  features: FeatureStatus[]
  content: ContentPiece[]
  sharedMemory: SharedMemoryEntry[]

  // Agent movement positions (for 3D animated handoffs)
  agentPositions: Record<AgentId, [number, number, number]>

  // Dedup
  lastProcessedStep: number

  // 4D Timeline state
  stateHistory: StateSnapshot[]
  timelineStep: number | null
  isTimelinePlaying: boolean
  timelineSpeed: Speed

  // Benchmark leaderboard
  benchmarkRuns: BenchmarkRun[]
  benchmarkPanelOpen: boolean
  currentModel: string
  currentProvider: string

  // UI state
  speechBubbles: SpeechBubble[]
  coordArrows: CoordArrow[]
  activeCollaborations: Collaboration[]
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
  addCollaboration: (collab: Collaboration) => void
  updateCollaborations: (deltaTime: number) => void
  setViewMode: (mode: ViewMode) => void
  togglePanel: (panel: keyof PanelVisibility) => void
  toggleTheme: () => void
  pushSnapshot: (snapshot: StateSnapshot) => void
  setTimelineStep: (step: number | null) => void
  setTimelinePlaying: (v: boolean) => void
  setTimelineSpeed: (s: Speed) => void
  clearHistory: () => void

  addBenchmarkRun: (run: BenchmarkRun) => void
  toggleBenchmarkPanel: () => void
  setCurrentModel: (model: string, provider: string) => void
}

const DEFAULT_AGENT = (id: AgentId): GTMAgent => ({
  agent_id: id,
  name: id,
  emoji: '',
  color: '#888',
  role: '',
  room: '',
  status: 'idle',
  current_task: '',
  current_action: '',
  target: '',
  reasoning: '',
  reward: 0,
  reward_history: [],
  last_message: '',
})

const defaultAgents = (): Record<AgentId, GTMAgent> =>
  Object.fromEntries(AGENT_ORDER.map(id => [id, DEFAULT_AGENT(id)])) as Record<AgentId, GTMAgent>

const defaultKPIs = (): KPISnapshot => ({
  step: 0, day: 1, revenue: 0, total_revenue: 0,
  website_traffic: 1000, conversion_rate: 0.02, brand_awareness: 10,
  product_stability: 1.0, budget_remaining: 15000, pipeline_value: 0,
  features_shipped: 0, content_published: 0, active_campaigns: 0,
  nps_score: 50, customer_satisfaction: 0.5, team_velocity: 1.0,
})

const defaultRewardTotals = (): Record<AgentId, number> =>
  Object.fromEntries(AGENT_ORDER.map(id => [id, 0])) as Record<AgentId, number>

export const useStore = create<GTMStore>((set, get) => ({
  episode: 0,
  step: 0,
  day: 1,
  turn: 0,
  phase: 'morning_standup',
  isRunning: false,
  speed: 1,
  globalReward: 0,
  rewardTotals: defaultRewardTotals(),
  done: false,
  maxDays: 10,

  agents: defaultAgents(),
  selectedAgent: null,
  activeAgent: null,

  kpis: defaultKPIs(),
  kpiHistory: [],

  conversations: [],
  events: [],

  pipeline: [],
  features: [],
  content: [],
  sharedMemory: [],

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
  activeCollaborations: [],
  wsConnected: false,
  isLoading: false,
  lastError: null,
  theme: (typeof window !== 'undefined' && localStorage.getItem('theme') === 'dark') ? 'dark' : 'light',
  viewMode: 'tabular',
  panelVisibility: { rightSidebar: false, bottomPanel: true },
  benchmarkRuns: (typeof window !== 'undefined' && localStorage.getItem('benchmarkRuns'))
    ? JSON.parse(localStorage.getItem('benchmarkRuns')!)
    : [],
  benchmarkPanelOpen: false,
  currentModel: 'unknown',
  currentProvider: 'bedrock',

  applyStepResult: (result) => set((state) => {
    const stepKey = result.state.step
    if (stepKey === state.lastProcessedStep) return {}

    const fullState = result.state
    const now = Date.now()

    // Speech bubble for active agent
    const newBubbles = state.speechBubbles.filter(b => b.expiresAt > now)
    const reasoningText = result.reasoning || `${result.action} -> ${result.target || 'working'}`
    if (result.activeAgent) {
      newBubbles.push({
        agentId: result.activeAgent,
        text: reasoningText,
        expiresAt: now + 8000,
      })
    }

    // Coordination arrows (no handoffs in real env, but keep structure)
    const newArrows = state.coordArrows.filter(a => a.expiresAt > now)

    // Push snapshot for 4D timeline
    const snapshot: StateSnapshot = {
      step: fullState.step,
      day: fullState.day,
      phase: fullState.phase,
      activeAgent: result.activeAgent,
      agents: { ...fullState.agents },
      kpis: { ...fullState.kpis },
      globalReward: fullState.global_reward,
      reasoning: result.reasoning || '',
      action: result.action || '',
      target: result.target || '',
    }

    // Record benchmark run when episode completes or every 10 steps
    let newBenchmarkRuns = state.benchmarkRuns
    if (fullState.done || (fullState.step > 0 && fullState.step % 10 === 0)) {
      const run: BenchmarkRun = {
        id: `${state.currentModel}-${fullState.episode}-${fullState.step}`,
        modelName: state.currentModel,
        provider: state.currentProvider,
        steps: fullState.step,
        totalReward: fullState.global_reward,
        isComplete: fullState.done,
        revenue: fullState.kpis.total_revenue,
        conversionRate: fullState.kpis.conversion_rate,
        featuresShipped: fullState.kpis.features_shipped,
        contentPublished: fullState.kpis.content_published,
        npsScore: fullState.kpis.nps_score,
        timestamp: now,
      }
      const existing = newBenchmarkRuns.findIndex(r => r.modelName === run.modelName && r.provider === run.provider)
      const updated = existing >= 0
        ? newBenchmarkRuns.map((r, i) => i === existing ? run : r)
        : [...newBenchmarkRuns, run]
      newBenchmarkRuns = [...updated].sort((a, b) => b.totalReward - a.totalReward).slice(0, 20)
      if (typeof window !== 'undefined') localStorage.setItem('benchmarkRuns', JSON.stringify(newBenchmarkRuns))
    }

    return {
      episode: fullState.episode,
      step: fullState.step,
      day: fullState.day,
      turn: fullState.turn,
      phase: fullState.phase,
      globalReward: fullState.global_reward,
      rewardTotals: fullState.reward_totals || defaultRewardTotals(),
      done: fullState.done,
      maxDays: fullState.max_days || 10,
      agents: fullState.agents,
      activeAgent: result.activeAgent,
      kpis: fullState.kpis,
      kpiHistory: fullState.kpi_history,
      conversations: fullState.conversations,
      events: fullState.events,
      pipeline: fullState.pipeline || [],
      features: fullState.features || [],
      content: fullState.content || [],
      sharedMemory: fullState.shared_memory || [],
      lastProcessedStep: stepKey,
      speechBubbles: newBubbles,
      coordArrows: newArrows,
      stateHistory: [...state.stateHistory, snapshot],
      benchmarkRuns: newBenchmarkRuns,
    }
  }),

  applyFullState: (s) => set({
    episode: s.episode,
    step: s.step,
    day: s.day || 1,
    turn: s.turn || 0,
    phase: s.phase,
    globalReward: s.global_reward,
    rewardTotals: s.reward_totals || defaultRewardTotals(),
    done: s.done,
    maxDays: s.max_days || 10,
    agents: s.agents,
    activeAgent: s.active_agent,
    kpis: s.kpis,
    kpiHistory: s.kpi_history,
    conversations: s.conversations,
    events: s.events,
    pipeline: s.pipeline || [],
    features: s.features || [],
    content: s.content || [],
    sharedMemory: s.shared_memory || [],
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

  addCollaboration: (collab) => set(s => ({
    activeCollaborations: [...s.activeCollaborations, collab],
  })),

  updateCollaborations: (deltaTime) => set(s => {
    const now = Date.now()
    return {
      activeCollaborations: s.activeCollaborations
        .map(c => ({
          ...c,
          active: now - c.startTime < c.duration,
        }))
        .filter(c => c.active),
    }
  }),

  setViewMode: (mode) => set({
    viewMode: mode,
    panelVisibility: (mode === 'playground' || mode === '4d')
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

  addBenchmarkRun: (run) => set(s => {
    // Replace existing run for same model or append
    const existing = s.benchmarkRuns.findIndex(r => r.modelName === run.modelName && r.provider === run.provider)
    const updated = existing >= 0
      ? s.benchmarkRuns.map((r, i) => i === existing ? run : r)
      : [...s.benchmarkRuns, run]
    // Keep top 20 by totalReward
    const sorted = [...updated].sort((a, b) => b.totalReward - a.totalReward).slice(0, 20)
    if (typeof window !== 'undefined') localStorage.setItem('benchmarkRuns', JSON.stringify(sorted))
    return { benchmarkRuns: sorted }
  }),

  toggleBenchmarkPanel: () => set(s => ({ benchmarkPanelOpen: !s.benchmarkPanelOpen })),

  setCurrentModel: (model, provider) => set({ currentModel: model, currentProvider: provider }),
}))
