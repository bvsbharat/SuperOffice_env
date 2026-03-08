/**
 * Office Scene V2 - Pixel-Art Top-Down Office
 *
 * Complete rewrite to match pixel-agents aesthetic:
 * - Top-down orthographic view
 * - Individual rooms with furniture
 * - Agents as pixel-art sprites in office setting
 * - Proper office layout with hallways
 */

import Phaser from 'phaser'
import type { AgentId, Phase } from '../types'
import { AGENT_ORDER } from '../types'
import { BehaviorManager, AgentState } from './agentBehavior'
import { SpeechBubbleManager } from './speechBubbles'
import { VisualEffects } from './visualEffects'
import { CollaborationVisuals } from './collaborationVisuals'
import { AgentStatusOverlay } from './agentStatusOverlay'
import { getRoomForAgent, getOfficeBounds, OFFICE_ROOMS, drawFurniture } from './officeDesign'
import { ease } from './easing'

const AGENT_SCALE = 2.0  // Pixel art agents scale
const ROOM_WALL_WIDTH = 3

interface AgentSprite {
  sprite: Phaser.GameObjects.Sprite
  nameText: Phaser.GameObjects.Text
  targetX: number
  targetY: number
  roomId: string
}

interface SpeechBubbleObjects {
  bubble: Phaser.GameObjects.Graphics
  label: Phaser.GameObjects.Text
  expiresAt: number
}

export interface PhaserBridge {
  updateAgents(agents: Record<string, any>, activeAgent: string | null): void
  updatePhase(phase: Phase): void
  onAgentClick: ((agentId: AgentId) => void) | null
  worldToScreen(wx: number, wy: number): { x: number; y: number } | null
  getAgentWorldPositions(): Record<string, { x: number; y: number }>
  getCanvasElement(): HTMLCanvasElement | null
  updateSpeechBubbles(bubbles: Array<{ agentId: string; text: string; expiresAt: number }>): void
  zoomIn(): void
  zoomOut(): void
  resetCamera(): void
}

export class OfficeSceneV2 extends Phaser.Scene {
  private agentSprites: Map<AgentId, AgentSprite> = new Map()
  private speechBubbleObjects: Map<string, SpeechBubbleObjects> = new Map()
  private currentPhase: Phase = 'morning_standup'
  private isDragging = false
  private dragStartX = 0
  private dragStartY = 0
  private camStartScrollX = 0
  private camStartScrollY = 0
  private defaultZoom = 1

  private behaviorManager: BehaviorManager = new BehaviorManager()
  private speechBubbleManager: SpeechBubbleManager | null = null
  private visualEffects: VisualEffects | null = null
  private collaborationVisuals: CollaborationVisuals | null = null
  private statusOverlay: AgentStatusOverlay | null = null

  private activeAgent: AgentId | null = null
  private activeCollaborations: Map<string, any> = new Map()

  bridge: PhaserBridge | null = null

  constructor() {
    super({ key: 'OfficeSceneV2' })
  }

  preload() {
    // Load character sprites
    for (const aid of AGENT_ORDER) {
      this.load.atlas(aid, `/game/sprites/${aid}.png`, '/game/sprites/atlas.json')
    }
  }

  create() {
    // Apply pixel-art filter
    const pixelArtKeys = [...AGENT_ORDER]
    for (const key of pixelArtKeys) {
      const tex = this.textures.get(key)
      if (tex) tex.setFilter(Phaser.Textures.FilterMode.NEAREST)
    }

    // Initialize visual systems
    this.speechBubbleManager = new SpeechBubbleManager(this)
    this.visualEffects = new VisualEffects(this)
    this.collaborationVisuals = new CollaborationVisuals(this)
    this.statusOverlay = new AgentStatusOverlay(this)

    // Draw office layout
    this.drawOffice()

    // Create agents in their rooms
    for (const aid of AGENT_ORDER) {
      this.createAgentInRoom(aid)
    }

    // Setup camera
    this.setupCamera()

    // Setup controls
    this.setupControls()

    // Setup bridge
    this.setupBridge()
  }

  /**
   * Draw the complete office layout
   */
  private drawOffice() {
    // Add office background (outside rooms - light green) - draw first so it's behind
    const bounds = getOfficeBounds()
    const bg = this.add.graphics()
    bg.fillStyle(0x99ff69, 1)  // Light green like in reference
    bg.fillRect(0, 0, bounds.maxX + 100, bounds.maxY + 100)
    bg.setDepth(-1)

    const graphics = this.add.graphics()
    graphics.setDepth(0)

    // Draw each room
    for (const room of Object.values(OFFICE_ROOMS)) {
      // Floor
      const floorColor = parseInt(room.floorColor.replace('#', ''), 16)
      graphics.fillStyle(floorColor, 1)
      graphics.fillRect(room.x, room.y, room.width, room.height)

      // Walls (simple border)
      const wallColor = parseInt(room.color.replace('#', ''), 16)
      graphics.lineStyle(ROOM_WALL_WIDTH, wallColor, 1)
      graphics.strokeRect(room.x, room.y, room.width, room.height)

      // Draw furniture
      for (const furniture of room.furniture) {
        drawFurniture(graphics, furniture)
      }
    }
  }

  /**
   * Create agent sprite in their assigned room
   */
  private createAgentInRoom(aid: AgentId) {
    const room = getRoomForAgent(aid)
    const { x, y } = room.agentSpawn

    // Create walk animations
    const directions = ['down', 'left', 'right', 'up']
    for (const dir of directions) {
      this.anims.create({
        key: `${aid}-${dir}-walk`,
        frames: [
          { key: aid, frame: `${dir}-walk.000` },
          { key: aid, frame: `${dir}-walk.001` },
          { key: aid, frame: `${dir}-walk.002` },
          { key: aid, frame: `${dir}-walk.003` },
        ],
        frameRate: 8,
        repeat: -1,
      })
    }

    // Create sprite
    const sprite = this.add.sprite(x, y, aid, 'down')
    sprite.setScale(AGENT_SCALE)
    sprite.setDepth(5)
    sprite.setInteractive({ useHandCursor: true })
    sprite.on('pointerdown', () => {
      if (this.bridge?.onAgentClick) {
        this.bridge.onAgentClick(aid)
      }
    })

    // Name label
    const nameText = this.add.text(x, y + 40, aid.toUpperCase(), {
      fontSize: '14px',
      color: '#ffffff',
      backgroundColor: '#000000aa',
      padding: { x: 4, y: 2 },
    })
    nameText.setOrigin(0.5, 0)
    nameText.setDepth(6)

    // Initialize behavior
    this.behaviorManager.initialize(aid, x, y)

    this.agentSprites.set(aid, {
      sprite,
      nameText,
      targetX: x,
      targetY: y,
      roomId: aid,
    })
  }

  /**
   * Setup camera
   */
  private setupCamera() {
    const cam = this.cameras.main
    const bounds = getOfficeBounds()

    cam.setBounds(0, 0, bounds.maxX + 100, bounds.maxY + 100)
    cam.setZoom(1)
    cam.centerOn(bounds.maxX / 2, bounds.maxY / 2)
    this.defaultZoom = 1

    // Scroll-to-zoom
    this.input.on('wheel', (_: any, __: any, ___: any, deltaY: number) => {
      const step = deltaY > 0 ? -0.1 : 0.1
      const newZoom = Phaser.Math.Clamp(cam.zoom + step, 0.5, 2.5)
      cam.setZoom(newZoom)
    })
  }

  /**
   * Setup camera controls
   */
  private setupControls() {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown() || pointer.middleButtonDown() || pointer.event.shiftKey) {
        this.isDragging = true
        this.dragStartX = pointer.x
        this.dragStartY = pointer.y
        this.camStartScrollX = this.cameras.main.scrollX
        this.camStartScrollY = this.cameras.main.scrollY
      }
    })

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.isDragging) return
      const cam = this.cameras.main
      const dx = (this.dragStartX - pointer.x) / cam.zoom
      const dy = (this.dragStartY - pointer.y) / cam.zoom
      cam.scrollX = this.camStartScrollX + dx
      cam.scrollY = this.camStartScrollY + dy
    })

    this.input.on('pointerup', () => {
      this.isDragging = false
    })
  }

  /**
   * Setup Phaser bridge
   */
  private setupBridge() {
    this.bridge = {
      updateAgents: (agents, activeAgent) => {
        this.handleUpdateAgents(agents, activeAgent)
      },
      updatePhase: (phase) => {
        this.handlePhaseChange(phase)
      },
      onAgentClick: null,
      worldToScreen: (wx: number, wy: number) => {
        const cam = this.cameras.main
        const canvas = this.game.canvas
        const scaleX = canvas.clientWidth / canvas.width
        const scaleY = canvas.clientHeight / canvas.height
        return {
          x: (wx - cam.worldView.x) * cam.zoom * scaleX,
          y: (wy - cam.worldView.y) * cam.zoom * scaleY,
        }
      },
      getAgentWorldPositions: () => {
        const positions: Record<string, { x: number; y: number }> = {}
        for (const [aid, agentData] of this.agentSprites) {
          positions[aid] = { x: agentData.sprite.x, y: agentData.sprite.y }
        }
        return positions
      },
      getCanvasElement: () => this.game.canvas ?? null,
      updateSpeechBubbles: (bubbles) => {
        const now = Date.now()
        const activeIds = new Set(bubbles.map((b) => b.agentId))
        for (const [aid] of this.speechBubbleObjects) {
          if (!activeIds.has(aid)) {
            this.hideSpeechBubble(aid)
          }
        }
        for (const b of bubbles) {
          if (b.expiresAt > now) {
            this.showSpeechBubble(b.agentId, b.text, b.expiresAt)
          }
        }
      },
      zoomIn: () => {
        const cam = this.cameras.main
        cam.setZoom(Phaser.Math.Clamp(cam.zoom + 0.1, 0.5, 2.5))
      },
      zoomOut: () => {
        const cam = this.cameras.main
        cam.setZoom(Phaser.Math.Clamp(cam.zoom - 0.1, 0.5, 2.5))
      },
      resetCamera: () => {
        const cam = this.cameras.main
        cam.setZoom(this.defaultZoom)
        const bounds = getOfficeBounds()
        cam.centerOn(bounds.maxX / 2, bounds.maxY / 2)
      },
    }
  }

  update(_time: number, delta: number) {
    // Update visual systems
    if (this.visualEffects) {
      this.visualEffects.update(delta)
      this.visualEffects.render()
    }
    if (this.collaborationVisuals) {
      this.collaborationVisuals.update()
    }
    if (this.speechBubbleManager) {
      this.speechBubbleManager.update(delta)
    }

    // Update agents
    for (const [aid, agentData] of this.agentSprites) {
      const { sprite, nameText } = agentData
      const behavior = this.behaviorManager.get(aid)
      if (!behavior) continue

      const dx = agentData.targetX - sprite.x
      const dy = agentData.targetY - sprite.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      const isMoving = dist > 2

      this.behaviorManager.updateBehavior(
        aid,
        this.currentPhase,
        aid === this.activeAgent,
        isMoving,
        behavior.collaboratingWith,
        delta
      )

      if (isMoving) {
        this.behaviorManager.updateDirectionFromDelta(aid, dx, dy)
      }

      const updatedBehavior = this.behaviorManager.get(aid)!

      if (isMoving) {
        const moveSpeed = 100 * (delta / 1000)  // pixels per second
        const moveAmount = Math.min(moveSpeed, dist)
        sprite.x += (dx / dist) * moveAmount
        sprite.y += (dy / dist) * moveAmount

        const direction = updatedBehavior.direction
        sprite.anims.play(`${aid}-${direction}-walk`, true)
      } else {
        sprite.x = agentData.targetX
        sprite.y = agentData.targetY
        if (sprite.anims.isPlaying) {
          sprite.anims.stop()
          sprite.setFrame('down')
        }
      }

      const bobOffset = this.behaviorManager.getIdleBobOffset(aid)
      const baseY = sprite.y + bobOffset

      nameText.setPosition(sprite.x, baseY + 30)

      // Update speech bubbles — counter-scale with camera zoom so text stays readable
      const bubbleObj = this.speechBubbleObjects.get(aid)
      if (bubbleObj) {
        if (Date.now() > bubbleObj.expiresAt) {
          this.hideSpeechBubble(aid)
        } else {
          const camZoom = this.cameras.main.zoom
          const invZoom = 1 / camZoom  // counter-scale: bigger when zoomed out
          const clampedScale = Math.max(invZoom, 0.5)  // don't shrink below 0.5x even when zoomed in

          bubbleObj.bubble.setScale(clampedScale)
          bubbleObj.label.setScale(clampedScale)

          const offsetY = 50 * clampedScale
          bubbleObj.bubble.setPosition(Math.round(sprite.x), Math.round(baseY - offsetY))

          const textW = bubbleObj.label.width * clampedScale
          const textH = bubbleObj.label.height * clampedScale
          const boxH = textH + 20 * clampedScale
          const tailH = 7 * clampedScale
          const padY = 10 * clampedScale
          bubbleObj.label.setPosition(
            Math.round(sprite.x - textW / 2),
            Math.round(baseY - offsetY - boxH - tailH + padY)
          )
        }
      }

      // Update status overlay
      if (this.statusOverlay) {
        this.statusOverlay.updateOverlay(
          aid,
          sprite.x,
          sprite.y,
          updatedBehavior.state,
          0.5,
          aid === this.activeAgent
        )
      }
    }

    // Render speech bubbles
    if (this.speechBubbleManager) {
      this.speechBubbleManager.render(this.agentSprites)
    }
  }

  private handleUpdateAgents(agents: Record<string, any>, activeAgent: string | null) {
    this.activeAgent = activeAgent as AgentId | null

    for (const aid of AGENT_ORDER) {
      const agentData = this.agentSprites.get(aid)
      const agent = agents[aid]
      if (!agentData || !agent) continue

      const displayName = agent.name ? agent.name.split('/')[0] : aid
      agentData.nameText.setText(`${displayName} ${agent.emoji || ''}`)

      const behavior = this.behaviorManager.get(aid)
      if (behavior) {
        const scale = this.behaviorManager.getStateScale(behavior.state, aid === activeAgent)
        agentData.sprite.setScale(scale)

        if (aid === activeAgent) {
          agentData.sprite.setTint(0xffff88)
        } else {
          agentData.sprite.clearTint()
        }
      }
    }
  }

  private handlePhaseChange(phase: Phase) {
    this.currentPhase = phase
    // All agents stay in their rooms during all phases for now
    // Phase changes just affect behavior state (idle/presenting)
  }

  private showSpeechBubble(agentId: string, text: string, expiresAt: number) {
    this.hideSpeechBubble(agentId)
    const agentData = this.agentSprites.get(agentId as AgentId)
    if (!agentData) return

    const { sprite } = agentData
    const truncated = text.length > 140 ? text.slice(0, 137) + '...' : text

    const label = this.add.text(0, 0, truncated, {
      fontSize: '16px',
      fontFamily: '"SF Pro Display", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
      color: '#1a1a1a',
      wordWrap: { width: 240 },
      align: 'left',
      lineSpacing: 3,
      resolution: 2,
    })
    label.setDepth(21)
    label.texture.setFilter(Phaser.Textures.FilterMode.LINEAR)

    const textW = label.width
    const textH = label.height
    const padX = 14
    const padY = 10
    const boxW = textW + 2 * padX
    const boxH = textH + 2 * padY
    const tailSize = 7
    const radius = 6

    const bubble = this.add.graphics()
    // White fill with slight shadow effect
    bubble.fillStyle(0xffffff, 0.97)
    bubble.fillRoundedRect(-boxW / 2, -boxH - tailSize, boxW, boxH, radius)
    bubble.lineStyle(1.5, 0x374151, 0.6)
    bubble.strokeRoundedRect(-boxW / 2, -boxH - tailSize, boxW, boxH, radius)
    // Tail triangle
    bubble.fillStyle(0xffffff, 0.97)
    bubble.fillTriangle(-tailSize, -tailSize, tailSize, -tailSize, 0, 0)
    bubble.lineStyle(1.5, 0x374151, 0.6)
    bubble.lineBetween(-tailSize, -tailSize, 0, 0)
    bubble.lineBetween(tailSize, -tailSize, 0, 0)
    // Cover tail-box seam
    bubble.fillStyle(0xffffff, 0.97)
    bubble.fillRect(-tailSize + 1, -tailSize - 1, tailSize * 2 - 2, 3)

    bubble.setPosition(sprite.x, sprite.y - 50)
    bubble.setDepth(20)

    label.setPosition(
      Math.round(sprite.x - textW / 2),
      Math.round(sprite.y - 50 - boxH - tailSize + padY)
    )

    this.speechBubbleObjects.set(agentId, { bubble, label, expiresAt })
  }

  private hideSpeechBubble(agentId: string) {
    const existing = this.speechBubbleObjects.get(agentId)
    if (existing) {
      existing.bubble.destroy()
      existing.label.destroy()
      this.speechBubbleObjects.delete(agentId)
    }
  }

  public handleCollaboration(from: AgentId, to: AgentId, type: 'message' | 'coordinate' | 'handoff') {
    const agent1 = this.agentSprites.get(from)
    const agent2 = this.agentSprites.get(to)
    if (!agent1 || !agent2) return

    const midX = (agent1.sprite.x + agent2.sprite.x) / 2
    const midY = (agent1.sprite.y + agent2.sprite.y) / 2

    agent1.targetX = midX - 20
    agent1.targetY = midY
    agent2.targetX = midX + 20
    agent2.targetY = midY

    if (this.collaborationVisuals) {
      this.collaborationVisuals.drawLine(
        from,
        to,
        { x: agent1.sprite.x, y: agent1.sprite.y },
        { x: agent2.sprite.x, y: agent2.sprite.y },
        type,
        3000
      )
    }

    if (this.visualEffects) {
      this.visualEffects.addGlow(from, agent1.sprite.x, agent1.sprite.y, 0x22c55e)
      this.visualEffects.addGlow(to, agent2.sprite.x, agent2.sprite.y, 0x22c55e)
    }

    setTimeout(() => {
      if (this.visualEffects) {
        this.visualEffects.removeGlow(from)
        this.visualEffects.removeGlow(to)
      }
    }, 3000)
  }

  public celebrateSuccess(agentId: AgentId, intensity: 'low' | 'medium' | 'high' = 'medium') {
    const agent = this.agentSprites.get(agentId)
    if (!agent || !this.visualEffects) return

    const count = { low: 6, medium: 12, high: 20 }[intensity]
    this.visualEffects.emitCelebration(agent.sprite.x, agent.sprite.y, count)

    if (intensity === 'high') {
      this.cameras.main.shake(500, 0.01)
    }
  }
}

// Export for use in React
export { getOfficeBounds }
