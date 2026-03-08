/**
 * Visual Effects System
 *
 * Handles particles, glows, highlights, and other visual feedback
 */

import Phaser from 'phaser'
import type { AgentId } from '../types'

interface ParticleEffect {
  x: number
  y: number
  type: 'sparkle' | 'burst' | 'celebration'
  createdAt: number
  duration: number
}

interface GlowEffect {
  sprite: Phaser.GameObjects.Graphics
  agentId: AgentId
  intensity: number
  createdAt: number
}

/**
 * VisualEffects - Manages particles, glows, and visual feedback
 */
export class VisualEffects {
  private particles: ParticleEffect[] = []
  private glows: Map<AgentId, GlowEffect> = new Map()
  private scene: Phaser.Scene

  constructor(scene: Phaser.Scene) {
    this.scene = scene
  }

  /**
   * Emit sparkle particles at position
   */
  emitSparkles(x: number, y: number, count: number = 8): void {
    const now = Date.now()
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 20,
        y: y + (Math.random() - 0.5) * 20,
        type: 'sparkle',
        createdAt: now,
        duration: 800,
      })
    }
  }

  /**
   * Emit celebration burst (bigger, more colorful)
   */
  emitCelebration(x: number, y: number, count: number = 12): void {
    const now = Date.now()
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2
      const distance = 30 + Math.random() * 20
      this.particles.push({
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        type: 'celebration',
        createdAt: now,
        duration: 1200,
      })
    }
  }

  /**
   * Add pulsing glow around agent
   */
  addGlow(agentId: AgentId, x: number, y: number, color: number = 0xffff88): void {
    this.removeGlow(agentId)

    const glow = this.scene.add.graphics()
    glow.fillStyle(color, 0.2)
    glow.fillCircle(0, 0, 40)
    glow.lineStyle(2, color, 0.4)
    glow.strokeCircle(0, 0, 40)
    glow.setPosition(x, y)
    glow.setDepth(5)

    this.glows.set(agentId, {
      sprite: glow,
      agentId,
      intensity: 1.0,
      createdAt: Date.now(),
    })
  }

  /**
   * Remove glow for agent
   */
  removeGlow(agentId: AgentId): void {
    const existing = this.glows.get(agentId)
    if (existing) {
      existing.sprite.destroy()
      this.glows.delete(agentId)
    }
  }

  /**
   * Update all effects (animations, expiration)
   */
  update(deltaTime: number): void {
    const now = Date.now()

    // Update particles
    this.particles = this.particles.filter(p => now - p.createdAt < p.duration)

    // Update glows (pulsing effect)
    for (const [agentId, glow] of this.glows) {
      const age = now - glow.createdAt
      const progress = Math.sin(age * 0.01) * 0.5 + 0.5 // 0 to 1 pulsing
      glow.intensity = progress
      glow.sprite.setAlpha(0.2 + progress * 0.3)
    }
  }

  /**
   * Render particles
   */
  render(): void {
    const now = Date.now()

    for (const particle of this.particles) {
      const age = now - particle.createdAt
      const progress = age / particle.duration
      const remaining = 1 - progress

      // Get world position (particles drift up)
      let y = particle.y - progress * 30
      let opacity = remaining

      if (particle.type === 'sparkle') {
        // Draw small star
        this.drawSparkle(particle.x, y, opacity)
      } else if (particle.type === 'celebration') {
        // Draw larger circles
        this.drawCelebration(particle.x, y, opacity)
      }
    }
  }

  /**
   * Draw sparkle particle
   */
  private drawSparkle(x: number, y: number, opacity: number): void {
    const ctx = this.scene.cameras.main
    const graphics = this.scene.add.graphics()
    graphics.fillStyle(0xffff88, opacity * 0.8)
    graphics.fillCircle(x, y, 2)
    graphics.setDepth(15)
    graphics.setAlpha(opacity)
    // Note: In real implementation, would cache/reuse graphics
  }

  /**
   * Draw celebration particle
   */
  private drawCelebration(x: number, y: number, opacity: number): void {
    const graphics = this.scene.add.graphics()
    const colors = [0xff6b9d, 0xf77f00, 0x9b5de5, 0x00f5d4]
    const color = colors[Math.floor(Math.random() * colors.length)]
    graphics.fillStyle(color, opacity * 0.7)
    graphics.fillCircle(x, y, 3)
    graphics.setDepth(15)
    graphics.setAlpha(opacity)
  }

  /**
   * Clear all effects
   */
  clear(): void {
    this.particles = []
    for (const [_, glow] of this.glows) {
      glow.sprite.destroy()
    }
    this.glows.clear()
  }
}
