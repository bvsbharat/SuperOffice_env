# 🎯 Getting Started with OpenEnv

Complete guide to set up your development environment and build your first agent.

## Prerequisites

- Python 3.8+
- pip or conda
- Git
- Basic knowledge of Reinforcement Learning

## Installation

### Option 1: PyPI (Recommended)

```bash
pip install openenv gymnasium numpy matplotlib
```

### Option 2: Development Installation

```bash
git clone https://github.com/meta-pytorch/OpenEnv.git
cd OpenEnv
pip install -e ".[dev]"
```

### Verify Installation

```python
import openenv
import gymnasium as gym

print(f"OpenEnv version: {openenv.__version__}")
print("✅ Installation successful!")
```

## Your First Agent

### Step 1: Create a Simple Environment

```python
import gymnasium as gym
from openenv import Environment

# Create a basic environment
env = gym.make("CartPole-v1")
observation, info = env.reset(seed=42)

print(f"Observation shape: {observation.shape}")
print(f"Action space: {env.action_space}")
```

### Step 2: Build a Random Agent

```python
import gymnasium as gym

env = gym.make("CartPole-v1")

for episode in range(3):
    observation, info = env.reset()
    done = False
    total_reward = 0
    
    while not done:
        # Random action
        action = env.action_space.sample()
        observation, reward, terminated, truncated, info = env.step(action)
        total_reward += reward
        done = terminated or truncated
    
    print(f"Episode {episode + 1}: Total Reward = {total_reward}")
```

### Step 3: Policy-Based Agent

```python
import gymnasium as gym
import numpy as np

env = gym.make("CartPole-v1")

# Simple policy: tilt cart based on position
def simple_policy(observation):
    position, velocity, angle, angular_velocity = observation
    return 1 if angle > 0 else 0

total_rewards = []
for episode in range(10):
    observation, info = env.reset()
    done = False
    total_reward = 0
    
    while not done:
        action = simple_policy(observation)
        observation, reward, terminated, truncated, info = env.step(action)
        total_reward += reward
        done = terminated or truncated
    
    total_rewards.append(total_reward)
    print(f"Episode {episode}: {total_reward}")

print(f"Average: {np.mean(total_rewards):.2f}")
```

## Building Custom Environments

### Template: Custom Environment

```python
import gymnasium as gym
from gymnasium import spaces
import numpy as np

class CustomEnv(gym.Env):
    metadata = {"render_modes": ["human"]}
    
    def __init__(self):
        self.observation_space = spaces.Box(low=-1, high=1, shape=(4,), dtype=np.float32)
        self.action_space = spaces.Discrete(2)
    
    def reset(self, seed=None):
        super().reset(seed=seed)
        self.state = self.observation_space.sample()
        return self.state, {}
    
    def step(self, action):
        # Define environment dynamics
        if action == 0:
            self.state = self.state * 0.99
        else:
            self.state = self.state + np.random.normal(0, 0.1, 4)
        
        # Reward: how close to origin
        reward = -np.sum(self.state ** 2)
        
        # Episode terminates if too far
        terminated = np.sum(self.state ** 2) > 10
        
        return self.state, reward, terminated, False, {}

# Test it
env = CustomEnv()
obs, _ = env.reset()
action = env.action_space.sample()
obs, reward, done, _, _ = env.step(action)
```

## Next Steps

1. Read the [RESOURCES.md](./RESOURCES.md) for complete API reference
2. Check [RULES_JUDGING.md](./RULES_JUDGING.md) for submission guidelines
3. Join the community Discord
4. Start building your hackathon project!

Good luck! 🚀