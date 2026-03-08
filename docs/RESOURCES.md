# 📚 OpenEnv Hackathon Resources

Comprehensive guide to all OpenEnv resources and related tools.

## Official Documentation

### Core Resources
| Resource | URL | Description |
|----------|-----|-------------|
| **OpenEnv Home** | https://meta-pytorch.github.io/OpenEnv | Official documentation hub |
| **GitHub Repo** | https://github.com/meta-pytorch/OpenEnv | Source code & issues |
| **PyPI Package** | https://pypi.org/project/openenv | Install via pip |
| **Hugging Face** | https://huggingface.co/openenv | Models & dataset integration |

### API Documentation
- **Environment API**: https://meta-pytorch.github.io/OpenEnv/api/environment
- **Actions & Observations**: https://meta-pytorch.github.io/OpenEnv/api/spaces
- **Wrappers & Middleware**: https://meta-pytorch.github.io/OpenEnv/api/wrappers

## Gymnasium (Required)

OpenEnv builds on **Gymnasium**, the standard RL environment interface.

- **Documentation**: https://gymnasium.farama.org/
- **GitHub**: https://github.com/Farama-Foundation/Gymnasium
- **Key Concepts**: https://gymnasium.farama.org/content/basic_usage/

## Tutorials & Learning Resources

### Interactive Notebooks & Examples
- **OpenEnv + GPT OSS Reinforcement Learning (2048 Game)**: 
  [Google Colab Notebook](https://colab.research.google.com/github/unslothai/notebooks/blob/main/nb/OpenEnv_gpt_oss_(20B)_Reinforcement_Learning_2048_Game.ipynb)
  - Complete example training an open-source GPT model using OpenEnv in a 2048 game environment
  - Covers RL training loop, environment interaction, and agent learning

## Agent Development Frameworks

### LangGraph (Multi-Agent Orchestration)
- **Website**: https://langchain-ai.github.io/langgraph/
- **GitHub**: https://github.com/langchain-ai/langgraph
- **Use Case**: Build complex agent workflows with state management

### CrewAI (Team-Based Agents)
- **Website**: https://crewai.com/
- **GitHub**: https://github.com/joaomdmoura/crewai
- **Use Case**: Coordinate multiple specialized agents

### LangChain (LLM Integration)
- **Website**: https://langchain.com/
- **Docs**: https://python.langchain.com/
- **Use Case**: Connect agents to language models

## Common Libraries

| Library | Purpose | Installation |
|---------|---------|---------------|
| **NumPy** | Numerical computing | `pip install numpy` |
| **PyTorch** | Deep Learning | `pip install torch` |
| **Matplotlib** | Visualization | `pip install matplotlib` |
| **Stable-Baselines3** | RL Algorithms | `pip install stable-baselines3` |

## Learning Paths

### Beginner
1. Start with Gymnasium basics
2. Understand OpenEnv environment API
3. Run a simple agent in OpenEnv

### Intermediate
1. Implement custom environments using OpenEnv
2. Train agents with Stable-Baselines3
3. Integrate with LangChain for multi-agent systems

### Advanced
1. Fine-tune models with OpenEnv environments
2. Build complex multi-agent systems with LangGraph
3. Deploy agents to production

---

**Last Updated**: March 2026
**OpenEnv Version**: Latest (Check PyPI for current version)