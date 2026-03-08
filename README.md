# 🚀 OpenEnv Hackathon 2026

# Multi-Agent GTM Simulation

A multi-agent reinforcement learning environment modeled on a real startup's 
go-to-market motion. The world is a startup office. The agents are its people.

---

## Overview

Training intelligent systems to operate in real organizations requires 
environments where multiple agents interact, compete, and collaborate under 
realistic social and strategic pressure. Existing RL setups lack the 
organizational complexity, role-based coordination, and dynamic market 
conditions that define how real companies operate.

This environment simulates a startup office where each agent represents a 
department or role. Agents observe their local state, take actions, receive 
reward signals, and learn optimal behavior across episodes while coordinating 
with every other agent in the system.

*Multi-agent. Multi-mind. One office.*

---

## Agents

| Agent | Role | Key Reward Signals |
|---|---|---|
| CEO | Sets OKRs, allocates budget, decides pivots | Revenue growth, burn rate |
| Planning / HR | Hiring plans, sprint coordination, OKR tracking | Velocity, time-to-hire |
| Marketing | Campaigns, A/B tests, lead generation | MQL volume, CAC |
| Content Builder | SEO, case studies, sales collateral | Organic traffic, inbound leads |
| Dev | Feature shipping, bug fixes, demos | Feature velocity, UX score |
| Sales | Qualify, pitch, close | MRR, win rate, cycle time |
| Scene | Environment orchestrator, scenario injector | Global reward, cooperation score |
| Customer | Reward oracle | Purchase, churn, NPS |

Each agent has five core tasks and four coordination tasks. Agents pass work 
to each other through defined handoff channels. If one agent underperforms, 
downstream agents feel it.

---

## Scenarios

Five adversarial scenarios stress-test the system under different market 
conditions:

- **Baseline GTM Launch** — standard conditions, receptive market, low competition
- **Competitor Launch** — a well-funded rival enters, forcing differentiation and pipeline defense
- **Series A Pressure** — investor demand for 3x MRR in 90 days, pushing all agents into aggressive coordination
- **Churn Spike** — 20% of customers signal intent to leave, requiring urgent product fixes and retention effort
- **Viral Moment** — sudden inbound flood overwhelms Marketing and Sales while Dev must scale fast

Each scenario shifts the reward dynamics and tests whether agents can adapt 
their coordination patterns under pressure.

---

## 🔗 Resources

### Core Documentation
- **Website**: [https://meta-pytorch.github.io/OpenEnv](https://meta-pytorch.github.io/OpenEnv)
- **GitHub Repository**: [https://github.com/meta-pytorch/OpenEnv](https://github.com/meta-pytorch/OpenEnv)
- **PyPI Package**: [https://pypi.org/project/openenv](https://pypi.org/project/openenv)

### Integrations
- **Hugging Face**: [OpenEnv on Hugging Face]([https://huggingface.co/openenv](https://huggingface.co/HarshalH/office-os-loras))
- **Research & References **:
      - [Generative Agents: Interactive Simulacra of Human Behavior (Park et al., 2023)](arxiv.org/abs/2304.03442)
      - [Social Simulacra: Creating Populated Prototypes for Social Computing Systems (Park et al., 2022)](arxiv.org/abs/2208.04024)
      - [AgentSociety: Large-Scale Simulation of LLM-Based Human Behaviors (Piao et al., 2025)](arxiv.org/abs/2502.08691)
  

## Project Structure
```
.
├── agents/
│   ├── ceo.py
│   ├── planning.py
│   ├── marketing.py
│   ├── content.py
│   ├── dev.py
│   ├── sales.py
│   ├── scene.py
│   └── customer.py
├── envs/
│   └── gtm_env.py          # Core RL environment
├── scenarios/
│   ├── baseline.py
│   ├── competitor_launch.py
│   ├── series_a.py
│   ├── churn_spike.py
│   └── viral_moment.py
├── rewards/
│   └── reward_model.py     # Local + global reward aggregation
├── run.py                  # Entry point
├── config.yaml             # Environment and training config
└── README.md
```

---

## How to Run

**Install dependencies**
```bash
pip install -r requirements.txt
```

**Run a simulation episode**
```bash
python run.py --scenario baseline
```

**Run all scenarios**
```bash
python run.py --scenario all
```

**Configure agents and rewards**

Edit `config.yaml` to adjust agent parameters, reward weights, episode 
length, and scenario conditions before running.

**Output**

Each episode logs agent actions, local rewards, global reward, and 
cooperation score. Results are saved to `/outputs` for replay and analysis.

---

