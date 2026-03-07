# MarketVille PRD
## A Smallville-Style Multi-Agent Marketing Simulation on OpenEnv

---

## 1. Vision

**MarketVille** is a Smallville-inspired multi-agent simulation where 5 AI marketing agents autonomously run a startup's marketing operations inside a PyTorch OpenEnv reinforcement learning environment. Agents have memory, reflect on past actions, plan strategies, interact socially, and learn through RL rewards tied to simulated marketing KPIs.

**Tagline**: *"What if your entire marketing team was a living simulation?"*

**Inspiration Sources**:
- **Stanford Generative Agents** (Smallville) - Memory streams, reflection, planning, social interaction
- **MAROONED / Colony-Collapse** - Multi-agent OpenEnv architecture, asymmetric roles, teacher-student training
- **OpenEnv Framework** - Gymnasium-compatible API, HF Spaces deployment, TRL/Unsloth training

---

## 2. Architecture (Adapted from MAROONED)

### High-Level Flow

```
Simulated Market World --> Observations per Agent --> LLM Reasoning --> Actions
        ^                                                                |
        |                                                                v
        +--- State Update <-- Reward Calculation <-- Action Execution <--+
```

### API Architecture (Web Demo)

```
Browser --> Next.js Dashboard --> FastAPI Backend --> MarketVille OpenEnv
                                        |
                                  Per-Agent Interface
                                        |
                              Returns: Observation, Reward, Done
```

### Project Structure (Mapped from MAROONED)

```
openenv-hack-hackathon/
├── marketville_env/                # Core RL Environment
│   ├── __init__.py
│   ├── environment.py              # OpenEnv Gym interface (reset/step/render)
│   ├── market_state.py             # Market simulation & state management
│   ├── models.py                   # Data schemas (Agent, Action, Observation)
│   ├── config.py                   # Constants (budgets, KPI targets, timing)
│   ├── llm_interface.py            # LLM prompt generation & action parsing
│   ├── memory.py                   # Smallville memory streams & reflection
│   ├── events.py                   # Dynamic market events generator
│   └── metrics.py                  # KPI tracking & reward calculation
│
├── agents/                         # Agent Definitions
│   ├── base_agent.py               # Base agent with memory/reflection
│   ├── cmo_agent.py                # Chief Marketing Officer
│   ├── content_agent.py            # Content Creator
│   ├── analytics_agent.py          # SEO/Analytics
│   ├── social_agent.py             # Social Media Manager
│   └── growth_agent.py             # Growth Hacker
│
├── demo/                           # Web Application
│   ├── api/
│   │   ├── server.py               # FastAPI backend
│   │   ├── routes.py               # REST endpoints
│   │   └── requirements.txt
│   └── frontend/
│       ├── components/
│       │   ├── AgentCard.tsx        # Agent status & activity
│       │   ├── MarketDashboard.tsx  # KPI visualization
│       │   ├── ConversationLog.tsx  # Agent interactions
│       │   └── TimelineView.tsx     # Event timeline
│       └── pages/
│           └── index.tsx
│
├── notebooks/
│   ├── train_marketville.ipynb     # Main training pipeline
│   └── demo_agents.ipynb           # Quick demo
│
├── tests/
│   ├── test_env.py
│   ├── test_agents.py
│   └── test_market_state.py
│
├── PRD/
│   └── MarketVille_PRD.md          # This file
├── requirements.txt
└── README.md
```

---

## 3. The Agents (Asymmetric Roles)

Each agent has a unique observation space, action space, and reward function -- mirroring MAROONED's colonist/traitor asymmetry.

### 3.1 CMO Agent (Strategist)
- **Role**: Sets overall strategy, allocates budget across channels, approves campaigns
- **Observation**: Full dashboard (all KPIs, all agents' recent actions, budget status, market events)
- **Actions**: `SET_STRATEGY`, `ALLOCATE_BUDGET`, `APPROVE_CAMPAIGN`, `CALL_MEETING`, `PIVOT_STRATEGY`
- **Reward**: Overall company KPI growth (weighted composite of all metrics)
- **Unique Ability**: Can override any agent's planned action, calls team meetings

### 3.2 Content Creator Agent
- **Role**: Writes blog posts, ad copy, landing pages, email sequences
- **Observation**: Content calendar, SEO keywords from Analytics agent, brand guidelines, past content performance
- **Actions**: `WRITE_BLOG`, `WRITE_AD_COPY`, `WRITE_EMAIL`, `WRITE_SOCIAL_POST`, `REVISE_CONTENT`
- **Reward**: Content engagement metrics (clicks, shares, time-on-page)
- **Unique Ability**: Can produce content that other agents distribute

### 3.3 SEO/Analytics Agent
- **Role**: Keyword research, competitive analysis, performance tracking, data-driven recommendations
- **Observation**: Full analytics dashboard, search rankings, competitor data, market trends
- **Actions**: `RESEARCH_KEYWORDS`, `ANALYZE_COMPETITOR`, `GENERATE_REPORT`, `RECOMMEND_STRATEGY`, `AUDIT_CONTENT`
- **Reward**: Organic traffic growth, search ranking improvements
- **Unique Ability**: Provides data that influences all other agents' decisions

### 3.4 Social Media Manager Agent
- **Role**: Posting schedule, community engagement, trend riding, influencer outreach
- **Observation**: Social feeds, engagement metrics, trending topics, audience sentiment
- **Actions**: `SCHEDULE_POST`, `ENGAGE_AUDIENCE`, `RIDE_TREND`, `OUTREACH_INFLUENCER`, `RESPOND_CRISIS`
- **Reward**: Follower growth, engagement rate, sentiment score
- **Unique Ability**: Can amplify content from Content agent, real-time trend response

### 3.5 Growth Hacker Agent
- **Role**: Experiments, A/B tests, viral loops, unconventional channels, conversion optimization
- **Observation**: Funnel data, experiment results, channel performance, conversion rates
- **Actions**: `RUN_EXPERIMENT`, `LAUNCH_AB_TEST`, `BUILD_VIRAL_LOOP`, `OPTIMIZE_FUNNEL`, `TEST_CHANNEL`
- **Reward**: Conversion rate improvement, CAC reduction, experiment success rate
- **Unique Ability**: Can propose high-risk/high-reward experiments that bypass normal approval

---

## 4. Environment Design

### 4.1 Market State (like MAROONED's game_state.py)

```python
@dataclass
class MarketState:
    # Time
    day: int                    # Simulated day (1-90 for a quarter)
    phase: str                  # "morning_standup", "execution", "review", "planning"

    # Company KPIs
    website_traffic: int        # Daily visitors
    conversion_rate: float      # Visitor -> customer %
    revenue: float              # Monthly recurring revenue
    brand_awareness: float      # 0-100 score
    customer_satisfaction: float # NPS-like score

    # Resources
    budget_remaining: float     # Marketing budget left
    content_backlog: list       # Pending content pieces
    active_campaigns: list      # Running campaigns

    # Market Context
    market_sentiment: float     # -1 to 1 (bearish to bullish)
    competitor_actions: list    # Recent competitor moves
    trending_topics: list       # Current trends

    # Agent States
    agent_memories: dict        # Per-agent memory streams
    agent_plans: dict           # Per-agent current plans
    conversation_log: list      # Inter-agent conversations
```

### 4.2 Day Structure (like MAROONED's 4 phases per day)

| Phase | Duration | What Happens |
|-------|----------|-------------|
| **Morning Standup** | Turns 1-2 | Agents share plans, CMO sets priorities, team alignment |
| **Execution** | Turns 3-8 | Agents take marketing actions (content, campaigns, analysis) |
| **Review** | Turn 9 | Analytics agent reports results, team discusses |
| **Planning** | Turn 10 | Agents reflect, update memory, plan next day |

Each "day" = 10 turns. An episode = 90 days (1 quarter). Total = 900 turns per episode.

### 4.3 Dynamic Events (like MAROONED's emergent gameplay)

Events inject randomness and force adaptation:

| Event | Effect | Agent Impact |
|-------|--------|-------------|
| **Competitor Launch** | Market share pressure | All agents must respond |
| **Viral Moment** | Sudden traffic spike | Social agent amplifies |
| **PR Crisis** | Brand damage | CMO + Social must handle |
| **Algorithm Change** | SEO rankings shift | Analytics agent adapts |
| **Budget Cut** | 30% budget reduction | CMO reallocates |
| **Trend Opportunity** | Hot topic in niche | Content + Social capitalize |
| **Influencer Mention** | Free publicity | Growth agent follows up |
| **Customer Complaint Wave** | Satisfaction drops | Social agent responds |

Events fire with configurable probability each day (default: 15% chance per event type).

### 4.4 Reward Function

```python
def calculate_rewards(state, prev_state, agent_id, action):
    # Base reward: overall company health improvement
    kpi_delta = composite_kpi(state) - composite_kpi(prev_state)

    # Per-agent bonus for role-specific metrics
    role_bonus = {
        "cmo": strategy_alignment_score(state),
        "content": content_engagement_delta(state, prev_state),
        "analytics": insight_accuracy_score(state),
        "social": engagement_rate_delta(state, prev_state),
        "growth": experiment_roi(state)
    }

    # Collaboration bonus: rewarded when agents build on each other's work
    collab_bonus = collaboration_score(state, agent_id, action)

    # Penalties
    budget_penalty = -2.0 if action.cost > state.budget_remaining else 0
    conflict_penalty = -1.0 if action_conflicts_with_strategy(action, state) else 0

    return kpi_delta + role_bonus[agent_id] + collab_bonus + budget_penalty + conflict_penalty
```

---

## 5. Smallville Mechanics

### 5.1 Memory Streams (per agent)

Each agent maintains a stream of memories, exactly like Stanford's Generative Agents:

```python
@dataclass
class Memory:
    timestamp: int              # Turn number
    description: str            # Natural language description
    memory_type: str            # "observation", "reflection", "plan"
    importance: float           # 1-10 score (LLM-rated)
    embedding: list[float]      # For retrieval
    associated_agents: list     # Other agents involved
```

**Retrieval**: When an agent needs context, retrieve top-K memories by:
- Recency (time decay)
- Importance (LLM-scored)
- Relevance (cosine similarity to current situation)

### 5.2 Reflection

Every N turns (configurable, default=10 i.e. end of each day), agents reflect:

```
Prompt: "Given your recent observations: [top 20 memories],
what are 3 high-level insights about your marketing strategy?"
```

Reflections become new memories with high importance scores, creating abstraction layers.

### 5.3 Planning

Each agent creates a daily plan during the Planning phase:

```
Prompt: "You are [role]. Your current plan was: [previous plan].
Recent events: [last day's events]. Reflections: [recent reflections].
Create your plan for tomorrow with specific actions."
```

Plans guide action selection but can be overridden by urgent events.

### 5.4 Social Interaction

Agents can talk to each other (like MAROONED's messaging system):

- **Standup**: All agents share 1 message each
- **Direct Message**: Agents can DM each other during execution (costs 1 action)
- **Meeting**: CMO can call a meeting (all agents discuss for 1 turn)
- **Conversations influence memory**: What agents say to each other gets stored in memory streams

---

## 6. OpenEnv Integration

### 6.1 Gym-Compatible API

```python
class MarketVilleEnv(gym.Env):
    metadata = {"render_modes": ["human", "rgb_array"]}

    def __init__(self, num_agents=5, episode_length=900, render_mode=None):
        self.market_state = MarketState()
        self.agents = initialize_agents()

        # Multi-agent action/observation spaces
        self.action_space = spaces.Dict({
            agent_id: agent.action_space for agent_id, agent in self.agents.items()
        })
        self.observation_space = spaces.Dict({
            agent_id: agent.observation_space for agent_id, agent in self.agents.items()
        })

    def reset(self, seed=None):
        self.market_state = MarketState.initial(seed=seed)
        observations = {aid: self._get_obs(aid) for aid in self.agents}
        return observations, {}

    def step(self, actions: dict):
        # Execute all agent actions
        for agent_id, action in actions.items():
            self._execute_action(agent_id, action)

        # Fire random events
        self._process_events()

        # Advance time
        self.market_state.advance()

        # Calculate per-agent rewards
        rewards = {aid: self._calc_reward(aid) for aid in self.agents}
        observations = {aid: self._get_obs(aid) for aid in self.agents}

        done = self.market_state.day >= 90
        return observations, rewards, {aid: done for aid in self.agents}, {}, {}

    def render(self):
        # Print dashboard with KPIs, agent activities, market events
        pass

    # OpenEnv Extensions
    def observation_to_prompt(self, obs, agent_id):
        """Convert structured observation to LLM prompt."""
        pass

    def info(self):
        """Return environment metadata."""
        return {"name": "MarketVille", "version": "1.0", "num_agents": 5}
```

### 6.2 Action Schema

```python
@dataclass
class MarketingAction:
    agent_id: str
    action_type: str            # e.g. "WRITE_BLOG", "RUN_EXPERIMENT"
    target: str                 # What it applies to
    parameters: dict            # Action-specific params
    reasoning: str              # LLM's reasoning (for visualization)
    cost: float                 # Budget cost
    message: str                # Optional message to other agents
```

### 6.3 Observation Schema (Asymmetric per role)

```python
# CMO sees everything (like MAROONED's traitor with global vision)
cmo_obs = {
    "all_kpis": {...},
    "all_agent_actions": [...],
    "budget_full": {...},
    "market_events": [...],
    "agent_plans": {...}          # Can see all agents' plans
}

# Content Creator sees content-specific data
content_obs = {
    "content_kpis": {...},        # Only content metrics
    "seo_keywords": [...],        # From analytics agent
    "content_calendar": [...],
    "brand_guidelines": {...},
    "recent_feedback": [...]      # Limited market view
}

# Other agents similarly scoped to their domain
```

---

## 7. Training Pipeline

### 7.1 Teacher-Student Setup (Adapted from MAROONED)

```
Teacher Model: Llama 3.1 70B (or GPT-4) via vLLM
Student Model: Llama 3.1 8B + LoRA (rank 16, BF16)

Loop:
  1. Student generates marketing action in natural language
  2. Teacher validates format + strategic quality
  3. Environment executes action, returns reward
  4. Student gets: env_reward + format_penalty + strategy_bonus
  5. Corrections stored: (student_wrong, teacher_correct)
  6. Every 25 steps: SFT pass on corrections
```

### 7.2 Reward Shaping for Marketing

```python
REWARD_WEIGHTS = {
    "traffic_growth": 0.20,
    "conversion_improvement": 0.25,
    "revenue_growth": 0.20,
    "brand_awareness": 0.15,
    "budget_efficiency": 0.10,
    "collaboration": 0.10
}
```

### 7.3 Training with TRL/Unsloth

Use GRPO (Group Relative Policy Optimization) from TRL with OpenEnv:

```python
from trl import GRPOTrainer
from openenv import OpenEnvWrapper

env = OpenEnvWrapper(MarketVilleEnv())
trainer = GRPOTrainer(
    model=student_model,
    reward_model=env,
    train_dataset=episodes,
    # ...
)
trainer.train()
```

---

## 8. Web Dashboard

### 8.1 Layout

```
+--------------------------------------------------+
|  MarketVille - Day 23 / Quarter 1                |
+--------------------------------------------------+
|  [KPI Dashboard]          |  [Agent Activity]     |
|  Traffic: 12,400 (+5%)   |  CMO: Setting Q1      |
|  Conv: 3.2% (+0.1%)     |    strategy...          |
|  Revenue: $45K           |  Content: Writing       |
|  Brand: 67/100           |    blog on AI trends   |
|                           |  Analytics: Running    |
|  [Budget: $8K/$15K]     |    competitor audit     |
|                           |  Social: Scheduling    |
|  [Market Events]          |    Twitter thread      |
|  > Competitor launched    |  Growth: A/B testing   |
|    new product           |    landing page        |
+---------------------------+-----------------------+
|  [Conversation Log]                               |
|  CMO -> Content: "Prioritize the AI trends blog" |
|  Analytics -> CMO: "Competitor getting 2x traffic"|
|  Social -> Content: "Can you write a thread too?" |
+--------------------------------------------------+
|  [Timeline] Day 1 ====|==========> Day 23 ... 90 |
+--------------------------------------------------+
```

### 8.2 API Endpoints

```
POST /api/step           # Advance simulation by 1 turn
GET  /api/state          # Current market state + all agent states
GET  /api/agent/{id}     # Specific agent's memory, plan, actions
GET  /api/metrics        # KPI time series
GET  /api/conversations  # Agent interaction log
POST /api/event          # Inject a custom market event
POST /api/reset          # Reset simulation
WS   /ws/live            # WebSocket for real-time updates
```

---

## 9. Tech Stack

| Component | Technology |
|-----------|-----------|
| **RL Environment** | OpenEnv + Gymnasium |
| **Agent LLM** | Llama 3.1 8B (LoRA via Unsloth) |
| **Teacher LLM** | Llama 3.1 70B via vLLM |
| **Training** | TRL (GRPO), Unsloth |
| **Backend** | FastAPI, Uvicorn |
| **Frontend** | Next.js, React, Tailwind, Recharts |
| **Embeddings** | sentence-transformers (for memory retrieval) |
| **Database** | SQLite (episode storage) |
| **Infra** | Northflank (H100 GPU), HF Spaces |
| **Framework** | PyTorch 2.0+ |

---

## 10. Implementation Phases

### Phase 1: Core Environment (Hours 1-6)
- [ ] `marketville_env/environment.py` - Gym interface with reset/step/render
- [ ] `marketville_env/market_state.py` - Market simulation with KPIs
- [ ] `marketville_env/models.py` - Action, Observation, Agent dataclasses
- [ ] `marketville_env/config.py` - Constants and parameters
- [ ] `marketville_env/metrics.py` - Reward calculation
- [ ] `tests/test_env.py` - Basic env tests

### Phase 2: Agents + Smallville Mechanics (Hours 6-12)
- [ ] `agents/base_agent.py` - Memory streams, reflection, planning
- [ ] `marketville_env/memory.py` - Memory storage and retrieval
- [ ] `marketville_env/events.py` - Dynamic event system
- [ ] 5 agent implementations with unique action/observation spaces
- [ ] `marketville_env/llm_interface.py` - Prompt generation and action parsing
- [ ] Agent-to-agent conversation system

### Phase 3: Training Pipeline (Hours 12-18)
- [ ] `notebooks/train_marketville.ipynb` - Training loop
- [ ] Teacher-student validation setup
- [ ] Reward shaping and tuning
- [ ] Run initial training episodes on H100

### Phase 4: Web Dashboard (Hours 18-24)
- [ ] FastAPI backend with all endpoints
- [ ] Next.js frontend with KPI dashboard
- [ ] Agent activity cards with memory/reasoning display
- [ ] Conversation log viewer
- [ ] Real-time WebSocket updates
- [ ] Timeline visualization

### Phase 5: Polish + Demo (Hours 24-30)
- [ ] End-to-end demo flow
- [ ] README and documentation
- [ ] Record demo video
- [ ] Presentation slides
- [ ] Deploy to HF Spaces

---

## 11. Demo Script (for Judges)

1. **Start**: Show MarketVille dashboard with 5 agents at Day 1 of a startup
2. **Morning Standup**: Watch agents discuss strategy in real-time
3. **Execution**: See Content agent write a blog, Social agent schedule posts, Growth agent run an A/B test
4. **Inject Event**: Trigger a "Competitor Launch" event live -- watch agents react and adapt
5. **Fast-Forward**: Skip to Day 30 -- show KPI improvements from agent collaboration
6. **Memory Deep-Dive**: Show an agent's memory stream -- observations, reflections, plans
7. **Training**: Show the RL reward curve -- agents getting better at marketing over episodes
8. **Wow Moment**: Show two agents having a conversation where one changes the other's plan based on data

---

## 12. Why This Wins

| Criteria | Our Strength |
|----------|-------------|
| **Innovation (30%)** | First Smallville-style simulation applied to marketing; generative agents with memory/reflection in an RL loop |
| **Technical (30%)** | Multi-agent OpenEnv env, teacher-student training, 5 asymmetric agents, memory retrieval system |
| **OpenEnv (20%)** | Full Gym API compliance, proper step/reset/render, deployable to HF Spaces |
| **Presentation (20%)** | Real-time dashboard showing agents thinking, talking, and executing marketing in a living simulation |
