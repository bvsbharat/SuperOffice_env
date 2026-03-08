/**
 * Speech Bubble Manager
 *
 * Manages display and animation of speech bubbles with:
 * - Smooth fade-in/fade-out animations
 * - Color-coded bubble types (reasoning, chat, action, event)
 * - Smart positioning to avoid overlaps
 * - Expiration tracking
 */

import Phaser from 'phaser'
import type { AgentId } from '../types'

export type BubbleType = 'reasoning' | 'chat' | 'action' | 'event'

interface BubbleData {
  agentId: AgentId
  text: string
  type: BubbleType
  createdAt: number
  duration: number
  fadeIn: number      // 0-1
  fadeOut: number     // 0-1
}

interface BubbleGraphics {
  bubble: Phaser.GameObjects.Graphics
  label: Phaser.GameObjects.Text
  expiresAt: number
}

const BUBBLE_CONSTANTS = {
  OFFSET_Y: -52,
  MAX_WIDTH: 220,
  PADDING: 12,
  FONT_SIZE: 15,
  MAX_CHARS: 120,
  TAIL_SIZE: 6,
  TEXT_RESOLUTION: 4,
  FADE_IN_TIME: 300,      // ms
  FADE_OUT_TIME: 500,     // ms
  DEFAULT_DURATION: 8000, // ms
  COLORS: {
    reasoning: 0x3b82f6,  // blue
    chat: 0x22c55e,       // green
    action: 0xf97316,     // orange
    event: 0xa855f7,      // purple
  },
}

const TEXT_FONT = '"SF Pro Display", "Segoe UI", "Helvetica Neue", Arial, sans-serif'

/**
 * SpeechBubbleManager - Manages all speech bubbles for agents
 */
export class SpeechBubbleManager {
  private bubbles: Map<AgentId, BubbleData> = new Map()
  private graphics: Map<AgentId, BubbleGraphics> = new Map()
  private scene: Phaser.Scene

  constructor(scene: Phaser.Scene) {
    this.scene = scene
  }

  /**
   * Show or update a speech bubble for an agent
   */
  show(agentId: AgentId, text: string, type: BubbleType = 'reasoning', duration: number = BUBBLE_CONSTANTS.DEFAULT_DURATION): void {
    const now = Date.now()

    // Create or update bubble data
    const bubble: BubbleData = {
      agentId,
      text,
      type,
      createdAt: now,
      duration,
      fadeIn: 0,
      fadeOut: 1,
    }

    this.bubbles.set(agentId, bubble)
  }

  /**
   * Hide a bubble for an agent
   */
  hide(agentId: AgentId): void {
    this.bubbles.delete(agentId)
    this.destroyBubbleGraphics(agentId)
  }

  /**
   * Update all bubbles (fade animations, expiration)
   */
  update(deltaTime: number): void {
    const now = Date.now()

    // Update fade states
    for (const [agentId, bubble] of this.bubbles) {
      const age = now - bubble.createdAt

      // Fade in (0-300ms)
      if (age < BUBBLE_CONSTANTS.FADE_IN_TIME) {
        bubble.fadeIn = age / BUBBLE_CONSTANTS.FADE_IN_TIME
      } else {
        bubble.fadeIn = 1
      }

      // Fade out (last 500ms)
      const remaining = bubble.duration - age
      if (remaining < BUBBLE_CONSTANTS.FADE_OUT_TIME) {
        bubble.fadeOut = remaining / BUBBLE_CONSTANTS.FADE_OUT_TIME
      } else {
        bubble.fadeOut = 1
      }

      // Mark for removal if expired
      if (age >= bubble.duration) {
        this.bubbles.delete(agentId)
        this.destroyBubbleGraphics(agentId)
      }
    }
  }

  /**
   * Render bubbles at world positions
   */
  render(agentSprites: Map<AgentId, { sprite: Phaser.GameObjects.Sprite }>): void {
    const now = Date.now()

    for (const [agentId, bubble] of this.bubbles) {
      const agentSprite = agentSprites.get(agentId)
      if (!agentSprite) continue

      const opacity = bubble.fadeIn * bubble.fadeOut
      const scale = 0.8 + (bubble.fadeIn * 0.2)  // Pop-in effect

      this.drawBubble(agentId, agentSprite.sprite.x, agentSprite.sprite.y, bubble, opacity, scale)
    }

    // Clean up expired bubbles
    for (const [agentId, bubble] of this.bubbles) {
      const age = now - bubble.createdAt
      if (age >= bubble.duration) {
        this.bubbles.delete(agentId)
        this.destroyBubbleGraphics(agentId)
      }
    }
  }

  /**
   * Draw a single bubble at the specified world position
   */
  private drawBubble(
    agentId: AgentId,
    worldX: number,
    worldY: number,
    bubble: BubbleData,
    opacity: number,
    scale: number
  ): void {
    // Clean up old graphics if they exist
    this.destroyBubbleGraphics(agentId)

    const truncated = bubble.text.length > BUBBLE_CONSTANTS.MAX_CHARS
      ? bubble.text.slice(0, BUBBLE_CONSTANTS.MAX_CHARS - 3) + '...'
      : bubble.text

    // Create text object first to measure
    const label = this.scene.add.text(
      0,
      0,
      truncated,
      {
        fontSize: `${BUBBLE_CONSTANTS.FONT_SIZE}px`,
        fontFamily: TEXT_FONT,
        color: '#000000',
        wordWrap: { width: BUBBLE_CONSTANTS.MAX_WIDTH - 2 * BUBBLE_CONSTANTS.PADDING },
        align: 'center',
        resolution: BUBBLE_CONSTANTS.TEXT_RESOLUTION,
      }
    )
    label.setDepth(21)
    label.texture.setFilter(Phaser.Textures.FilterMode.LINEAR)
    label.setAlpha(opacity)

    const textW = label.width
    const textH = label.height
    const boxW = textW + 2 * BUBBLE_CONSTANTS.PADDING
    const boxH = textH + 2 * BUBBLE_CONSTANTS.PADDING

    // Create graphics for bubble shape
    const bubbleGraphics = this.scene.add.graphics()
    bubbleGraphics.setDepth(20)
    bubbleGraphics.setAlpha(opacity)
    bubbleGraphics.setScale(scale)

    const bx = -boxW / 2
    const by = -(boxH + BUBBLE_CONSTANTS.TAIL_SIZE)
    const radius = 8

    const color = BUBBLE_CONSTANTS.COLORS[bubble.type]

    // Fill
    bubbleGraphics.fillStyle(color, 0.9)
    bubbleGraphics.fillRoundedRect(bx, by, boxW, boxH, radius)

    // Stroke
    bubbleGraphics.lineStyle(2, 0x000000, 1)
    bubbleGraphics.strokeRoundedRect(bx, by, boxW, boxH, radius)

    // Tail triangle pointing down
    bubbleGraphics.fillStyle(color, 0.9)
    bubbleGraphics.fillTriangle(
      -BUBBLE_CONSTANTS.TAIL_SIZE, by + boxH,
      BUBBLE_CONSTANTS.TAIL_SIZE, by + boxH,
      0, 0
    )

    // Stroke tail edges
    bubbleGraphics.lineStyle(2, 0x000000, 1)
    bubbleGraphics.lineBetween(-BUBBLE_CONSTANTS.TAIL_SIZE, by + boxH, 0, 0)
    bubbleGraphics.lineBetween(BUBBLE_CONSTANTS.TAIL_SIZE, by + boxH, 0, 0)

    // Cover tail base with color fill
    bubbleGraphics.fillStyle(color, 0.9)
    bubbleGraphics.fillRect(-BUBBLE_CONSTANTS.TAIL_SIZE + 1, by + boxH - 2, BUBBLE_CONSTANTS.TAIL_SIZE * 2 - 2, 3)

    // Position bubble and text
    const bubbleY = worldY + BUBBLE_CONSTANTS.OFFSET_Y
    bubbleGraphics.setPosition(worldX, bubbleY)
    label.setPosition(
      worldX - textW / 2,
      bubbleY - (boxH + BUBBLE_CONSTANTS.TAIL_SIZE) + BUBBLE_CONSTANTS.PADDING
    )
    label.setScale(scale)

    // Store graphics for cleanup
    this.graphics.set(agentId, {
      bubble: bubbleGraphics,
      label,
      expiresAt: bubble.createdAt + bubble.duration,
    })
  }

  /**
   * Destroy graphics objects for an agent
   */
  private destroyBubbleGraphics(agentId: AgentId): void {
    const existing = this.graphics.get(agentId)
    if (existing) {
      existing.bubble.destroy()
      existing.label.destroy()
      this.graphics.delete(agentId)
    }
  }

  /**
   * Clear all bubbles
   */
  clear(): void {
    for (const [agentId] of this.graphics) {
      this.destroyBubbleGraphics(agentId)
    }
    this.bubbles.clear()
    this.graphics.clear()
  }

  /**
   * Get active bubbles for debugging
   */
  getActiveBubbles(): BubbleData[] {
    return Array.from(this.bubbles.values())
  }

  /**
   * Check if a bubble is currently showing
   */
  isShowing(agentId: AgentId): boolean {
    return this.bubbles.has(agentId)
  }
}
