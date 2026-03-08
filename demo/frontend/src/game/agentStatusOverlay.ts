/**
 * Agent Status Overlay System
 *
 * Displays progress bars, work icons, and status indicators above agents
 */

import Phaser from 'phaser'
import type { AgentId } from '../types'
import { AgentState } from './agentBehavior'

interface StatusOverlay {
  progressBar: Phaser.GameObjects.Graphics
  workIcon: Phaser.GameObjects.Text
  statusBorder: Phaser.GameObjects.Graphics
}

/**
 * AgentStatusOverlay - Manages visual status indicators for agents
 */
export class AgentStatusOverlay {
  private overlays: Map<AgentId, StatusOverlay> = new Map()
  private scene: Phaser.Scene

  constructor(scene: Phaser.Scene) {
    this.scene = scene
  }

  /**
   * Create or update status overlay for an agent
   */
  updateOverlay(
    agentId: AgentId,
    x: number,
    y: number,
    state: AgentState,
    progress: number = 0.5,
    isActive: boolean = false
  ): void {
    // Remove old overlay
    this.removeOverlay(agentId)

    const overlayGroup = this.scene.add.group()

    // 1. Draw progress bar below agent
    const progressBar = this.scene.add.graphics()
    this.drawProgressBar(progressBar, x, y + 35, progress, isActive)
    progressBar.setDepth(12)

    // 2. Draw work icon above agent
    const workIcon = this.scene.add.text(x + 15, y - 25, this.getWorkIcon(state), {
      fontSize: '16px',
    })
    workIcon.setOrigin(0.5)
    workIcon.setDepth(13)
    workIcon.setAlpha(0.7)

    // 3. Draw status border (colored outline)
    const statusBorder = this.scene.add.graphics()
    this.drawStatusBorder(statusBorder, x, y, this.getStatusColor(state, isActive))
    statusBorder.setDepth(5)

    const overlay: StatusOverlay = {
      progressBar,
      workIcon,
      statusBorder,
    }

    this.overlays.set(agentId, overlay)
  }

  /**
   * Remove overlay for agent
   */
  removeOverlay(agentId: AgentId): void {
    const overlay = this.overlays.get(agentId)
    if (overlay) {
      overlay.progressBar.destroy()
      overlay.workIcon.destroy()
      overlay.statusBorder.destroy()
      this.overlays.delete(agentId)
    }
  }

  /**
   * Draw progress bar
   */
  private drawProgressBar(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    progress: number,
    isActive: boolean
  ): void {
    const barWidth = 30
    const barHeight = 3
    const startX = x - barWidth / 2

    // Background (dark)
    graphics.fillStyle(0x000000, 0.5)
    graphics.fillRect(startX, y, barWidth, barHeight)

    // Progress (colored)
    const color = isActive ? 0xffff88 : 0x22c55e
    graphics.fillStyle(color, 0.8)
    graphics.fillRect(startX, y, barWidth * progress, barHeight)

    // Border
    graphics.lineStyle(1, 0xffffff, 0.5)
    graphics.strokeRect(startX, y, barWidth, barHeight)
  }

  /**
   * Draw status border around agent
   */
  private drawStatusBorder(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    color: number
  ): void {
    const size = 24
    graphics.lineStyle(2, color, 0.6)
    graphics.strokeRect(x - size / 2, y - size / 2, size, size)

    // Corner accents
    graphics.fillStyle(color, 0.4)
    graphics.fillRect(x - size / 2 - 1, y - size / 2 - 1, 3, 3)
    graphics.fillRect(x + size / 2 - 2, y - size / 2 - 1, 3, 3)
    graphics.fillRect(x - size / 2 - 1, y + size / 2 - 2, 3, 3)
    graphics.fillRect(x + size / 2 - 2, y + size / 2 - 2, 3, 3)
  }

  /**
   * Get work icon for agent state
   */
  private getWorkIcon(state: AgentState): string {
    switch (state) {
      case AgentState.IDLE:
        return '😴'
      case AgentState.WORKING:
        return '⚙️'
      case AgentState.WALKING:
        return '🚶'
      case AgentState.COLLABORATING:
        return '🤝'
      case AgentState.PRESENTING:
        return '🎤'
      default:
        return '❓'
    }
  }

  /**
   * Get status color based on state and activity
   */
  private getStatusColor(state: AgentState, isActive: boolean): number {
    if (isActive) {
      return 0xffff88 // Yellow for active
    }

    switch (state) {
      case AgentState.IDLE:
        return 0x888888 // Gray
      case AgentState.WORKING:
        return 0x22c55e // Green
      case AgentState.WALKING:
        return 0x3b82f6 // Blue
      case AgentState.COLLABORATING:
        return 0xf97316 // Orange
      case AgentState.PRESENTING:
        return 0x9b5de5 // Purple
      default:
        return 0x888888
    }
  }

  /**
   * Update all overlays (called each frame)
   */
  updateAll(agents: Map<AgentId, { x: number; y: number; state: AgentState; progress?: number; isActive?: boolean }>): void {
    for (const [agentId, data] of agents) {
      this.updateOverlay(agentId, data.x, data.y, data.state, data.progress || 0.5, data.isActive || false)
    }
  }

  /**
   * Clear all overlays
   */
  clear(): void {
    for (const [_, overlay] of this.overlays) {
      overlay.progressBar.destroy()
      overlay.workIcon.destroy()
      overlay.statusBorder.destroy()
    }
    this.overlays.clear()
  }
}
