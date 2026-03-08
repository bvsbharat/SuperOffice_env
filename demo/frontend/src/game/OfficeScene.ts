import Phaser from 'phaser'
import type { AgentId, Phase } from '../types'
import { AGENT_ORDER } from '../types'
import {
  ROOM_TILE_CENTERS,
  STANDUP_POSITIONS,
  tileToPixel,
  TILE_SIZE,
  MAP_COLS,
  MAP_ROWS,
  BUILDING_W,
  BUILDING_H,
  BUILDING_CENTER_X,
  BUILDING_CENTER_Y,
} from './officeLayout'

const MOVEMENT_SPEED = 2 // pixels per frame
const MIN_ZOOM = 0.3
const MAX_ZOOM = 3
const ZOOM_STEP = 0.15

const BUBBLE_OFFSET_Y = -52
const BUBBLE_MAX_WIDTH = 220
const BUBBLE_PADDING = 12
const BUBBLE_FONT_SIZE = '13px'
const BUBBLE_MAX_CHARS = 120
const BUBBLE_TAIL_SIZE = 6
const TEXT_RESOLUTION = 3

interface AgentSprite {
  sprite: Phaser.GameObjects.Sprite
  nameText: Phaser.GameObjects.Text
  targetX: number
  targetY: number
}

interface SpeechBubbleObjects {
  bubble: Phaser.GameObjects.Graphics
  label: Phaser.GameObjects.Text
  expiresAt: number
}

export interface PhaserBridge {
  updateAgents(
    agents: Record<string, { status: string; name: string; emoji: string; color: string }>,
    activeAgent: string | null
  ): void
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

export class OfficeScene extends Phaser.Scene {
  private agentSprites: Map<AgentId, AgentSprite> = new Map()
  private speechBubbleObjects: Map<string, SpeechBubbleObjects> = new Map()
  private currentPhase: Phase = 'standup'
  private isDragging = false
  private dragStartX = 0
  private dragStartY = 0
  private camStartScrollX = 0
  private camStartScrollY = 0
  private defaultZoom = 1
  bridge: PhaserBridge | null = null

  constructor() {
    super({ key: 'OfficeScene' })
  }

  preload() {
    // Tilesets
    this.load.image('field_b', '/game/tilesets/CuteRPG_Field_B.png')
    this.load.image('field_c', '/game/tilesets/CuteRPG_Field_C.png')
    this.load.image('room_builder', '/game/tilesets/Room_Builder_32x32.png')
    this.load.image('village_b', '/game/tilesets/CuteRPG_Village_B.png')
    this.load.image('forest_b', '/game/tilesets/CuteRPG_Forest_B.png')
    this.load.image('interiors_1', '/game/tilesets/interiors_pt1.png')
    this.load.image('interiors_2', '/game/tilesets/interiors_pt2.png')
    this.load.image('interiors_3', '/game/tilesets/interiors_pt3.png')
    this.load.image('interiors_4', '/game/tilesets/interiors_pt4.png')
    this.load.image('blocks', '/game/tilesets/blocks_1.png')

    // Tilemap JSON
    this.load.tilemapTiledJSON('office_map', '/game/office_map.json')

    // Character sprites
    for (const aid of AGENT_ORDER) {
      this.load.atlas(aid, `/game/sprites/${aid}.png`, '/game/sprites/atlas.json')
    }

  }

  create() {
    // Create tilemap
    const map = this.make.tilemap({ key: 'office_map' })

    // Add tilesets to map
    const fieldB = map.addTilesetImage('CuteRPG_Field_B', 'field_b')!
    const fieldC = map.addTilesetImage('CuteRPG_Field_C', 'field_c')!
    const roomBuilder = map.addTilesetImage('Room_Builder_32x32', 'room_builder')!
    const villageB = map.addTilesetImage('CuteRPG_Village_B', 'village_b')!
    const forestB = map.addTilesetImage('CuteRPG_Forest_B', 'forest_b')!
    const interiors1 = map.addTilesetImage('interiors_pt1', 'interiors_1')!
    const interiors2 = map.addTilesetImage('interiors_pt2', 'interiors_2')!
    const interiors3 = map.addTilesetImage('interiors_pt3', 'interiors_3')!
    const interiors4 = map.addTilesetImage('interiors_pt4', 'interiors_4')!

    const allTilesets = [fieldB, fieldC, roomBuilder, villageB, forestB, interiors1, interiors2, interiors3, interiors4]

    // Create layers with depth ordering
    const bottomGround = map.createLayer('Bottom Ground', allTilesets)
    if (bottomGround) bottomGround.setDepth(0)

    const interiorGround = map.createLayer('Interior Ground', allTilesets)
    if (interiorGround) interiorGround.setDepth(1)

    const wall = map.createLayer('Wall', allTilesets)
    if (wall) wall.setDepth(2)

    const furnitureL1 = map.createLayer('Interior Furniture L1', allTilesets)
    if (furnitureL1) furnitureL1.setDepth(3)

    const furnitureL2 = map.createLayer('Interior Furniture L2', allTilesets)
    if (furnitureL2) furnitureL2.setDepth(4)

    const foreground = map.createLayer('Foreground L1', allTilesets)
    if (foreground) foreground.setDepth(10)

    // Create agent sprites (depth 5-9, between furniture and foreground)
    for (const aid of AGENT_ORDER) {
      this.createAgentSprite(aid)
    }

    // Set up camera — fit map, allow free panning
    const mapW = MAP_COLS * TILE_SIZE
    const mapH = MAP_ROWS * TILE_SIZE

    const fitCamera = () => {
      const cam = this.cameras.main
      const vw = this.scale.width
      const vh = this.scale.height
      // Fit entire building inside viewport (no overflow)
      const zoom = Math.min(vw / BUILDING_W, vh / BUILDING_H)
      this.defaultZoom = zoom
      cam.setZoom(zoom)
      cam.centerOn(BUILDING_CENTER_X, BUILDING_CENTER_Y)
    }
    fitCamera()
    this.scale.on('resize', fitCamera)

    // Scroll-to-zoom
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gameObjects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
      const cam = this.cameras.main
      const step = deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
      const newZoom = Phaser.Math.Clamp(cam.zoom + step, MIN_ZOOM, MAX_ZOOM)
      cam.setZoom(newZoom)
    })

    // Drag-to-pan (middle mouse or right click, or just regular drag)
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // Use right-click or middle-click for pan, or any click with shift
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

    // Disable right-click context menu on canvas
    this.game.canvas.addEventListener('contextmenu', (e) => e.preventDefault())

    // Set up bridge
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
        if (!cam) return null
        const canvas = this.game.canvas
        // Use clientWidth/Height — immune to ancestor 3D CSS transforms
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
      getCanvasElement: () => {
        return this.game.canvas ?? null
      },
      updateSpeechBubbles: (bubbles) => {
        const now = Date.now()
        const activeIds = new Set(bubbles.map((b) => b.agentId))
        // Remove bubbles for agents no longer active
        for (const [aid, obj] of this.speechBubbleObjects) {
          if (!activeIds.has(aid)) {
            this.hideSpeechBubble(aid)
          }
        }
        // Show/update bubbles
        for (const b of bubbles) {
          if (b.expiresAt <= now) continue
          const existing = this.speechBubbleObjects.get(b.agentId)
          if (existing && existing.expiresAt === b.expiresAt) continue
          this.showSpeechBubble(b.agentId, b.text, b.expiresAt)
        }
      },
      zoomIn: () => {
        const cam = this.cameras.main
        cam.setZoom(Phaser.Math.Clamp(cam.zoom + ZOOM_STEP, MIN_ZOOM, MAX_ZOOM))
      },
      zoomOut: () => {
        const cam = this.cameras.main
        cam.setZoom(Phaser.Math.Clamp(cam.zoom - ZOOM_STEP, MIN_ZOOM, MAX_ZOOM))
      },
      resetCamera: () => {
        const cam = this.cameras.main
        cam.setZoom(this.defaultZoom)
        cam.centerOn(BUILDING_CENTER_X, BUILDING_CENTER_Y)
      },
    }
  }

  private createAgentSprite(aid: AgentId) {
    const pos = ROOM_TILE_CENTERS[aid]
    const { x, y } = tileToPixel(pos.tx, pos.ty)

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

    // Create sprite — scale up for visibility at zoom level
    const sprite = this.add.sprite(x, y, aid, 'down')
    sprite.setScale(1.5)
    sprite.setDepth(6)
    sprite.setInteractive({ useHandCursor: true })
    sprite.on('pointerdown', () => {
      if (this.bridge?.onAgentClick) {
        this.bridge.onAgentClick(aid)
      }
    })

    // Name text below sprite — high resolution so it's crisp despite pixelArt mode
    const nameText = this.add.text(x, y + 28, aid.toUpperCase(), {
      fontSize: '18px',
      fontFamily: 'monospace',
      color: '#ffffff',
      backgroundColor: '#000000cc',
      padding: { x: 6, y: 3 },
      resolution: TEXT_RESOLUTION,
    })
    nameText.setOrigin(0.5, 0)
    nameText.setDepth(7)
    nameText.texture.setFilter(Phaser.Textures.FilterMode.LINEAR)

    this.agentSprites.set(aid, {
      sprite,
      nameText,
      targetX: x,
      targetY: y,
    })
  }

  update() {
    // Move agents toward their target positions
    for (const [aid, agentData] of this.agentSprites) {
      const { sprite, nameText } = agentData
      const dx = agentData.targetX - sprite.x
      const dy = agentData.targetY - sprite.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist > 2) {
        const vx = (dx / dist) * MOVEMENT_SPEED
        const vy = (dy / dist) * MOVEMENT_SPEED

        sprite.x += vx
        sprite.y += vy

        // Pick animation direction
        if (Math.abs(dx) > Math.abs(dy)) {
          sprite.anims.play(`${aid}-${dx > 0 ? 'right' : 'left'}-walk`, true)
        } else {
          sprite.anims.play(`${aid}-${dy > 0 ? 'down' : 'up'}-walk`, true)
        }
      } else {
        // Arrived at target
        sprite.x = agentData.targetX
        sprite.y = agentData.targetY
        if (sprite.anims.isPlaying) {
          sprite.anims.stop()
          sprite.setFrame('down')
        }
      }

      // Update name position
      nameText.setPosition(sprite.x, sprite.y + 28)

      // Update speech bubble position or expire
      const bubbleObj = this.speechBubbleObjects.get(aid)
      if (bubbleObj) {
        if (Date.now() > bubbleObj.expiresAt) {
          this.hideSpeechBubble(aid)
        } else {
          // Graphics drawn relative to origin, so just move it
          bubbleObj.bubble.setPosition(sprite.x, sprite.y + BUBBLE_OFFSET_Y)
          // Reposition text to stay centered in the bubble
          const textW = bubbleObj.label.width
          const textH = bubbleObj.label.height
          const boxH = textH + 2 * BUBBLE_PADDING
          bubbleObj.label.setPosition(
            sprite.x - textW / 2,
            sprite.y + BUBBLE_OFFSET_Y - (boxH + BUBBLE_TAIL_SIZE) + BUBBLE_PADDING
          )
        }
      }
    }
  }

  private handleUpdateAgents(
    agents: Record<string, { status: string; name: string; emoji: string; color: string }>,
    activeAgent: string | null
  ) {
    for (const aid of AGENT_ORDER) {
      const agentData = this.agentSprites.get(aid)
      const agent = agents[aid]
      if (!agentData || !agent) continue

      // Update name text
      const displayName = agent.name.split('/')[0]
      agentData.nameText.setText(`${displayName} ${agent.emoji}`)

      // Highlight active agent
      if (aid === activeAgent) {
        agentData.sprite.setTint(0xffff88)
        agentData.sprite.setScale(1.8)
      } else {
        agentData.sprite.clearTint()
        agentData.sprite.setScale(1.5)
      }
    }
  }

  private showSpeechBubble(agentId: string, text: string, expiresAt: number) {
    this.hideSpeechBubble(agentId)
    const agentData = this.agentSprites.get(agentId as AgentId)
    if (!agentData) return

    const { sprite } = agentData
    const truncated = text.length > BUBBLE_MAX_CHARS ? text.slice(0, BUBBLE_MAX_CHARS - 3) + '...' : text
    const initials = agentId.slice(0, 3).toUpperCase()
    const displayText = `${initials}: ${truncated}`

    // Create text first to measure its size — high resolution for crisp rendering
    const label = this.add.text(0, 0, displayText, {
      fontSize: BUBBLE_FONT_SIZE,
      fontFamily: 'monospace',
      color: '#000000',
      wordWrap: { width: BUBBLE_MAX_WIDTH - 2 * BUBBLE_PADDING },
      align: 'center',
      resolution: TEXT_RESOLUTION,
    })
    label.setDepth(21)
    label.texture.setFilter(Phaser.Textures.FilterMode.LINEAR)

    const textW = label.width
    const textH = label.height
    const boxW = textW + 2 * BUBBLE_PADDING
    const boxH = textH + 2 * BUBBLE_PADDING

    // Position text centered inside the bubble (drawn relative to origin)
    label.setPosition(-textW / 2, -(boxH + BUBBLE_TAIL_SIZE) - BUBBLE_PADDING + BUBBLE_PADDING / 2)
    // Simplify: place label so it's centered in the box above the tail
    label.setPosition(-textW / 2, -(boxH + BUBBLE_TAIL_SIZE) + BUBBLE_PADDING)

    // Draw bubble graphics relative to (0, 0) — we'll reposition via setPosition
    const bubble = this.add.graphics()
    bubble.setDepth(20)

    const bx = -boxW / 2
    const by = -(boxH + BUBBLE_TAIL_SIZE)
    const radius = 8

    // Fill
    bubble.fillStyle(0xffffff, 0.95)
    bubble.fillRoundedRect(bx, by, boxW, boxH, radius)
    // Stroke
    bubble.lineStyle(2, 0x000000, 1)
    bubble.strokeRoundedRect(bx, by, boxW, boxH, radius)
    // Tail triangle pointing down
    bubble.fillStyle(0xffffff, 0.95)
    bubble.fillTriangle(
      -BUBBLE_TAIL_SIZE, by + boxH,
      BUBBLE_TAIL_SIZE, by + boxH,
      0, 0
    )
    // Stroke tail edges (left and right lines only)
    bubble.lineStyle(2, 0x000000, 1)
    bubble.lineBetween(-BUBBLE_TAIL_SIZE, by + boxH, 0, 0)
    bubble.lineBetween(BUBBLE_TAIL_SIZE, by + boxH, 0, 0)
    // Cover the stroke at the base of the tail with a white fill
    bubble.fillStyle(0xffffff, 0.95)
    bubble.fillRect(-BUBBLE_TAIL_SIZE + 1, by + boxH - 2, BUBBLE_TAIL_SIZE * 2 - 2, 3)

    // Position both at the sprite location
    bubble.setPosition(sprite.x, sprite.y + BUBBLE_OFFSET_Y)
    label.setPosition(
      sprite.x - textW / 2,
      sprite.y + BUBBLE_OFFSET_Y - (boxH + BUBBLE_TAIL_SIZE) + BUBBLE_PADDING
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

  private handlePhaseChange(phase: Phase) {
    this.currentPhase = phase
    for (const aid of AGENT_ORDER) {
      const agentData = this.agentSprites.get(aid)
      if (!agentData) continue

      let targetPos: { tx: number; ty: number }
      if (phase === 'standup') {
        targetPos = STANDUP_POSITIONS[aid]
      } else {
        targetPos = ROOM_TILE_CENTERS[aid]
      }
      const { x, y } = tileToPixel(targetPos.tx, targetPos.ty)
      agentData.targetX = x
      agentData.targetY = y
    }
  }

}
