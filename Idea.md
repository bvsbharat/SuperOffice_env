 Plain-Language Explanation of the Multi-Agent Reinforcement Learning Simulation
----------------------------------------------------------------------------------

OVERVIEW
--------
This is a reinforcement learning (RL) simulation environment built around a real startup's go-to-market (GTM) strategy. Instead of a game or a robot, the "world" here is a startup office — and the "agents" are the key people and departments inside it: the CEO, Planning/HR, Marketing, Sales, Dev, Content Builder, the Scene orchestrator, and the Customer. Each agent has its own goals, tasks, and a reward signal that tells it how well it is doing. Together, they must cooperate to grow the product, acquire customers, and generate revenue. The environment runs in episodes, and every episode is a simulated quarter of startup operations.


THE ENVIRONMENT AND EPISODES
-----------------------------
Think of the environment as a startup clock that ticks forward step by step. At each tick, one agent takes an action — for example, the CEO sets OKRs, or Sales runs a discovery call, or Dev ships a feature. The environment moves through all eight agents in a cycle, and after three full cycles, an episode ends. An episode represents roughly one business quarter. At the end of every episode, the system tallies up the total reward across all agents and logs it. Then it resets, picks up any new scenario conditions, and starts the next episode. This looping structure is the classic RL loop: observe state, take action, receive reward, update, repeat.


THE AGENTS AND WHAT THEY DO
----------------------------
The CEO sits at the top of the hierarchy and acts as the strategic brain. Every episode, the CEO sets quarterly OKRs (Objectives and Key Results), allocates budget across departments, reviews product-market fit signals, and decides whether the company should pivot its strategy or stay the course. The CEO's reward is tied to revenue growth and burn rate control — meaning the agent is penalized for overspending and rewarded for efficient growth. All other agents receive direction from the CEO and report outcomes back up to it.

The Planning and HR agent handles the operational backbone of the company. It drafts hiring plans, runs sprint planning sessions with the Dev team, tracks OKR completion percentages, and resolves blockers between teams. Its reward signals include how fast the team ships (velocity), how quickly it hires (time-to-hire), and how many OKRs are completed. Without this agent functioning well, the Dev and Sales agents cannot operate efficiently — it is the connective tissue of the organization.

The Marketing agent is responsible for generating awareness and demand. It launches product campaigns, runs A/B tests on landing pages, produces demo videos and blog content, sets up email drip sequences, and analyzes customer acquisition cost (CAC). Its most important output is Marketing Qualified Leads (MQLs) — potential customers who have shown interest. These MQLs are handed off to the Sales agent. Marketing is rewarded based on the volume and quality of leads it generates and the efficiency of its spend.

The Content Builder agent works closely with Marketing but focuses specifically on content assets. It writes SEO blog posts, produces customer case studies, creates sales decks and one-pagers, manages the social media calendar, and builds lead-generation landing pages. This agent feeds two pipelines simultaneously: it gives Marketing the raw material for campaigns, and it directly generates inbound leads that flow into the Sales pipeline. Its reward is measured by organic traffic growth, content-driven lead volume, and engagement metrics.

The Dev agent — which covers both feature development and UX — is the product engine. Each sprint, it ships new features, conducts usability testing, fixes bugs reported by customers, builds integrations requested by Sales, and maintains a live demo environment for prospects. Dev is deeply coordinated: it receives sprint assignments from Planning, demo requests from Sales and Marketing, and bug reports from the Customer. Its reward signals are feature velocity (how fast it ships), bug rate (lower is better), and UX satisfaction scores from user testing.

The Sales agent is the revenue closer. It takes MQLs from Marketing and leads from Content, qualifies them, runs discovery calls, sends proposals, negotiates pricing, and closes deals. Closed deals are handed off to an onboarding process and feed into the company's Monthly Recurring Revenue (MRR). Sales also feeds objections and lost-deal reasons back to Marketing so campaigns can be improved. The Sales agent is rewarded on MRR closed, win rate percentage, and how quickly it moves deals through the pipeline (cycle time).

The Scene agent — labeled "Scheme/Scene" in the original diagram — is the environment orchestrator. It does not represent a person but rather the simulation manager itself operating inside the world. It initializes each episode, injects scenario conditions (like a competitor launching or a churn spike), evaluates the global reward by aggregating all agent rewards, triggers scenario escalations if KPIs fall below thresholds, and logs the full episode trajectory for replay and analysis. The Scene agent is what makes this a proper RL environment rather than just a flow chart — it controls the dynamics that agents must respond to.

The Customer agent is the most important agent of all because it is the reward oracle. The Customer observes the quality of the product demo, the pricing proposal from Sales, the support experience, and the overall pitch. Based on all of these inputs, the Customer decides whether to purchase, churn, or request more information. A purchase event triggers an MRR gain. A churn event is a negative reward. The Customer also provides NPS scores and feature feedback that flows directly back to Dev. In RL terms, the Customer is the environment's terminal reward function — the final judge of whether the multi-agent system succeeded.


HOW THE AGENTS COORDINATE
--------------------------
Coordination happens through defined handoff channels between agents. The CEO briefs Planning on headcount needs and approves the Dev roadmap. Planning assigns sprints to Dev and reports OKR completion back to the CEO. Marketing passes MQLs to Sales and requests product demos from Dev. Content supplies assets to Marketing campaigns and sends inbound leads directly to Sales. Dev demos the product to both Sales and Marketing, and uses Customer feedback to reprioritize the backlog. Sales sends qualified leads into the Scene stage, where the Customer interaction is simulated. The Customer's purchase or churn decision flows back to Sales as a revenue event and back to Dev as a feedback signal. The Scene agent watches all of this, computes the global reward, and feeds the state back to the CEO to inform the next episode's strategy. Every connection has a purpose and a reward consequence — if one agent fails, others feel it downstream.


THE REWARD MODEL
----------------
Each agent has its own local reward function tuned to its role. Local rewards are computed at every step based on simulated KPIs relevant to that agent. At the Scene evaluation step — which happens every four agent steps — all local rewards are aggregated into a global episode reward. A cooperation score is also computed, which measures how well agents are coordinating rather than optimizing selfishly. The reward model is also modulated by the active scenario: in a baseline launch, rewards are amplified because conditions are favorable. In a churn spike or competitor launch scenario, the reward multiplier is reduced, meaning agents must work harder and coordinate better to achieve the same outcome. This creates the dynamic pressure that makes the simulation useful for testing strategy.


THE SCENARIOS
-------------
Five scenarios test the multi-agent system under different market conditions. The Baseline GTM Launch is the standard case — market is receptive, competition is low, and agents can follow their standard playbooks. The Competitor Launch scenario injects a well-funded rival into the market, forcing Marketing to differentiate, Sales to defend pipeline, and Dev to accelerate the roadmap. The Series A Pressure scenario simulates investor demands for 3x MRR growth in 90 days, pushing all agents into an aggressive coordination mode. The Churn Spike scenario has 20% of customers signaling intent to leave, requiring Dev to fix critical bugs urgently while Sales works retention calls. The Viral Moment scenario simulates a sudden flood of inbound interest — Marketing and Sales are overwhelmed, and Dev must scale the product infrastructure fast. Each scenario changes the reward dynamics and tests whether the agents can adapt their coordination patterns accordingly.


WHY THIS IS AN RL ENVIRONMENT
------------------------------
Traditional business simulations are rule-based — they follow fixed scripts. This environment is an RL environment because the agents are meant to learn optimal policies through trial and error across many episodes. Each agent observes its local state (pipeline size, OKR completion, bug count, lead volume), takes an action from its task list, receives a reward signal, and over many episodes, learns which sequences of actions maximize cumulative reward under each scenario. The cooperation score adds a multi-agent learning dimension — agents must not only maximize their own rewards but also learn to time their handoffs and outputs so that downstream agents can operate effectively. The Scene agent ensures the environment remains non-stationary (it changes between episodes), which is the key challenge that makes this a meaningful RL problem rather than a trivial optimization.


IN SUMMARY
----------
This RL environment turns the messy, human reality of a startup's go-to-market motion into a structured simulation that can be run, measured, and optimized. Eight agents, each with five core tasks and four coordination tasks, interact across a defined flow graph. Their collective performance is judged by a Customer agent whose purchase and churn decisions determine the ultimate reward. The Scene agent governs the dynamics, injects scenarios, and computes the global signal that tells the system how well the startup is doing as a whole. Run enough episodes, across enough scenarios, and the system reveals which coordination patterns, task prioritizations, and agent behaviors lead to the best outcomes — which is exactly what any real startup founder wants to know.

8 Agents (from your sketch):
AgentTasksKey Reward Signals👑 CEOOKRs, budget, pivot decisionsRevenue, burn rate🗂️ Planning/HRHiring, sprints, OKR trackingVelocity, time-to-hire📣 MarketingCampaigns, A/B tests, CACMQL volume, CTR✍️ Content BuilderSEO, case studies, collateralOrganic traffic, leads⚙️ Dev (Features+UX)Sprints, bug fixes, demosFeature velocity, UX score🤝 SalesQualify, pitch, closeMRR, win rate🎬 Scene/SchemeEnvironment orchestratorGlobal reward, coop score🧑‍💼 CustomerReward oraclePurchase, NPS, churn
Coordination flows match your diagram exactly — CEO → all departments → Scene → Customer → back to Dev/Sales.
5 Scenarios to stress-test the agents:

🟢 Baseline GTM, 💰 Series A Pressure, 🔴 Competitor Launch, 📉 Churn Spike, 🚀 Viral Moment

