import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { OrbitControls, Environment } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '../../store/useStore'
import { AGENT_ORDER, AGENT_3D_CONFIG, ROOM_3D_POSITIONS, ROOM_FLOOR_COLORS, ROOM_ROTATIONS } from '../../types'
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
      {/* Large wooden floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#8B7355" roughness={0.85} />
      </mesh>
      {/* Subtle plank lines */}
      {Array.from({ length: 80 }).map((_, i) => (
        <mesh key={`plank-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.018, -20 + i * 0.5]}>
          <planeGeometry args={[40, 0.006]} />
          <meshStandardMaterial color="#6B5B45" transparent opacity={0.25} />
        </mesh>
      ))}
      {/* Cross-grain lines */}
      {Array.from({ length: 28 }).map((_, i) => (
        <mesh key={`grain-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[-14 + i * 1.0, -0.017, 0]}>
          <planeGeometry args={[0.4, 40]} />
          <meshStandardMaterial
            color={i % 3 === 0 ? '#7a6a50' : '#6B5B45'}
            transparent
            opacity={0.15}
          />
        </mesh>
      ))}
    </group>
  )
}

// Rotate a local offset by Y-axis rotation
function rotateOffset(offset: [number, number, number], rotY: number): [number, number, number] {
  const cos = Math.cos(rotY)
  const sin = Math.sin(rotY)
  return [
    offset[0] * cos + offset[2] * sin,
    offset[1],
    -offset[0] * sin + offset[2] * cos,
  ]
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

const ROOM_SIZE: [number, number, number] = [5.0, 1.5, 3.4]

export function OfficeScene3D() {
  const speechBubbles = useStore(s => s.speechBubbles)
  const coordArrows = useStore(s => s.coordArrows)
  const agentPositions = useStore(s => s.agentPositions)
  const theme = useStore(s => s.theme)

  const now = Date.now()

  return (
    <>
      {/* Lighting — normal, clean */}
      <ambientLight intensity={1.0} />
      <directionalLight
        position={[20, 30, 10]}
        intensity={1.2}
        color="#ffffff"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />

      <Environment preset="city" />
      <WoodFloor />
      <FloatingParticles />

      {/* 8 Rooms — L-shape layout with per-room rotation */}
      {AGENT_ORDER.map((aid) => {
        const pos = ROOM_3D_POSITIONS[aid]
        const config = AGENT_3D_CONFIG[aid]
        const rotY = ROOM_ROTATIONS[aid]
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
            rotationY={rotY}
          />
        )
      })}

      {/* Agent characters — use rotation-aware home positions */}
      {AGENT_ORDER.map((aid) => {
        const config = AGENT_3D_CONFIG[aid]
        const homePos = ROOM_3D_POSITIONS[aid]
        const rotY = ROOM_ROTATIONS[aid]
        const localOffset: [number, number, number] = [0.4, 0, 0.3]
        const worldOffset = rotateOffset(localOffset, rotY)
        const homeWorld: [number, number, number] = [
          homePos[0] + worldOffset[0],
          homePos[1] + worldOffset[1],
          homePos[2] + worldOffset[2],
        ]
        const targetPos = agentPositions[aid] ?? homeWorld
        return (
          <AgentBot
            key={`bot-${aid}`}
            agentId={aid}
            position={homeWorld}
            targetPosition={targetPos}
            color={config.color}
            accentColor={config.accentColor}
            accessory={config.accessory}
          />
        )
      })}

      {/* === Hallway decorations — repositioned for L-shape layout === */}
      {/* Center area plants */}
      <HallwayPlant position={[0, 0, 0]} />
      <HallwayPlant position={[0, 0, 3.5]} />
      <HallwayPlant position={[-3.5, 0, 2.0]} />
      <HallwayPlant position={[3.5, 0, 2.0]} />

      {/* Floor lamps in corridors */}
      <FloorLamp position={[0, 0, -3.0]} color="#fbbf24" />
      <FloorLamp position={[-4.0, 0, 6.0]} color="#a78bfa" />
      <FloorLamp position={[4.0, 0, 6.0]} color="#34d399" />

      {/* Large potted trees on perimeter */}
      <LargePottedTree position={[-10.5, 0, -7.0]} />
      <LargePottedTree position={[10.5, 0, -7.0]} />
      <LargePottedTree position={[-10.5, 0, 2.0]} />
      <LargePottedTree position={[10.5, 0, 2.0]} />
      <LargePottedTree position={[-10.5, 0, 7.0]} />
      <LargePottedTree position={[10.5, 0, 7.0]} />
      <LargePottedTree position={[-10.5, 0, 12.0]} />
      <LargePottedTree position={[10.5, 0, 12.0]} />

      {/* Water dispensers */}
      <WaterDispenser position={[0, 0, 6.5]} />
      <WaterDispenser position={[-4.0, 0, -3.0]} />

      {/* Benches in central area */}
      <Bench position={[0, 0, -1.5]} />
      <Bench position={[0, 0, 5.5]} />

      {/* Vending machine */}
      <VendingMachine position={[4.0, 0, -3.0]} />

      {/* Fire extinguishers */}
      <FireExtinguisher position={[-10.0, 0, -3.5]} />
      <FireExtinguisher position={[10.0, 0, -3.5]} />

      {/* Trash cans */}
      <TrashCan position={[0, 0.05, 2.0]} />
      <TrashCan position={[-3.5, 0.05, 6.5]} />

      {/* Directional signs */}
      <DirectionalSign position={[0, 0, -3.5]} rotation={0} />
      <DirectionalSign position={[0, 0, 6.0]} rotation={Math.PI} />

      {/* Extra hallway plants around perimeter */}
      <HallwayPlant position={[-5.5, 0, -3.0]} />
      <HallwayPlant position={[5.5, 0, -3.0]} />
      <HallwayPlant position={[-4.0, 0, 10.0]} />
      <HallwayPlant position={[4.0, 0, 10.0]} />

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

      {/* Background — sky blue / dark navy */}
      <color attach="background" args={[theme === 'dark' ? '#0f172a' : '#bae6fd']} />

      <OrbitControls
        makeDefault
        enablePan
        enableZoom
        enableRotate
        minDistance={4}
        maxDistance={40}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.8}
        target={[0, 0, 3.0]}
      />
    </>
  )
}
