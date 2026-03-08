import { AgentType } from '../types/fourd'
import type { Agent } from '../types/fourd'

export const getAgentPos = (index: number) => {
  switch (index) {
    case 0: return { col: 1, row: 1 } // CEO
    case 1: return { col: 0, row: 0 } // Dev
    case 2: return { col: 2, row: 0 } // Marketing
    case 3: return { col: 0, row: 1 } // Sales
    case 4: return { col: 2, row: 1 } // Content
    case 5: return { col: 0, row: 2 } // HR
    case 6: return { col: 2, row: 2 } // Customer
    default: return { col: 0, row: 0 }
  }
}

export const INITIAL_AGENTS: Agent[] = [
  { id: 'ceo', type: AgentType.CEO, icon: '\u{1F451}', tasks: ['OKRs', 'Budget', 'Pivot Decisions'], rewardSignals: ['Revenue', 'Burn Rate'], status: 'idle', taskProgress: 0, reward: 0, coopScore: 100 },
  { id: 'dev', type: AgentType.DEV, icon: '\u2699\ufe0f', tasks: ['Sprints', 'Bug Fixes', 'Demos'], rewardSignals: ['Feature Velocity', 'UX Score'], status: 'idle', taskProgress: 0, reward: 0, coopScore: 100 },
  { id: 'marketing', type: AgentType.MARKETING, icon: '\u{1F4E3}', tasks: ['Campaigns', 'A/B Tests', 'CAC'], rewardSignals: ['MQL Volume', 'CTR'], status: 'idle', taskProgress: 0, reward: 0, coopScore: 100 },
  { id: 'sales', type: AgentType.SALES, icon: '\u{1F91D}', tasks: ['Qualify', 'Pitch', 'Close'], rewardSignals: ['MRR', 'Win Rate'], status: 'idle', taskProgress: 0, reward: 0, coopScore: 100 },
  { id: 'content', type: AgentType.CONTENT, icon: '\u270d\ufe0f', tasks: ['SEO', 'Case Studies', 'Collateral'], rewardSignals: ['Organic Traffic', 'Leads'], status: 'idle', taskProgress: 0, reward: 0, coopScore: 100 },
  { id: 'hr', type: AgentType.PLANNING, icon: '\u{1F4CB}', tasks: ['Hiring', 'Sprints', 'OKR Tracking'], rewardSignals: ['Velocity', 'Time-to-hire'], status: 'idle', taskProgress: 0, reward: 0, coopScore: 100 },
  { id: 'customer', type: AgentType.CUSTOMER, icon: '\u{1F9D1}\u200d\u{1F4BC}', tasks: ['Reward Oracle'], rewardSignals: ['Purchase', 'NPS', 'Churn'], status: 'idle', taskProgress: 0, reward: 0, coopScore: 100 },
]
