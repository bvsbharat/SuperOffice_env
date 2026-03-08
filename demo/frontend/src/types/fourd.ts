import type { GTMAgent, AgentId } from './index'

export enum AgentType {
  CEO = 'CEO',
  PLANNING = 'Planning/HR',
  MARKETING = 'Marketing',
  CONTENT = 'Content Builder',
  DEV = 'Dev',
  SALES = 'Sales',
  SCENE = 'Scene',
  CUSTOMER = 'Customer',
}

export interface Agent {
  id: string
  type: AgentType
  icon: string
  tasks: string[]
  rewardSignals: string[]
  status: 'idle' | 'working' | 'success' | 'failure'
  currentTask?: string
  taskProgress: number
  reward: number
  coopScore: number
  talkingTo?: string
  lastMessage?: string
}

export interface Metric {
  revenue: number
  burn: number
  cash: number
  customers: number
  velocity: number
  nps: number
  mqls: number
  traffic: number
}

export interface LogEntry {
  id: string
  agent: string
  message: string
  type: 'info' | 'reward' | 'alert' | 'system'
  timestamp: number
}

export enum ScenarioType {
  BASELINE = 'Baseline GTM',
  SERIES_A = 'Series A Pressure',
  COMPETITOR = 'Competitor Launch',
  CHURN = 'Churn Spike',
  VIRAL = 'Viral Moment',
}

export interface Scenario {
  type: ScenarioType
  description: string
  modifiers: {
    burnRate: number
    customerAcquisition: number
    churnRate: number
    devVelocity: number
  }
}

const AGENT_TYPE_MAP: Record<AgentId, AgentType> = {
  ceo: AgentType.CEO,
  hr: AgentType.PLANNING,
  marketing: AgentType.MARKETING,
  content: AgentType.CONTENT,
  dev: AgentType.DEV,
  sales: AgentType.SALES,
  scene: AgentType.SCENE,
  customer: AgentType.CUSTOMER,
}

export function gtmAgentToFourdAgent(
  g: GTMAgent,
  handoffTo?: AgentId | null,
  reasoning?: string,
  isActiveAgent?: boolean,
): Agent {
  // For the active agent, show reasoning or task as speech
  // For other agents, show their last_message if any
  const message = isActiveAgent
    ? (reasoning || g.current_task || g.last_message || undefined)
    : (g.last_message || g.current_task || undefined)

  return {
    id: g.agent_id,
    type: AGENT_TYPE_MAP[g.agent_id],
    icon: g.emoji,
    tasks: [g.current_task || 'Idle'],
    rewardSignals: [],
    status: g.status === 'active' ? 'working' : g.status === 'done' ? 'success' : 'idle',
    currentTask: g.current_task || undefined,
    taskProgress: g.status === 'active' ? 50 : g.status === 'done' ? 100 : 0,
    reward: g.reward,
    coopScore: 100,
    talkingTo: handoffTo === g.agent_id ? undefined : (handoffTo || undefined),
    lastMessage: message,
  }
}
