import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { OrbitControls, Html } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '../../store/useStore'
import { AGENT_ORDER, AGENT_3D_CONFIG, ROOM_3D_POSITIONS, ROOM_FLOOR_COLORS } from '../../types'
import type { AgentId } from '../../types'
import { OfficeRoom } from './OfficeRoom'
import { AgentBot } from './AgentBot'
import { AgentLabel } from './AgentLabel'

function FloatingParticles() {
  const particlesRef = useRef<THREE.Points>(null)
  const count = 40

  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 18
      pos[i * 3 + 1] = Math.random() * 3 + 0.5
      pos[i * 3 + 2] = (Math.random() - 0.5) * 20
    }
    return pos
  }, [])

  useFrame((state) => {
    if (!particlesRef.current) return
    const t = state.clock.elapsedTime
    const pos = particlesRef.current.geometry.attributes.position
    for (let i = 0; i < count; i++) {
      ;(pos.array as Float32Array)[i * 3 + 1] += Math.sin(t * 0.4 + i) * 0.0008
      ;(pos.array as Float32Array)[i * 3] += Math.cos(t * 0.15 + i * 0.5) * 0.0002
      if ((pos.array as Float32Array)[i * 3 + 1] > 4) (pos.array as Float32Array)[i * 3 + 1] = 0.5
    }
    pos.needsUpdate = true
  })

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.02} color="#fbbf24" transparent opacity={0.3} sizeAttenuation />
    </points>
  )
}

function WoodFloor() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[22, 22]} />
        <meshStandardMaterial color="#5a4030" roughness={0.85} />
      </mesh>
      {Array.from({ length: 88 }).map((_, i) => (
        <mesh key={`plank-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.018, -11 + i * 0.25]}>
          <planeGeometry args={[22, 0.006]} />
          <meshStandardMaterial color="#3a2818" transparent opacity={0.4} />
        </mesh>
      ))}
      {Array.from({ length: 32 }).map((_, i) => (
        <mesh key={`grain-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[-11 + i * 0.7, -0.017, 0]}>
          <planeGeometry args={[0.35, 22]} />
          <meshStandardMaterial
            color={i % 3 === 0 ? '#6a5038' : i % 3 === 1 ? '#4a3420' : '#5a4230'}
            transparent
            opacity={0.25}
          />
        </mesh>
      ))}
      {/* Corridor carpet runner between columns */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-0.5, -0.015, 0]}>
        <planeGeometry args={[1.8, 18]} />
        <meshStandardMaterial color="#6b4530" roughness={0.95} />
      </mesh>
    </group>
  )
}

function RoomLabel({ position, text, color }: { position: [number, number, number]; text: string; color: string }) {
  return (
    <Html position={position} center transform={false} zIndexRange={[1, 0]} style={{ pointerEvents: 'none' }}>
      <div style={{
        fontFamily: "'Press Start 2P', monospace",
        fontSize: '9px',
        color: color,
        textShadow: `0 0 8px ${color}88`,
        whiteSpace: 'nowrap',
        letterSpacing: '2px',
        userSelect: 'none',
      }}>
        {text}
      </div>
    </Html>
  )
}

// Hallway decorations
function HallwayPlant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.05, 0.04, 0.12, 6]} />
        <meshStandardMaterial color="#8B5E3C" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.16, 0]}>
        <sphereGeometry args={[0.08, 8, 6]} />
        <meshStandardMaterial color="#16a34a" roughness={0.7} />
      </mesh>
      <mesh position={[0.04, 0.22, 0.02]}>
        <sphereGeometry args={[0.05, 6, 6]} />
        <meshStandardMaterial color="#22c55e" roughness={0.7} />
      </mesh>
    </group>
  )
}

function LargePottedTree({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.07, 0.06, 0.16, 8]} />
        <meshStandardMaterial color="#78350f" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.12, 6]} />
        <meshStandardMaterial color="#5c3a14" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.3, 0]}>
        <sphereGeometry args={[0.14, 8, 8]} />
        <meshStandardMaterial color="#16a34a" roughness={0.7} />
      </mesh>
      <mesh position={[0.06, 0.36, 0.04]}>
        <sphereGeometry args={[0.08, 6, 6]} />
        <meshStandardMaterial color="#22c55e" roughness={0.7} />
      </mesh>
      <mesh position={[-0.05, 0.34, -0.03]}>
        <sphereGeometry args={[0.07, 6, 6]} />
        <meshStandardMaterial color="#15803d" roughness={0.7} />
      </mesh>
    </group>
  )
}

function FloorLamp({ position, color = '#fbbf24' }: { position: [number, number, number]; color?: string }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.25, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 0.5, 6]} />
        <meshStandardMaterial color="#71717a" roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.52, 0]}>
        <coneGeometry args={[0.06, 0.06, 8]} />
        <meshStandardMaterial color="#fafafa" roughness={0.4} />
      </mesh>
      <pointLight position={[0, 0.48, 0]} color={color} intensity={0.2} distance={2} />
    </group>
  )
}

function WaterDispenser({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.2, 0]}>
        <boxGeometry args={[0.1, 0.4, 0.1]} />
        <meshStandardMaterial color="#d4d4d8" roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.08, 8]} />
        <meshStandardMaterial color="#7dd3fc" transparent opacity={0.5} roughness={0.2} />
      </mesh>
    </group>
  )
}

function Bench({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry args={[0.5, 0.03, 0.15]} />
        <meshStandardMaterial color="#92400e" roughness={0.7} />
      </mesh>
      <mesh position={[-0.2, 0.05, 0]}>
        <boxGeometry args={[0.03, 0.1, 0.12]} />
        <meshStandardMaterial color="#78350f" roughness={0.7} />
      </mesh>
      <mesh position={[0.2, 0.05, 0]}>
        <boxGeometry args={[0.03, 0.1, 0.12]} />
        <meshStandardMaterial color="#78350f" roughness={0.7} />
      </mesh>
    </group>
  )
}

function VendingMachine({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[0.2, 0.6, 0.15]} />
        <meshStandardMaterial color="#ef4444" roughness={0.4} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.35, 0.076]}>
        <boxGeometry args={[0.14, 0.25, 0.002]} />
        <meshStandardMaterial color="#1f2937" roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.15, 0.076]}>
        <boxGeometry args={[0.08, 0.04, 0.002]} />
        <meshStandardMaterial color="#d1d5db" metalness={0.5} roughness={0.3} />
      </mesh>
    </group>
  )
}

function FireExtinguisher({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 0.2, 8]} />
        <meshStandardMaterial color="#ef4444" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.21, 0]}>
        <cylinderGeometry args={[0.012, 0.018, 0.02, 6]} />
        <meshStandardMaterial color="#374151" metalness={0.5} roughness={0.3} />
      </mesh>
    </group>
  )
}

function TrashCan({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={position}>
      <cylinderGeometry args={[0.04, 0.035, 0.1, 8]} />
      <meshStandardMaterial color="#6b7280" roughness={0.5} />
    </mesh>
  )
}

function DirectionalSign({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 0.4, 4]} />
        <meshStandardMaterial color="#6b7280" roughness={0.4} />
      </mesh>
      <mesh position={[0.06, 0.35, 0]}>
        <boxGeometry args={[0.12, 0.04, 0.01]} />
        <meshStandardMaterial color="#fbbf24" roughness={0.4} />
      </mesh>
      <mesh position={[0.06, 0.28, 0]}>
        <boxGeometry args={[0.1, 0.03, 0.01]} />
        <meshStandardMaterial color="#3b82f6" roughness={0.4} />
      </mesh>
    </group>
  )
}

function CeilingBeam({ position, length = 4 }: { position: [number, number, number]; length?: number }) {
  return (
    <mesh position={position}>
      <boxGeometry args={[0.08, 0.04, length]} />
      <meshStandardMaterial color="#4a3420" roughness={0.8} transparent opacity={0.6} />
    </mesh>
  )
}

const ROOM_SIZE: [number, number, number] = [3.8, 1.0, 2.4]

export function OfficeScene3D() {
  const speechBubbles = useStore(s => s.speechBubbles)
  const coordArrows = useStore(s => s.coordArrows)
  const agentPositions = useStore(s => s.agentPositions)
  const theme = useStore(s => s.theme)

  const now = Date.now()

  return (
    <>
      {/* Warm bright lighting */}
      <ambientLight intensity={1.4} />
      <directionalLight position={[10, 16, 8]} intensity={1.6} color="#fff8f0" castShadow />
      <directionalLight position={[-8, 12, -6]} intensity={0.8} color="#e8e0f0" />
      <directionalLight position={[0, 10, 10]} intensity={0.4} color="#fff5e6" />
      <hemisphereLight args={['#fef3c7', '#ede9fe', 0.5]} />

      <WoodFloor />
      <FloatingParticles />

      {/* 8 Rooms — with per-room furniture */}
      {AGENT_ORDER.map((aid) => {
        const pos = ROOM_3D_POSITIONS[aid]
        const config = AGENT_3D_CONFIG[aid]
        return (
          <OfficeRoom
            key={aid}
            position={pos}
            size={ROOM_SIZE}
            edgeColor={config.color}
            monitorColor={config.color}
            floorColor={ROOM_FLOOR_COLORS[aid]}
            agentId={aid}
            roomName={config.roomLabel}
          />
        )
      })}

      {/* Room Labels — above rooms */}
      {AGENT_ORDER.map((aid) => {
        const pos = ROOM_3D_POSITIONS[aid]
        const config = AGENT_3D_CONFIG[aid]
        return (
          <RoomLabel
            key={`label-${aid}`}
            position={[pos[0], 0.7, pos[2] - ROOM_SIZE[2] / 2 - 0.2]}
            text={config.roomLabel}
            color={config.color}
          />
        )
      })}

      {/* Agent characters — use animated positions from store */}
      {AGENT_ORDER.map((aid) => {
        const config = AGENT_3D_CONFIG[aid]
        const homePos = ROOM_3D_POSITIONS[aid]
        const targetPos = agentPositions[aid] ?? [homePos[0] + 0.4, homePos[1], homePos[2] + 0.3]
        return (
          <AgentBot
            key={`bot-${aid}`}
            agentId={aid}
            position={[homePos[0] + 0.4, homePos[1], homePos[2] + 0.3]}
            targetPosition={targetPos}
            color={config.color}
            accentColor={config.accentColor}
            accessory={config.accessory}
          />
        )
      })}

      {/* === Hallway decorations === */}
      {/* Center corridor plants */}
      <HallwayPlant position={[-0.5, 0, -5.0]} />
      <HallwayPlant position={[-0.5, 0, -1.8]} />
      <HallwayPlant position={[-0.5, 0, 1.4]} />
      <HallwayPlant position={[-0.5, 0, 4.6]} />

      {/* Floor lamps along corridors */}
      <FloorLamp position={[-0.5, 0, -3.4]} color="#fbbf24" />
      <FloorLamp position={[-0.5, 0, -0.2]} color="#a78bfa" />
      <FloorLamp position={[-0.5, 0, 3.0]} color="#34d399" />

      {/* Large potted trees on perimeter */}
      <LargePottedTree position={[-7.5, 0, -6.0]} />
      <LargePottedTree position={[6.5, 0, -6.0]} />
      <LargePottedTree position={[-7.5, 0, 6.0]} />
      <LargePottedTree position={[6.5, 0, 6.0]} />
      <LargePottedTree position={[-7.5, 0, 0]} />
      <LargePottedTree position={[6.5, 0, 0]} />

      {/* Water dispensers */}
      <WaterDispenser position={[6.5, 0, -3.0]} />
      <WaterDispenser position={[-7.5, 0, 3.0]} />

      {/* Benches in hallways */}
      <Bench position={[-0.5, 0, -6.5]} />
      <Bench position={[-0.5, 0, 6.5]} />

      {/* Vending machine */}
      <VendingMachine position={[6.5, 0, 3.0]} />

      {/* Fire extinguishers */}
      <FireExtinguisher position={[-7.2, 0, -3.0]} />
      <FireExtinguisher position={[6.2, 0, 1.0]} />

      {/* Trash cans */}
      <TrashCan position={[-0.5, 0.05, -3.8]} />
      <TrashCan position={[-0.5, 0.05, 3.2]} />

      {/* Directional signs */}
      <DirectionalSign position={[-0.5, 0, -7.0]} rotation={0} />
      <DirectionalSign position={[-0.5, 0, 7.0]} rotation={Math.PI} />

      {/* Ceiling beams for corridor feel */}
      <CeilingBeam position={[-0.5, 2.0, 0]} length={18} />
      <CeilingBeam position={[-4.5, 2.0, 0]} length={18} />
      <CeilingBeam position={[3.5, 2.0, 0]} length={18} />

      {/* Extra hallway plants */}
      <HallwayPlant position={[-7.0, 0, -1.0]} />
      <HallwayPlant position={[6.0, 0, -1.0]} />
      <HallwayPlant position={[-7.0, 0, 4.0]} />
      <HallwayPlant position={[6.0, 0, 4.0]} />

      {/* Speech bubbles */}
      {speechBubbles
        .filter(b => b.expiresAt > now)
        .map((b) => {
          const pos = agentPositions[b.agentId as AgentId]
          if (!pos) return null
          return (
            <AgentLabel
              key={`speech-${b.agentId}`}
              agentId={b.agentId as AgentId}
              position={pos}
              text={b.text}
            />
          )
        })}

      {/* Handoff beams kept for 2D — coordArrows still used for visual hints */}
      {coordArrows
        .filter(a => a.expiresAt > now)
        .map((a, i) => {
          const fromPos = agentPositions[a.from as AgentId]
          const toPos = agentPositions[a.to as AgentId]
          if (!fromPos || !toPos) return null
          return (
            <mesh key={`trail-${i}`} position={[(fromPos[0] + toPos[0]) / 2, 0.02, (fromPos[2] + toPos[2]) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.05, 0.08, 12]} />
              <meshStandardMaterial color="#a78bfa" emissive="#a78bfa" emissiveIntensity={0.5} transparent opacity={0.4} side={THREE.DoubleSide} />
            </mesh>
          )
        })}

      {/* Background */}
      <color attach="background" args={[theme === 'dark' ? '#1e1b2e' : '#f5f0e8']} />
      <fog attach="fog" args={[theme === 'dark' ? '#1e1b2e' : '#f5f0e8', 18, 35]} />

      <OrbitControls
        makeDefault
        enablePan
        enableZoom
        enableRotate
        minDistance={4}
        maxDistance={22}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.8}
        target={[-0.5, 0, 0]}
      />
    </>
  )
}
