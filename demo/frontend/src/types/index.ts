export type AgentId = 'ceo' | 'hr' | 'marketing' | 'content' | 'dev' | 'sales' | 'scene' | 'customer'
export type ScenarioKey = 'baseline' | 'competitor_launch' | 'series_a' | 'churn_spike' | 'viral_moment'
export type Phase = 'standup' | 'execution' | 'review' | 'planning' | 'done'
export type MsgType = 'chat' | 'handoff' | 'event' | 'reasoning'
export type Speed = 1 | 2 | 5

export interface GTMAgent {
  agent_id: AgentId
  name: string
  emoji: string
  color: string
  role: string
  room: string
  status: 'idle' | 'active' | 'done'
  current_task: string
  reward: number
  reward_history: number[]
  last_message: string
}

export interface KPISnapshot {
  step: number
  mrr: number
  cac: number
  mql: number
  nps: number
  win_rate: number
  burn_rate: number
}

export interface Message {
  step: number
  from_agent: string
  to_agent: string
  text: string
  msg_type: MsgType
}

export interface SimEvent {
  step: number
  type: string
  description: string
}

export interface EpisodeResult {
  episode: number
  global_reward: number
  cooperation_score: number
  final_kpis: KPISnapshot
}

export interface GTMState {
  episode: number
  step: number
  phase: Phase
  scenario: ScenarioKey
  agents: Record<AgentId, GTMAgent>
  kpis: KPISnapshot
  kpi_history: KPISnapshot[]
  global_reward: number
  cooperation_score: number
  events: SimEvent[]
  conversations: Message[]
  episode_history: EpisodeResult[]
  active_agent: AgentId | null
  done: boolean
}

export interface StepResult {
  type: 'step'
  activeAgent: AgentId
  task: string
  reasoning: string
  kpis: KPISnapshot
  reward: number
  handoffTo: AgentId | null
  handoffMessage: string | null
  cooperationScore: number
  globalReward: number
  step: number
  phase: Phase
  done: boolean
  events: SimEvent[]
  state: GTMState
}

export const AGENT_ORDER: AgentId[] = ['ceo', 'hr', 'marketing', 'content', 'dev', 'sales', 'scene', 'customer']

export const AGENT_ROOM_POSITIONS: Record<AgentId, { col: number; row: number }> = {
  ceo:       { col: 0, row: 0 },
  hr:        { col: 1, row: 0 },
  marketing: { col: 0, row: 1 },
  content:   { col: 1, row: 1 },
  dev:       { col: 0, row: 2 },
  sales:     { col: 1, row: 2 },
  scene:     { col: 0, row: 3 },
  customer:  { col: 1, row: 3 },
}

export const ROOM_LABELS: Record<AgentId, string> = {
  ceo:       'EXEC SUITE',
  hr:        'OPS ROOM',
  marketing: 'CAMPAIGN HUB',
  content:   'CONTENT LAB',
  dev:       'DEV ROOM',
  sales:     'SALES FLOOR',
  scene:     'SERVER ROOM',
  customer:  'LOBBY',
}

export const SCENARIO_LABELS: Record<ScenarioKey, string> = {
  baseline:          'Baseline',
  competitor_launch: 'Competitor Launch',
  series_a:          'Series A',
  churn_spike:       'Churn Spike',
  viral_moment:      'Viral Moment',
}

export const PHASE_COLORS: Record<Phase, string> = {
  standup:   '#3b82f6',
  execution: '#22c55e',
  review:    '#eab308',
  planning:  '#a855f7',
  done:      '#6b7280',
}

export const PHASE_STEP_RANGES: Record<Phase, [number, number]> = {
  standup:   [0, 1],
  execution: [2, 18],
  review:    [19, 19],
  planning:  [20, 23],
  done:      [24, 24],
}

export const agentIconPath = (id: AgentId) => `/agents/${id}.png`

export type Theme = 'light' | 'dark'
export type ViewMode = 'playground' | '3d' | 'tabular'

export type AgentAccessory = 'crown' | 'headphones' | 'visor' | 'beret' | 'goggles' | 'monocle' | 'antenna_large' | 'bow'

export interface Agent3DConfig {
  color: string
  accentColor: string
  accessory: AgentAccessory
  roomLabel: string
  roomDescription: string
}

export const AGENT_3D_CONFIG: Record<AgentId, Agent3DConfig> = {
  ceo:       { color: '#6366f1', accentColor: '#818cf8', accessory: 'crown',         roomLabel: 'EXEC SUITE',   roomDescription: "CEO's executive office" },
  hr:        { color: '#8b5cf6', accentColor: '#a78bfa', accessory: 'headphones',    roomLabel: 'OPS ROOM',     roomDescription: 'HR operations center' },
  marketing: { color: '#ec4899', accentColor: '#f472b6', accessory: 'visor',         roomLabel: 'CAMPAIGN HUB', roomDescription: 'Marketing campaign hub' },
  content:   { color: '#f97316', accentColor: '#fb923c', accessory: 'beret',         roomLabel: 'CONTENT LAB',  roomDescription: 'Content creation lab' },
  dev:       { color: '#22d3ee', accentColor: '#67e8f9', accessory: 'goggles',       roomLabel: 'DEV ROOM',     roomDescription: 'Developer workspace' },
  sales:     { color: '#fbbf24', accentColor: '#fcd34d', accessory: 'monocle',       roomLabel: 'SALES FLOOR',  roomDescription: 'Sales team floor' },
  scene:     { color: '#34d399', accentColor: '#6ee7b7', accessory: 'antenna_large', roomLabel: 'SERVER ROOM',  roomDescription: 'Infrastructure server room' },
  customer:  { color: '#f472b6', accentColor: '#f9a8d4', accessory: 'bow',           roomLabel: 'LOBBY',        roomDescription: 'Customer reception lobby' },
}

// 2x4 grid world positions: [x, y, z] — spread wide with hallway corridor
export const ROOM_3D_POSITIONS: Record<AgentId, [number, number, number]> = {
  ceo:       [-4.5, 0, -5.0],
  hr:        [ 3.5, 0, -5.0],
  marketing: [-4.5, 0, -1.8],
  content:   [ 3.5, 0, -1.8],
  dev:       [-4.5, 0,  1.4],
  sales:     [ 3.5, 0,  1.4],
  scene:     [-4.5, 0,  4.6],
  customer:  [ 3.5, 0,  4.6],
}

export const ROOM_FLOOR_COLORS: Record<AgentId, string> = {
  ceo:       '#4a3f6b',  // deep royal purple carpet
  hr:        '#3d4a6b',  // slate blue carpet
  marketing: '#6b3d5a',  // magenta-tinted carpet
  content:   '#6b5a3d',  // warm amber carpet
  dev:       '#2a4a5a',  // dark teal tile
  sales:     '#5a5030',  // golden brown carpet
  scene:     '#2a3a2a',  // dark green industrial tile
  customer:  '#5a4a3a',  // warm wood lobby floor
}
export interface PanelVisibility {
  rightSidebar: boolean
  bottomPanel: boolean
}
