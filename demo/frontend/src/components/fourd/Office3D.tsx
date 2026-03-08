import { useRef, useState, useEffect } from 'react'
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

const AGENT_GLOW_COLORS = [
  '#6366f1', '#10b981', '#ec4899', '#f59e0b',
  '#a855f7', '#06b6d4', '#f43f5e',
]

const FUR_BROWN = '#8B6914'
const FUR_DARK = '#6B4E12'
const FACE_CREAM = '#F5E6C8'
const EYE_PATCH = '#3D2B1F'
const NOSE_BLACK = '#1a1a1a'

const to3D = (pctX: number, pctY: number): [number, number] => {
  const x = (pctX / 100) * 18 - 9
  const z = (pctY / 100) * 18 - 9
  return [x, z]
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max - 1) + '\u2026'
}

/* ── Sloth Base Body (shared by all agents) ── */
function SlothBody() {
  return (
    <group>
      {/* Chubby round body */}
      <mesh castShadow position={[0, 0.22, 0]}>
        <sphereGeometry args={[0.2, 14, 12]} />
        <meshStandardMaterial color={FUR_BROWN} roughness={0.8} />
      </mesh>
      {/* Belly patch */}
      <mesh position={[0, 0.2, 0.14]}>
        <sphereGeometry args={[0.13, 10, 10]} />
        <meshStandardMaterial color={FACE_CREAM} roughness={0.75} />
      </mesh>
      {/* Left arm (stubby) */}
      <mesh castShadow position={[-0.18, 0.18, 0]} rotation={[0, 0, 0.5]}>
        <capsuleGeometry args={[0.055, 0.1, 4, 6]} />
        <meshStandardMaterial color={FUR_DARK} roughness={0.8} />
      </mesh>
      {/* Left claw */}
      <mesh position={[-0.26, 0.12, 0]}>
        <sphereGeometry args={[0.035, 6, 6]} />
        <meshStandardMaterial color={FUR_DARK} roughness={0.8} />
      </mesh>
      {/* Right arm (stubby) */}
      <mesh castShadow position={[0.18, 0.18, 0]} rotation={[0, 0, -0.5]}>
        <capsuleGeometry args={[0.055, 0.1, 4, 6]} />
        <meshStandardMaterial color={FUR_DARK} roughness={0.8} />
      </mesh>
      {/* Right claw */}
      <mesh position={[0.26, 0.12, 0]}>
        <sphereGeometry args={[0.035, 6, 6]} />
        <meshStandardMaterial color={FUR_DARK} roughness={0.8} />
      </mesh>
      {/* Left leg */}
      <mesh castShadow position={[-0.1, 0.02, 0.04]}>
        <sphereGeometry args={[0.065, 8, 6]} />
        <meshStandardMaterial color={FUR_DARK} roughness={0.8} />
      </mesh>
      {/* Right leg */}
      <mesh castShadow position={[0.1, 0.02, 0.04]}>
        <sphereGeometry args={[0.065, 8, 6]} />
        <meshStandardMaterial color={FUR_DARK} roughness={0.8} />
      </mesh>
    </group>
  )
}

/* ── Sloth Head (cute face with eye patches) ── */
function SlothHead() {
  return (
    <group position={[0, 0.48, 0]}>
      {/* Head */}
      <mesh castShadow>
        <sphereGeometry args={[0.16, 14, 12]} />
        <meshStandardMaterial color={FUR_BROWN} roughness={0.8} />
      </mesh>
      {/* Face mask (cream) */}
      <mesh position={[0, -0.02, 0.1]}>
        <sphereGeometry args={[0.12, 10, 10]} />
        <meshStandardMaterial color={FACE_CREAM} roughness={0.7} />
      </mesh>
      {/* Left eye patch (dark) */}
      <mesh position={[-0.055, 0.02, 0.12]} scale={[1.4, 1.6, 0.5]}>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshStandardMaterial color={EYE_PATCH} roughness={0.6} />
      </mesh>
      {/* Left eye (white) */}
      <mesh position={[-0.055, 0.025, 0.145]} scale={[1, 1.2, 0.5]}>
        <sphereGeometry args={[0.02, 8, 8]} />
        <meshStandardMaterial color="#ffffff" roughness={0.3} />
      </mesh>
      {/* Left pupil */}
      <mesh position={[-0.05, 0.028, 0.155]}>
        <sphereGeometry args={[0.01, 6, 6]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.2} />
      </mesh>
      {/* Left eye shine */}
      <mesh position={[-0.045, 0.035, 0.16]}>
        <sphereGeometry args={[0.004, 4, 4]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      {/* Right eye patch (dark) */}
      <mesh position={[0.055, 0.02, 0.12]} scale={[1.4, 1.6, 0.5]}>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshStandardMaterial color={EYE_PATCH} roughness={0.6} />
      </mesh>
      {/* Right eye (white) */}
      <mesh position={[0.055, 0.025, 0.145]} scale={[1, 1.2, 0.5]}>
        <sphereGeometry args={[0.02, 8, 8]} />
        <meshStandardMaterial color="#ffffff" roughness={0.3} />
      </mesh>
      {/* Right pupil */}
      <mesh position={[0.05, 0.028, 0.155]}>
        <sphereGeometry args={[0.01, 6, 6]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.2} />
      </mesh>
      {/* Right eye shine */}
      <mesh position={[0.055, 0.035, 0.16]}>
        <sphereGeometry args={[0.004, 4, 4]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      {/* Nose */}
      <mesh position={[0, -0.02, 0.17]}>
        <sphereGeometry args={[0.02, 8, 8]} />
        <meshStandardMaterial color={NOSE_BLACK} roughness={0.4} />
      </mesh>
      {/* Nose shine */}
      <mesh position={[0.005, -0.012, 0.185]}>
        <sphereGeometry args={[0.005, 4, 4]} />
        <meshBasicMaterial color="#555555" />
      </mesh>
      {/* Mouth line (smile) */}
      <mesh position={[0, -0.045, 0.155]} rotation={[0.3, 0, 0]} scale={[1.5, 0.3, 0.3]}>
        <torusGeometry args={[0.015, 0.003, 4, 8, Math.PI]} />
        <meshStandardMaterial color="#5a3825" roughness={0.5} />
      </mesh>
      {/* Left ear */}
      <mesh position={[-0.12, 0.08, 0]} scale={[0.8, 1, 0.6]}>
        <sphereGeometry args={[0.04, 6, 6]} />
        <meshStandardMaterial color={FUR_BROWN} roughness={0.8} />
      </mesh>
      {/* Right ear */}
      <mesh position={[0.12, 0.08, 0]} scale={[0.8, 1, 0.6]}>
        <sphereGeometry args={[0.04, 6, 6]} />
        <meshStandardMaterial color={FUR_BROWN} roughness={0.8} />
      </mesh>
      {/* Forehead tuft */}
      <mesh position={[0, 0.14, 0.04]} rotation={[-0.3, 0, 0]}>
        <coneGeometry args={[0.04, 0.06, 5]} />
        <meshStandardMaterial color={FUR_DARK} roughness={0.8} />
      </mesh>
      <mesh position={[-0.025, 0.13, 0.05]} rotation={[-0.3, 0, 0.3]}>
        <coneGeometry args={[0.025, 0.04, 4]} />
        <meshStandardMaterial color={FUR_DARK} roughness={0.8} />
      </mesh>
      <mesh position={[0.025, 0.13, 0.05]} rotation={[-0.3, 0, -0.3]}>
        <coneGeometry args={[0.025, 0.04, 4]} />
        <meshStandardMaterial color={FUR_DARK} roughness={0.8} />
      </mesh>
    </group>
  )
}

/* ── Per-agent accessories ── */
function SlothAccessories({ agentId }: { agentId: string }) {
  switch (agentId) {
    case 'ceo': // Golden crown
      return (
        <group position={[0, 0.66, 0]}>
          <mesh>
            <cylinderGeometry args={[0.1, 0.12, 0.06, 6]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.7} roughness={0.2} />
          </mesh>
          {/* Crown points */}
          {[0, 1, 2, 3, 4].map(i => (
            <mesh key={i} position={[Math.sin(i * Math.PI * 2 / 5) * 0.09, 0.05, Math.cos(i * Math.PI * 2 / 5) * 0.09]}>
              <coneGeometry args={[0.02, 0.05, 4]} />
              <meshStandardMaterial color="#f59e0b" metalness={0.7} roughness={0.2} />
            </mesh>
          ))}
          {/* Jewel */}
          <mesh position={[0, 0.0, 0.1]}>
            <sphereGeometry args={[0.015, 6, 6]} />
            <meshStandardMaterial color="#ef4444" metalness={0.5} roughness={0.1} emissive="#ef4444" emissiveIntensity={0.3} />
          </mesh>
        </group>
      )
    case 'hr': // Glasses + clipboard
      return (
        <group>
          {/* Glasses frames */}
          <group position={[0, 0.5, 0.16]}>
            <mesh position={[-0.05, 0, 0]} rotation={[0, 0, 0]}>
              <torusGeometry args={[0.025, 0.004, 4, 12]} />
              <meshStandardMaterial color="#1e293b" roughness={0.3} />
            </mesh>
            <mesh position={[0.05, 0, 0]}>
              <torusGeometry args={[0.025, 0.004, 4, 12]} />
              <meshStandardMaterial color="#1e293b" roughness={0.3} />
            </mesh>
            {/* Bridge */}
            <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.003, 0.003, 0.04, 4]} />
              <meshStandardMaterial color="#1e293b" roughness={0.3} />
            </mesh>
          </group>
        </group>
      )
    case 'marketing': // Red baseball cap
      return (
        <group position={[0, 0.62, 0.02]}>
          {/* Cap dome */}
          <mesh rotation={[-0.15, 0, 0]}>
            <sphereGeometry args={[0.14, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
            <meshStandardMaterial color="#ef4444" roughness={0.6} />
          </mesh>
          {/* Brim */}
          <mesh position={[0, -0.01, 0.1]} rotation={[-0.4, 0, 0]}>
            <cylinderGeometry args={[0.14, 0.14, 0.015, 12, 1, false, -Math.PI / 2, Math.PI]} />
            <meshStandardMaterial color="#dc2626" roughness={0.6} />
          </mesh>
        </group>
      )
    case 'sales': // Business tie
      return (
        <group position={[0, 0.32, 0.18]}>
          {/* Tie knot */}
          <mesh position={[0, 0.03, 0]}>
            <sphereGeometry args={[0.02, 6, 6]} />
            <meshStandardMaterial color="#dc2626" roughness={0.5} />
          </mesh>
          {/* Tie body */}
          <mesh position={[0, -0.02, 0]}>
            <boxGeometry args={[0.04, 0.08, 0.01]} />
            <meshStandardMaterial color="#dc2626" roughness={0.5} />
          </mesh>
          {/* Tie point */}
          <mesh position={[0, -0.07, 0]} rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[0.028, 0.028, 0.01]} />
            <meshStandardMaterial color="#dc2626" roughness={0.5} />
          </mesh>
        </group>
      )
    case 'content': // Beret
      return (
        <group position={[0, 0.63, 0]}>
          {/* Beret base */}
          <mesh rotation={[0.1, 0.2, 0.15]}>
            <sphereGeometry args={[0.13, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.45]} />
            <meshStandardMaterial color="#1e293b" roughness={0.6} />
          </mesh>
          {/* Beret nub */}
          <mesh position={[0, 0.06, 0]}>
            <sphereGeometry args={[0.02, 6, 6]} />
            <meshStandardMaterial color="#1e293b" roughness={0.6} />
          </mesh>
        </group>
      )
    case 'dev': // Hoodie
      return (
        <group>
          {/* Hoodie body overlay */}
          <mesh position={[0, 0.25, 0]}>
            <sphereGeometry args={[0.22, 12, 10]} />
            <meshStandardMaterial color="#374151" roughness={0.7} />
          </mesh>
          {/* Hood */}
          <mesh position={[0, 0.42, -0.06]} scale={[1, 0.9, 1]}>
            <sphereGeometry args={[0.16, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.65]} />
            <meshStandardMaterial color="#374151" roughness={0.7} />
          </mesh>
          {/* Hood edge */}
          <mesh position={[0, 0.38, 0.08]} scale={[1.05, 0.5, 0.5]}>
            <torusGeometry args={[0.1, 0.015, 4, 12, Math.PI]} />
            <meshStandardMaterial color="#4b5563" roughness={0.6} />
          </mesh>
        </group>
      )
    case 'customer': // Grumpy eyebrows (no accessory, just expression)
      return (
        <group position={[0, 0.48, 0]}>
          {/* Angry left eyebrow */}
          <mesh position={[-0.055, 0.06, 0.14]} rotation={[0, 0, -0.4]} scale={[1, 0.4, 0.4]}>
            <boxGeometry args={[0.04, 0.012, 0.012]} />
            <meshStandardMaterial color="#3D2B1F" roughness={0.5} />
          </mesh>
          {/* Angry right eyebrow */}
          <mesh position={[0.055, 0.06, 0.14]} rotation={[0, 0, 0.4]} scale={[1, 0.4, 0.4]}>
            <boxGeometry args={[0.04, 0.012, 0.012]} />
            <meshStandardMaterial color="#3D2B1F" roughness={0.5} />
          </mesh>
        </group>
      )
    default:
      return null
  }
}

/* ── Cute 3D Sloth Agent ── */
function Agent3D({ agent, index, agents }: { agent: Agent; index: number; agents: Agent[] }) {
  const groupRef = useRef<THREE.Group>(null)
  const leftArmRef = useRef<THREE.Group>(null)
  const rightArmRef = useRef<THREE.Group>(null)
  const [displayMsg, setDisplayMsg] = useState<string | undefined>(agent.lastMessage || agent.currentTask)

  useEffect(() => {
    const msg = agent.lastMessage || agent.currentTask
    if (msg) setDisplayMsg(msg)
  }, [agent.lastMessage, agent.currentTask])

  const { col, row } = getAgentPos(index)
  const homeX = 16.66 + col * 33.33
  const homeY = 16.66 + row * 33.33

  let targetPctX = homeX
  let targetPctY = homeY
  let targetRotY = 0

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

    // Cute bounce: hop when walking, bob when working, idle breathe
    if (isMoving) {
      groupRef.current.position.y = 0.5 + Math.abs(Math.sin(t * 8)) * 0.12
    } else if (agent.status === 'working') {
      groupRef.current.position.y = 0.5 + Math.sin(t * 3) * 0.06
    } else {
      groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, 0.5, 3 * delta)
    }

    // Arm wave when working
    if (leftArmRef.current && rightArmRef.current) {
      if (agent.status === 'working') {
        leftArmRef.current.rotation.z = 0.5 + Math.sin(t * 4) * 0.3
        rightArmRef.current.rotation.z = -0.5 - Math.sin(t * 4 + 1) * 0.3
      } else if (isMoving) {
        leftArmRef.current.rotation.z = 0.5 + Math.sin(t * 6) * 0.4
        rightArmRef.current.rotation.z = -0.5 - Math.sin(t * 6 + Math.PI) * 0.4
      } else {
        leftArmRef.current.rotation.z = THREE.MathUtils.lerp(leftArmRef.current.rotation.z, 0.5, 3 * delta)
        rightArmRef.current.rotation.z = THREE.MathUtils.lerp(rightArmRef.current.rotation.z, -0.5, 3 * delta)
      }
    }
  })

  const glowColor = AGENT_GLOW_COLORS[index % AGENT_GLOW_COLORS.length]
  const bubbleText = agent.lastMessage || displayMsg || agent.currentTask
  const showBubble = !!(bubbleText && agent.status !== 'success' && (agent.status === 'working' || agent.talkingTo || agent.lastMessage))

  return (
    <group ref={groupRef} position={[targetX, 0.5, targetZ]} scale={1.8}>
      {/* Sloth body */}
      <SlothBody />
      {/* Animated arms (override body arms for animation) */}
      <group ref={leftArmRef} position={[-0.18, 0.22, 0]}>
        <mesh castShadow rotation={[0, 0, 0.5]}>
          <capsuleGeometry args={[0.055, 0.1, 4, 6]} />
          <meshStandardMaterial color={FUR_DARK} roughness={0.8} />
        </mesh>
        <mesh position={[-0.06, -0.06, 0]}>
          <sphereGeometry args={[0.035, 6, 6]} />
          <meshStandardMaterial color={FUR_DARK} roughness={0.8} />
        </mesh>
      </group>
      <group ref={rightArmRef} position={[0.18, 0.22, 0]}>
        <mesh castShadow rotation={[0, 0, -0.5]}>
          <capsuleGeometry args={[0.055, 0.1, 4, 6]} />
          <meshStandardMaterial color={FUR_DARK} roughness={0.8} />
        </mesh>
        <mesh position={[0.06, -0.06, 0]}>
          <sphereGeometry args={[0.035, 6, 6]} />
          <meshStandardMaterial color={FUR_DARK} roughness={0.8} />
        </mesh>
      </group>
      {/* Sloth head */}
      <SlothHead />
      {/* Role accessories */}
      <SlothAccessories agentId={agent.id} />

      {/* Glow when working */}
      {agent.status === 'working' && (
        <pointLight position={[0, 1.2, 0]} color={glowColor} intensity={2} distance={3} />
      )}

      {/* Cartoon speech bubble */}
      {showBubble && bubbleText && (
        <Html
          position={[0, 0.85, 0]}
          center
          zIndexRange={[100, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div style={{
            position: 'relative',
            background: agent.status === 'working' ? '#4f46e5' : '#ffffff',
            color: agent.status === 'working' ? '#ffffff' : '#1e293b',
            fontSize: 10,
            fontFamily: "'Comic Sans MS', 'Chalkboard SE', 'Comic Neue', cursive, system-ui",
            padding: '4px 10px',
            borderRadius: 16,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            fontWeight: 600,
            maxWidth: 220,
            minWidth: 60,
            lineHeight: 1.3,
            border: agent.status === 'working' ? '2px solid #818cf8' : '2px solid #e2e8f0',
            textAlign: 'center' as const,
            whiteSpace: 'nowrap' as const,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {truncate(bubbleText, 50)}
            {/* Cartoon tail */}
            <div style={{
              position: 'absolute',
              bottom: -7,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: `7px solid ${agent.status === 'working' ? '#4f46e5' : '#ffffff'}`,
            }} />
            <div style={{
              position: 'absolute',
              bottom: -10,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '7px solid transparent',
              borderRight: '7px solid transparent',
              borderTop: `8px solid ${agent.status === 'working' ? '#818cf8' : '#e2e8f0'}`,
              zIndex: -1,
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

        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
          <planeGeometry args={[100, 100]} />
          <meshStandardMaterial color="#86efac" />
        </mesh>

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
