export type AgentId = 'ceo' | 'hr' | 'marketing' | 'content' | 'dev' | 'sales' | 'customer'
export type Phase = 'morning_standup' | 'execution' | 'review' | 'planning' | 'done'
export type MsgType = 'chat' | 'reasoning' | 'event' | 'action'
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
  current_action: string
  target: string
  reasoning: string
  reward: number
  reward_history: number[]
  last_message: string
}

export interface KPISnapshot {
  step: number
  day: number
  revenue: number
  total_revenue: number
  website_traffic: number
  conversion_rate: number
  brand_awareness: number
  product_stability: number
  budget_remaining: number
  pipeline_value: number
  features_shipped: number
  content_published: number
  active_campaigns: number
  nps_score: number
  customer_satisfaction: number
  team_velocity: number
}

export interface Message {
  step: number
  from_agent: string
  to_agent: string
  text: string
  msg_type: MsgType
  reward?: number
}

export interface SimEvent {
  step: number
  type: string
  description: string
}

export interface PipelineCustomer {
  name: string
  stage: string
  budget: number
  pain_point: string
  industry: string
}

export interface FeatureStatus {
  name: string
  description: string
  shipped: boolean
  turns_remaining: number
}

export interface ContentPiece {
  title: string
  type: string
  published: boolean
  quality: number
}

export interface SharedMemoryEntry {
  author: string
  type: string
  content: string
  day: number
}

export interface GTMState {
  episode: number
  step: number
  day: number
  turn: number
  phase: Phase
  done: boolean
  agents: Record<AgentId, GTMAgent>
  kpis: KPISnapshot
  kpi_history: KPISnapshot[]
  global_reward: number
  reward_totals: Record<AgentId, number>
  events: SimEvent[]
  conversations: Message[]
  pipeline: PipelineCustomer[]
  features: FeatureStatus[]
  content: ContentPiece[]
  shared_memory: SharedMemoryEntry[]
  active_agent: AgentId | null
  max_days: number
}

export interface StepResult {
  type: 'step'
  activeAgent: AgentId
  action: string
  target: string
  reasoning: string
  message: string | null
  kpis: KPISnapshot
  reward: number
  day: number
  turn: number
  phase: Phase
  done: boolean
  events: SimEvent[]
  actionResult: Record<string, unknown>
  state: GTMState
}

export const AGENT_ORDER: AgentId[] = ['ceo', 'dev', 'marketing', 'sales', 'content', 'hr', 'customer']

export const AGENT_ROOM_POSITIONS: Record<AgentId, { col: number; row: number }> = {
  ceo:       { col: 0, row: 0 },
  hr:        { col: 1, row: 0 },
  marketing: { col: 0, row: 1 },
  content:   { col: 1, row: 1 },
  dev:       { col: 0, row: 2 },
  sales:     { col: 1, row: 2 },
  customer:  { col: 0, row: 3 },
}

export const ROOM_LABELS: Record<AgentId, string> = {
  ceo:       'EXEC SUITE',
  hr:        'OPS ROOM',
  marketing: 'CAMPAIGN HUB',
  content:   'CONTENT LAB',
  dev:       'DEV ROOM',
  sales:     'SALES FLOOR',
  customer:  'LOBBY',
}

export const PHASE_COLORS: Record<Phase, string> = {
  morning_standup: '#3b82f6',
  execution:       '#22c55e',
  review:          '#eab308',
  planning:        '#a855f7',
  done:            '#6b7280',
}

export const agentIconPath = (id: AgentId) => `/agents/${id}.png`

export type Theme = 'light' | 'dark'
export type ViewMode = 'playground' | '4d' | 'tabular'
export type SimMode = 'llm' | 'training' | 'inference'

export interface StateSnapshot {
  step: number
  day: number
  phase: Phase
  activeAgent: AgentId | null
  agents: Record<AgentId, GTMAgent>
  kpis: KPISnapshot
  globalReward: number
  reasoning: string
  action: string
  target: string
}

export type AgentAccessory = 'tie_clip' | 'headset' | 'sunglasses' | 'beret' | 'glasses' | 'watch' | 'hair_clip'

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
  customer:  { color: '#f472b6', accentColor: '#f9a8d4', accessory: 'hair_clip',   roomLabel: 'LOBBY',        roomDescription: 'Customer reception lobby' },
}

export const ROOM_3D_POSITIONS: Record<AgentId, [number, number, number]> = {
  ceo:       [-3.0, 0, -6.0],
  marketing: [ 3.0, 0, -6.0],
  hr:        [-7.5, 0, -0.5],
  sales:     [-7.5, 0,  4.5],
  customer:  [-7.5, 0,  9.5],
  dev:       [ 7.5, 0, -0.5],
  content:   [ 7.5, 0,  9.5],
}

export const ROOM_ROTATIONS: Record<AgentId, number> = {
  ceo:       0,
  marketing: 0,
  hr:        Math.PI / 2,
  sales:     Math.PI / 2,
  customer:  Math.PI / 2,
  dev:       -Math.PI / 2,
  content:   -Math.PI / 2,
}

export const ROOM_FLOOR_COLORS: Record<AgentId, string> = {
  ceo:       '#1e293b',
  hr:        '#fed7aa',
  marketing: '#bfdbfe',
  content:   '#e9d5ff',
  dev:       '#0f172a',
  sales:     '#bfdbfe',
  customer:  '#cbd5e1',
}

export interface PanelVisibility {
  rightSidebar: boolean
  bottomPanel: boolean
}
