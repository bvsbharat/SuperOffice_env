#!/usr/bin/env python3
"""
Basic OpenEnv Agent Example
Demonstrates a simple agent that learns to navigate CartPole environment.
"""

import gymnasium as gym
import numpy as np
from typing import Tuple


class SimpleAgent:
    """A basic agent that uses a learned policy to interact with OpenEnv."""
    
    def __init__(self, observation_space, action_space):
        self.observation_space = observation_space
        self.action_space = action_space
        # Initialize simple policy weights
        self.weights = np.random.randn(observation_space.shape[0], action_space.n) * 0.01
    
    def select_action(self, observation: np.ndarray) -> int:
        """Select action based on current policy."""
        logits = observation @ self.weights
        action = np.argmax(logits)
        return action
    
    def train_episode(self, env, learning_rate: float = 0.001) -> float:
        """Run one training episode."""
        observation, info = env.reset()
        total_reward = 0
        done = False
        
        while not done:
            action = self.select_action(observation)
            observation, reward, terminated, truncated, info = env.step(action)
            total_reward += reward
            done = terminated or truncated
            
            # Simple reward scaling
            scaled_reward = reward * learning_rate
            self.weights += scaled_reward * np.outer(observation, np.eye(self.action_space.n)[action])
        
        return total_reward


def main():
    """Run the example agent."""
    # Create environment
    env = gym.make("CartPole-v1")
    
    # Create agent
    agent = SimpleAgent(env.observation_space, env.action_space)
    
    # Train for 100 episodes
    rewards = []
    for episode in range(100):
        reward = agent.train_episode(env)
        rewards.append(reward)
        
        if (episode + 1) % 10 == 0:
            avg_reward = np.mean(rewards[-10:])
            print(f"Episode {episode + 1}: Avg Reward (last 10) = {avg_reward:.2f}")
    
    # Evaluate final policy
    print("\nEvaluating final policy...")
    eval_rewards = []
    for _ in range(10):
        observation, info = env.reset()
        total_reward = 0
        done = False
        
        while not done:
            action = agent.select_action(observation)
            observation, reward, terminated, truncated, info = env.step(action)
            total_reward += reward
            done = terminated or truncated
        
        eval_rewards.append(total_reward)
    
    print(f"Final evaluation average reward: {np.mean(eval_rewards):.2f}")
    env.close()


if __name__ == "__main__":
    main()
