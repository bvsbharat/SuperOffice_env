/**
 * Agent Behavior State Machine
 *
 * Defines agent states (idle, working, walking, collaborating, presenting) and
 * manages state transitions based on backend data and phase changes.
 */

import type { AgentId, Phase } from '../types'

export enum AgentState {
  IDLE = 'idle',                       // Standing in room, subtle bob
  WORKING = 'working',                 // At desk, performing tasks
  WALKING = 'walking',                 // Moving between locations
  COLLABORATING = 'collaborating',     // Meeting with another agent
  PRESENTING = 'presenting',           // Speaking during standup
}

export interface AgentBehavior {
  state: AgentState
  targetX: number
  targetY: number
  animationFrame: number
  collaboratingWith: AgentId | null
  stateTimer: number
  idlePhase: number                    // For subtle bob animation
  direction: 'up' | 'down' | 'left' | 'right'
}

/**
 * BehaviorManager - Manages agent states and transitions
 *
 * Responsible for:
 * - Determining correct state based on backend data
 * - Managing state-specific animations
 * - Handling transitions between states
 * - Updating visual properties based on state
 */
export class BehaviorManager {
  private behaviors: Map<AgentId, AgentBehavior> = new Map()

  /**
   * Initialize behavior for an agent
   */
  initialize(agentId: AgentId, startX: number, startY: number): AgentBehavior {
    const behavior: AgentBehavior = {
      state: AgentState.IDLE,
      targetX: startX,
      targetY: startY,
      animationFrame: 0,
      collaboratingWith: null,
      stateTimer: 0,
      idlePhase: Math.random() * Math.PI * 2,  // Random offset for variation
      direction: 'down',
    }
    this.behaviors.set(agentId, behavior)
    return behavior
  }

  /**
   * Get behavior for an agent
   */
  get(agentId: AgentId): AgentBehavior | undefined {
    return this.behaviors.get(agentId)
  }

  /**
   * Update behavior based on backend state
   *
   * Determines the correct state based on:
   * - Current phase (morning_standup, execution, review, planning, done)
   * - Whether agent is active
   * - Whether agent is collaborating
   * - Agent movement (moving to target vs at target)
   */
  updateBehavior(
    agentId: AgentId,
    phase: Phase,
    isActive: boolean,
    isMoving: boolean,
    collaboratingWith: AgentId | null,
    deltaTime: number
  ): AgentBehavior | undefined {
    const behavior = this.behaviors.get(agentId)
    if (!behavior) return undefined

    // Update timers
    behavior.stateTimer += deltaTime

    // Determine next state based on conditions (priority order)
    let nextState: AgentState

    if (collaboratingWith) {
      // Currently collaborating with another agent
      nextState = AgentState.COLLABORATING
      behavior.collaboratingWith = collaboratingWith
    } else if (phase === 'morning_standup' && isActive) {
      // During standup, active agent presents
      nextState = AgentState.PRESENTING
      behavior.collaboratingWith = null
    } else if (isActive && phase === 'execution') {
      // During execution, active agent works
      nextState = AgentState.WORKING
      behavior.collaboratingWith = null
    } else if (isMoving) {
      // Agent moving between locations
      nextState = AgentState.WALKING
      behavior.collaboratingWith = null
    } else {
      // Default: idle in room
      nextState = AgentState.IDLE
      behavior.collaboratingWith = null
    }

    // Handle state transitions
    if (behavior.state !== nextState) {
      this.transitionTo(agentId, nextState)
    }

    behavior.state = nextState

    // Update animation frame for idle bobbing
    if (nextState === AgentState.IDLE) {
      behavior.idlePhase += deltaTime * 0.003  // Slow bobbing
    }

    return behavior
  }

  /**
   * Transition to a new state
   */
  transitionTo(agentId: AgentId, newState: AgentState): void {
    const behavior = this.behaviors.get(agentId)
    if (!behavior) return

    behavior.state = newState
    behavior.stateTimer = 0
    behavior.animationFrame = 0

    // State-specific initialization
    switch (newState) {
      case AgentState.WORKING:
        // Show tool icon above head
        break
      case AgentState.PRESENTING:
        // Face center, larger bubble preparation
        break
      case AgentState.WALKING:
        // Movement already set via targetX/targetY
        break
      case AgentState.COLLABORATING:
        // Both agents face each other
        break
      case AgentState.IDLE:
        // Reset to standing frame
        break
    }
  }

  /**
   * Get animation frame based on state
   *
   * Returns the sprite frame key for the current state
   */
  getAnimationForState(agentId: AgentId, state: AgentState): string {
    const behavior = this.behaviors.get(agentId)
    if (!behavior) return 'down'

    switch (state) {
      case AgentState.WALKING:
        return behavior.direction

      case AgentState.IDLE:
        // Standing frame
        return 'down'

      case AgentState.WORKING:
        // At desk frame (still uses direction for facing)
        return behavior.direction

      case AgentState.COLLABORATING:
        // Face the collaborating partner
        return behavior.direction

      case AgentState.PRESENTING:
        // Face center during standup
        return 'down'

      default:
        return 'down'
    }
  }

  /**
   * Get idle bob offset (Y position adjustment for subtle animation)
   *
   * Returns a small vertical offset for the idle bobbing effect
   */
  getIdleBobOffset(agentId: AgentId): number {
    const behavior = this.behaviors.get(agentId)
    if (!behavior || behavior.state !== AgentState.IDLE) return 0

    // Subtle sine wave bobbing: ±2 pixels
    return Math.sin(behavior.idlePhase) * 2
  }

  /**
   * Get opacity/alpha for state
   *
   * Some states may be semi-transparent for visual effect
   */
  getStateOpacity(state: AgentState): number {
    switch (state) {
      case AgentState.IDLE:
      case AgentState.WORKING:
      case AgentState.PRESENTING:
      case AgentState.WALKING:
        return 1.0

      case AgentState.COLLABORATING:
        return 0.9  // Slightly highlighted

      default:
        return 1.0
    }
  }

  /**
   * Get scale multiplier for state
   *
   * Emphasize certain states with size changes
   */
  getStateScale(state: AgentState, isActive: boolean): number {
    const baseScale = isActive ? 1.8 : 1.5

    switch (state) {
      case AgentState.PRESENTING:
        return baseScale * 1.1  // Slightly larger during presentation

      case AgentState.WORKING:
        return baseScale

      case AgentState.COLLABORATING:
        return baseScale * 1.05  // Slightly emphasized

      case AgentState.WALKING:
      case AgentState.IDLE:
        return baseScale

      default:
        return baseScale
    }
  }

  /**
   * Set movement target for an agent
   */
  setTarget(agentId: AgentId, x: number, y: number): void {
    const behavior = this.behaviors.get(agentId)
    if (behavior) {
      behavior.targetX = x
      behavior.targetY = y
    }
  }

  /**
   * Set direction facing for an agent
   */
  setDirection(agentId: AgentId, direction: 'up' | 'down' | 'left' | 'right'): void {
    const behavior = this.behaviors.get(agentId)
    if (behavior) {
      behavior.direction = direction
    }
  }

  /**
   * Update direction based on target delta
   */
  updateDirectionFromDelta(agentId: AgentId, dx: number, dy: number): void {
    const behavior = this.behaviors.get(agentId)
    if (!behavior) return

    if (Math.abs(dx) > Math.abs(dy)) {
      behavior.direction = dx > 0 ? 'right' : 'left'
    } else {
      behavior.direction = dy > 0 ? 'down' : 'up'
    }
  }

  /**
   * Clear all behaviors (for reset)
   */
  clear(): void {
    this.behaviors.clear()
  }
}
