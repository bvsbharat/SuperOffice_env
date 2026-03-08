import { useRef, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../../store/useStore'
import type { AgentId, AgentAccessory } from '../../types'

interface AgentBotProps {
  agentId: AgentId
  position: [number, number, number]
  targetPosition: [number, number, number]
  color: string
  accentColor: string
  accessory: AgentAccessory
}

export function AgentBot({ agentId, position, targetPosition, color, accentColor, accessory }: AgentBotProps) {
  const groupRef = useRef<THREE.Group>(null)
  const leftArmRef = useRef<THREE.Group>(null)
  const rightArmRef = useRef<THREE.Group>(null)
  const [hovered, setHovered] = useState(false)

  const agent = useStore(s => s.agents[agentId])
  const activeAgent = useStore(s => s.activeAgent)
  const selectedAgent = useStore(s => s.selectedAgent)
  const selectAgent = useStore(s => s.selectAgent)

  const isSelected = selectedAgent === agentId
  const isActive = activeAgent === agentId
  const isWorking = agent.status === 'active'

  const bobOffset = useRef(Math.random() * Math.PI * 2)
  const currentPos = useRef(new THREE.Vector3(...position))
  const targetVec = useMemo(() => new THREE.Vector3(), [])
  const waveTimer = useRef(0)
  const isWaving = useRef(false)

  const colorObj = useMemo(() => new THREE.Color(color), [color])
  const accentObj = useMemo(() => new THREE.Color(accentColor), [accentColor])
  const bellyColor = useMemo(() => new THREE.Color(accentColor).lerp(new THREE.Color('#ffffff'), 0.4), [accentColor])

  useFrame((state, delta) => {
    if (!groupRef.current) return
    const t = state.clock.elapsedTime + bobOffset.current

    // Lerp toward target position
    targetVec.set(targetPosition[0], targetPosition[1], targetPosition[2])
    const dist = currentPos.current.distanceTo(targetVec)
    const isMoving = dist > 0.1

    if (isMoving) {
      currentPos.current.lerp(targetVec, 0.03)
    } else if (dist > 0.01) {
      currentPos.current.lerp(targetVec, 0.08)
      // Arrived — trigger wave
      if (dist < 0.15 && !isWaving.current) {
        isWaving.current = true
        waveTimer.current = t
      }
    }

    groupRef.current.position.x = currentPos.current.x
    groupRef.current.position.z = currentPos.current.z

    // Walking bounce when moving
    if (isMoving) {
      groupRef.current.position.y = currentPos.current.y + Math.abs(Math.sin(t * 8)) * 0.04
      // Face direction of movement
      const dx = targetVec.x - currentPos.current.x
      const dz = targetVec.z - currentPos.current.z
      if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
        groupRef.current.rotation.y = Math.atan2(dx, dz)
      }
    } else {
      // Gentle body bob
      groupRef.current.position.y = currentPos.current.y + Math.sin(t * 1.8) * 0.02
      // Subtle body sway
      if (!isWorking) {
        groupRef.current.rotation.y = Math.sin(t * 0.5) * 0.1
        groupRef.current.rotation.z = Math.sin(t * 0.7) * 0.02
      } else {
        groupRef.current.rotation.y = currentPos.current.z > 0 ? Math.PI : 0
        groupRef.current.rotation.z = 0
      }
    }

    // Arms
    if (leftArmRef.current && rightArmRef.current) {
      if (isWaving.current && (t - waveTimer.current) < 1.0) {
        // Wave animation — arms up
        const waveT = t - waveTimer.current
        leftArmRef.current.rotation.z = 0.8 + Math.sin(waveT * 10) * 0.3
        rightArmRef.current.rotation.z = -0.8 - Math.sin(waveT * 10 + 1) * 0.3
      } else if (isWaving.current) {
        isWaving.current = false
      }

      if (!isWaving.current) {
        if (isMoving) {
          // Walking arm swing
          leftArmRef.current.rotation.z = 0.2 + Math.sin(t * 8) * 0.3
          rightArmRef.current.rotation.z = -0.2 - Math.sin(t * 8 + Math.PI) * 0.3
        } else if (isWorking) {
          leftArmRef.current.rotation.z = 0.3 + Math.sin(t * 6) * 0.15
          rightArmRef.current.rotation.z = -0.3 - Math.sin(t * 6 + 1.2) * 0.15
        } else {
          leftArmRef.current.rotation.z = 0.15 + Math.sin(t * 1.0) * 0.08
          rightArmRef.current.rotation.z = -0.15 - Math.sin(t * 1.0 + Math.PI) * 0.08
        }
      }
    }

    if (hovered || isSelected) {
      groupRef.current.position.y += Math.sin(t * 3) * 0.025 + 0.03
    }
  })

  return (
    <group
      ref={groupRef}
      position={position}
      onClick={(e) => { e.stopPropagation(); selectAgent(agentId) }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = 'default' }}
      scale={hovered ? 1.08 : 1}
    >
      {/* === BODY === */}
      <mesh position={[0, 0.28, 0]}>
        <sphereGeometry args={[0.24, 16, 14]} />
        <meshStandardMaterial color={colorObj} roughness={0.55} metalness={0.05} />
      </mesh>
      <mesh position={[0, 0.24, 0.18]}>
        <sphereGeometry args={[0.14, 12, 10]} />
        <meshStandardMaterial color={bellyColor} roughness={0.6} metalness={0.0} />
      </mesh>

      {/* === FACE === */}
      <mesh position={[-0.08, 0.36, 0.19]}>
        <sphereGeometry args={[0.055, 10, 10]} />
        <meshStandardMaterial color="#ffffff" roughness={0.3} />
      </mesh>
      <mesh position={[-0.075, 0.365, 0.24]}>
        <sphereGeometry args={[0.032, 8, 8]} />
        <meshStandardMaterial color="#1a1a2e" roughness={0.2} />
      </mesh>
      <mesh position={[-0.065, 0.375, 0.265]}>
        <sphereGeometry args={[0.012, 6, 6]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.5} roughness={0.1} />
      </mesh>

      <mesh position={[0.08, 0.36, 0.19]}>
        <sphereGeometry args={[0.055, 10, 10]} />
        <meshStandardMaterial color="#ffffff" roughness={0.3} />
      </mesh>
      <mesh position={[0.075, 0.365, 0.24]}>
        <sphereGeometry args={[0.032, 8, 8]} />
        <meshStandardMaterial color="#1a1a2e" roughness={0.2} />
      </mesh>
      <mesh position={[0.085, 0.375, 0.265]}>
        <sphereGeometry args={[0.012, 6, 6]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.5} roughness={0.1} />
      </mesh>

      <mesh position={[0, 0.29, 0.225]} rotation={[0.2, 0, 0]}>
        <torusGeometry args={[0.04, 0.008, 6, 12, Math.PI]} />
        <meshStandardMaterial color="#1a1a2e" roughness={0.3} />
      </mesh>

      <mesh position={[0, 0.32, 0.235]}>
        <sphereGeometry args={[0.015, 6, 6]} />
        <meshStandardMaterial color={new THREE.Color(color).multiplyScalar(0.6)} roughness={0.4} />
      </mesh>

      <mesh position={[-0.13, 0.31, 0.17]}>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshStandardMaterial color="#ff8a9e" transparent opacity={0.35} roughness={0.8} />
      </mesh>
      <mesh position={[0.13, 0.31, 0.17]}>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshStandardMaterial color="#ff8a9e" transparent opacity={0.35} roughness={0.8} />
      </mesh>

      {/* === EARS === */}
      <mesh position={[-0.2, 0.42, 0]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color={colorObj} roughness={0.55} />
      </mesh>
      <mesh position={[-0.2, 0.42, 0]}>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshStandardMaterial color={accentObj} roughness={0.55} />
      </mesh>
      <mesh position={[0.2, 0.42, 0]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color={colorObj} roughness={0.55} />
      </mesh>
      <mesh position={[0.2, 0.42, 0]}>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshStandardMaterial color={accentObj} roughness={0.55} />
      </mesh>

      {/* === ARMS === */}
      <group ref={leftArmRef} position={[-0.22, 0.22, 0.05]}>
        <mesh>
          <capsuleGeometry args={[0.04, 0.1, 6, 8]} />
          <meshStandardMaterial color={colorObj} roughness={0.55} />
        </mesh>
      </group>
      <group ref={rightArmRef} position={[0.22, 0.22, 0.05]}>
        <mesh>
          <capsuleGeometry args={[0.04, 0.1, 6, 8]} />
          <meshStandardMaterial color={colorObj} roughness={0.55} />
        </mesh>
      </group>

      {/* === FEET === */}
      <mesh position={[-0.09, 0.03, 0.04]}>
        <sphereGeometry args={[0.055, 8, 6]} />
        <meshStandardMaterial color={accentObj} roughness={0.55} />
      </mesh>
      <mesh position={[0.09, 0.03, 0.04]}>
        <sphereGeometry args={[0.055, 8, 6]} />
        <meshStandardMaterial color={accentObj} roughness={0.55} />
      </mesh>

      {/* === ACCESSORIES === */}
      {accessory === 'crown' && (
        <group position={[0, 0.5, 0]}>
          <mesh>
            <cylinderGeometry args={[0.1, 0.12, 0.06, 6]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.7} roughness={0.2} emissive="#fbbf24" emissiveIntensity={0.2} />
          </mesh>
          {[-0.06, 0, 0.06].map((x, i) => (
            <mesh key={i} position={[x, 0.05, 0]}>
              <sphereGeometry args={[0.018, 6, 6]} />
              <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.3} metalness={0.5} />
            </mesh>
          ))}
        </group>
      )}

      {accessory === 'headphones' && (
        <group position={[0, 0.4, 0]}>
          <mesh position={[-0.21, -0.02, 0]}>
            <sphereGeometry args={[0.04, 8, 8]} />
            <meshStandardMaterial color="#6366f1" metalness={0.4} roughness={0.3} />
          </mesh>
          <mesh position={[0.21, -0.02, 0]}>
            <sphereGeometry args={[0.04, 8, 8]} />
            <meshStandardMaterial color="#6366f1" metalness={0.4} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.06, 0]}>
            <torusGeometry args={[0.16, 0.015, 8, 16, Math.PI]} />
            <meshStandardMaterial color="#6366f1" metalness={0.4} roughness={0.3} />
          </mesh>
        </group>
      )}

      {accessory === 'visor' && (
        <mesh position={[0, 0.36, 0.2]} rotation={[-0.1, 0, 0]}>
          <boxGeometry args={[0.28, 0.04, 0.06]} />
          <meshStandardMaterial color="#ec4899" transparent opacity={0.6} metalness={0.8} roughness={0.1} />
        </mesh>
      )}

      {accessory === 'beret' && (
        <group position={[0.03, 0.48, 0.02]}>
          <mesh>
            <sphereGeometry args={[0.1, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color={accentObj} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.02, 0]}>
            <sphereGeometry args={[0.02, 6, 6]} />
            <meshStandardMaterial color={accentObj} roughness={0.5} />
          </mesh>
        </group>
      )}

      {accessory === 'goggles' && (
        <group position={[0, 0.36, 0.2]}>
          <mesh position={[-0.07, 0, 0.02]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 0.025, 10]} />
            <meshStandardMaterial color="#2dd4bf" transparent opacity={0.5} metalness={0.7} />
          </mesh>
          <mesh position={[0.07, 0, 0.02]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 0.025, 10]} />
            <meshStandardMaterial color="#2dd4bf" transparent opacity={0.5} metalness={0.7} />
          </mesh>
          <mesh position={[0, 0, -0.01]}>
            <boxGeometry args={[0.22, 0.025, 0.015]} />
            <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.3} />
          </mesh>
        </group>
      )}

      {accessory === 'monocle' && (
        <group position={[0.08, 0.36, 0.24]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.04, 0.005, 8, 12]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.9} roughness={0.1} />
          </mesh>
          <mesh position={[0.04, -0.1, 0]}>
            <cylinderGeometry args={[0.002, 0.002, 0.12, 4]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.9} roughness={0.1} />
          </mesh>
        </group>
      )}

      {accessory === 'bow' && (
        <group position={[0.12, 0.44, 0.05]}>
          <mesh position={[-0.025, 0, 0]} rotation={[0, 0, 0.4]}>
            <sphereGeometry args={[0.03, 6, 6]} />
            <meshStandardMaterial color="#f472b6" roughness={0.4} />
          </mesh>
          <mesh position={[0.025, 0, 0]} rotation={[0, 0, -0.4]}>
            <sphereGeometry args={[0.03, 6, 6]} />
            <meshStandardMaterial color="#f472b6" roughness={0.4} />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.015, 6, 6]} />
            <meshStandardMaterial color="#ec4899" roughness={0.3} />
          </mesh>
        </group>
      )}

      {accessory === 'antenna_large' && (
        <group position={[0, 0.48, 0]}>
          <mesh position={[-0.06, 0.04, 0]}>
            <cylinderGeometry args={[0.006, 0.006, 0.1, 4]} />
            <meshStandardMaterial color={accentObj} metalness={0.5} />
          </mesh>
          <mesh position={[-0.06, 0.1, 0]}>
            <sphereGeometry args={[0.018, 6, 6]} />
            <meshStandardMaterial color="#06d6a0" emissive="#06d6a0" emissiveIntensity={1.5} />
          </mesh>
          <mesh position={[0.06, 0.04, 0]}>
            <cylinderGeometry args={[0.006, 0.006, 0.1, 4]} />
            <meshStandardMaterial color={accentObj} metalness={0.5} />
          </mesh>
          <mesh position={[0.06, 0.1, 0]}>
            <sphereGeometry args={[0.018, 6, 6]} />
            <meshStandardMaterial color="#06d6a0" emissive="#06d6a0" emissiveIntensity={1.5} />
          </mesh>
        </group>
      )}

      {/* Selection ring */}
      {(isSelected || hovered) && (
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.28, 0.32, 24]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={1.5}
            transparent
            opacity={0.7}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Active agent glow */}
      {isActive && (
        <pointLight position={[0, 0.3, 0.1]} color={color} intensity={0.6} distance={1.5} />
      )}
    </group>
  )
}
