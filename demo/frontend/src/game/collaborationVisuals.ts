/**
 * Collaboration Visualization System
 *
 * Handles drawing connecting lines, icons, and glows for agent collaborations
 */

import Phaser from 'phaser'
import type { AgentId } from '../types'

interface CollaborationLine {
  graphic: Phaser.GameObjects.Graphics
  icon: Phaser.GameObjects.Text
  from: AgentId
  to: AgentId
  type: 'message' | 'coordinate' | 'handoff'
  createdAt: number
  expiresAt: number
}

/**
 * CollaborationVisuals - Manages visual representation of agent collaborations
 */
export class CollaborationVisuals {
  private lines: Map<string, CollaborationLine> = new Map()
  private scene: Phaser.Scene

  constructor(scene: Phaser.Scene) {
    this.scene = scene
  }

  /**
   * Draw collaboration line between two agents
   */
  drawLine(
    from: AgentId,
    to: AgentId,
    fromPos: { x: number; y: number },
    toPos: { x: number; y: number },
    type: 'message' | 'coordinate' | 'handoff',
    duration: number = 3000
  ): void {
    const key = `${from}-${to}`
    this.removeLine(key)

    const color = this.getCollaborationColor(type)
    const now = Date.now()

    // Create dashed line
    const graphic = this.scene.add.graphics()
    graphic.setDepth(8)

    this.drawDashedLine(graphic, fromPos.x, fromPos.y, toPos.x, toPos.y, color, 2)

    // Create collaboration type icon
    const midX = (fromPos.x + toPos.x) / 2
    const midY = (fromPos.y + toPos.y) / 2
    const icon = this.scene.add.text(midX, midY - 15, this.getCollaborationIcon(type), {
      fontSize: '20px',
      color: '#ffffff',
    })
    icon.setOrigin(0.5)
    icon.setDepth(9)
    icon.setBackgroundColor(this.getCollaborationColorHex(color))
    icon.setPadding(4, 4, 4, 4)

    this.lines.set(key, {
      graphic,
      icon,
      from,
      to,
      type,
      createdAt: now,
      expiresAt: now + duration,
    })
  }

  /**
   * Update collaboration lines (fade out, cleanup)
   */
  update(): void {
    const now = Date.now()
    const expired: string[] = []

    for (const [key, line] of this.lines) {
      if (now > line.expiresAt) {
        expired.push(key)
      } else {
        // Fade out as approaching expiration
        const remaining = line.expiresAt - now
        const fadeStart = 500 // fade last 500ms
        if (remaining < fadeStart) {
          const opacity = remaining / fadeStart
          line.graphic.setAlpha(opacity)
          line.icon.setAlpha(opacity)
        }
      }
    }

    // Remove expired lines
    for (const key of expired) {
      this.removeLine(key)
    }
  }

  /**
   * Remove collaboration line
   */
  private removeLine(key: string): void {
    const line = this.lines.get(key)
    if (line) {
      line.graphic.destroy()
      line.icon.destroy()
      this.lines.delete(key)
    }
  }

  /**
   * Draw dashed line between two points
   */
  private drawDashedLine(
    graphics: Phaser.GameObjects.Graphics,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: number,
    width: number,
    dashLength: number = 8,
    gapLength: number = 4
  ): void {
    graphics.lineStyle(width, color, 0.7)

    const dx = x2 - x1
    const dy = y2 - y1
    const distance = Math.sqrt(dx * dx + dy * dy)
    const normalizedDx = dx / distance
    const normalizedDy = dy / distance

    let currentDist = 0
    let isDashing = true

    while (currentDist < distance) {
      const segmentLength = isDashing ? dashLength : gapLength
      const nextDist = Math.min(currentDist + segmentLength, distance)

      const px1 = x1 + normalizedDx * currentDist
      const py1 = y1 + normalizedDy * currentDist
      const px2 = x1 + normalizedDx * nextDist
      const py2 = y1 + normalizedDy * nextDist

      if (isDashing) {
        graphics.lineBetween(px1, py1, px2, py2)
      }

      currentDist = nextDist
      isDashing = !isDashing
    }
  }

  /**
   * Get color for collaboration type
   */
  private getCollaborationColor(type: 'message' | 'coordinate' | 'handoff'): number {
    switch (type) {
      case 'message':
        return 0x22c55e // Green
      case 'coordinate':
        return 0x3b82f6 // Blue
      case 'handoff':
        return 0xf97316 // Orange
      default:
        return 0x888888
    }
  }

  /**
   * Get color hex string for collaboration type
   */
  private getCollaborationColorHex(color: number): string {
    return '#' + color.toString(16).padStart(6, '0')
  }

  /**
   * Get emoji icon for collaboration type
   */
  private getCollaborationIcon(type: 'message' | 'coordinate' | 'handoff'): string {
    switch (type) {
      case 'message':
        return '💬' // Chat bubble
      case 'coordinate':
        return '🤝' // Handshake
      case 'handoff':
        return '📦' // Package
      default:
        return '✨'
    }
  }

  /**
   * Get active collaboration count
   */
  getActiveCount(): number {
    return this.lines.size
  }

  /**
   * Clear all lines
   */
  clear(): void {
    for (const [_, line] of this.lines) {
      line.graphic.destroy()
      line.icon.destroy()
    }
    this.lines.clear()
  }
}
