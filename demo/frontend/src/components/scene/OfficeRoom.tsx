import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import type { AgentId } from '../../types'

/* ─── Shared sub-components (procedural geometry) ─── */

function MonitorScreen({ position, color, offset = 0 }: { position: [number, number, number]; color: string; offset?: number }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame((state) => {
    if (!ref.current) return
    const t = state.clock.elapsedTime + offset
    ;(ref.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + Math.sin(t * 3) * 0.15
  })
  return (
    <mesh ref={ref} position={position}>
      <boxGeometry args={[0.17, 0.1, 0.005]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} />
    </mesh>
  )
}

function Desk({ position, monitorColor = '#22d3ee', index = 0 }: { position: [number, number, number]; monitorColor?: string; index?: number }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.18, 0]}>
        <boxGeometry args={[0.35, 0.015, 0.2]} />
        <meshStandardMaterial color="#5a4a3a" roughness={0.7} />
      </mesh>
      {([[-0.14, 0.09, -0.07], [0.14, 0.09, -0.07], [-0.14, 0.09, 0.07], [0.14, 0.09, 0.07]] as [number, number, number][]).map((p, i) => (
        <mesh key={i} position={p}>
          <boxGeometry args={[0.015, 0.18, 0.015]} />
          <meshStandardMaterial color="#4a3a2a" roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, 0.31, -0.06]}>
        <boxGeometry args={[0.2, 0.13, 0.01]} />
        <meshStandardMaterial color="#1a1a2a" metalness={0.6} roughness={0.2} />
      </mesh>
      <MonitorScreen position={[0, 0.31, -0.053]} color={monitorColor} offset={index * 2.5} />
      <mesh position={[0, 0.22, -0.06]}>
        <boxGeometry args={[0.025, 0.06, 0.015]} />
        <meshStandardMaterial color="#4a4a5a" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.192, 0.04]}>
        <boxGeometry args={[0.12, 0.006, 0.035]} />
        <meshStandardMaterial color="#3a3a4a" roughness={0.5} />
      </mesh>
    </group>
  )
}

function LargeDesk({ position, monitorColor = '#22d3ee' }: { position: [number, number, number]; monitorColor?: string }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.2, 0]}>
        <boxGeometry args={[0.5, 0.02, 0.28]} />
        <meshStandardMaterial color="#3d2b1a" roughness={0.6} />
      </mesh>
      {([[-0.22, 0.1, -0.11], [0.22, 0.1, -0.11], [-0.22, 0.1, 0.11], [0.22, 0.1, 0.11]] as [number, number, number][]).map((p, i) => (
        <mesh key={i} position={p}>
          <boxGeometry args={[0.02, 0.2, 0.02]} />
          <meshStandardMaterial color="#2a1a0a" roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, 0.35, -0.1]}>
        <boxGeometry args={[0.24, 0.15, 0.01]} />
        <meshStandardMaterial color="#1a1a2a" metalness={0.6} roughness={0.2} />
      </mesh>
      <MonitorScreen position={[0, 0.35, -0.093]} color={monitorColor} />
    </group>
  )
}

function StandingDesk({ position, monitorColor = '#ec4899' }: { position: [number, number, number]; monitorColor?: string }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[0.35, 0.015, 0.2]} />
        <meshStandardMaterial color="#e5e7eb" roughness={0.3} metalness={0.2} />
      </mesh>
      <mesh position={[-0.14, 0.15, 0]}>
        <boxGeometry args={[0.02, 0.3, 0.02]} />
        <meshStandardMaterial color="#9ca3af" roughness={0.3} metalness={0.3} />
      </mesh>
      <mesh position={[0.14, 0.15, 0]}>
        <boxGeometry args={[0.02, 0.3, 0.02]} />
        <meshStandardMaterial color="#9ca3af" roughness={0.3} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.44, -0.06]}>
        <boxGeometry args={[0.2, 0.13, 0.01]} />
        <meshStandardMaterial color="#1a1a2a" metalness={0.6} roughness={0.2} />
      </mesh>
      <MonitorScreen position={[0, 0.44, -0.053]} color={monitorColor} />
    </group>
  )
}

function Chair({ position, chairColor = '#4a5568' }: { position: [number, number, number]; chairColor?: string }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.11, 0]}>
        <boxGeometry args={[0.1, 0.015, 0.1]} />
        <meshStandardMaterial color={chairColor} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.19, -0.045]}>
        <boxGeometry args={[0.1, 0.14, 0.015]} />
        <meshStandardMaterial color={chairColor} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.1, 6]} />
        <meshStandardMaterial color="#2d3748" roughness={0.4} />
      </mesh>
    </group>
  )
}

function LeatherChair({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.12, 0]}>
        <boxGeometry args={[0.14, 0.04, 0.14]} />
        <meshStandardMaterial color="#5c3a1e" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.22, -0.06]}>
        <boxGeometry args={[0.14, 0.16, 0.03]} />
        <meshStandardMaterial color="#5c3a1e" roughness={0.5} />
      </mesh>
      <mesh position={[-0.07, 0.16, 0]}>
        <boxGeometry args={[0.02, 0.06, 0.12]} />
        <meshStandardMaterial color="#5c3a1e" roughness={0.5} />
      </mesh>
      <mesh position={[0.07, 0.16, 0]}>
        <boxGeometry args={[0.02, 0.06, 0.12]} />
        <meshStandardMaterial color="#5c3a1e" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 0.1, 6]} />
        <meshStandardMaterial color="#2d3748" roughness={0.4} />
      </mesh>
    </group>
  )
}

function Plant({ position, leafColor = '#22c55e', scale = 1 }: { position: [number, number, number]; leafColor?: string; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.04, 0]}>
        <cylinderGeometry args={[0.035, 0.03, 0.08, 6]} />
        <meshStandardMaterial color="#92400e" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.1, 0]}>
        <sphereGeometry args={[0.05, 6, 6]} />
        <meshStandardMaterial color={leafColor} emissive={leafColor} emissiveIntensity={0.05} roughness={0.7} />
      </mesh>
      <mesh position={[0.02, 0.14, 0.01]}>
        <sphereGeometry args={[0.03, 6, 6]} />
        <meshStandardMaterial color={leafColor} roughness={0.7} />
      </mesh>
    </group>
  )
}

function Bookshelf({ position, color }: { position: [number, number, number]; color: string }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.2, 0]}>
        <boxGeometry args={[0.3, 0.4, 0.08]} />
        <meshStandardMaterial color="#5a3d1a" roughness={0.8} />
      </mesh>
      {[[-0.08, 0.3], [0, 0.28], [0.08, 0.32]].map(([x, h], i) => (
        <mesh key={i} position={[x, h, 0.02]}>
          <boxGeometry args={[0.06, h * 0.4, 0.05]} />
          <meshStandardMaterial color={i === 0 ? color : i === 1 ? '#6366f1' : '#f97316'} roughness={0.6} />
        </mesh>
      ))}
    </group>
  )
}

function Whiteboard({ position, hasScribbles = false }: { position: [number, number, number]; hasScribbles?: boolean }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[0.4, 0.25, 0.015]} />
        <meshStandardMaterial color="#f0f0f0" roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.35, -0.008]}>
        <boxGeometry args={[0.42, 0.27, 0.01]} />
        <meshStandardMaterial color="#9ca3af" roughness={0.4} />
      </mesh>
      {hasScribbles && (
        <>
          <mesh position={[-0.08, 0.38, 0.009]}>
            <boxGeometry args={[0.15, 0.008, 0.001]} />
            <meshStandardMaterial color="#ef4444" />
          </mesh>
          <mesh position={[0.05, 0.34, 0.009]}>
            <boxGeometry args={[0.12, 0.008, 0.001]} />
            <meshStandardMaterial color="#3b82f6" />
          </mesh>
          <mesh position={[-0.02, 0.30, 0.009]}>
            <boxGeometry args={[0.1, 0.008, 0.001]} />
            <meshStandardMaterial color="#22c55e" />
          </mesh>
        </>
      )}
    </group>
  )
}

function ServerRack({ position }: { position: [number, number, number] }) {
  const ledRef = useRef<THREE.Mesh>(null)
  useFrame((state) => {
    if (!ledRef.current) return
    const t = state.clock.elapsedTime
    ;(ledRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + Math.sin(t * 8) * 0.5
  })
  return (
    <group position={position}>
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[0.2, 0.5, 0.15]} />
        <meshStandardMaterial color="#1a1a2a" metalness={0.7} roughness={0.2} />
      </mesh>
      {[0.12, 0.2, 0.28, 0.36].map((y, i) => (
        <mesh key={i} position={[0, y, 0.076]}>
          <boxGeometry args={[0.16, 0.04, 0.002]} />
          <meshStandardMaterial color="#2a2a3a" metalness={0.5} roughness={0.3} />
        </mesh>
      ))}
      <mesh ref={ledRef} position={[0.07, 0.4, 0.08]}>
        <sphereGeometry args={[0.008, 6, 6]} />
        <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={1} />
      </mesh>
      <mesh position={[0.05, 0.4, 0.08]}>
        <sphereGeometry args={[0.008, 6, 6]} />
        <meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={0.6} />
      </mesh>
    </group>
  )
}

function FilingCabinet({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.18, 0]}>
        <boxGeometry args={[0.15, 0.36, 0.12]} />
        <meshStandardMaterial color="#6b7280" metalness={0.5} roughness={0.4} />
      </mesh>
      {[0.08, 0.18, 0.28].map((y, i) => (
        <mesh key={i} position={[0, y, 0.061]}>
          <boxGeometry args={[0.12, 0.06, 0.002]} />
          <meshStandardMaterial color="#9ca3af" metalness={0.4} roughness={0.3} />
        </mesh>
      ))}
      {[0.08, 0.18, 0.28].map((y, i) => (
        <mesh key={`h-${i}`} position={[0, y, 0.063]}>
          <boxGeometry args={[0.04, 0.008, 0.008]} />
          <meshStandardMaterial color="#d1d5db" metalness={0.6} roughness={0.2} />
        </mesh>
      ))}
    </group>
  )
}

function CoffeeMachine({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.08, 0]}>
        <boxGeometry args={[0.1, 0.16, 0.08]} />
        <meshStandardMaterial color="#374151" roughness={0.4} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.17, -0.01]}>
        <boxGeometry args={[0.06, 0.03, 0.06]} />
        <meshStandardMaterial color="#1f2937" roughness={0.3} metalness={0.4} />
      </mesh>
      <mesh position={[0.02, 0.03, 0.04]}>
        <cylinderGeometry args={[0.015, 0.012, 0.04, 8]} />
        <meshStandardMaterial color="#f5f5f4" roughness={0.5} />
      </mesh>
    </group>
  )
}

function Rug({ position, size, color }: { position: [number, number, number]; size: [number, number]; color: string }) {
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  )
}

function PictureFrame({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[0.12, 0.1, 0.01]} />
        <meshStandardMaterial color="#92400e" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0, 0.006]}>
        <boxGeometry args={[0.09, 0.07, 0.002]} />
        <meshStandardMaterial color="#bfdbfe" roughness={0.4} />
      </mesh>
    </group>
  )
}

function Globe({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.04, 0]}>
        <cylinderGeometry args={[0.03, 0.04, 0.02, 8]} />
        <meshStandardMaterial color="#92400e" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.005, 0.005, 0.04, 4]} />
        <meshStandardMaterial color="#fbbf24" metalness={0.7} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.09, 0]} rotation={[0.3, 0, 0]}>
        <sphereGeometry args={[0.04, 12, 10]} />
        <meshStandardMaterial color="#3b82f6" roughness={0.5} />
      </mesh>
      <mesh position={[0.01, 0.1, 0.02]}>
        <sphereGeometry args={[0.015, 6, 6]} />
        <meshStandardMaterial color="#22c55e" roughness={0.6} />
      </mesh>
    </group>
  )
}

function Trophy({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.025, 0.03, 0.02, 8]} />
        <meshStandardMaterial color="#fbbf24" metalness={0.8} roughness={0.15} />
      </mesh>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.005, 0.005, 0.06, 4]} />
        <meshStandardMaterial color="#fbbf24" metalness={0.8} roughness={0.15} />
      </mesh>
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.015, 0.025, 0.04, 8]} />
        <meshStandardMaterial color="#fbbf24" metalness={0.8} roughness={0.15} emissive="#fbbf24" emissiveIntensity={0.1} />
      </mesh>
    </group>
  )
}

function PhoneOnDesk({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.01, 0]}>
        <boxGeometry args={[0.06, 0.015, 0.04]} />
        <meshStandardMaterial color="#1f2937" roughness={0.3} />
      </mesh>
      <mesh position={[-0.04, 0.025, 0]}>
        <boxGeometry args={[0.03, 0.02, 0.015]} />
        <meshStandardMaterial color="#374151" roughness={0.3} />
      </mesh>
    </group>
  )
}

function Easel({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[-0.04, 0.2, -0.02]} rotation={[0, 0, 0.15]}>
        <boxGeometry args={[0.01, 0.4, 0.01]} />
        <meshStandardMaterial color="#92400e" roughness={0.7} />
      </mesh>
      <mesh position={[0.04, 0.2, -0.02]} rotation={[0, 0, -0.15]}>
        <boxGeometry args={[0.01, 0.4, 0.01]} />
        <meshStandardMaterial color="#92400e" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.3, -0.01]}>
        <boxGeometry args={[0.18, 0.15, 0.005]} />
        <meshStandardMaterial color="#fefce8" roughness={0.6} />
      </mesh>
      <mesh position={[-0.03, 0.32, -0.006]}>
        <boxGeometry args={[0.05, 0.04, 0.001]} />
        <meshStandardMaterial color="#f97316" roughness={0.5} />
      </mesh>
    </group>
  )
}

function MagazineRack({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.12, 0]}>
        <boxGeometry args={[0.12, 0.24, 0.06]} />
        <meshStandardMaterial color="#78350f" roughness={0.7} />
      </mesh>
      {[0.06, 0.12, 0.18].map((y, i) => (
        <mesh key={i} position={[0, y, 0.035]}>
          <boxGeometry args={[0.1, 0.04, 0.005]} />
          <meshStandardMaterial color={['#ef4444', '#3b82f6', '#22c55e'][i]} roughness={0.5} />
        </mesh>
      ))}
    </group>
  )
}

function ReceptionDesk({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.18, 0]}>
        <boxGeometry args={[0.6, 0.36, 0.15]} />
        <meshStandardMaterial color="#5a3d1a" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.37, -0.02]}>
        <boxGeometry args={[0.62, 0.02, 0.18]} />
        <meshStandardMaterial color="#3d2b12" roughness={0.5} />
      </mesh>
      <mesh position={[0.2, 0.42, -0.04]}>
        <boxGeometry args={[0.08, 0.06, 0.04]} />
        <meshStandardMaterial color="#d1d5db" metalness={0.3} roughness={0.3} />
      </mesh>
    </group>
  )
}

function DeskLamp({ position, color = '#fbbf24' }: { position: [number, number, number]; color?: string }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.01, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 0.01, 8]} />
        <meshStandardMaterial color="#374151" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.06, -0.02]} rotation={[0.3, 0, 0]}>
        <cylinderGeometry args={[0.004, 0.004, 0.1, 4]} />
        <meshStandardMaterial color="#374151" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.1, -0.04]}>
        <coneGeometry args={[0.03, 0.03, 8]} />
        <meshStandardMaterial color="#fafafa" roughness={0.4} />
      </mesh>
      <pointLight position={[0, 0.08, -0.04]} color={color} intensity={0.15} distance={1} />
    </group>
  )
}

function CableTray({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.45, 0]}>
        <boxGeometry args={[0.5, 0.02, 0.08]} />
        <meshStandardMaterial color="#4b5563" metalness={0.5} roughness={0.3} />
      </mesh>
      {[-0.2, 0, 0.2].map((x, i) => (
        <mesh key={i} position={[x, 0.45, 0]}>
          <cylinderGeometry args={[0.008, 0.008, 0.04, 4]} />
          <meshStandardMaterial color={['#ef4444', '#3b82f6', '#fbbf24'][i]} roughness={0.5} />
        </mesh>
      ))}
    </group>
  )
}

function CoolingUnit({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[0.15, 0.3, 0.1]} />
        <meshStandardMaterial color="#e5e7eb" metalness={0.3} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.2, 0.051]}>
        <boxGeometry args={[0.1, 0.15, 0.002]} />
        <meshStandardMaterial color="#9ca3af" metalness={0.4} roughness={0.3} />
      </mesh>
    </group>
  )
}

function CorkBoard({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.32, 0]}>
        <boxGeometry args={[0.3, 0.2, 0.015]} />
        <meshStandardMaterial color="#c2956a" roughness={0.9} />
      </mesh>
      <mesh position={[-0.08, 0.35, 0.008]}>
        <boxGeometry args={[0.06, 0.05, 0.002]} />
        <meshStandardMaterial color="#fbbf24" roughness={0.5} />
      </mesh>
      <mesh position={[0.05, 0.30, 0.008]}>
        <boxGeometry args={[0.05, 0.04, 0.002]} />
        <meshStandardMaterial color="#ec4899" roughness={0.5} />
      </mesh>
      <mesh position={[0.02, 0.37, 0.008]}>
        <boxGeometry args={[0.04, 0.03, 0.002]} />
        <meshStandardMaterial color="#22c55e" roughness={0.5} />
      </mesh>
    </group>
  )
}

function CubiclePanel({ position, height = 0.35, width = 0.6 }: { position: [number, number, number]; height?: number; width?: number }) {
  return (
    <mesh position={position}>
      <boxGeometry args={[width, height, 0.02]} />
      <meshStandardMaterial color="#9ca3af" roughness={0.7} transparent opacity={0.6} />
    </mesh>
  )
}

function Printer({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[0.15, 0.1, 0.12]} />
        <meshStandardMaterial color="#e5e7eb" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.1, -0.02]}>
        <boxGeometry args={[0.12, 0.02, 0.06]} />
        <meshStandardMaterial color="#d1d5db" roughness={0.3} />
      </mesh>
    </group>
  )
}

function Couch({ position, color = '#7c3aed' }: { position: [number, number, number]; color?: string }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.08, 0]}>
        <boxGeometry args={[0.4, 0.08, 0.16]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.15, -0.07]}>
        <boxGeometry args={[0.4, 0.08, 0.03]} />
        <meshStandardMaterial color={new THREE.Color(color).multiplyScalar(1.15)} roughness={0.7} />
      </mesh>
      <mesh position={[-0.18, 0.12, 0]}>
        <boxGeometry args={[0.04, 0.04, 0.14]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      <mesh position={[0.18, 0.12, 0]}>
        <boxGeometry args={[0.04, 0.04, 0.14]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
    </group>
  )
}

function CoffeeTable({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.015, 8]} />
        <meshStandardMaterial color="#5a3d1a" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.015, 0.03, 0.1, 6]} />
        <meshStandardMaterial color="#3a2a1a" roughness={0.5} />
      </mesh>
    </group>
  )
}

function WelcomeMat({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[0.5, 0.3]} />
      <meshStandardMaterial color="#92400e" roughness={0.95} />
    </mesh>
  )
}

function Nameplate({ position, text }: { position: [number, number, number]; text: string }) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[0.12, 0.03, 0.025]} />
        <meshStandardMaterial color="#fbbf24" metalness={0.7} roughness={0.2} />
      </mesh>
      <Text position={[0, 0, 0.014]} fontSize={0.012} color="#1a1a2a" anchorX="center" anchorY="middle">
        {text}
      </Text>
    </group>
  )
}

function TripleMonitors({ position, color = '#22d3ee' }: { position: [number, number, number]; color?: string }) {
  return (
    <group position={position}>
      {[-0.18, 0, 0.18].map((x, i) => (
        <group key={i} position={[x, 0, 0]}>
          <mesh position={[0, 0.31, -0.06]}>
            <boxGeometry args={[0.16, 0.1, 0.008]} />
            <meshStandardMaterial color="#1a1a2a" metalness={0.6} roughness={0.2} />
          </mesh>
          <MonitorScreen position={[0, 0.31, -0.054]} color={color} offset={i * 1.5} />
          <mesh position={[0, 0.24, -0.06]}>
            <boxGeometry args={[0.015, 0.04, 0.01]} />
            <meshStandardMaterial color="#4a4a5a" roughness={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function LEDStrip({ position, color = '#22d3ee' }: { position: [number, number, number]; color?: string }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame((state) => {
    if (!ref.current) return
    const t = state.clock.elapsedTime
    ;(ref.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.3 + Math.sin(t * 2) * 0.2
  })
  return (
    <mesh ref={ref} position={position}>
      <boxGeometry args={[0.6, 0.01, 0.01]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
    </mesh>
  )
}

function Briefcase({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.03, 0]}>
        <boxGeometry args={[0.08, 0.06, 0.03]} />
        <meshStandardMaterial color="#78350f" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.065, 0]}>
        <boxGeometry args={[0.04, 0.008, 0.008]} />
        <meshStandardMaterial color="#fbbf24" metalness={0.7} roughness={0.2} />
      </mesh>
    </group>
  )
}

function ChartBoard({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.32, 0]}>
        <boxGeometry args={[0.3, 0.2, 0.01]} />
        <meshStandardMaterial color="#fefce8" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.32, -0.006]}>
        <boxGeometry args={[0.32, 0.22, 0.005]} />
        <meshStandardMaterial color="#374151" roughness={0.4} />
      </mesh>
      {/* Bar chart bars */}
      {[-0.08, -0.03, 0.02, 0.07].map((x, i) => (
        <mesh key={i} position={[x, 0.26 + i * 0.015, 0.006]}>
          <boxGeometry args={[0.03, 0.04 + i * 0.02, 0.002]} />
          <meshStandardMaterial color={['#ef4444', '#fbbf24', '#22c55e', '#3b82f6'][i]} />
        </mesh>
      ))}
    </group>
  )
}

function MoodBoard({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.32, 0]}>
        <boxGeometry args={[0.25, 0.18, 0.01]} />
        <meshStandardMaterial color="#d6d3d1" roughness={0.8} />
      </mesh>
      {[[-0.06, 0.35, '#fbbf24'], [0.04, 0.30, '#ec4899'], [-0.02, 0.28, '#8b5cf6'], [0.06, 0.36, '#22c55e']].map(([x, y, c], i) => (
        <mesh key={i} position={[Number(x), Number(y), 0.006]}>
          <boxGeometry args={[0.04, 0.03, 0.002]} />
          <meshStandardMaterial color={c as string} roughness={0.5} />
        </mesh>
      ))}
    </group>
  )
}

function PenCup({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.025, 0]}>
        <cylinderGeometry args={[0.018, 0.015, 0.05, 8]} />
        <meshStandardMaterial color="#374151" roughness={0.5} />
      </mesh>
      {[[-0.005, 0.06, '#ef4444'], [0.005, 0.065, '#3b82f6'], [0, 0.058, '#22c55e']].map(([x, y, c], i) => (
        <mesh key={i} position={[Number(x), Number(y), 0]}>
          <cylinderGeometry args={[0.003, 0.003, 0.03, 4]} />
          <meshStandardMaterial color={c as string} />
        </mesh>
      ))}
    </group>
  )
}

function Megaphone({ position }: { position: [number, number, number] }) {
  return (
    <group position={position} rotation={[0, 0, Math.PI / 6]}>
      <mesh>
        <coneGeometry args={[0.03, 0.08, 8]} />
        <meshStandardMaterial color="#ec4899" roughness={0.4} metalness={0.2} />
      </mesh>
    </group>
  )
}

function CoffeeCups({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.015, 0]}>
        <cylinderGeometry args={[0.015, 0.012, 0.03, 8]} />
        <meshStandardMaterial color="#f5f5f4" roughness={0.5} />
      </mesh>
      <mesh position={[0.04, 0.015, 0.01]}>
        <cylinderGeometry args={[0.013, 0.01, 0.025, 8]} />
        <meshStandardMaterial color="#374151" roughness={0.4} />
      </mesh>
    </group>
  )
}

/* ─── Per-room furniture sets ─── */

function CEOFurniture({ halfW, halfD, edgeColor }: { halfW: number; halfD: number; edgeColor: string }) {
  return (
    <>
      <LargeDesk position={[0, 0, -halfD + 0.35]} monitorColor={edgeColor} />
      <LeatherChair position={[0, 0, -halfD + 0.6]} />
      <Bookshelf position={[-halfW + 0.2, 0, -halfD + 0.06]} color={edgeColor} />
      <Globe position={[halfW - 0.2, 0.2, -halfD + 0.15]} />
      <PictureFrame position={[-halfW + 0.08, 0.35, -halfD + 0.06]} />
      <PictureFrame position={[-halfW + 0.08, 0.25, -halfD + 0.06]} />
      <Rug position={[0, 0.004, 0]} size={[1.4, 0.9]} color="#6b3a5a" />
      <Plant position={[halfW - 0.15, 0, halfD - 0.15]} leafColor="#22c55e" />
    </>
  )
}

function HRFurniture({ halfW, halfD, edgeColor }: { halfW: number; halfD: number; edgeColor: string }) {
  return (
    <>
      <Desk position={[-0.3, 0, -halfD + 0.35]} monitorColor={edgeColor} index={0} />
      <Desk position={[0.3, 0, -halfD + 0.35]} monitorColor={edgeColor} index={1} />
      <Chair position={[-0.3, 0, -halfD + 0.55]} />
      <Chair position={[0.3, 0, -halfD + 0.55]} />
      <FilingCabinet position={[-halfW + 0.12, 0, halfD - 0.12]} />
      <CorkBoard position={[halfW - 0.15, 0, -halfD + 0.01]} />
      <Plant position={[halfW - 0.15, 0, halfD - 0.15]} leafColor="#34d399" />
      <Printer position={[-halfW + 0.15, 0, -halfD + 0.12]} />
    </>
  )
}

function MarketingFurniture({ halfW, halfD, edgeColor }: { halfW: number; halfD: number; edgeColor: string }) {
  return (
    <>
      <StandingDesk position={[0.3, 0, -halfD + 0.35]} monitorColor={edgeColor} />
      <Whiteboard position={[-halfW + 0.25, 0, -halfD + 0.01]} hasScribbles />
      <Megaphone position={[halfW - 0.2, 0.2, -halfD + 0.12]} />
      <Rug position={[0, 0.004, 0.1]} size={[1.2, 0.8]} color="#ec489922" />
      <Chair position={[0.3, 0, -halfD + 0.6]} />
      <CubiclePanel position={[-0.3, 0.18, 0]} />
      <Plant position={[-halfW + 0.15, 0, halfD - 0.15]} leafColor="#22c55e" />
    </>
  )
}

function ContentFurniture({ halfW, halfD, edgeColor }: { halfW: number; halfD: number; edgeColor: string }) {
  return (
    <>
      <Desk position={[0.2, 0, -halfD + 0.35]} monitorColor={edgeColor} index={0} />
      <Chair position={[0.2, 0, -halfD + 0.55]} />
      <Easel position={[-halfW + 0.25, 0, -halfD + 0.2]} />
      <PenCup position={[0.35, 0.19, -halfD + 0.35]} />
      <MoodBoard position={[halfW - 0.15, 0, -halfD + 0.01]} />
      <DeskLamp position={[0.05, 0.19, -halfD + 0.3]} color="#f97316" />
      <Plant position={[-halfW + 0.15, 0, halfD - 0.15]} leafColor="#22c55e" />
    </>
  )
}

function DevFurniture({ halfW, halfD, edgeColor }: { halfW: number; halfD: number; edgeColor: string }) {
  return (
    <>
      <group position={[0, 0, -halfD + 0.35]}>
        <mesh position={[0, 0.18, 0]}>
          <boxGeometry args={[0.55, 0.015, 0.22]} />
          <meshStandardMaterial color="#5a4a3a" roughness={0.7} />
        </mesh>
        {([[-0.24, 0.09, -0.08], [0.24, 0.09, -0.08], [-0.24, 0.09, 0.08], [0.24, 0.09, 0.08]] as [number, number, number][]).map((p, i) => (
          <mesh key={i} position={p}>
            <boxGeometry args={[0.015, 0.18, 0.015]} />
            <meshStandardMaterial color="#4a3a2a" roughness={0.6} />
          </mesh>
        ))}
        <TripleMonitors position={[0, 0, 0]} color={edgeColor} />
      </group>
      <Chair position={[0, 0, -halfD + 0.6]} chairColor="#374151" />
      <ServerRack position={[-halfW + 0.15, 0, halfD - 0.12]} />
      <CoffeeCups position={[0.35, 0.19, -halfD + 0.38]} />
      <LEDStrip position={[0, 0.48, -halfD + 0.02]} color={edgeColor} />
    </>
  )
}

function SalesFurniture({ halfW, halfD, edgeColor }: { halfW: number; halfD: number; edgeColor: string }) {
  return (
    <>
      <Desk position={[0, 0, -halfD + 0.35]} monitorColor={edgeColor} index={0} />
      <Chair position={[0, 0, -halfD + 0.55]} />
      <PhoneOnDesk position={[0.2, 0.19, -halfD + 0.35]} />
      <ChartBoard position={[-halfW + 0.2, 0, -halfD + 0.01]} />
      <Briefcase position={[halfW - 0.2, 0, halfD - 0.15]} />
      <Trophy position={[halfW - 0.15, 0.19, -halfD + 0.15]} />
      <Nameplate position={[0, 0.19, -halfD + 0.2]} text="SALES" />
      <Plant position={[-halfW + 0.15, 0, halfD - 0.15]} leafColor="#22c55e" />
    </>
  )
}

function SceneRoomFurniture({ halfW, halfD }: { halfW: number; halfD: number }) {
  return (
    <>
      <ServerRack position={[-halfW + 0.18, 0, -halfD + 0.15]} />
      <ServerRack position={[-halfW + 0.45, 0, -halfD + 0.15]} />
      <ServerRack position={[halfW - 0.18, 0, -halfD + 0.15]} />
      <CableTray position={[0, 0, -halfD + 0.08]} />
      <CoolingUnit position={[halfW - 0.12, 0, halfD - 0.12]} />
      <CoolingUnit position={[-halfW + 0.12, 0, halfD - 0.12]} />
    </>
  )
}

function LobbyFurniture({ halfW, halfD }: { halfW: number; halfD: number }) {
  return (
    <>
      <ReceptionDesk position={[0, 0, -halfD + 0.2]} />
      <Couch position={[-0.5, 0, 0.2]} color="#7c3aed" />
      <CoffeeTable position={[0, 0, 0.2]} />
      <MagazineRack position={[halfW - 0.12, 0, 0]} />
      <WelcomeMat position={[0, 0.003, halfD - 0.15]} />
      <Plant position={[halfW - 0.15, 0, -halfD + 0.15]} leafColor="#34d399" scale={1.3} />
      <Plant position={[-halfW + 0.15, 0, halfD - 0.15]} leafColor="#16a34a" scale={1.2} />
    </>
  )
}

/* ─── Main OfficeRoom component ─── */

interface OfficeRoomProps {
  position: [number, number, number]
  size: [number, number, number]
  edgeColor: string
  monitorColor: string
  floorColor?: string
  agentId: AgentId
  roomName: string
}

export function OfficeRoom({
  position,
  size,
  edgeColor,
  floorColor = '#4a3422',
  agentId,
  roomName,
}: OfficeRoomProps) {
  const halfW = size[0] / 2
  const halfD = size[2] / 2

  return (
    <group position={position}>
      {/* Floor — unique color per room */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[size[0], size[2]]} />
        <meshStandardMaterial color={floorColor} roughness={0.85} />
      </mesh>

      {/* Subtle floor texture lines */}
      {Array.from({ length: Math.floor(size[2] / 0.2) }).map((_, i) => (
        <mesh key={`fp-${i}`} position={[0, 0.002, -halfD + (i + 1) * 0.2]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[size[0], 0.005]} />
          <meshStandardMaterial color="#000000" transparent opacity={0.12} />
        </mesh>
      ))}

      {/* Back wall — solid with agent-colored tint */}
      <mesh position={[0, 0.3, -halfD + 0.015]}>
        <boxGeometry args={[size[0], 0.6, 0.03]} />
        <meshStandardMaterial
          color={new THREE.Color(edgeColor).lerp(new THREE.Color('#e5e7eb'), 0.65)}
          roughness={0.7}
          metalness={0.05}
        />
      </mesh>

      {/* Room name on back wall */}
      <Text
        position={[0, 0.48, -halfD + 0.035]}
        fontSize={0.08}
        color={edgeColor}
        anchorX="center"
        anchorY="middle"
        font={undefined}
        maxWidth={size[0] - 0.3}
      >
        {roomName}
      </Text>

      {/* Side walls — half-height for visibility */}
      <mesh position={[-halfW + 0.015, 0.15, 0]}>
        <boxGeometry args={[0.03, 0.3, size[2]]} />
        <meshStandardMaterial
          color={new THREE.Color(edgeColor).lerp(new THREE.Color('#d1d5db'), 0.7)}
          roughness={0.7}
          transparent
          opacity={0.5}
        />
      </mesh>
      <mesh position={[halfW - 0.015, 0.15, 0]}>
        <boxGeometry args={[0.03, 0.3, size[2]]} />
        <meshStandardMaterial
          color={new THREE.Color(edgeColor).lerp(new THREE.Color('#d1d5db'), 0.7)}
          roughness={0.7}
          transparent
          opacity={0.5}
        />
      </mesh>

      {/* Floor edge trim */}
      <mesh position={[0, 0.005, -halfD]}>
        <boxGeometry args={[size[0] + 0.02, 0.015, 0.018]} />
        <meshStandardMaterial color={edgeColor} emissive={edgeColor} emissiveIntensity={0.4} metalness={0.3} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.005, halfD]}>
        <boxGeometry args={[size[0] + 0.02, 0.015, 0.018]} />
        <meshStandardMaterial color={edgeColor} emissive={edgeColor} emissiveIntensity={0.4} metalness={0.3} roughness={0.4} />
      </mesh>

      {/* Per-room furniture */}
      {agentId === 'ceo' && <CEOFurniture halfW={halfW} halfD={halfD} edgeColor={edgeColor} />}
      {agentId === 'hr' && <HRFurniture halfW={halfW} halfD={halfD} edgeColor={edgeColor} />}
      {agentId === 'marketing' && <MarketingFurniture halfW={halfW} halfD={halfD} edgeColor={edgeColor} />}
      {agentId === 'content' && <ContentFurniture halfW={halfW} halfD={halfD} edgeColor={edgeColor} />}
      {agentId === 'dev' && <DevFurniture halfW={halfW} halfD={halfD} edgeColor={edgeColor} />}
      {agentId === 'sales' && <SalesFurniture halfW={halfW} halfD={halfD} edgeColor={edgeColor} />}
      {agentId === 'scene' && <SceneRoomFurniture halfW={halfW} halfD={halfD} />}
      {agentId === 'customer' && <LobbyFurniture halfW={halfW} halfD={halfD} />}

      {/* Room ambient light */}
      <pointLight position={[0, 0.6, 0]} color={edgeColor} intensity={0.3} distance={4} />
    </group>
  )
}
