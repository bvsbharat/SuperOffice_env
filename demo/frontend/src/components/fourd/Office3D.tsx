import { useRef, useState, useEffect, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Html, Environment } from '@react-three/drei'
import * as THREE from 'three'
import type { Agent } from '../../types/fourd'
import { getAgentPos } from '../../constants/fourd'

interface Office3DProps {
  agents: Agent[]
  viewMode: 'birdsEye' | 'eagleEye' | '3d'
  zoomLevel: number
}

const SHIRT_COLORS = [
  '#3b82f6', '#10b981', '#a855f7', '#f43f5e',
  '#f59e0b', '#06b6d4', '#6366f1', '#ec4899',
]

const SKIN_TONES = ['#F5D0A9', '#8D5524', '#FFDBB4', '#C68642', '#F1C27D', '#E0AC69', '#D4A574', '#FFE0BD']
const HAIR_COLORS = ['#1a1a2e', '#2c1810', '#8B4513', '#4a2c2a', '#1a1a1a', '#6B3A2A', '#2c2c2c', '#D4A76A']
const EYE_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f97316', '#22d3ee', '#92400e', '#34d399', '#f472b6']

const OUTFIT_PRIMARY = ['#1e293b', '#7c3aed', '#ec4899', '#f97316', '#22d3ee', '#fbbf24', '#34d399', '#f472b6']
const OUTFIT_SECONDARY = ['#ffffff', '#ede9fe', '#fdf2f8', '#fff7ed', '#1e293b', '#ffffff', '#1e293b', '#fdf2f8']
const PANTS_COLORS = ['#1e293b', '#4c1d95', '#831843', '#78350f', '#1e293b', '#1e293b', '#374151', '#f472b6']
const PANTS_STYLE: ('trousers' | 'skirt')[] = ['trousers', 'skirt', 'trousers', 'trousers', 'trousers', 'trousers', 'trousers', 'skirt']

const to3D = (pctX: number, pctY: number): [number, number] => {
  const x = (pctX / 100) * 18 - 9
  const z = (pctY / 100) * 18 - 9
  return [x, z]
}

/* ── Hair styles per agent index ── */
function AgentHair({ index, hairColor }: { index: number; hairColor: THREE.Color }) {
  switch (index) {
    case 0: // CEO - slicked back
      return (
        <group>
          <mesh position={[0, 0.04, -0.02]} scale={[1, 0.7, 1]}>
            <sphereGeometry args={[0.125, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
            <meshStandardMaterial color={hairColor} roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.02, -0.06]} scale={[0.95, 0.6, 0.7]}>
            <sphereGeometry args={[0.12, 8, 6]} />
            <meshStandardMaterial color={hairColor} roughness={0.7} />
          </mesh>
        </group>
      )
    case 1: // HR - bob
      return (
        <group>
          <mesh position={[0, 0.04, -0.01]} scale={[1.05, 0.75, 1]}>
            <sphereGeometry args={[0.125, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
            <meshStandardMaterial color={hairColor} roughness={0.65} />
          </mesh>
          <mesh position={[-0.09, -0.05, 0]} scale={[0.55, 0.9, 0.65]}>
            <sphereGeometry args={[0.08, 6, 6]} />
            <meshStandardMaterial color={hairColor} roughness={0.65} />
          </mesh>
          <mesh position={[0.09, -0.05, 0]} scale={[0.55, 0.9, 0.65]}>
            <sphereGeometry args={[0.08, 6, 6]} />
            <meshStandardMaterial color={hairColor} roughness={0.65} />
          </mesh>
        </group>
      )
    case 2: // Marketing - updo with pink streak
      return (
        <group>
          <mesh position={[0, 0.06, -0.01]} scale={[1, 0.8, 0.95]}>
            <sphereGeometry args={[0.125, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
            <meshStandardMaterial color={hairColor} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.1, -0.02]} scale={[0.6, 0.5, 0.5]}>
            <sphereGeometry args={[0.08, 8, 6]} />
            <meshStandardMaterial color={hairColor} roughness={0.6} />
          </mesh>
          <mesh position={[0.05, 0.04, 0.08]} scale={[0.25, 0.65, 0.35]}>
            <sphereGeometry args={[0.08, 6, 6]} />
            <meshStandardMaterial color="#ec4899" roughness={0.5} />
          </mesh>
        </group>
      )
    case 3: // Content - messy
      return (
        <group>
          <mesh position={[0, 0.04, -0.01]} scale={[1.08, 0.7, 1.05]}>
            <sphereGeometry args={[0.125, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
            <meshStandardMaterial color={hairColor} roughness={0.75} />
          </mesh>
          <mesh position={[-0.10, 0.0, 0.05]} rotation={[0, 0, 0.3]} scale={[0.3, 0.7, 0.3]}>
            <sphereGeometry args={[0.05, 5, 5]} />
            <meshStandardMaterial color={hairColor} roughness={0.75} />
          </mesh>
          <mesh position={[0.09, -0.01, 0.04]} rotation={[0, 0, -0.2]} scale={[0.3, 0.6, 0.3]}>
            <sphereGeometry args={[0.05, 5, 5]} />
            <meshStandardMaterial color={hairColor} roughness={0.75} />
          </mesh>
        </group>
      )
    case 4: // Dev - spiky
      return (
        <group>
          <mesh position={[0, 0.04, 0]} scale={[1, 0.6, 1]}>
            <sphereGeometry args={[0.125, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
            <meshStandardMaterial color={hairColor} roughness={0.7} />
          </mesh>
          {([[-0.05, 0.09, 0.03], [0.04, 0.1, 0.01], [-0.01, 0.11, -0.04], [0.06, 0.08, -0.02], [-0.03, 0.1, -0.01]] as [number, number, number][]).map((pos, i) => (
            <mesh key={i} position={pos}>
              <coneGeometry args={[0.025, 0.05, 4]} />
              <meshStandardMaterial color={hairColor} roughness={0.7} />
            </mesh>
          ))}
        </group>
      )
    case 5: // Sales - side-part
      return (
        <group>
          <mesh position={[0, 0.04, -0.01]} scale={[1, 0.7, 1]}>
            <sphereGeometry args={[0.125, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
            <meshStandardMaterial color={hairColor} roughness={0.6} />
          </mesh>
          <mesh position={[-0.06, 0.06, 0.05]} scale={[0.55, 0.4, 0.45]}>
            <sphereGeometry args={[0.1, 6, 6]} />
            <meshStandardMaterial color={hairColor} roughness={0.6} />
          </mesh>
          <mesh position={[-0.04, 0.07, 0.07]} scale={[0.35, 0.3, 0.3]}>
            <sphereGeometry args={[0.08, 6, 6]} />
            <meshStandardMaterial color={hairColor} roughness={0.6} />
          </mesh>
        </group>
      )
    case 6: // Customer - long flowing
    default:
      return (
        <group>
          <mesh position={[0, 0.04, -0.01]} scale={[1.05, 0.75, 1]}>
            <sphereGeometry args={[0.125, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
            <meshStandardMaterial color={hairColor} roughness={0.55} />
          </mesh>
          <mesh position={[-0.09, -0.09, -0.02]} scale={[0.45, 1.2, 0.55]}>
            <sphereGeometry args={[0.07, 6, 6]} />
            <meshStandardMaterial color={hairColor} roughness={0.55} />
          </mesh>
          <mesh position={[0.09, -0.09, -0.02]} scale={[0.45, 1.2, 0.55]}>
            <sphereGeometry args={[0.07, 6, 6]} />
            <meshStandardMaterial color={hairColor} roughness={0.55} />
          </mesh>
          <mesh position={[0, -0.06, -0.06]} scale={[0.85, 1.15, 0.55]}>
            <sphereGeometry args={[0.08, 6, 6]} />
            <meshStandardMaterial color={hairColor} roughness={0.55} />
          </mesh>
        </group>
      )
  }
}

/* ── Humanoid head with face + hair ── */
function HumanHead({ skinColor, hairColor, eyeColor, index }: { skinColor: THREE.Color; hairColor: THREE.Color; eyeColor: string; index: number }) {
  return (
    <group position={[0, 0.58, 0]}>
      {/* Head sphere */}
      <mesh>
        <sphereGeometry args={[0.12, 12, 10]} />
        <meshStandardMaterial color={skinColor} roughness={0.6} metalness={0.05} />
      </mesh>
      {/* Left eye */}
      <mesh position={[-0.04, 0.015, 0.1]} scale={[1, 1.3, 0.6]}>
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshStandardMaterial color="#ffffff" roughness={0.3} />
      </mesh>
      <mesh position={[-0.04, 0.02, 0.115]} scale={[1, 1.2, 0.5]}>
        <sphereGeometry args={[0.016, 8, 8]} />
        <meshStandardMaterial color={eyeColor} roughness={0.2} />
      </mesh>
      <mesh position={[-0.04, 0.022, 0.125]}>
        <sphereGeometry args={[0.008, 6, 6]} />
        <meshStandardMaterial color="#1a1a2e" roughness={0.1} />
      </mesh>
      <mesh position={[-0.035, 0.03, 0.128]}>
        <sphereGeometry args={[0.004, 4, 4]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.6} />
      </mesh>
      {/* Left eyebrow */}
      <mesh position={[-0.04, 0.052, 0.105]} rotation={[0, 0, 0.1]} scale={[1, 0.3, 0.3]}>
        <boxGeometry args={[0.04, 0.01, 0.01]} />
        <meshStandardMaterial color={hairColor} roughness={0.5} />
      </mesh>
      {/* Right eye */}
      <mesh position={[0.04, 0.015, 0.1]} scale={[1, 1.3, 0.6]}>
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshStandardMaterial color="#ffffff" roughness={0.3} />
      </mesh>
      <mesh position={[0.04, 0.02, 0.115]} scale={[1, 1.2, 0.5]}>
        <sphereGeometry args={[0.016, 8, 8]} />
        <meshStandardMaterial color={eyeColor} roughness={0.2} />
      </mesh>
      <mesh position={[0.04, 0.022, 0.125]}>
        <sphereGeometry args={[0.008, 6, 6]} />
        <meshStandardMaterial color="#1a1a2e" roughness={0.1} />
      </mesh>
      <mesh position={[0.045, 0.03, 0.128]}>
        <sphereGeometry args={[0.004, 4, 4]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.6} />
      </mesh>
      {/* Right eyebrow */}
      <mesh position={[0.04, 0.052, 0.105]} rotation={[0, 0, -0.1]} scale={[1, 0.3, 0.3]}>
        <boxGeometry args={[0.04, 0.01, 0.01]} />
        <meshStandardMaterial color={hairColor} roughness={0.5} />
      </mesh>
      {/* Nose */}
      <mesh position={[0, -0.005, 0.12]}>
        <sphereGeometry args={[0.006, 5, 5]} />
        <meshStandardMaterial color={skinColor.clone().lerp(new THREE.Color('#cc8866'), 0.2)} roughness={0.5} />
      </mesh>
      {/* Mouth */}
      <mesh position={[0, -0.03, 0.11]} rotation={[0.2, 0, 0]} scale={[1.2, 0.4, 0.5]}>
        <sphereGeometry args={[0.015, 8, 6]} />
        <meshStandardMaterial color="#e88a9a" roughness={0.5} />
      </mesh>
      {/* Ears */}
      <mesh position={[-0.115, 0.0, 0]} scale={[0.5, 1, 0.6]}>
        <sphereGeometry args={[0.03, 6, 6]} />
        <meshStandardMaterial color={skinColor} roughness={0.6} />
      </mesh>
      <mesh position={[0.115, 0.0, 0]} scale={[0.5, 1, 0.6]}>
        <sphereGeometry args={[0.03, 6, 6]} />
        <meshStandardMaterial color={skinColor} roughness={0.6} />
      </mesh>
      {/* Hair */}
      <AgentHair index={index} hairColor={hairColor} />
    </group>
  )
}

/* ── Roblox-style Agent ── */
function Agent3D({ agent, index, agents }: { agent: Agent; index: number; agents: Agent[] }) {
  const groupRef = useRef<THREE.Group>(null)
  const leftArmRef = useRef<THREE.Group>(null)
  const rightArmRef = useRef<THREE.Group>(null)
  const leftLegRef = useRef<THREE.Group>(null)
  const rightLegRef = useRef<THREE.Group>(null)
  const [displayMsg, setDisplayMsg] = useState<string | undefined>(agent.lastMessage || agent.currentTask)

  useEffect(() => {
    const msg = agent.lastMessage || agent.currentTask
    if (msg) setDisplayMsg(msg)
  }, [agent.lastMessage, agent.currentTask])

  const skinColor = useMemo(() => new THREE.Color(SKIN_TONES[index % SKIN_TONES.length]), [index])
  const hairColor = useMemo(() => new THREE.Color(HAIR_COLORS[index % HAIR_COLORS.length]), [index])
  const eyeColor = EYE_COLORS[index % EYE_COLORS.length]
  const outfitPrimary = OUTFIT_PRIMARY[index % OUTFIT_PRIMARY.length]
  const outfitSecondary = OUTFIT_SECONDARY[index % OUTFIT_SECONDARY.length]
  const pantsColor = PANTS_COLORS[index % PANTS_COLORS.length]
  const pantsStyle = PANTS_STYLE[index % PANTS_STYLE.length]

  const { col, row } = getAgentPos(index)
  const homeX = 16.66 + col * 33.33
  const homeY = 16.66 + row * 33.33

  let targetPctX = homeX
  let targetPctY = homeY
  let targetRotY = 0

  // Default facing direction
  if (col === 0) targetRotY = -Math.PI / 2
  else if (col === 2) targetRotY = Math.PI / 2
  else if (row === 2) targetRotY = Math.PI
  else if (col === 1 && row === 1) targetRotY = 0

  if (agent.status === 'working') {
    targetPctX = homeX
    targetPctY = homeY
  } else if (agent.status === 'success') {
    targetPctX = homeX + 2
    targetPctY = homeY + 2
  } else if (agent.talkingTo) {
    const targetIndex = agents.findIndex(a => a.id === agent.talkingTo)
    if (targetIndex !== -1 && targetIndex !== index) {
      const { col: tCol, row: tRow } = getAgentPos(targetIndex)
      const tCenterX = 16.66 + tCol * 33.33
      const tCenterY = 16.66 + tRow * 33.33
      // Walk TO the target's cubicle (offset slightly so they stand beside the desk)
      targetPctX = tCenterX + (index % 2 === 0 ? -5 : 5)
      targetPctY = tCenterY + (index % 2 === 0 ? 3 : -3)
      targetRotY = Math.atan2(tCenterX - targetPctX, tCenterY - targetPctY)
    }
  }

  const [targetX, targetZ] = to3D(targetPctX, targetPctY)

  useFrame((state, delta) => {
    if (!groupRef.current) return
    const t = state.clock.elapsedTime

    const prevX = groupRef.current.position.x
    const prevZ = groupRef.current.position.z
    groupRef.current.position.x = THREE.MathUtils.lerp(prevX, targetX, 3 * delta)
    groupRef.current.position.z = THREE.MathUtils.lerp(prevZ, targetZ, 3 * delta)

    const dx = groupRef.current.position.x - prevX
    const dz = groupRef.current.position.z - prevZ
    const isMoving = Math.sqrt(dx * dx + dz * dz) > 0.005

    // Rotation
    const currentRot = groupRef.current.rotation.y
    let diff = targetRotY - currentRot
    while (diff < -Math.PI) diff += Math.PI * 2
    while (diff > Math.PI) diff -= Math.PI * 2
    groupRef.current.rotation.y += diff * 3 * delta

    // Y position: walking bounce or working bob or idle
    if (isMoving) {
      groupRef.current.position.y = 0.5 + Math.abs(Math.sin(t * 8)) * 0.04
    } else if (agent.status === 'working') {
      groupRef.current.position.y = 0.5 + Math.sin(t * 8) * 0.06
    } else {
      groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, 0.5, 3 * delta)
    }

    // Arm animations
    if (leftArmRef.current && rightArmRef.current) {
      if (isMoving) {
        leftArmRef.current.rotation.z = 0.2 + Math.sin(t * 8) * 0.4
        rightArmRef.current.rotation.z = -0.2 - Math.sin(t * 8 + Math.PI) * 0.4
      } else if (agent.status === 'working') {
        leftArmRef.current.rotation.z = 0.3 + Math.sin(t * 6) * 0.15
        rightArmRef.current.rotation.z = -0.3 - Math.sin(t * 6 + 1.2) * 0.15
      } else {
        leftArmRef.current.rotation.z = 0.15 + Math.sin(t * 1.0) * 0.08
        rightArmRef.current.rotation.z = -0.15 - Math.sin(t * 1.0 + Math.PI) * 0.08
      }
    }

    // Leg animations
    if (leftLegRef.current && rightLegRef.current) {
      if (isMoving) {
        leftLegRef.current.rotation.x = Math.sin(t * 8) * 0.3
        rightLegRef.current.rotation.x = Math.sin(t * 8 + Math.PI) * 0.3
      } else {
        leftLegRef.current.rotation.x = THREE.MathUtils.lerp(leftLegRef.current.rotation.x, 0, 5 * delta)
        rightLegRef.current.rotation.x = THREE.MathUtils.lerp(rightLegRef.current.rotation.x, 0, 5 * delta)
      }
    }
  })

  const color = SHIRT_COLORS[index % SHIRT_COLORS.length]
  const bubbleText = agent.currentTask || displayMsg || agent.lastMessage
  const showBubble = !!(bubbleText && agent.status !== 'success' && (agent.status === 'working' || agent.talkingTo || agent.lastMessage))

  return (
    <group ref={groupRef} position={[targetX, 0.5, targetZ]} scale={1.6}>
      {/* === LEGS === */}
      <group ref={leftLegRef} position={[-0.06, 0.2, 0]}>
        {/* Upper leg */}
        <mesh position={[0, -0.06, 0]}>
          <capsuleGeometry args={[0.04, 0.12, 4, 6]} />
          <meshStandardMaterial color={pantsColor} roughness={0.7} />
        </mesh>
        {/* Lower leg */}
        <mesh position={[0, -0.16, 0]}>
          <capsuleGeometry args={[0.03, 0.1, 4, 6]} />
          <meshStandardMaterial color={skinColor} roughness={0.6} />
        </mesh>
        {/* Shoe */}
        <mesh position={[0, -0.23, 0.015]}>
          <boxGeometry args={[0.055, 0.03, 0.07]} />
          <meshStandardMaterial color="#1a1a2e" roughness={0.7} />
        </mesh>
      </group>
      <group ref={rightLegRef} position={[0.06, 0.2, 0]}>
        <mesh position={[0, -0.06, 0]}>
          <capsuleGeometry args={[0.04, 0.12, 4, 6]} />
          <meshStandardMaterial color={pantsColor} roughness={0.7} />
        </mesh>
        <mesh position={[0, -0.16, 0]}>
          <capsuleGeometry args={[0.03, 0.1, 4, 6]} />
          <meshStandardMaterial color={skinColor} roughness={0.6} />
        </mesh>
        <mesh position={[0, -0.23, 0.015]}>
          <boxGeometry args={[0.055, 0.03, 0.07]} />
          <meshStandardMaterial color="#1a1a2e" roughness={0.7} />
        </mesh>
      </group>
      {/* Skirt overlay for skirt agents */}
      {pantsStyle === 'skirt' && (
        <mesh position={[0, 0.22, 0]}>
          <capsuleGeometry args={[0.08, 0.08, 6, 8]} />
          <meshStandardMaterial color={pantsColor} roughness={0.6} />
        </mesh>
      )}

      {/* === NECK === */}
      <mesh position={[0, 0.50, 0]}>
        <cylinderGeometry args={[0.03, 0.035, 0.04, 6]} />
        <meshStandardMaterial color={skinColor} roughness={0.6} />
      </mesh>

      {/* === TORSO (skin base) === */}
      <mesh position={[0, 0.38, 0]}>
        <capsuleGeometry args={[0.09, 0.14, 6, 8]} />
        <meshStandardMaterial color={skinColor} roughness={0.6} />
      </mesh>
      {/* === CLOTHING OVERLAY === */}
      <mesh position={[0, 0.38, 0]}>
        <capsuleGeometry args={[0.1, 0.16, 6, 8]} />
        <meshStandardMaterial color={outfitPrimary} roughness={0.7} />
      </mesh>
      {/* Collar / secondary detail */}
      <mesh position={[0, 0.47, 0.06]} scale={[1.2, 0.5, 0.8]}>
        <boxGeometry args={[0.08, 0.02, 0.02]} />
        <meshStandardMaterial color={outfitSecondary} roughness={0.5} />
      </mesh>

      {/* === HEAD === */}
      <HumanHead skinColor={skinColor} hairColor={hairColor} eyeColor={eyeColor} index={index} />

      {/* === ARMS === */}
      <group ref={leftArmRef} position={[-0.14, 0.42, 0]}>
        <mesh position={[0, -0.04, 0]}>
          <capsuleGeometry args={[0.03, 0.1, 4, 6]} />
          <meshStandardMaterial color={outfitPrimary} roughness={0.7} />
        </mesh>
        <mesh position={[0, -0.13, 0]}>
          <capsuleGeometry args={[0.025, 0.08, 4, 6]} />
          <meshStandardMaterial color={skinColor} roughness={0.6} />
        </mesh>
        <mesh position={[0, -0.19, 0]}>
          <sphereGeometry args={[0.022, 6, 6]} />
          <meshStandardMaterial color={skinColor} roughness={0.6} />
        </mesh>
      </group>
      <group ref={rightArmRef} position={[0.14, 0.42, 0]}>
        <mesh position={[0, -0.04, 0]}>
          <capsuleGeometry args={[0.03, 0.1, 4, 6]} />
          <meshStandardMaterial color={outfitPrimary} roughness={0.7} />
        </mesh>
        <mesh position={[0, -0.13, 0]}>
          <capsuleGeometry args={[0.025, 0.08, 4, 6]} />
          <meshStandardMaterial color={skinColor} roughness={0.6} />
        </mesh>
        <mesh position={[0, -0.19, 0]}>
          <sphereGeometry args={[0.022, 6, 6]} />
          <meshStandardMaterial color={skinColor} roughness={0.6} />
        </mesh>
      </group>

      {/* Glow when working */}
      {agent.status === 'working' && (
        <pointLight position={[0, 1.5, 0]} color={color} intensity={2} distance={3} />
      )}

      {/* Speech bubble only (no name badge — name is on desk nameplate) */}
      {showBubble && bubbleText && (
        <Html
          position={[0, 1.18, 0]}
          center
          zIndexRange={[100, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div style={{
            position: 'relative',
            background: agent.status === 'working' ? '#4f46e5' : '#ffffff',
            color: agent.status === 'working' ? '#ffffff' : '#1e293b',
            fontSize: 11,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            padding: '8px 12px',
            borderRadius: 12,
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            fontWeight: 500,
            width: 180,
            lineHeight: 1.4,
            border: agent.status === 'working' ? '2px solid #818cf8' : '2px solid #cbd5e1',
            textAlign: 'center' as const,
            wordWrap: 'break-word' as const,
          }}>
            {bubbleText}
            <div style={{
              position: 'absolute',
              bottom: -8,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '8px solid transparent',
              borderRight: '8px solid transparent',
              borderTop: `8px solid ${agent.status === 'working' ? '#4f46e5' : '#ffffff'}`,
            }} />
          </div>
        </Html>
      )}
    </group>
  )
}

function Room({ col, row, agent }: { col: number; row: number; agent: Agent }) {
  const x = (col - 1) * 6
  const z = (row - 1) * 6

  const wallColor = '#cbd5e1'
  let floorColor = '#e2e8f0'
  let deskColor = '#b45309'

  if (agent.type.includes('CEO')) {
    floorColor = '#1e293b'; deskColor = '#0f172a'
  } else if (agent.type.includes('Dev')) {
    floorColor = '#0f172a'; deskColor = '#1e293b'
  } else if (agent.type.includes('Sales') || agent.type.includes('Marketing')) {
    floorColor = '#bfdbfe'; deskColor = '#1e3a8a'
  } else if (agent.type.includes('Content')) {
    floorColor = '#e9d5ff'; deskColor = '#581c87'
  } else if (agent.type.includes('Scene')) {
    floorColor = '#a7f3d0'; deskColor = '#065f46'
  } else {
    floorColor = '#fed7aa'; deskColor = '#7c2d12'
  }

  let deskPos: [number, number, number] = [0, 0.4, 0]
  let deskRot: [number, number, number] = [0, 0, 0]
  let monitorPos: [number, number, number] = [0, 1.0, 0]
  let screenPos: [number, number, number] = [0, 1.0, 0]
  let screenRot: [number, number, number] = [0, 0, 0]

  if (col === 0) {
    deskPos = [-1.5, 0.4, 0]; deskRot = [0, Math.PI / 2, 0]
    monitorPos = [-1.8, 1.0, 0]; screenPos = [-1.74, 1.0, 0]; screenRot = [0, Math.PI / 2, 0]
  } else if (col === 2) {
    deskPos = [1.5, 0.4, 0]; deskRot = [0, -Math.PI / 2, 0]
    monitorPos = [1.8, 1.0, 0]; screenPos = [1.74, 1.0, 0]; screenRot = [0, -Math.PI / 2, 0]
  } else if (row === 2) {
    deskPos = [0, 0.4, 1.5]; deskRot = [0, 0, 0]
    monitorPos = [0, 1.0, 1.8]; screenPos = [0, 1.0, 1.74]; screenRot = [0, Math.PI, 0]
  } else if (col === 1 && row === 1) {
    deskPos = [0, 0.4, -1.0]; deskRot = [0, 0, 0]
    monitorPos = [0, 1.0, -1.3]; screenPos = [0, 1.0, -1.24]; screenRot = [0, 0, 0]
  }

  const screenColor = agent.status === 'working' ? '#22d3ee' : '#38bdf8'

  return (
    <group position={[x, 0, z]}>
      <mesh receiveShadow position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[5.8, 5.8]} />
        <meshStandardMaterial color={floorColor} />
      </mesh>
      {agent.type.includes('CEO') && (
        <mesh receiveShadow position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[4, 4]} />
          <meshStandardMaterial color="#7f1d1d" />
        </mesh>
      )}
      {row === 0 && (
        <mesh castShadow receiveShadow position={[0, 1, -2.9]}>
          <boxGeometry args={[6, 2, 0.2]} />
          <meshStandardMaterial color={wallColor} />
        </mesh>
      )}
      {row === 2 && (
        <mesh castShadow receiveShadow position={[0, 1, 2.9]}>
          <boxGeometry args={[6, 2, 0.2]} />
          <meshStandardMaterial color={wallColor} />
        </mesh>
      )}
      {col === 0 && (
        <mesh castShadow receiveShadow position={[-2.9, 1, 0]}>
          <boxGeometry args={[0.2, 2, 6]} />
          <meshStandardMaterial color={wallColor} />
        </mesh>
      )}
      {col === 2 && (
        <mesh castShadow receiveShadow position={[2.9, 1, 0]}>
          <boxGeometry args={[0.2, 2, 6]} />
          <meshStandardMaterial color={wallColor} />
        </mesh>
      )}
      {col < 2 && (
        <mesh castShadow receiveShadow position={[2.9, 1, 1.5]}>
          <boxGeometry args={[0.1, 2, 3]} />
          <meshPhysicalMaterial color="#ffffff" transmission={0.9} opacity={1} transparent roughness={0.1} />
        </mesh>
      )}
      {row < 2 && (
        <mesh castShadow receiveShadow position={[-1.5, 1, 2.9]}>
          <boxGeometry args={[3, 2, 0.1]} />
          <meshPhysicalMaterial color="#ffffff" transmission={0.9} opacity={1} transparent roughness={0.1} />
        </mesh>
      )}
      {col === 1 && row === 1 && (
        <mesh castShadow receiveShadow position={[-1.5, 1, -2.9]}>
          <boxGeometry args={[3, 2, 0.1]} />
          <meshPhysicalMaterial color="#ffffff" transmission={0.9} opacity={1} transparent roughness={0.1} />
        </mesh>
      )}
      {/* Desk */}
      <mesh castShadow receiveShadow position={deskPos} rotation={deskRot}>
        <boxGeometry args={[3, 0.8, 1.2]} />
        <meshStandardMaterial color={deskColor} />
      </mesh>
      {/* Monitor */}
      <mesh castShadow receiveShadow position={monitorPos} rotation={screenRot}>
        <boxGeometry args={[1.2, 0.8, 0.1]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
      {/* Screen glow */}
      <mesh position={screenPos} rotation={screenRot}>
        <planeGeometry args={[1.1, 0.7]} />
        <meshBasicMaterial color={screenColor} />
      </mesh>

      {/* Desk Nameplate */}
      <group position={[deskPos[0], deskPos[1] + 0.45, deskPos[2]]}>
        <Html
          center
          distanceFactor={18}
          zIndexRange={[50, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div style={{
            background: '#ffffff',
            color: '#1a1a2e',
            fontSize: 11,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 4,
            border: '1.5px solid #fbbf24',
            whiteSpace: 'nowrap',
            textAlign: 'center',
            boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
          }}>
            {agent.icon} {agent.type}
          </div>
        </Html>
      </group>
    </group>
  )
}

function Lobby() {
  return (
    <group position={[0, 0, -6]}>
      <mesh receiveShadow position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[5.8, 5.8]} />
        <meshStandardMaterial color="#cbd5e1" />
      </mesh>
      <mesh castShadow receiveShadow position={[-2, 1, -2.9]}>
        <boxGeometry args={[2, 2, 0.2]} />
        <meshStandardMaterial color="#94a3b8" />
      </mesh>
      <mesh castShadow receiveShadow position={[2, 1, -2.9]}>
        <boxGeometry args={[2, 2, 0.2]} />
        <meshStandardMaterial color="#94a3b8" />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 1, -2.9]}>
        <boxGeometry args={[2, 2, 0.1]} />
        <meshPhysicalMaterial color="#ffffff" transmission={0.9} opacity={1} transparent roughness={0.1} />
      </mesh>
      <mesh castShadow receiveShadow position={[0.8, 1, -2.8]}>
        <boxGeometry args={[0.1, 0.4, 0.1]} />
        <meshStandardMaterial color="#333333" />
      </mesh>
      <mesh castShadow receiveShadow position={[-1.5, 0.5, 0]}>
        <boxGeometry args={[1, 1, 3]} />
        <meshStandardMaterial color="#92400e" />
      </mesh>
      <group position={[2, 0, -1.5]}>
        <mesh castShadow receiveShadow position={[0, 1, 0]}>
          <boxGeometry args={[1, 2, 1]} />
          <meshStandardMaterial color="#581c87" />
        </mesh>
        <mesh position={[-0.51, 1.2, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[0.8, 0.6]} />
          <meshBasicMaterial color="#22d3ee" />
        </mesh>
      </group>
      <mesh castShadow receiveShadow position={[2, 0.4, 1.5]}>
        <boxGeometry args={[1, 0.8, 2]} />
        <meshStandardMaterial color="#4338ca" />
      </mesh>
    </group>
  )
}

// Pre-computed tree positions outside the office footprint
const TREE_POSITIONS: [number, number][] = [
  [-16, -12], [-20, -4], [-18, 6], [-14, 14], [-22, 10],
  [16, -12], [20, -4], [18, 6], [14, 14], [22, 10],
  [-12, -16], [0, -18], [12, -16], [-8, 18], [8, 18],
  [-24, 0], [24, 0], [-16, -20], [16, -20], [0, 22],
]

function Trees() {
  return (
    <group>
      {TREE_POSITIONS.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh castShadow receiveShadow position={[0, 1, 0]}>
            <cylinderGeometry args={[0.4, 0.6, 2]} />
            <meshStandardMaterial color="#78350f" />
          </mesh>
          <mesh castShadow receiveShadow position={[0, 3, 0]}>
            <sphereGeometry args={[2, 16, 16]} />
            <meshStandardMaterial color="#15803d" />
          </mesh>
        </group>
      ))}
    </group>
  )
}

export default function Office3D({ agents }: Office3DProps) {
  return (
    <div className="w-full h-full bg-sky-200">
      <Canvas shadows={{ type: THREE.PCFShadowMap }} camera={{ position: [-18, 16, 18], fov: 45 }}>
        <ambientLight intensity={0.6} />
        <directionalLight
          castShadow
          position={[20, 30, 10]}
          intensity={1.5}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-20}
          shadow-camera-right={20}
          shadow-camera-top={20}
          shadow-camera-bottom={-20}
        />
        <Environment preset="city" />

        {/* Ground */}
        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
          <planeGeometry args={[100, 100]} />
          <meshStandardMaterial color="#86efac" />
        </mesh>

        {/* Office Base */}
        <mesh receiveShadow position={[0, 0, 0]}>
          <boxGeometry args={[18.2, 0.2, 18.2]} />
          <meshStandardMaterial color="#475569" />
        </mesh>

        <Lobby />

        {agents.map((agent, i) => {
          const { col, row } = getAgentPos(i)
          return <Room key={`room-${i}`} col={col} row={row} agent={agent} />
        })}

        {agents.map((agent, i) => (
          <Agent3D key={agent.id} agent={agent} index={i} agents={agents} />
        ))}

        <Trees />

        {/* OrbitControls: zoom, pan, rotate freely */}
        <OrbitControls
          makeDefault
          maxPolarAngle={Math.PI / 2 - 0.05}
          minDistance={8}
          maxDistance={50}
          enablePan
          enableZoom
        />
      </Canvas>
    </div>
  )
}
