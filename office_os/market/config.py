"""Constants and configuration for the Office OS simulation."""

from dataclasses import dataclass, field


PIPELINE_STAGES = [
    "visitor",
    "lead",
    "qualified",
    "demo",
    "proposal",
    "negotiation",
    "closed_won",
    "closed_lost",
    "churned",
]

# Rewards given to each agent role when a customer moves to a stage
STAGE_REWARDS: dict[str, dict[str, float]] = {
    "visitor": {"content": 0.5},
    "lead": {"content": 1.0, "marketing": 1.5},
    "qualified": {"sales": 1.0},
    "demo": {"sales": 1.5, "dev": 0.5},
    "proposal": {"sales": 2.0},
    "closed_won": {"sales": 10.0, "content": 2.0, "marketing": 3.0, "dev": 2.0},
    "closed_lost": {"sales": -3.0, "marketing": -1.0},
    "churned": {"dev": -5.0, "sales": -3.0, "content": -1.0, "marketing": -1.0},
}

AGENT_ROLES = ["dev", "marketing", "sales", "content"]

# Actions available per role
ROLE_ACTIONS: dict[str, list[str]] = {
    "dev": [
        "BUILD_FEATURE",
        "FIX_BUG",
        "SHIP_RELEASE",
        "REFACTOR",
        "WRITE_DOCS",
        "REVIEW_PR",
    ],
    "marketing": [
        "LAUNCH_CAMPAIGN",
        "RUN_AD",
        "RESEARCH_MARKET",
        "ANALYZE_COMPETITOR",
        "OPTIMIZE_FUNNEL",
        "A_B_TEST",
    ],
    "sales": [
        "QUALIFY_LEAD",
        "RUN_DEMO",
        "SEND_PROPOSAL",
        "CLOSE_DEAL",
        "FOLLOW_UP",
        "COLLECT_FEEDBACK",
    ],
    "content": [
        "WRITE_BLOG",
        "WRITE_SOCIAL_POST",
        "WRITE_CASE_STUDY",
        "WRITE_EMAIL_SEQUENCE",
        "WRITE_DOCS",
        "REVISE_CONTENT",
    ],
}

DAY_PHASES = ["morning_standup", "execution", "review", "planning"]

# Turns per phase within a day
PHASE_TURNS = {
    "morning_standup": 2,
    "execution": 6,
    "review": 1,
    "planning": 1,
}
TURNS_PER_DAY = sum(PHASE_TURNS.values())  # 10
EPISODE_DAYS = 90
EPISODE_TURNS = TURNS_PER_DAY * EPISODE_DAYS  # 900

# Contract tiers: name -> (duration_months, reward_multiplier)
CONTRACT_TIERS: dict[str, dict] = {
    "monthly":  {"months": 1,  "multiplier": 1.0, "label": "Monthly"},
    "6_month":  {"months": 6,  "multiplier": 2.0, "label": "6-Month"},
    "annual":   {"months": 12, "multiplier": 3.0, "label": "Annual"},
}


@dataclass
class Config:
    """Simulation configuration."""

    initial_budget: float = 15000.0
    monthly_budget_refresh: float = 10000.0
    initial_traffic: int = 1000
    initial_conversion_rate: float = 0.02
    initial_revenue: float = 0.0
    initial_brand_awareness: float = 10.0

    # Customer generation
    min_days_between_customers: int = 1
    max_days_between_customers: int = 3
    lead_decay_days: int = 5  # Leads not contacted within this many days are lost

    # Event probability per day
    event_probability: float = 0.15

    # Feature development
    feature_build_turns: int = 3  # Turns to build a feature
    bug_fix_turns: int = 2

    # Content
    blog_write_turns: int = 3
    case_study_write_turns: int = 4

    # Costs
    campaign_cost: float = 500.0
    ad_cost: float = 300.0
    ab_test_cost: float = 200.0


SAMPLE_CUSTOMERS = [
    {
        "name": "Acme Corp",
        "company_size": "enterprise",
        "industry": "fintech",
        "budget": 50000.0,
        "pain_point": "Needs SSO & compliance",
    },
    {
        "name": "TechStart Inc",
        "company_size": "startup",
        "industry": "saas",
        "budget": 5000.0,
        "pain_point": "Wants fast onboarding",
    },
    {
        "name": "MedFlow Health",
        "company_size": "smb",
        "industry": "healthtech",
        "budget": 20000.0,
        "pain_point": "HIPAA compliance",
    },
    {
        "name": "RetailAI",
        "company_size": "enterprise",
        "industry": "retail",
        "budget": 80000.0,
        "pain_point": "Needs API integrations",
    },
    {
        "name": "GreenScale",
        "company_size": "startup",
        "industry": "cleantech",
        "budget": 8000.0,
        "pain_point": "Cost-effective solution",
    },
    {
        "name": "FinServ Partners",
        "company_size": "enterprise",
        "industry": "finance",
        "budget": 100000.0,
        "pain_point": "Audit trail & reporting",
    },
    {
        "name": "EduTech Labs",
        "company_size": "smb",
        "industry": "edtech",
        "budget": 12000.0,
        "pain_point": "Easy team collaboration",
    },
    {
        "name": "DataDriven Co",
        "company_size": "smb",
        "industry": "analytics",
        "budget": 15000.0,
        "pain_point": "Analytics dashboard",
    },
]
