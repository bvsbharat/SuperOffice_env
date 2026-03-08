import { AgentType, Agent, ScenarioType, Scenario } from './types';

export const getAgentPos = (index: number) => {
  switch(index) {
    case 0: return { col: 1, row: 1 }; // CEO
    case 1: return { col: 0, row: 0 };
    case 2: return { col: 2, row: 0 };
    case 3: return { col: 0, row: 1 };
    case 4: return { col: 2, row: 1 };
    case 5: return { col: 0, row: 2 };
    case 6: return { col: 1, row: 2 };
    case 7: return { col: 2, row: 2 };
    default: return { col: 0, row: 0 };
  }
};

export const INITIAL_AGENTS: Agent[] = [
  {
    id: 'ceo',
    type: AgentType.CEO,
    icon: '👑',
    tasks: ['OKRs', 'Budget', 'Pivot Decisions'],
    rewardSignals: ['Revenue', 'Burn Rate'],
    status: 'idle',
    taskProgress: 0,
    reward: 0,
    coopScore: 100
  },
  {
    id: 'hr',
    type: AgentType.PLANNING,
    icon: '🗂️',
    tasks: ['Hiring', 'Sprints', 'OKR Tracking'],
    rewardSignals: ['Velocity', 'Time-to-hire'],
    status: 'idle',
    taskProgress: 0,
    reward: 0,
    coopScore: 100
  },
  {
    id: 'marketing',
    type: AgentType.MARKETING,
    icon: '📣',
    tasks: ['Campaigns', 'A/B Tests', 'CAC'],
    rewardSignals: ['MQL Volume', 'CTR'],
    status: 'idle',
    taskProgress: 0,
    reward: 0,
    coopScore: 100
  },
  {
    id: 'content',
    type: AgentType.CONTENT,
    icon: '✍️',
    tasks: ['SEO', 'Case Studies', 'Collateral'],
    rewardSignals: ['Organic Traffic', 'Leads'],
    status: 'idle',
    taskProgress: 0,
    reward: 0,
    coopScore: 100
  },
  {
    id: 'dev',
    type: AgentType.DEV,
    icon: '⚙️',
    tasks: ['Sprints', 'Bug Fixes', 'Demos'],
    rewardSignals: ['Feature Velocity', 'UX Score'],
    status: 'idle',
    taskProgress: 0,
    reward: 0,
    coopScore: 100
  },
  {
    id: 'sales',
    type: AgentType.SALES,
    icon: '🤝',
    tasks: ['Qualify', 'Pitch', 'Close'],
    rewardSignals: ['MRR', 'Win Rate'],
    status: 'idle',
    taskProgress: 0,
    reward: 0,
    coopScore: 100
  },
  {
    id: 'scene',
    type: AgentType.SCENE,
    icon: '🎬',
    tasks: ['Environment Orchestrator'],
    rewardSignals: ['Global Reward', 'Coop Score'],
    status: 'idle',
    taskProgress: 0,
    reward: 0,
    coopScore: 100
  },
  {
    id: 'customer',
    type: AgentType.CUSTOMER,
    icon: '🧑💼',
    tasks: ['Reward Oracle'],
    rewardSignals: ['Purchase', 'NPS', 'Churn'],
    status: 'idle',
    taskProgress: 0,
    reward: 0,
    coopScore: 100
  }
];

export const SCENARIOS: Scenario[] = [
  {
    type: ScenarioType.BASELINE,
    description: 'Standard market conditions. Focus on steady growth.',
    modifiers: {
      burnRate: 1.0,
      customerAcquisition: 1.0,
      churnRate: 1.0,
      devVelocity: 1.0
    }
  },
  {
    type: ScenarioType.SERIES_A,
    description: 'High pressure to scale. Burn rate increases, but so does potential acquisition.',
    modifiers: {
      burnRate: 2.5,
      customerAcquisition: 1.8,
      churnRate: 1.2,
      devVelocity: 1.5
    }
  },
  {
    type: ScenarioType.COMPETITOR,
    description: 'A major competitor launched. Churn rate spikes, acquisition is harder.',
    modifiers: {
      burnRate: 1.2,
      customerAcquisition: 0.5,
      churnRate: 2.5,
      devVelocity: 1.2
    }
  },
  {
    type: ScenarioType.CHURN,
    description: 'Product issues leading to high churn. NPS is critical.',
    modifiers: {
      burnRate: 1.0,
      customerAcquisition: 0.8,
      churnRate: 3.0,
      devVelocity: 0.8
    }
  },
  {
    type: ScenarioType.VIRAL,
    description: 'A viral moment! Massive traffic and acquisition boost.',
    modifiers: {
      burnRate: 1.5,
      customerAcquisition: 5.0,
      churnRate: 0.8,
      devVelocity: 2.0
    }
  }
];
