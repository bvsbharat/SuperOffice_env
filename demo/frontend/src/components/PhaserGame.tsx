import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import { OfficeScene } from '../game/OfficeScene'
import type { PhaserBridge } from '../game/OfficeScene'
import { useStore } from '../store/useStore'
import type { AgentId } from '../types'

interface PhaserGameProps {
  onBridgeReady?: (bridge: PhaserBridge) => void
}

export function PhaserGame({ onBridgeReady }: PhaserGameProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | null>(null)
  const bridgeRef = useRef<PhaserBridge | null>(null)

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: containerRef.current,
      pixelArt: true,
      transparent: true,
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.NO_CENTER,
      },
      scene: OfficeScene,
    }

    const game = new Phaser.Game(config)
    gameRef.current = game

    // Wait for scene to be ready, then grab bridge
    game.events.on('ready', () => {
      const scene = game.scene.getScene('OfficeScene') as OfficeScene
      if (scene) {
        // The bridge might not be set yet (scene hasn't run create), poll briefly
        const checkBridge = () => {
          if (scene.bridge) {
            bridgeRef.current = scene.bridge
            // Set up the click handler
            scene.bridge.onAgentClick = (agentId: AgentId) => {
              const store = useStore.getState()
              store.selectAgent(store.selectedAgent === agentId ? null : agentId)
            }
            // Push initial state
            const state = useStore.getState()
            scene.bridge.updateAgents(state.agents as any, state.activeAgent)
            scene.bridge.updatePhase(state.phase)
            scene.bridge.updateSpeechBubbles(state.speechBubbles)
            // Notify parent
            onBridgeReady?.(scene.bridge)
          } else {
            setTimeout(checkBridge, 100)
          }
        }
        checkBridge()
      }
    })

    return () => {
      gameRef.current?.destroy(true)
      gameRef.current = null
      bridgeRef.current = null
    }
  }, [])

  // Subscribe to store changes and push to Phaser
  useEffect(() => {
    const unsubAgents = useStore.subscribe(
      (state) => {
        if (bridgeRef.current) {
          bridgeRef.current.updateAgents(state.agents as any, state.activeAgent)
        }
      }
    )
    return unsubAgents
  }, [])

  useEffect(() => {
    const unsubPhase = useStore.subscribe(
      (state) => {
        if (bridgeRef.current) {
          bridgeRef.current.updatePhase(state.phase)
        }
      }
    )
    return unsubPhase
  }, [])

  useEffect(() => {
    const unsubBubbles = useStore.subscribe((state) => {
      if (bridgeRef.current) {
        bridgeRef.current.updateSpeechBubbles(state.speechBubbles)
      }
    })
    return unsubBubbles
  }, [])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        zIndex: 1,
      }}
    />
  )
}
