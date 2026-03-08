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
export type ViewMode = 'playground' | '3d' | '4d' | 'tabular'

export interface StateSnapshot {
  step: number
  phase: Phase
  activeAgent: AgentId | null
  agents: Record<AgentId, GTMAgent>
  kpis: KPISnapshot
  globalReward: number
  cooperationScore: number
  reasoning: string
  task: string
  handoffTo: AgentId | null
}

export type AgentAccessory = 'tie_clip' | 'headset' | 'sunglasses' | 'beret' | 'glasses' | 'watch' | 'lanyard' | 'hair_clip'

export interface Agent3DConfig {
  color: string
  accentColor: string
  accessory: AgentAccessory
  roomLabel: string
  roomDescription: string
}

export const AGENT_3D_CONFIG: Record<AgentId, Agent3DConfig> = {
  ceo:       { color: '#6366f1', accentColor: '#818cf8', accessory: 'tie_clip',    roomLabel: 'EXEC SUITE',   roomDescription: "CEO's executive office" },
  hr:        { color: '#8b5cf6', accentColor: '#a78bfa', accessory: 'headset',     roomLabel: 'OPS ROOM',     roomDescription: 'HR operations center' },
  marketing: { color: '#ec4899', accentColor: '#f472b6', accessory: 'sunglasses',  roomLabel: 'CAMPAIGN HUB', roomDescription: 'Marketing campaign hub' },
  content:   { color: '#f97316', accentColor: '#fb923c', accessory: 'beret',       roomLabel: 'CONTENT LAB',  roomDescription: 'Content creation lab' },
  dev:       { color: '#22d3ee', accentColor: '#67e8f9', accessory: 'glasses',     roomLabel: 'DEV ROOM',     roomDescription: 'Developer workspace' },
  sales:     { color: '#fbbf24', accentColor: '#fcd34d', accessory: 'watch',       roomLabel: 'SALES FLOOR',  roomDescription: 'Sales team floor' },
  scene:     { color: '#34d399', accentColor: '#6ee7b7', accessory: 'lanyard',     roomLabel: 'SERVER ROOM',  roomDescription: 'Infrastructure server room' },
  customer:  { color: '#f472b6', accentColor: '#f9a8d4', accessory: 'hair_clip',   roomLabel: 'LOBBY',        roomDescription: 'Customer reception lobby' },
}

// L-shape layout: top row + left arm + right arm + bottom
export const ROOM_3D_POSITIONS: Record<AgentId, [number, number, number]> = {
  ceo:       [-3.0, 0, -6.0],   // top row left
  marketing: [ 3.0, 0, -6.0],   // top row right
  hr:        [-7.5, 0, -0.5],   // left column upper
  sales:     [-7.5, 0,  4.5],   // left column middle
  customer:  [-7.5, 0,  9.5],   // left column lower (lobby beside sales)
  dev:       [ 7.5, 0, -0.5],   // right column upper
  scene:     [ 7.5, 0,  4.5],   // right column middle (server room)
  content:   [ 7.5, 0,  9.5],   // right column lower (content beside server)
}

// Rotation per room so each faces inward toward center
export const ROOM_ROTATIONS: Record<AgentId, number> = {
  ceo:       0,                  // faces +z (toward center)
  marketing: 0,                  // faces +z
  hr:        Math.PI / 2,       // faces +x (toward center)
  sales:     Math.PI / 2,       // faces +x (toward center)
  customer:  Math.PI / 2,       // faces +x (toward center)
  dev:       -Math.PI / 2,      // faces -x (toward center)
  scene:     -Math.PI / 2,      // faces -x (toward center)
  content:   -Math.PI / 2,      // faces -x (toward center)
}

export const ROOM_FLOOR_COLORS: Record<AgentId, string> = {
  ceo:       '#1e293b',  // dark slate (CEO office)
  hr:        '#fed7aa',  // light orange (HR)
  marketing: '#bfdbfe',  // light blue (marketing)
  content:   '#e9d5ff',  // light purple (creative)
  dev:       '#0f172a',  // very dark (dev room)
  sales:     '#bfdbfe',  // light blue (sales)
  scene:     '#0f172a',  // very dark (server room)
  customer:  '#cbd5e1',  // light slate (lobby)
}
export interface PanelVisibility {
  rightSidebar: boolean
  bottomPanel: boolean
}
