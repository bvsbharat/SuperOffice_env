# MarketVille PRD
## A Smallville-Style Multi-Agent Marketing Simulation on OpenEnv

---

## 1. Vision

**MarketVille** is a Smallville-inspired multi-agent simulation where 4 AI startup agents (Dev, Marketing, Sales, Content Creator) autonomously run a startup's marketing operations inside a PyTorch OpenEnv reinforcement learning environment. Agents have memory, reflect on past actions, plan strategies, interact socially, and learn through RL rewards tied to simulated marketing KPIs.

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

### Project Structure (OpenEnv `office_os/` scaffold)

The environment lives inside `office_os/`, the directory created by `openenv init`.
We build on top of the OpenEnv scaffold -- `Environment` base class, Pydantic
Action/Observation models, WebSocket `EnvClient`, and `create_app()` FastAPI server.

```
openenv-hack-hackathon/
├── office_os/                        # OpenEnv environment (from `openenv init`)
│   ├── __init__.py                   # Exports MarketVilleEnv, Action, Observation
│   ├── openenv.yaml                  # OpenEnv manifest (name: office_os)
│   ├── pyproject.toml                # Dependencies (openenv-core, pydantic, etc.)
│   ├── uv.lock
│   │
│   ├── models.py                     # Pydantic Action & Observation schemas
│   │                                 #   MarketVilleAction(Action)
│   │                                 #   MarketVilleObservation(Observation)
│   ├── client.py                     # EnvClient subclass for WebSocket connection
│   │
│   ├── server/                       # FastAPI server (OpenEnv standard)
│   │   ├── __init__.py
│   │   ├── app.py                    # create_app() with MarketVilleEnvironment
│   │   ├── office_os_environment.py  # Core Environment subclass (reset/step/state)
│   │   └── Dockerfile
│   │
│   ├── market/                       # MarketVille simulation logic
│   │   ├── __init__.py
│   │   ├── state.py                  # MarketState dataclass (KPIs, budget, etc.)
│   │   ├── config.py                 # Constants (budgets, KPI targets, timing)
│   │   ├── events.py                 # Dynamic market events generator
│   │   ├── metrics.py                # KPI tracking & reward calculation
│   │   └── simulator.py             # Market simulation engine (day phases)
│   │
│   ├── agents/                       # Smallville-style startup team agents
│   │   ├── __init__.py
│   │   ├── base_agent.py             # Base: memory streams, reflection, planning
│   │   ├── memory.py                 # Memory storage, retrieval, embeddings
│   │   ├── modes.py                  # kw-sdk custom ModeConfigs per role
│   │   ├── prompts.py                # Orchestrator prompts per role
│   │   ├── rubrics.py                # Domain-specific rubric templates
│   │   ├── dev_agent.py              # Dev (plan mode + code execution)
│   │   ├── marketing_agent.py        # Marketing (explore + search + analytics)
│   │   ├── sales_agent.py            # Sales (standard + pipeline management)
│   │   └── content_agent.py          # Content Creator (standard + iterate)
│   │
│   └── tests/
│       ├── test_env.py
│       ├── test_agents.py
│       └── test_market_state.py
│
├── notebooks/
│   ├── train_marketville.ipynb       # Main training pipeline
│   └── demo_agents.ipynb             # Quick demo
│
├── PRD/
│   └── MarketVille_PRD.md            # This file
├── requirements.txt
└── README.md
```

### How It Maps to OpenEnv Scaffold

| OpenEnv Scaffold | MarketVille Implementation |
|---|---|
| `models.py` `OfficeOsAction(Action)` | `MarketVilleAction(Action)` with agent_id, action_type, target, params, reasoning |
| `models.py` `OfficeOsObservation(Observation)` | `MarketVilleObservation(Observation)` with KPIs, agent_view, events, memories, messages |
| `server/office_os_environment.py` `OfficeOsEnvironment(Environment)` | `MarketVilleEnvironment(Environment)` with full market sim in reset/step/state |
| `client.py` `OfficeOsEnv(EnvClient)` | `MarketVilleEnv(EnvClient)` with multi-agent step payload parsing |
| `server/app.py` `create_app(...)` | Same pattern, wired to MarketVilleEnvironment |
| `openenv.yaml` | Updated name, same runtime/port structure |

---

## 3. The Agents (Asymmetric Roles)

4 agents, each with a unique observation space, action space, and reward function -- mirroring MAROONED's asymmetric role design. They collaborate inside a simulated startup office.

### 3.1 Dev Agent (Builder)
- **Role**: Develops new product features, fixes bugs, ships releases, manages technical debt
- **Observation**: Product backlog, bug reports, feature requests from Sales, current sprint status, system health metrics
- **Actions**: `BUILD_FEATURE`, `FIX_BUG`, `SHIP_RELEASE`, `REFACTOR`, `WRITE_DOCS`, `REVIEW_PR`
- **Reward**: Features shipped, bug resolution rate, product stability score, release velocity
- **Unique Ability**: Shipping a feature unlocks new selling points for Sales and new topics for Content Creator. Can block a release if stability is low.

### 3.2 Marketing Agent (Strategist)
- **Role**: Runs campaigns, manages ad spend, SEO, analytics, brand positioning, growth experiments
- **Observation**: Full dashboard (all KPIs, traffic, conversion, CAC, brand awareness), campaign results, competitor moves, market events
- **Actions**: `LAUNCH_CAMPAIGN`, `RUN_AD`, `RESEARCH_MARKET`, `ANALYZE_COMPETITOR`, `OPTIMIZE_FUNNEL`, `A_B_TEST`
- **Reward**: Traffic growth, lead generation, conversion rate improvement, CAC reduction, brand awareness lift
- **Unique Ability**: Sees all company metrics (global vision like MAROONED's traitor). Can call team meetings to align strategy.

### 3.3 Sales Agent (Closer)
- **Role**: Qualifies leads, runs demos, closes deals, manages pipeline, collects customer feedback
- **Observation**: Lead pipeline, deal stages, customer objections, product feature list (from Dev), pricing, competitor pricing
- **Actions**: `QUALIFY_LEAD`, `RUN_DEMO`, `SEND_PROPOSAL`, `CLOSE_DEAL`, `FOLLOW_UP`, `COLLECT_FEEDBACK`
- **Reward**: Revenue closed, pipeline value, close rate, customer satisfaction, feedback quality (loops to Dev)
- **Unique Ability**: Closing deals generates revenue that funds the whole team. Customer feedback creates feature requests for Dev.

### 3.4 Content Creator Agent (Storyteller)
- **Role**: Writes blog posts, social media, case studies, email sequences, product docs, video scripts
- **Observation**: Content calendar, SEO keywords from Marketing, new features from Dev, customer stories from Sales, brand guidelines
- **Actions**: `WRITE_BLOG`, `WRITE_SOCIAL_POST`, `WRITE_CASE_STUDY`, `WRITE_EMAIL_SEQUENCE`, `WRITE_DOCS`, `REVISE_CONTENT`
- **Reward**: Content engagement (clicks, shares, time-on-page), lead attribution, SEO ranking improvement
- **Unique Ability**: Produces assets that Marketing distributes and Sales uses in demos. Can turn Dev releases into launch announcements.

### Agent Interaction Map

```
         Dev
        /   \
  features   bug fixes
      |         |
  Content <---> Marketing
      |         |
  case studies  leads
      \       /
        Sales
```

**Key dependencies (why collaboration matters):**
- Dev ships feature -> Content writes about it -> Marketing promotes it -> Sales sells it
- Sales collects feedback -> Dev prioritizes bugs/features
- Marketing generates leads -> Sales closes them
- Content creates assets -> Marketing uses in campaigns, Sales uses in demos

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

### 4.3 Customer Pipeline & Lead System

Customers flow through a pipeline. Each agent gets rewarded at their stage.

```python
@dataclass
class Customer:
    id: str
    name: str                     # e.g. "Acme Corp", "TechStart Inc"
    company_size: str             # "startup", "smb", "enterprise"
    industry: str                 # "fintech", "healthtech", "saas", etc.
    budget: float                 # Annual contract value potential
    pain_point: str               # What problem they need solved
    source: str                   # How they arrived: "blog", "ad", "referral", "organic"
    stage: str                    # Pipeline stage (see below)
    created_at: int               # Day the lead was created
    content_touchpoints: list     # Which content pieces they interacted with
    objections: list              # What blocks them from buying
    satisfaction: float           # 0-1, post-sale satisfaction

PIPELINE_STAGES = [
    "visitor",        # Arrived at site (Content Creator gets credit)
    "lead",           # Showed interest / signed up (Marketing gets credit)
    "qualified",      # Matches ICP, has budget (Sales qualifies)
    "demo",           # Attended a demo (Sales runs demo)
    "proposal",       # Received a proposal (Sales sends)
    "negotiation",    # Back and forth on terms
    "closed_won",     # Signed contract (Sales gets big reward)
    "closed_lost",    # Walked away (penalty distributed)
    "churned",        # Left after signing (penalty to all)
]
```

**Sample Customers (spawned throughout simulation):**

| Customer | Size | Budget | Pain Point | Source |
|---|---|---|---|---|
| Acme Corp | Enterprise | $50K/yr | Needs SSO & compliance | Blog post on security |
| TechStart Inc | Startup | $5K/yr | Wants fast onboarding | Product Hunt launch |
| MedFlow Health | SMB | $20K/yr | HIPAA compliance | Case study from Content |
| RetailAI | Enterprise | $80K/yr | Needs API integrations | Competitor comparison ad |
| GreenScale | Startup | $8K/yr | Cost-effective solution | Social media post |
| FinServ Partners | Enterprise | $100K/yr | Audit trail & reporting | Whitepaper download |
| EduTech Labs | SMB | $12K/yr | Easy team collaboration | Email sequence |
| DataDriven Co | SMB | $15K/yr | Analytics dashboard | SEO organic search |

New customers spawn every 2-5 days based on Content output and Marketing campaigns.
Higher quality content/campaigns = higher quality leads (larger budgets, better fit).

**Reward Attribution by Stage:**

```python
STAGE_REWARDS = {
    # Content Creator rewards
    "visitor": {"content": +0.5},                    # Content attracted them
    "lead": {"content": +1.0, "marketing": +1.5},    # Content + Marketing converted

    # Sales rewards
    "qualified": {"sales": +1.0},                     # Sales qualified correctly
    "demo": {"sales": +1.5, "dev": +0.5},            # Good demo (Dev's features matter)
    "proposal": {"sales": +2.0},
    "closed_won": {"sales": +10.0, "content": +2.0,  # Everyone benefits from revenue
                   "marketing": +3.0, "dev": +2.0},

    # Penalties
    "closed_lost": {"sales": -3.0, "marketing": -1.0},  # Lost deal hurts
    "churned": {"dev": -5.0, "sales": -3.0,              # Product/service failure
                "content": -1.0, "marketing": -1.0},
}
```

**Constraints:**
- Sales can only demo features that Dev has actually shipped
- Content can only write about features that exist (no vaporware)
- Marketing spend must stay within budget (budget resets monthly from revenue)
- If a customer's pain point matches a shipped feature, close rate goes up 2x
- If content addresses a customer's objection, negotiation moves faster
- Customer patience decays: if not contacted within 5 days of becoming a lead, they leave

### 4.4 Dynamic Events (like MAROONED's emergent gameplay)

Events inject randomness and force adaptation:

| Event | Effect | Agent Impact |
|-------|--------|-------------|
| **Competitor Launch** | Market share pressure, leads reconsider | All agents must respond |
| **Viral Moment** | Sudden traffic spike, 5 new leads | Content + Marketing amplify |
| **PR Crisis** | Brand damage, 2 leads go cold | Marketing + Sales handle |
| **Algorithm Change** | SEO rankings shift, organic traffic drops | Marketing adapts strategy |
| **Budget Cut** | 30% budget reduction | Marketing reallocates |
| **Big Customer Inquiry** | Enterprise lead with $100K budget appears | Sales prioritizes, Dev checks features |
| **Feature Request Wave** | 3 customers want same feature | Dev prioritizes, Sales follows up |
| **Customer Success Story** | Happy customer wants to do case study | Content writes it, Sales uses it |

Events fire with configurable probability each day (default: 15% chance per event type).

### 4.5 Reward Function

```python
def calculate_rewards(state, prev_state, agent_id, action):
    # 1. Base reward: overall company health improvement
    kpi_delta = composite_kpi(state) - composite_kpi(prev_state)

    # 2. Customer pipeline rewards (the main reward signal)
    #    Awarded when customers move through pipeline stages
    pipeline_reward = sum(
        STAGE_REWARDS[customer.stage].get(agent_id, 0)
        for customer in state.customers_that_moved_stage()
    )

    # 3. Per-agent bonus for role-specific metrics
    role_bonus = {
        "dev": feature_velocity(state) + stability_score(state),
        "marketing": traffic_growth(state, prev_state) + lead_gen_delta(state, prev_state),
        "sales": revenue_closed(state, prev_state) + pipeline_growth(state, prev_state),
        "content": content_engagement_delta(state, prev_state) + lead_attribution(state),
    }

    # 4. Collaboration bonus: rewarded when agents build on each other's work
    #    e.g. Content wrote about a feature Dev shipped -> bonus for both
    #    e.g. Sales used a case study Content wrote -> bonus for both
    collab_bonus = collaboration_score(state, agent_id, action)

    # 5. Constraints & Penalties
    budget_penalty = -2.0 if action.cost > state.budget_remaining else 0
    vaporware_penalty = -5.0 if agent_id == "content" and references_unshipped_feature(action) else 0
    stale_lead_penalty = -2.0 if agent_id == "sales" and has_stale_leads(state) else 0
    broken_release_penalty = -5.0 if agent_id == "dev" and action.action_type == "SHIP_RELEASE" and not stable(state) else 0

    return (kpi_delta + pipeline_reward + role_bonus[agent_id] +
            collab_bonus + budget_penalty + vaporware_penalty +
            stale_lead_penalty + broken_release_penalty)
```

**Key constraints enforced by the environment:**
- Content cannot write about features that Dev hasn't shipped yet (vaporware penalty)
- Sales cannot demo features that don't exist (demo fails, lead goes cold)
- Dev shipping unstable code causes customer churn (broken release penalty)
- Marketing overspending budget causes all campaigns to pause
- Leads decay: uncontacted leads within 5 days become `closed_lost`
- Revenue from `closed_won` deals replenishes monthly budget (positive feedback loop)
- Customer satisfaction affects referral rate (more happy customers = more organic leads)

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

## 6. OpenEnv Integration (Real API)

The environment uses the actual OpenEnv scaffold from `openenv init`. It extends
`Environment` (from `openenv.core.env_server.interfaces`) and uses Pydantic models
extending `Action` and `Observation` (from `openenv.core.env_server.types`).

### 6.1 Action Model (`models.py`)

```python
from typing import Optional
from pydantic import Field
from openenv.core.env_server.types import Action, Observation


class MarketVilleAction(Action):
    """A single agent's marketing action for one turn."""
    agent_id: str = Field(..., description="Which agent is acting (cmo, content, analytics, social, growth)")
    action_type: str = Field(..., description="Action type (e.g. WRITE_BLOG, SET_STRATEGY, RUN_EXPERIMENT)")
    target: str = Field(default="", description="What the action applies to")
    parameters: dict = Field(default_factory=dict, description="Action-specific parameters")
    reasoning: str = Field(default="", description="Agent's reasoning for this action")
    cost: float = Field(default=0.0, description="Budget cost of this action")
    message: Optional[str] = Field(default=None, description="Optional message to other agents")
```

### 6.2 Observation Model (`models.py`)

```python
class MarketVilleObservation(Observation):
    """What an agent sees after a step -- asymmetric per role."""
    agent_id: str = Field(default="", description="Which agent this observation is for")
    day: int = Field(default=1, description="Current simulation day (1-90)")
    phase: str = Field(default="morning_standup", description="Current day phase")

    # KPIs (scoped per agent role)
    kpis: dict = Field(default_factory=dict, description="Visible KPI metrics")
    budget_remaining: float = Field(default=0.0, description="Remaining marketing budget")

    # Agent-specific view
    recent_actions: list = Field(default_factory=list, description="Recent actions by visible agents")
    messages: list = Field(default_factory=list, description="Messages from other agents")
    events: list = Field(default_factory=list, description="Active market events")

    # Smallville memory context
    relevant_memories: list = Field(default_factory=list, description="Top-K retrieved memories")
    current_plan: str = Field(default="", description="Agent's current daily plan")
    reflections: list = Field(default_factory=list, description="Recent reflections")

    # Role-specific fields
    role_data: dict = Field(default_factory=dict, description="Role-specific observation data")
```

### 6.3 Environment (`server/office_os_environment.py`)

```python
from uuid import uuid4
from openenv.core.env_server.interfaces import Environment
from openenv.core.env_server.types import State
from models import MarketVilleAction, MarketVilleObservation
from market.state import MarketState
from market.simulator import MarketSimulator
from market.events import EventEngine
from market.metrics import RewardCalculator
from agents import AgentManager


class MarketVilleEnvironment(Environment):
    """
    Multi-agent marketing simulation environment.
    5 Smallville-style agents run a startup's marketing for 90 days.
    """
    SUPPORTS_CONCURRENT_SESSIONS: bool = True

    def __init__(self):
        self._state = State(episode_id=str(uuid4()), step_count=0)
        self._market = MarketState()
        self._simulator = MarketSimulator(self._market)
        self._events = EventEngine()
        self._rewards = RewardCalculator()
        self._agents = AgentManager()

    def reset(self) -> MarketVilleObservation:
        self._state = State(episode_id=str(uuid4()), step_count=0)
        self._market = MarketState.initial()
        self._simulator = MarketSimulator(self._market)
        self._agents.reset()

        return MarketVilleObservation(
            agent_id="all",
            day=1,
            phase="morning_standup",
            kpis=self._market.get_all_kpis(),
            budget_remaining=self._market.budget_remaining,
            events=[],
            messages=["MarketVille simulation started. Day 1 begins."],
            done=False,
            reward=0.0,
        )

    def step(self, action: MarketVilleAction) -> MarketVilleObservation:
        self._state.step_count += 1

        # Execute the agent's action
        result = self._simulator.execute_action(action)

        # Process random market events
        new_events = self._events.tick(self._market)

        # Advance simulation clock
        self._simulator.advance()

        # Calculate reward
        reward = self._rewards.calculate(
            state=self._market,
            agent_id=action.agent_id,
            action=action,
        )

        # Build asymmetric observation for the acting agent
        obs = self._build_observation(action.agent_id, new_events, reward)

        return obs

    @property
    def state(self) -> State:
        return self._state

    def _build_observation(self, agent_id, events, reward) -> MarketVilleObservation:
        """Build role-scoped observation for a specific agent."""
        agent = self._agents.get(agent_id)
        return MarketVilleObservation(
            agent_id=agent_id,
            day=self._market.day,
            phase=self._market.phase,
            kpis=self._market.get_kpis_for_role(agent.role),
            budget_remaining=self._market.budget_remaining,
            recent_actions=self._market.get_visible_actions(agent_id),
            messages=self._market.get_messages_for(agent_id),
            events=[e.description for e in events],
            relevant_memories=agent.memory.retrieve_relevant(k=10),
            current_plan=agent.current_plan,
            reflections=agent.recent_reflections(n=3),
            role_data=agent.get_role_specific_data(self._market),
            done=self._market.day >= 90,
            reward=reward,
            metadata={
                "step": self._state.step_count,
                "episode_id": self._state.episode_id,
            },
        )
```

### 6.4 Client (`client.py`)

```python
from typing import Dict
from openenv.core.client_types import StepResult
from openenv.core.env_server.types import State
from openenv.core import EnvClient
from .models import MarketVilleAction, MarketVilleObservation


class MarketVilleEnv(EnvClient[MarketVilleAction, MarketVilleObservation]):
    """WebSocket client for the MarketVille environment."""

    def _step_payload(self, action: MarketVilleAction) -> Dict:
        return action.model_dump()

    def _parse_result(self, payload: Dict) -> StepResult[MarketVilleObservation]:
        obs_data = payload.get("observation", {})
        observation = MarketVilleObservation(**obs_data)
        return StepResult(
            observation=observation,
            reward=payload.get("reward"),
            done=payload.get("done", False),
        )

    def _parse_state(self, payload: Dict) -> State:
        return State(
            episode_id=payload.get("episode_id"),
            step_count=payload.get("step_count", 0),
        )
```

### 6.5 Server App (`server/app.py`)

```python
from openenv.core.env_server.http_server import create_app
from models import MarketVilleAction, MarketVilleObservation
from .office_os_environment import MarketVilleEnvironment

app = create_app(
    MarketVilleEnvironment,
    MarketVilleAction,
    MarketVilleObservation,
    env_name="office_os",
    max_concurrent_envs=4,  # One per agent session
)
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

### 7.2 Reward Shaping

```python
REWARD_WEIGHTS = {
    "revenue_growth": 0.25,
    "product_velocity": 0.20,
    "traffic_and_leads": 0.20,
    "content_engagement": 0.15,
    "collaboration": 0.10,       # Agents building on each other's work
    "budget_efficiency": 0.10,
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
|  Revenue: $45K (+12%)    |  Dev: Shipping v2.3    |
|  Traffic: 12,400 (+5%)   |    auth feature...     |
|  Conv: 3.2% (+0.1%)     |  Marketing: Running    |
|  Pipeline: $120K         |    product launch ad   |
|                           |  Sales: Following up   |
|  [Budget: $8K/$15K]     |    3 warm leads        |
|                           |  Content: Writing      |
|  [Market Events]          |    case study on       |
|  > Competitor launched    |    customer success    |
|    new product           |                        |
+---------------------------+-----------------------+
|  [Conversation Log]                               |
|  Sales -> Dev: "Customer needs SSO, 3 deals blocked"|
|  Dev -> Content: "Auth feature shipped, write it up"|
|  Marketing -> Sales: "12 new leads from campaign"   |
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

### Phase 1: Core Environment in office_os/ (Hours 1-6)
- [ ] `office_os/models.py` - Replace echo models with MarketVilleAction & MarketVilleObservation
- [ ] `office_os/market/state.py` - MarketState dataclass with KPIs, budget, day/phase
- [ ] `office_os/market/config.py` - Constants and parameters
- [ ] `office_os/market/simulator.py` - Day phase engine, action execution
- [ ] `office_os/market/metrics.py` - Reward calculation
- [ ] `office_os/market/events.py` - Dynamic market events
- [ ] `office_os/server/office_os_environment.py` - Replace echo logic with MarketVilleEnvironment
- [ ] `office_os/client.py` - Update client to parse MarketVille payloads
- [ ] `office_os/server/app.py` - Wire create_app() to new models
- [ ] `office_os/tests/test_env.py` - Basic reset/step tests
- [ ] Verify: `uv run --project office_os server` starts and `/health` returns OK

### Phase 2: Agents + kw-sdk + Smallville Mechanics (Hours 6-12)
- [ ] `office_os/agents/memory.py` - Memory streams, retrieval, importance scoring
- [ ] `office_os/agents/base_agent.py` - Base agent with kw-sdk RLHarness + memory + reflection
- [ ] `office_os/agents/modes.py` - Custom ModeConfigs (cmo_strategist, content_creator, etc.)
- [ ] `office_os/agents/prompts.py` - Orchestrator prompts per role
- [ ] `office_os/agents/rubrics.py` - Marketing rubric templates
- [ ] 4 agent implementations (dev, marketing, sales, content) wired to kw-sdk verification loops
- [ ] Agent-to-agent conversation system (messages stored in memory)
- [ ] Add `verif` (kw-sdk) to `office_os/pyproject.toml` dependencies

### Phase 3: Training Pipeline (Hours 12-18)
- [ ] `notebooks/train_marketville.ipynb` - Training loop using OpenEnv client
- [ ] Teacher-student validation setup (kw-sdk verification as teacher)
- [ ] Reward shaping and tuning
- [ ] Run initial training episodes on H100

### Phase 4: Web Dashboard (Hours 18-24)
- [ ] OpenEnv built-in web UI at `/web` already works via create_app()
- [ ] Add custom dashboard routes for KPI visualization
- [ ] kw-sdk streaming events -> WebSocket broadcast for agent cognition
- [ ] Agent activity cards with memory/reasoning display
- [ ] Conversation log viewer

### Phase 5: Polish + Demo (Hours 24-30)
- [ ] End-to-end demo: `openenv push` to HF Spaces
- [ ] README and documentation
- [ ] Record demo video
- [ ] Presentation slides
- [ ] Verify Docker build: `docker build -t office_os-env:latest -f server/Dockerfile .`

---

## 11. Demo Script (for Judges)

1. **Start**: Show MarketVille dashboard with 4 agents at Day 1 of a startup
2. **Morning Standup**: Watch Dev, Marketing, Sales, Content discuss priorities
3. **Execution**: Dev ships a feature -> Content writes a launch post -> Marketing promotes it -> Sales pitches it to leads
4. **Inject Event**: Trigger a "Competitor Launch" event -- watch all agents react and adapt their plans
5. **Fast-Forward**: Skip to Day 30 -- show revenue growth from the full Dev->Content->Marketing->Sales pipeline
6. **Memory Deep-Dive**: Show Sales agent's memory -- customer feedback that became a Dev feature request
7. **Training**: Show the RL reward curve -- agents learning to collaborate across the pipeline
8. **Wow Moment**: Sales closes a deal because Content wrote a case study about a feature Dev shipped last week -- the full loop working autonomously

---

## 12. kw-sdk Integration (ClioAI/kw-sdk)

The **Knowledge Work SDK** (`verif`) provides a self-verifying agentic loop with rubric-based verification, subagent orchestration, execution modes, streaming events, and checkpointing. We integrate it as the **cognitive engine** powering each MarketVille agent.

### 12.1 Why kw-sdk + MarketVille

MarketVille agents do **knowledge work** -- research, writing, analysis, strategy. This is exactly what kw-sdk was built for. Traditional RL agents pick from discrete actions; our agents produce rich, open-ended marketing outputs (blog posts, competitive analyses, campaign plans) that need **quality verification**, not just format checks.

| kw-sdk Component | MarketVille Usage |
|---|---|
| **Verification Loop** (Brief -> Rubric -> Execute -> Verify -> Submit) | Every agent action goes through self-verification before the environment accepts it |
| **Execution Modes** (standard, plan, explore, iterate) | Each agent role uses a different mode matching their work style |
| **Rubrics** | Auto-generated quality criteria for marketing outputs (content quality, data accuracy, strategic alignment) |
| **Subagent Orchestration** | CMO delegates to specialist agents; Analytics spawns parallel research subagents |
| **Streaming Events** | Real-time event feed powering the web dashboard |
| **Checkpointing** | Save/resume simulation state at any turn |
| **Code Execution** | Analytics agent runs Python for data analysis, chart generation |
| **Web Search** | Agents research real market data, competitor info, trends |
| **Context Compaction** | Handles long memory streams without blowing context windows |
| **Custom Modes** | Agent-specific orchestration modes (see below) |

### 12.2 Agent-to-Mode Mapping

Each agent operates through a kw-sdk mode tuned to their work:

```python
from verif import RLHarness, ProviderConfig
from verif.config import ModeConfig
from verif.modes import MODES
from verif.providers.base import PROMPTS

# Dev uses "plan" mode -- structured feature development
DEV_MODE = ModeConfig(
    name="dev_builder",
    orchestrator_prompt="DEV_ORCHESTRATOR",
    tools=["create_brief", "create_rubric", "spawn_subagent",
           "execute_code", "verify_answer", "submit_answer"],
    verification_tool="verify_answer",
    rubric_strategy="create",
    has_pre_execution=False,
    prompt_kwargs=["backlog", "sprint_status", "bug_reports", "feedback"],
)

# Marketing uses "explore" mode -- research + strategy + experiments
MARKETING_MODE = ModeConfig(
    name="marketing_strategist",
    orchestrator_prompt="MARKETING_ORCHESTRATOR",
    tools=["create_brief", "create_rubric", "spawn_subagent",
           "search_web", "execute_code", "verify_answer", "submit_answer"],
    verification_tool="verify_answer",
    rubric_strategy="create",
    has_pre_execution=False,
    prompt_kwargs=["all_kpis", "budget", "team_status", "competitor_data"],
)

# Sales uses "standard" mode -- pipeline execution + deal closing
SALES_MODE = ModeConfig(
    name="sales_closer",
    orchestrator_prompt="SALES_ORCHESTRATOR",
    tools=["create_brief", "create_rubric", "spawn_subagent",
           "search_web", "verify_answer", "submit_answer"],
    verification_tool="verify_answer",
    rubric_strategy="create",
    has_pre_execution=False,
    prompt_kwargs=["pipeline", "feature_list", "pricing", "leads"],
)

# Content Creator uses "standard" mode with content quality rubrics
CONTENT_MODE = ModeConfig(
    name="content_creator",
    orchestrator_prompt="CONTENT_ORCHESTRATOR",
    tools=["create_brief", "create_rubric", "spawn_subagent",
           "verify_answer", "submit_answer"],
    verification_tool="verify_answer",
    rubric_strategy="create",
    has_pre_execution=False,
    prompt_kwargs=["seo_keywords", "new_features", "customer_stories", "content_calendar"],
)

# Register all modes
for mode in [DEV_MODE, MARKETING_MODE, SALES_MODE, CONTENT_MODE]:
    MODES[mode.name] = mode
```

### 12.3 Verification Loop in the RL Step

The key insight: kw-sdk's verification loop becomes the **action quality gate** inside the OpenEnv `step()`. Instead of just parsing LLM output and hoping it's good, every agent action is self-verified before the environment processes it.

```python
# Inside MarketVilleEnv.step()
async def _generate_verified_action(self, agent_id, observation):
    """Agent produces a verified marketing action via kw-sdk."""
    agent = self.agents[agent_id]
    harness = agent.harness  # Each agent has its own RLHarness

    # Observation becomes the task prompt
    prompt = self.observation_to_prompt(observation, agent_id)

    # kw-sdk runs: Brief -> Rubric -> Execute -> Verify -> Submit
    result = await harness.run_single(
        task=prompt,
        mode=agent.mode_name,
        **agent.get_mode_kwargs(self.market_state)
    )

    # Parse verified output into structured action
    action = parse_marketing_action(result.answer)

    # Store execution trace in agent memory
    agent.memory.add_observation(
        f"I decided to {action.action_type}: {action.reasoning}",
        importance=self._rate_importance(action)
    )

    return action, result
```

### 12.4 Auto-Generated Marketing Rubrics

Each agent type gets rubrics tailored to their domain:

```python
# Content Creator auto-rubric (generated by kw-sdk, refined per episode)
CONTENT_RUBRIC = """
## Content Quality (40 points)
- [ ] Clear headline with target keyword
- [ ] Opening hook in first 2 sentences
- [ ] Supports brand voice guidelines
- [ ] Actionable takeaways for reader

## Strategic Alignment (30 points)
- [ ] Addresses current campaign priorities
- [ ] Targets audience segment from CMO brief
- [ ] Includes relevant CTA

## SEO (30 points)
- [ ] Primary keyword in title and first paragraph
- [ ] 800-1500 word count
- [ ] Internal linking opportunities noted
"""

# Analytics auto-rubric
ANALYTICS_RUBRIC = """
## Data Quality (40 points)
- [ ] All claims backed by specific numbers
- [ ] Sources cited for external data
- [ ] Time periods clearly stated

## Actionability (30 points)
- [ ] Specific recommendations (not vague)
- [ ] Prioritized by expected impact
- [ ] Feasibility considered

## Completeness (30 points)
- [ ] Covers all requested metrics
- [ ] Competitor comparison included
- [ ] Trends identified (not just snapshots)
"""
```

### 12.5 Subagent Delegation (Marketing -> Team)

Marketing agent has global visibility and uses kw-sdk's `spawn_subagent` to coordinate:

```python
MARKETING_ORCHESTRATOR = """You are the Marketing lead at a startup. Day {day}, Budget: ${budget}.

All KPIs: {all_kpis}
Team status: {team_status}
Competitor data: {competitor_data}

## Your Workflow
1. Analyze all company KPIs and market conditions
2. Use spawn_subagent to run parallel research:
   - Competitive intelligence subagent (with search_web)
   - Campaign performance subagent (with execute_code for data analysis)
   - Lead quality subagent
3. Synthesize findings into marketing directives
4. verify_answer against strategic rubric
5. submit_answer with your decisions

Your output must include:
- CAMPAIGN: What to run/optimize today
- LEADS_FOR_SALES: Qualified leads to hand off
- CONTENT_REQUEST: What Content Creator should write
- FEATURE_SIGNAL: What Dev should know from market data
- REASONING: Why this approach given current data
"""
```

### 12.6 Streaming Events -> Dashboard

kw-sdk's event system feeds directly into the web dashboard via WebSocket:

```python
from verif import RLHarness, ProviderConfig
from verif.providers.base import HistoryEntry

async def on_agent_event(entry: HistoryEntry, agent_id: str):
    """Stream agent cognition to the dashboard in real-time."""
    event_map = {
        "model_chunk": "agent_thinking",
        "tool_call": "agent_action",
        "subagent_start": "delegation",
        "subagent_end": "delegation_result",
        "verification_chunk": "self_check",
    }

    dashboard_event = {
        "agent_id": agent_id,
        "event_type": event_map.get(entry.entry_type, entry.entry_type),
        "content": entry.content,
        "timestamp": entry.timestamp,
    }

    await websocket_manager.broadcast(dashboard_event)
```

### 12.7 Checkpointing = Simulation Save States

```python
# Save simulation at any point
for agent in agents.values():
    result = agent.harness.run_single(task, checkpoint=True)

# Resume from any turn (e.g., replay from Day 15 with different event)
for agent in agents.values():
    agent.harness.resume(
        checkpoint_id=f"day15:step:150",
        feedback="A major competitor just launched. Adapt your strategy."
    )
```

### 12.8 Plan Mode for Dev Feature Development

Dev agent uses kw-sdk's `plan` mode to structure feature work:

```python
result = dev_harness.run_single(
    task=f"""Backlog: {backlog}
    Sprint status: {sprint_status}
    Customer feedback from Sales: {feedback}
    Bug reports: {bug_reports}

    Decide what to build/fix today. Prioritize by revenue impact.""",
    mode="dev_builder",
)

# Output includes:
# - FEATURE/BUG: What to work on
# - COMPLEXITY: Estimated effort
# - DEPENDENCIES: What other agents need to know
# - SHIP_DATE: When it'll be ready for Content to write about
```

### 12.9 Iterate Mode for Content Refinement

When content doesn't pass verification, kw-sdk's iterate mode refines it:

```python
# First draft -- Content writes about a feature Dev just shipped
result = content_harness.run_single(
    task="Write a launch blog post for the new SSO feature.",
    mode="content_creator",
)

# Marketing provides feedback based on SEO data
refined = content_harness.iterate(
    task="Write a launch blog post for the new SSO feature.",
    answer=result.answer,
    rubric=result.rubric,
    feedback="Target keyword 'enterprise SSO integration'. Add customer quote from Sales.",
    rubric_update="Must include specific customer use case and CTA for demo.",
)
```

### 12.10 Updated Project Structure (with kw-sdk, inside office_os/)

All code lives inside `office_os/` to stay compatible with `openenv push`.

```
openenv-hack-hackathon/
├── office_os/                          # OpenEnv environment root
│   ├── __init__.py                     # Exports MarketVilleEnv, Action, Obs
│   ├── models.py                       # Pydantic Action + Observation
│   ├── client.py                       # EnvClient subclass
│   ├── openenv.yaml                    # OpenEnv manifest
│   ├── pyproject.toml                  # Deps: openenv-core, verif (kw-sdk), etc.
│   ├── uv.lock
│   │
│   ├── server/                         # FastAPI server (OpenEnv standard)
│   │   ├── __init__.py
│   │   ├── app.py                      # create_app() wired to MarketVille
│   │   ├── office_os_environment.py    # MarketVilleEnvironment(Environment)
│   │   └── Dockerfile
│   │
│   ├── market/                         # Market simulation engine
│   │   ├── __init__.py
│   │   ├── state.py                    # MarketState dataclass
│   │   ├── config.py                   # Constants, KPI targets, budgets
│   │   ├── events.py                   # Random market event generator
│   │   ├── metrics.py                  # Reward calculation
│   │   └── simulator.py               # Day phases, action execution
│   │
│   ├── agents/                         # kw-sdk powered Smallville agents
│   │   ├── __init__.py                 # AgentManager
│   │   ├── base_agent.py              # Base: RLHarness + memory + reflection
│   │   ├── memory.py                   # Memory streams, retrieval, embeddings
│   │   ├── modes.py                    # Custom kw-sdk ModeConfigs per role
│   │   ├── prompts.py                  # Orchestrator prompts per role
│   │   ├── rubrics.py                  # Domain-specific rubric templates
│   │   ├── dev_agent.py               # Dev (plan mode + code execution)
│   │   ├── marketing_agent.py         # Marketing (explore + search + analytics)
│   │   ├── sales_agent.py             # Sales (standard + pipeline)
│   │   └── content_agent.py           # Content (standard + iterate)
│   │
│   └── tests/
│       ├── test_env.py
│       ├── test_agents.py
│       └── test_market_state.py
│
├── notebooks/
│   ├── train_marketville.ipynb
│   └── demo_agents.ipynb
├── PRD/
│   └── MarketVille_PRD.md
├── requirements.txt
└── README.md
```

### 12.11 Updated Tech Stack

| Component | Technology |
|-----------|-----------|
| **RL Environment** | OpenEnv + Gymnasium |
| **Agent Cognition** | **kw-sdk (verif)** -- verification loops, modes, subagents |
| **Agent LLM** | Llama 3.1 8B (LoRA via Unsloth) or Gemini/OpenAI via kw-sdk providers |
| **Training** | TRL (GRPO), Unsloth |
| **Backend** | FastAPI + kw-sdk event streaming |
| **Frontend** | Next.js, React, Tailwind, Recharts |
| **Memory Retrieval** | sentence-transformers embeddings |
| **Code Execution** | kw-sdk SubprocessExecutor (for Analytics agent) |
| **Web Search** | kw-sdk search tool (for real market data) |
| **Checkpointing** | kw-sdk snapshots |
| **Infra** | Northflank (H100 GPU), HF Spaces |

---

## 13. Why This Wins

| Criteria | Our Strength |
|----------|-------------|
| **Innovation (30%)** | First Smallville-style simulation applied to marketing; kw-sdk verification loops give agents self-correcting cognition -- they don't just act, they verify their own work |
| **Technical (30%)** | Multi-agent OpenEnv env + kw-sdk orchestration, custom modes per role, rubric-based quality gates, subagent delegation, code execution for analytics |
| **OpenEnv (20%)** | Full Gym API compliance, proper step/reset/render, deployable to HF Spaces |
| **Presentation (20%)** | Real-time dashboard streaming agent cognition (thinking -> verifying -> submitting) via kw-sdk events. Watch agents debate, self-correct, and iterate live |
