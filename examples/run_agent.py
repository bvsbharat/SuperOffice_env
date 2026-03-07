#!/usr/bin/env python3
"""
Example script to run a basic OpenEnv agent.
"""

import gymnasium as gym


def run_simple_agent():
    """Run a simple random agent for demonstration."""
    env = gym.make("CartPole-v1", render_mode="rgb_array")
    
    print("Running CartPole agent...")
    for episode in range(5):
        observation, info = env.reset()
        total_reward = 0
        
        for step in range(500):
            # Random action for demo
            action = env.action_space.sample()
            observation, reward, terminated, truncated, info = env.step(action)
            total_reward += reward
            
            if terminated or truncated:
                break
        
        print(f"Episode {episode + 1}: Total Reward = {total_reward}")
    
    env.close()


if __name__ == "__main__":
    run_simple_agent()
