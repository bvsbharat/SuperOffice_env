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

const SKIN_TONES: Record<AgentId, string> = {
  ceo:       '#F5D0A9',
  hr:        '#8D5524',
  marketing: '#FFDBB4',
  content:   '#C68642',
  dev:       '#F1C27D',
  sales:     '#E0AC69',
  scene:     '#D4A574',
  customer:  '#FFE0BD',
}

const HAIR_COLORS: Record<AgentId, string> = {
  ceo:       '#1a1a2e',
  hr:        '#2c1810',
  marketing: '#8B4513',
  content:   '#4a2c2a',
  dev:       '#1a1a1a',
  sales:     '#6B3A2A',
  scene:     '#2c2c2c',
  customer:  '#D4A76A',
}

const OUTFIT_CONFIG: Record<AgentId, { primary: string; secondary: string; accent?: string }> = {
  ceo:       { primary: '#1e293b', secondary: '#ffffff', accent: '#ef4444' },
  hr:        { primary: '#7c3aed', secondary: '#ede9fe' },
  marketing: { primary: '#ec4899', secondary: '#fdf2f8', accent: '#fbbf24' },
  content:   { primary: '#f97316', secondary: '#fff7ed' },
  dev:       { primary: '#22d3ee', secondary: '#1e293b' },
  sales:     { primary: '#fbbf24', secondary: '#ffffff' },
  scene:     { primary: '#34d399', secondary: '#1e293b' },
  customer:  { primary: '#f472b6', secondary: '#fdf2f8' },
}

const PANTS_CONFIG: Record<AgentId, { color: string; style: 'trousers' | 'skirt' }> = {
  ceo:       { color: '#1e293b', style: 'trousers' },
  hr:        { color: '#4c1d95', style: 'skirt' },
  marketing: { color: '#831843', style: 'trousers' },
  content:   { color: '#78350f', style: 'trousers' },
  dev:       { color: '#1e293b', style: 'trousers' },
  sales:     { color: '#1e293b', style: 'trousers' },
  scene:     { color: '#374151', style: 'trousers' },
  customer:  { color: '#f472b6', style: 'skirt' },
}

const EYE_COLORS: Record<AgentId, string> = {
  ceo:       '#6366f1',
  hr:        '#8b5cf6',
  marketing: '#ec4899',
  content:   '#f97316',
  dev:       '#22d3ee',
  sales:     '#92400e',
  scene:     '#34d399',
  customer:  '#f472b6',
}

function HumanHead({ skinColor, hairColor, eyeColor, agentId }: { skinColor: THREE.Color; hairColor: THREE.Color; eyeColor: string; agentId: AgentId }) {
  return (
    <group position={[0, 0.58, 0]}>
      {/* Head sphere */}
      <mesh>
        <sphereGeometry args={[0.12, 12, 10]} />
        <meshStandardMaterial color={skinColor} roughness={0.6} metalness={0.05} />
      </mesh>

      {/* Eyes - anime style larger */}
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

      {/* Nose - anime minimal */}
      <mesh position={[0, -0.005, 0.12]}>
        <sphereGeometry args={[0.006, 5, 5]} />
        <meshStandardMaterial color={skinColor.clone().lerp(new THREE.Color('#cc8866'), 0.2)} roughness={0.5} />
      </mesh>

      {/* Mouth - cute smile line */}
      <mesh position={[0, -0.03, 0.11]} rotation={[0.2, 0, 0]} scale={[1.2, 0.4, 0.5]}>
        <sphereGeometry args={[0.015, 8, 6]} />
        <meshStandardMaterial color="#e88a9a" roughness={0.5} />
      </mesh>

      {/* Ears - small human ears */}
      <mesh position={[-0.115, 0.0, 0]} scale={[0.5, 1, 0.6]}>
        <sphereGeometry args={[0.03, 6, 6]} />
        <meshStandardMaterial color={skinColor} roughness={0.6} />
      </mesh>
      <mesh position={[0.115, 0.0, 0]} scale={[0.5, 1, 0.6]}>
        <sphereGeometry args={[0.03, 6, 6]} />
        <meshStandardMaterial color={skinColor} roughness={0.6} />
      </mesh>

      {/* Hair per agent */}
      <AgentHair agentId={agentId} hairColor={hairColor} />
    </group>
  )
}

function AgentHair({ agentId, hairColor }: { agentId: AgentId; hairColor: THREE.Color }) {
  switch (agentId) {
    case 'ceo':
      // Slicked back short hair — extended back coverage
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
    case 'hr':
      // Medium bob — side pieces lowered to jawline
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
    case 'marketing':
      // Stylish updo with colored streak
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
          {/* Pink streak — larger and more visible */}
          <mesh position={[0.05, 0.04, 0.08]} scale={[0.25, 0.65, 0.35]}>
            <sphereGeometry args={[0.08, 6, 6]} />
            <meshStandardMaterial color="#ec4899" roughness={0.5} />
          </mesh>
        </group>
      )
    case 'content':
      // Messy artistic bob (beret added via accessory)
      return (
        <group>
          <mesh position={[0, 0.04, -0.01]} scale={[1.08, 0.7, 1.05]}>
            <sphereGeometry args={[0.125, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
            <meshStandardMaterial color={hairColor} roughness={0.75} />
          </mesh>
          {/* Messy strands — pulled further out */}
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
    case 'dev':
      // Short spiky hair
      return (
        <group>
          <mesh position={[0, 0.04, 0]} scale={[1, 0.6, 1]}>
            <sphereGeometry args={[0.125, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
            <meshStandardMaterial color={hairColor} roughness={0.7} />
          </mesh>
          {[[-0.05, 0.09, 0.03], [0.04, 0.1, 0.01], [-0.01, 0.11, -0.04], [0.06, 0.08, -0.02], [-0.03, 0.1, -0.01]].map((pos, i) => (
            <mesh key={i} position={pos as [number, number, number]}>
              <coneGeometry args={[0.025, 0.05, 4]} />
              <meshStandardMaterial color={hairColor} roughness={0.7} />
            </mesh>
          ))}
        </group>
      )
    case 'sales':
      // Neat side-parted
      return (
        <group>
          <mesh position={[0, 0.04, -0.01]} scale={[1, 0.7, 1]}>
            <sphereGeometry args={[0.125, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
            <meshStandardMaterial color={hairColor} roughness={0.6} />
          </mesh>
          {/* Side part sweep — larger and with second piece */}
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
    case 'scene':
      // Buzz cut — taller and slightly darker
      return (
        <mesh position={[0, 0.04, -0.01]} scale={[1.02, 0.65, 1.02]}>
          <sphereGeometry args={[0.124, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.52]} />
          <meshStandardMaterial color={hairColor.clone().lerp(new THREE.Color('#1a1a1a'), 0.15)} roughness={0.85} />
        </mesh>
      )
    case 'customer':
      // Long flowing hair
      return (
        <group>
          <mesh position={[0, 0.04, -0.01]} scale={[1.05, 0.75, 1]}>
            <sphereGeometry args={[0.125, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
            <meshStandardMaterial color={hairColor} roughness={0.55} />
          </mesh>
          {/* Long flowing sides — extended lower */}
          <mesh position={[-0.09, -0.09, -0.02]} scale={[0.45, 1.2, 0.55]}>
            <sphereGeometry args={[0.07, 6, 6]} />
            <meshStandardMaterial color={hairColor} roughness={0.55} />
          </mesh>
          <mesh position={[0.09, -0.09, -0.02]} scale={[0.45, 1.2, 0.55]}>
            <sphereGeometry args={[0.07, 6, 6]} />
            <meshStandardMaterial color={hairColor} roughness={0.55} />
          </mesh>
          {/* Back flow — larger */}
          <mesh position={[0, -0.06, -0.06]} scale={[0.85, 1.15, 0.55]}>
            <sphereGeometry args={[0.08, 6, 6]} />
            <meshStandardMaterial color={hairColor} roughness={0.55} />
          </mesh>
        </group>
      )
  }
}

function OfficeOutfit({ agentId, outfit }: { agentId: AgentId; outfit: { primary: string; secondary: string; accent?: string } }) {
  switch (agentId) {
    case 'ceo':
      // Blazer + white shirt + red tie
      return (
        <group>
          {/* Blazer torso */}
          <mesh position={[0, 0.38, 0]}>
            <capsuleGeometry args={[0.105, 0.16, 6, 8]} />
            <meshStandardMaterial color={outfit.primary} roughness={0.7} />
          </mesh>
          {/* White shirt V */}
          <mesh position={[0, 0.40, 0.08]} scale={[0.4, 0.8, 0.3]}>
            <boxGeometry args={[0.08, 0.12, 0.02]} />
            <meshStandardMaterial color={outfit.secondary} roughness={0.6} />
          </mesh>
          {/* Red tie */}
          <mesh position={[0, 0.37, 0.09]} scale={[1, 1, 0.5]}>
            <boxGeometry args={[0.02, 0.1, 0.015]} />
            <meshStandardMaterial color={outfit.accent!} roughness={0.4} />
          </mesh>
          {/* Collar left */}
          <mesh position={[-0.03, 0.47, 0.07]} rotation={[0, 0, 0.4]}>
            <boxGeometry args={[0.03, 0.02, 0.015]} />
            <meshStandardMaterial color={outfit.secondary} roughness={0.6} />
          </mesh>
          {/* Collar right */}
          <mesh position={[0.03, 0.47, 0.07]} rotation={[0, 0, -0.4]}>
            <boxGeometry args={[0.03, 0.02, 0.015]} />
            <meshStandardMaterial color={outfit.secondary} roughness={0.6} />
          </mesh>
        </group>
      )
    case 'hr':
      // Button-up blouse + pencil skirt
      return (
        <group>
          {/* Blouse */}
          <mesh position={[0, 0.40, 0]}>
            <capsuleGeometry args={[0.1, 0.12, 6, 8]} />
            <meshStandardMaterial color={outfit.primary} roughness={0.6} />
          </mesh>
          {/* Pencil skirt (hips area) */}
          <mesh position={[0, 0.28, 0]}>
            <capsuleGeometry args={[0.1, 0.06, 6, 8]} />
            <meshStandardMaterial color={outfit.primary} roughness={0.65} />
          </mesh>
          {/* Collar */}
          <mesh position={[0, 0.475, 0.05]} scale={[1.2, 0.5, 0.8]}>
            <boxGeometry args={[0.08, 0.02, 0.02]} />
            <meshStandardMaterial color={outfit.secondary} roughness={0.5} />
          </mesh>
        </group>
      )
    case 'marketing':
      // Trendy blazer + gold scarf
      return (
        <group>
          {/* Blazer */}
          <mesh position={[0, 0.38, 0]}>
            <capsuleGeometry args={[0.105, 0.16, 6, 8]} />
            <meshStandardMaterial color={outfit.primary} roughness={0.6} />
          </mesh>
          {/* Gold scarf */}
          <mesh position={[0, 0.47, 0.06]}>
            <torusGeometry args={[0.06, 0.015, 6, 12]} />
            <meshStandardMaterial color={outfit.accent!} metalness={0.3} roughness={0.4} />
          </mesh>
        </group>
      )
    case 'content':
      // Casual turtleneck
      return (
        <group>
          <mesh position={[0, 0.38, 0]}>
            <capsuleGeometry args={[0.1, 0.16, 6, 8]} />
            <meshStandardMaterial color={outfit.primary} roughness={0.65} />
          </mesh>
          {/* Turtleneck collar */}
          <mesh position={[0, 0.48, 0]}>
            <cylinderGeometry args={[0.055, 0.06, 0.04, 8]} />
            <meshStandardMaterial color={outfit.primary} roughness={0.65} />
          </mesh>
        </group>
      )
    case 'dev':
      // Hoodie
      return (
        <group>
          {/* Hoodie body */}
          <mesh position={[0, 0.38, 0]}>
            <capsuleGeometry args={[0.108, 0.16, 6, 8]} />
            <meshStandardMaterial color={outfit.primary} roughness={0.75} />
          </mesh>
          {/* Hood (behind head) */}
          <mesh position={[0, 0.52, -0.06]} scale={[0.9, 0.7, 0.7]}>
            <sphereGeometry args={[0.1, 8, 6, 0, Math.PI * 2, 0.3, Math.PI * 0.5]} />
            <meshStandardMaterial color={outfit.secondary} roughness={0.75} />
          </mesh>
          {/* Front pocket */}
          <mesh position={[0, 0.33, 0.1]} scale={[1, 0.5, 0.3]}>
            <boxGeometry args={[0.1, 0.04, 0.02]} />
            <meshStandardMaterial color={outfit.secondary} roughness={0.7} />
          </mesh>
        </group>
      )
    case 'sales':
      // Dress shirt + gold vest
      return (
        <group>
          {/* White shirt */}
          <mesh position={[0, 0.38, 0]}>
            <capsuleGeometry args={[0.1, 0.16, 6, 8]} />
            <meshStandardMaterial color={outfit.secondary} roughness={0.6} />
          </mesh>
          {/* Gold vest overlay */}
          <mesh position={[0, 0.39, 0.01]}>
            <capsuleGeometry args={[0.095, 0.12, 6, 8]} />
            <meshStandardMaterial color={outfit.primary} roughness={0.5} metalness={0.1} transparent opacity={0.85} />
          </mesh>
          {/* Collar */}
          <mesh position={[-0.03, 0.47, 0.06]} rotation={[0, 0, 0.3]}>
            <boxGeometry args={[0.025, 0.018, 0.012]} />
            <meshStandardMaterial color={outfit.secondary} roughness={0.5} />
          </mesh>
          <mesh position={[0.03, 0.47, 0.06]} rotation={[0, 0, -0.3]}>
            <boxGeometry args={[0.025, 0.018, 0.012]} />
            <meshStandardMaterial color={outfit.secondary} roughness={0.5} />
          </mesh>
        </group>
      )
    case 'scene':
      // Tech polo + collar
      return (
        <group>
          <mesh position={[0, 0.38, 0]}>
            <capsuleGeometry args={[0.1, 0.16, 6, 8]} />
            <meshStandardMaterial color={outfit.primary} roughness={0.65} />
          </mesh>
          {/* Polo collar */}
          <mesh position={[0, 0.475, 0.03]} rotation={[-0.2, 0, 0]}>
            <boxGeometry args={[0.09, 0.025, 0.06]} />
            <meshStandardMaterial color={outfit.primary} roughness={0.6} />
          </mesh>
        </group>
      )
    case 'customer':
      // Reception dress
      return (
        <group>
          <mesh position={[0, 0.36, 0]}>
            <capsuleGeometry args={[0.1, 0.2, 6, 8]} />
            <meshStandardMaterial color={outfit.primary} roughness={0.55} />
          </mesh>
          {/* Neckline */}
          <mesh position={[0, 0.465, 0.06]} scale={[1, 0.4, 0.5]}>
            <sphereGeometry args={[0.04, 6, 6]} />
            <meshStandardMaterial color={new THREE.Color(SKIN_TONES.customer)} roughness={0.6} />
          </mesh>
        </group>
      )
  }
}

function AgentAccessoryMesh({ accessory, agentId, accentObj }: { accessory: AgentAccessory; agentId: AgentId; accentObj: THREE.Color }) {
  switch (accessory) {
    case 'tie_clip':
      return (
        <mesh position={[0, 0.39, 0.1]}>
          <boxGeometry args={[0.03, 0.006, 0.006]} />
          <meshStandardMaterial color="#fbbf24" metalness={0.9} roughness={0.1} />
        </mesh>
      )
    case 'headset':
      return (
        <group position={[0, 0.58, 0]}>
          <mesh position={[-0.125, -0.01, 0]}>
            <sphereGeometry args={[0.025, 8, 8]} />
            <meshStandardMaterial color="#374151" metalness={0.5} roughness={0.3} />
          </mesh>
          <mesh position={[0.125, -0.01, 0]}>
            <sphereGeometry args={[0.025, 8, 8]} />
            <meshStandardMaterial color="#374151" metalness={0.5} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.06, 0]}>
            <torusGeometry args={[0.1, 0.008, 8, 16, Math.PI]} />
            <meshStandardMaterial color="#374151" metalness={0.5} roughness={0.3} />
          </mesh>
          {/* Mic arm */}
          <mesh position={[-0.13, -0.04, 0.04]} rotation={[0, 0, 0.3]}>
            <cylinderGeometry args={[0.003, 0.003, 0.06, 4]} />
            <meshStandardMaterial color="#374151" metalness={0.5} />
          </mesh>
          <mesh position={[-0.14, -0.06, 0.06]}>
            <sphereGeometry args={[0.008, 6, 6]} />
            <meshStandardMaterial color="#1a1a1a" roughness={0.3} />
          </mesh>
        </group>
      )
    case 'sunglasses':
      return (
        <group position={[0, 0.595, 0.1]}>
          <mesh position={[-0.035, 0, 0.02]} rotation={[Math.PI / 2, 0, 0]} scale={[1.1, 0.6, 1]}>
            <cylinderGeometry args={[0.022, 0.022, 0.012, 8]} />
            <meshStandardMaterial color="#1a1a2e" transparent opacity={0.7} metalness={0.6} />
          </mesh>
          <mesh position={[0.035, 0, 0.02]} rotation={[Math.PI / 2, 0, 0]} scale={[1.1, 0.6, 1]}>
            <cylinderGeometry args={[0.022, 0.022, 0.012, 8]} />
            <meshStandardMaterial color="#1a1a2e" transparent opacity={0.7} metalness={0.6} />
          </mesh>
          <mesh position={[0, 0, 0.015]}>
            <boxGeometry args={[0.02, 0.004, 0.004]} />
            <meshStandardMaterial color="#ec4899" metalness={0.6} roughness={0.2} />
          </mesh>
        </group>
      )
    case 'beret':
      return (
        <group position={[0.02, 0.68, 0.01]}>
          <mesh>
            <sphereGeometry args={[0.07, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color={accentObj} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.015, 0]}>
            <sphereGeometry args={[0.012, 6, 6]} />
            <meshStandardMaterial color={accentObj} roughness={0.5} />
          </mesh>
        </group>
      )
    case 'glasses':
      return (
        <group position={[0, 0.59, 0.11]}>
          <mesh position={[-0.035, 0, 0.01]}>
            <boxGeometry args={[0.035, 0.022, 0.008]} />
            <meshStandardMaterial color="#94a3b8" transparent opacity={0.3} metalness={0.4} />
          </mesh>
          <mesh position={[0.035, 0, 0.01]}>
            <boxGeometry args={[0.035, 0.022, 0.008]} />
            <meshStandardMaterial color="#94a3b8" transparent opacity={0.3} metalness={0.4} />
          </mesh>
          {/* Frame */}
          <mesh position={[-0.035, 0, 0.01]}>
            <torusGeometry args={[0.018, 0.002, 4, 8]} />
            <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.3} />
          </mesh>
          <mesh position={[0.035, 0, 0.01]}>
            <torusGeometry args={[0.018, 0.002, 4, 8]} />
            <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.3} />
          </mesh>
          {/* Bridge */}
          <mesh position={[0, 0, 0.012]}>
            <boxGeometry args={[0.015, 0.003, 0.003]} />
            <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.3} />
          </mesh>
        </group>
      )
    case 'watch':
      // Positioned on left wrist area
      return (
        <group position={[-0.14, 0.24, 0.05]}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.015, 0.015, 0.005, 8]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.8} roughness={0.15} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.016, 0.002, 6, 8]} />
            <meshStandardMaterial color="#b8860b" metalness={0.8} roughness={0.15} />
          </mesh>
        </group>
      )
    case 'lanyard':
      return (
        <group>
          {/* Lanyard strap */}
          <mesh position={[0, 0.45, 0.08]}>
            <boxGeometry args={[0.015, 0.12, 0.003]} />
            <meshStandardMaterial color="#34d399" roughness={0.6} />
          </mesh>
          {/* ID badge */}
          <mesh position={[0, 0.38, 0.085]}>
            <boxGeometry args={[0.035, 0.045, 0.004]} />
            <meshStandardMaterial color="#ffffff" roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.39, 0.088]}>
            <boxGeometry args={[0.02, 0.015, 0.002]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.5} />
          </mesh>
        </group>
      )
    case 'hair_clip':
      return (
        <group position={[0.08, 0.63, 0.04]}>
          <mesh rotation={[0, 0, -0.3]}>
            <boxGeometry args={[0.025, 0.008, 0.01]} />
            <meshStandardMaterial color="#ec4899" metalness={0.4} roughness={0.3} />
          </mesh>
          {/* Small decorative gem */}
          <mesh position={[0.005, 0.005, 0.005]}>
            <sphereGeometry args={[0.005, 6, 6]} />
            <meshStandardMaterial color="#f9a8d4" emissive="#f9a8d4" emissiveIntensity={0.3} metalness={0.5} />
          </mesh>
        </group>
      )
  }
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

  const skinColor = useMemo(() => new THREE.Color(SKIN_TONES[agentId]), [agentId])
  const hairColor = useMemo(() => new THREE.Color(HAIR_COLORS[agentId]), [agentId])
  const outfit = OUTFIT_CONFIG[agentId]
  const eyeColor = EYE_COLORS[agentId]
  const colorObj = useMemo(() => new THREE.Color(color), [color])
  const accentObj = useMemo(() => new THREE.Color(accentColor), [accentColor])

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
      // Arrived - trigger wave
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
        // Wave animation - arms up
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
      scale={hovered ? 1.08 * 1.6 : 1.6}
    >
      {/* === LEGS === */}
      {/* Upper legs */}
      <mesh position={[-0.06, 0.14, 0]}>
        <capsuleGeometry args={[0.04, 0.12, 4, 6]} />
        <meshStandardMaterial color={skinColor} roughness={0.6} />
      </mesh>
      <mesh position={[0.06, 0.14, 0]}>
        <capsuleGeometry args={[0.04, 0.12, 4, 6]} />
        <meshStandardMaterial color={skinColor} roughness={0.6} />
      </mesh>
      {/* Lower legs */}
      <mesh position={[-0.06, 0.06, 0]}>
        <capsuleGeometry args={[0.03, 0.1, 4, 6]} />
        <meshStandardMaterial color={skinColor} roughness={0.6} />
      </mesh>
      <mesh position={[0.06, 0.06, 0]}>
        <capsuleGeometry args={[0.03, 0.1, 4, 6]} />
        <meshStandardMaterial color={skinColor} roughness={0.6} />
      </mesh>
      {/* Pants / Skirt */}
      {PANTS_CONFIG[agentId].style === 'trousers' ? (
        <>
          <mesh position={[-0.06, 0.14, 0]}>
            <capsuleGeometry args={[0.042, 0.12, 4, 6]} />
            <meshStandardMaterial color={PANTS_CONFIG[agentId].color} roughness={0.7} />
          </mesh>
          <mesh position={[0.06, 0.14, 0]}>
            <capsuleGeometry args={[0.042, 0.12, 4, 6]} />
            <meshStandardMaterial color={PANTS_CONFIG[agentId].color} roughness={0.7} />
          </mesh>
        </>
      ) : (
        <mesh position={[0, 0.22, 0]}>
          <capsuleGeometry args={[0.08, 0.08, 6, 8]} />
          <meshStandardMaterial color={PANTS_CONFIG[agentId].color} roughness={0.6} />
        </mesh>
      )}

      {/* Shoes */}
      <mesh position={[-0.06, 0.015, 0.015]}>
        <boxGeometry args={[0.055, 0.03, 0.07]} />
        <meshStandardMaterial color="#1a1a2e" roughness={0.7} />
      </mesh>
      <mesh position={[0.06, 0.015, 0.015]}>
        <boxGeometry args={[0.055, 0.03, 0.07]} />
        <meshStandardMaterial color="#1a1a2e" roughness={0.7} />
      </mesh>

      {/* === NECK === */}
      <mesh position={[0, 0.50, 0]}>
        <cylinderGeometry args={[0.03, 0.035, 0.04, 6]} />
        <meshStandardMaterial color={skinColor} roughness={0.6} />
      </mesh>

      {/* === TORSO + HIPS (skin base, covered by clothing) === */}
      <mesh position={[0, 0.38, 0]}>
        <capsuleGeometry args={[0.09, 0.14, 6, 8]} />
        <meshStandardMaterial color={skinColor} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.27, 0]}>
        <sphereGeometry args={[0.09, 8, 6]} />
        <meshStandardMaterial color={skinColor} roughness={0.6} />
      </mesh>

      {/* === CLOTHING LAYER === */}
      <OfficeOutfit agentId={agentId} outfit={outfit} />

      {/* === HEAD (with face + hair) === */}
      <HumanHead skinColor={skinColor} hairColor={hairColor} eyeColor={eyeColor} agentId={agentId} />

      {/* === ARMS === */}
      <group ref={leftArmRef} position={[-0.14, 0.42, 0]}>
        {/* Upper arm */}
        <mesh position={[0, -0.04, 0]}>
          <capsuleGeometry args={[0.03, 0.1, 4, 6]} />
          <meshStandardMaterial color={outfit.primary} roughness={0.7} />
        </mesh>
        {/* Lower arm (skin) */}
        <mesh position={[0, -0.13, 0]}>
          <capsuleGeometry args={[0.025, 0.08, 4, 6]} />
          <meshStandardMaterial color={skinColor} roughness={0.6} />
        </mesh>
        {/* Hand */}
        <mesh position={[0, -0.19, 0]}>
          <sphereGeometry args={[0.022, 6, 6]} />
          <meshStandardMaterial color={skinColor} roughness={0.6} />
        </mesh>
      </group>
      <group ref={rightArmRef} position={[0.14, 0.42, 0]}>
        {/* Upper arm */}
        <mesh position={[0, -0.04, 0]}>
          <capsuleGeometry args={[0.03, 0.1, 4, 6]} />
          <meshStandardMaterial color={outfit.primary} roughness={0.7} />
        </mesh>
        {/* Lower arm (skin) */}
        <mesh position={[0, -0.13, 0]}>
          <capsuleGeometry args={[0.025, 0.08, 4, 6]} />
          <meshStandardMaterial color={skinColor} roughness={0.6} />
        </mesh>
        {/* Hand */}
        <mesh position={[0, -0.19, 0]}>
          <sphereGeometry args={[0.022, 6, 6]} />
          <meshStandardMaterial color={skinColor} roughness={0.6} />
        </mesh>
      </group>

      {/* === ACCESSORIES === */}
      <AgentAccessoryMesh accessory={accessory} agentId={agentId} accentObj={accentObj} />

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
        <pointLight position={[0, 0.45, 0.1]} color={color} intensity={0.6} distance={1.5} />
      )}
    </group>
  )
}
