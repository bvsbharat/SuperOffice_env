---
title: Office Os Environment Server
emoji: 🥈
colorFrom: blue
colorTo: gray
sdk: docker
pinned: false
app_port: 8000
base_path: /web
tags:
  - openenv
---

# MarketVille — Multi-Agent Startup Simulation

A Smallville-style multi-agent simulation where 4 AI agents (Dev, Marketing, Sales, Content Creator) autonomously collaborate to grow a SaaS startup over 90 simulated days. Built on Meta's [OpenEnv](https://github.com/meta-pytorch/openenv) framework.

## Run the Simulation

```bash
export ANTHROPIC_API_KEY=your-key
python run_agents.py --local --days 10 --model claude-haiku-4-5-20251001
```

Options:
- `--local` — run directly without a server
- `--server http://localhost:8000` — run against the OpenEnv server
- `--days N` — number of simulated days (default: 90)
- `--model MODEL` — Claude model to use (default: claude-sonnet-4-20250514)
- `--reflect-every N` — agent reflection frequency in turns (default: 10)

## How It Works

4 LLM-powered agents take turns operating a startup:

| Agent | Role | Key Actions |
|-------|------|-------------|
| Alex (Dev) | Build product | BUILD_FEATURE, FIX_BUG, SHIP_RELEASE |
| Jordan (Marketing) | Drive growth | LAUNCH_CAMPAIGN, RUN_AD, OPTIMIZE_FUNNEL |
| Sam (Sales) | Close deals | QUALIFY_LEAD, RUN_DEMO, CLOSE_DEAL |
| Casey (Content) | Create content | WRITE_BLOG, WRITE_CASE_STUDY, WRITE_SOCIAL_POST |

Customers flow through a pipeline: `visitor → lead → qualified → demo → proposal → negotiation → closed_won`

Deals can be closed with contract tiers: **monthly** (1x reward), **6-month** (2x), **annual** (3x).

Each agent has a Smallville-style memory stream (observations, reflections, plans) and receives asymmetric observations scoped to their role.

### Real-World Integration

Enable Google Sheets sync to watch the simulation live in a spreadsheet — see [Sheets Setup](integrations/SHEETS_SETUP.md).

## Quick Start (Client API)

Connect to a running MarketVille server:

```python
from office_os import OfficeOsAction, OfficeOsEnv

with OfficeOsEnv(base_url="http://localhost:8000") as env:
    result = env.reset()
    print(f"Day {result.observation.day}, Budget: ${result.observation.budget_remaining}")

    result = env.step(OfficeOsAction(
        agent_id="dev",
        action_type="BUILD_FEATURE",
        target="SSO Integration",
    ))
    print(f"Result: {result.observation.last_action_result['detail']}")
```

## Building the Docker Image

Before using the environment, you need to build the Docker image:

```bash
# From project root
docker build -t office_os-env:latest -f server/Dockerfile .
```

## Deploying to Hugging Face Spaces

You can easily deploy your OpenEnv environment to Hugging Face Spaces using the `openenv push` command:

```bash
# From the environment directory (where openenv.yaml is located)
openenv push

# Or specify options
openenv push --namespace my-org --private
```

The `openenv push` command will:
1. Validate that the directory is an OpenEnv environment (checks for `openenv.yaml`)
2. Prepare a custom build for Hugging Face Docker space (enables web interface)
3. Upload to Hugging Face (ensuring you're logged in)

### Prerequisites

- Authenticate with Hugging Face: The command will prompt for login if not already authenticated

### Options

- `--directory`, `-d`: Directory containing the OpenEnv environment (defaults to current directory)
- `--repo-id`, `-r`: Repository ID in format 'username/repo-name' (defaults to 'username/env-name' from openenv.yaml)
- `--base-image`, `-b`: Base Docker image to use (overrides Dockerfile FROM)
- `--private`: Deploy the space as private (default: public)

### Examples

```bash
# Push to your personal namespace (defaults to username/env-name from openenv.yaml)
openenv push

# Push to a specific repository
openenv push --repo-id my-org/my-env

# Push with a custom base image
openenv push --base-image ghcr.io/meta-pytorch/openenv-base:latest

# Push as a private space
openenv push --private

# Combine options
openenv push --repo-id my-org/my-env --base-image custom-base:latest --private
```

After deployment, your space will be available at:
`https://huggingface.co/spaces/<repo-id>`

The deployed space includes:
- **Web Interface** at `/web` - Interactive UI for exploring the environment
- **API Documentation** at `/docs` - Full OpenAPI/Swagger interface
- **Health Check** at `/health` - Container health monitoring
- **WebSocket** at `/ws` - Persistent session endpoint for low-latency interactions

## Environment Details

### Action
**OfficeOsAction**: Contains a single field
- `message` (str) - The message to echo back

### Observation
**OfficeOsObservation**: Contains the echo response and metadata
- `echoed_message` (str) - The message echoed back
- `message_length` (int) - Length of the message
- `reward` (float) - Reward based on message length (length × 0.1)
- `done` (bool) - Always False for echo environment
- `metadata` (dict) - Additional info like step count

### Reward
The reward is calculated as: `message_length × 0.1`
- "Hi" → reward: 0.2
- "Hello, World!" → reward: 1.3
- Empty message → reward: 0.0

## Advanced Usage

### Connecting to an Existing Server

If you already have a Office Os environment server running, you can connect directly:

```python
from office_os import OfficeOsEnv

# Connect to existing server
office_osenv = OfficeOsEnv(base_url="<ENV_HTTP_URL_HERE>")

# Use as normal
result = office_osenv.reset()
result = office_osenv.step(OfficeOsAction(message="Hello!"))
```

Note: When connecting to an existing server, `office_osenv.close()` will NOT stop the server.

### Using the Context Manager

The client supports context manager usage for automatic connection management:

```python
from office_os import OfficeOsAction, OfficeOsEnv

# Connect with context manager (auto-connects and closes)
with OfficeOsEnv(base_url="http://localhost:8000") as env:
    result = env.reset()
    print(f"Reset: {result.observation.echoed_message}")
    # Multiple steps with low latency
    for msg in ["Hello", "World", "!"]:
        result = env.step(OfficeOsAction(message=msg))
        print(f"Echoed: {result.observation.echoed_message}")
```

The client uses WebSocket connections for:
- **Lower latency**: No HTTP connection overhead per request
- **Persistent session**: Server maintains your environment state
- **Efficient for episodes**: Better for many sequential steps

### Concurrent WebSocket Sessions

The server supports multiple concurrent WebSocket connections. To enable this,
modify `server/app.py` to use factory mode:

```python
# In server/app.py - use factory mode for concurrent sessions
app = create_app(
    OfficeOsEnvironment,  # Pass class, not instance
    OfficeOsAction,
    OfficeOsObservation,
    max_concurrent_envs=4,  # Allow 4 concurrent sessions
)
```

Then multiple clients can connect simultaneously:

```python
from office_os import OfficeOsAction, OfficeOsEnv
from concurrent.futures import ThreadPoolExecutor

def run_episode(client_id: int):
    with OfficeOsEnv(base_url="http://localhost:8000") as env:
        result = env.reset()
        for i in range(10):
            result = env.step(OfficeOsAction(message=f"Client {client_id}, step {i}"))
        return client_id, result.observation.message_length

# Run 4 episodes concurrently
with ThreadPoolExecutor(max_workers=4) as executor:
    results = list(executor.map(run_episode, range(4)))
```

## Development & Testing

### Direct Environment Testing

Test the environment logic directly without starting the HTTP server:

```bash
# From the server directory
python3 server/office_os_environment.py
```

This verifies that:
- Environment resets correctly
- Step executes actions properly
- State tracking works
- Rewards are calculated correctly

### Running Locally

Run the server locally for development:

```bash
uvicorn server.app:app --reload
```

## Project Structure

```
office_os/
├── .dockerignore         # Docker build exclusions
├── __init__.py            # Module exports
├── README.md              # This file
├── openenv.yaml           # OpenEnv manifest
├── pyproject.toml         # Project metadata and dependencies
├── uv.lock                # Locked dependencies (generated)
├── client.py              # OfficeOsEnv client
├── models.py              # Action and Observation models
└── server/
    ├── __init__.py        # Server module exports
    ├── office_os_environment.py  # Core environment logic
    ├── app.py             # FastAPI application (HTTP + WebSocket endpoints)
    └── Dockerfile         # Container image definition
```
