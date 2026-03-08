import React, { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Html, ContactShadows, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { Agent, Metric } from '../types';

interface Office3DProps {
  agents: Agent[];
  trees: { left: string; top: string }[];
  viewMode: 'birdsEye' | 'eagleEye' | '3d';
  zoomLevel: number;
}

const SHIRT_COLORS = [
  '#3b82f6', '#10b981', '#a855f7', '#f43f5e', 
  '#f59e0b', '#06b6d4', '#6366f1', '#ec4899'
];

// Helper to convert 2D percentages to 3D coordinates
const to3D = (pctX: number, pctY: number) => {
  const x = (pctX / 100) * 30 - 15;
  const z = (pctY / 100) * 12 - 6;
  return [x, z];
};

function Agent3D({ agent, index, agents }: { agent: Agent, index: number, agents: Agent[] }) {
  const groupRef = useRef<THREE.Group>(null);
  const [lastMsg, setLastMsg] = useState(agent.lastMessage);
  
  useEffect(() => {
    if (agent.lastMessage) setLastMsg(agent.lastMessage);
  }, [agent.lastMessage]);

  // Calculate target position
  const col = index % 4;
  const row = Math.floor(index / 4);
  const centerX = 20 + 10 + col * 20;
  const chairY = row === 0 ? 22.5 : 72.5;
  
  let targetPctX = centerX;
  let targetPctY = chairY;
  let targetRotY = row === 0 ? 0 : Math.PI;

  if (agent.status === 'idle') {
    if (agent.talkingTo) {
      const targetIndex = agents.findIndex(a => a.id === agent.talkingTo);
      if (targetIndex !== -1 && targetIndex !== index) {
        const tCol = targetIndex % 4;
        const tRow = Math.floor(targetIndex / 4);
        const tCenterX = 20 + 10 + tCol * 20;
        const tChairY = tRow === 0 ? 22.5 : 72.5;
        
        targetPctX = tCenterX + (index % 2 === 0 ? -3 : 3);
        targetPctY = tRow === 0 ? tChairY + 15 : tChairY - 15;
        targetRotY = tRow === 0 ? 0 : Math.PI;
      } else {
        targetPctX = 8 + (index % 3) * 3;
        targetPctY = 25 + (index * 7);
        targetRotY = -Math.PI / 2;
      }
    } else {
      targetPctX = 8 + (index % 3) * 3;
      targetPctY = 25 + (index * 7);
      targetRotY = -Math.PI / 2;
    }
  }

  const [targetX, targetZ] = to3D(targetPctX, targetPctY);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    // Smooth movement
    groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, targetX, 4 * delta);
    groupRef.current.position.z = THREE.MathUtils.lerp(groupRef.current.position.z, targetZ, 4 * delta);
    
    // Smooth rotation
    const currentRot = groupRef.current.rotation.y;
    // Handle wrap around for rotation
    let diff = targetRotY - currentRot;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    groupRef.current.rotation.y += diff * 4 * delta;

    // Bobbing animation when working
    if (agent.status === 'working') {
      groupRef.current.position.y = 0.5 + Math.sin(state.clock.elapsedTime * 10) * 0.05;
    } else {
      groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, 0.5, 4 * delta);
    }
  });

  const color = SHIRT_COLORS[index % SHIRT_COLORS.length];

  return (
    <group ref={groupRef} position={[targetX, 0.5, targetZ]}>
      {/* Body */}
      <mesh castShadow receiveShadow position={[0, 0.4, 0]}>
        <boxGeometry args={[0.6, 0.8, 0.4]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* Head */}
      <mesh castShadow receiveShadow position={[0, 1.0, 0]}>
        <boxGeometry args={[0.4, 0.4, 0.4]} />
        <meshStandardMaterial color="#fde68a" />
      </mesh>
      
      {/* Name Tag */}
      <Text
        position={[0, 1.4, 0]}
        fontSize={0.2}
        color="white"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="black"
      >
        {agent.type}
      </Text>

      {/* Speech Bubble */}
      {agent.status === 'idle' && agent.talkingTo && lastMsg && (
        <Html position={[0.5, 1.5, 0]} center zIndexRange={[100, 0]}>
          <div className="bg-white text-slate-900 text-[10px] px-3 py-2 rounded-xl rounded-bl-none shadow-xl font-medium w-32 border border-slate-200 pointer-events-none">
            {lastMsg}
          </div>
        </Html>
      )}
    </group>
  );
}

function Room({ col, row, agent }: { col: number, row: number, agent: Agent }) {
  const x = -9 + 3 + col * 6; // -9 is start of rooms, 3 is half width, 6 is width
  const z = -6 + 3 + row * 6; // -6 is start of rooms, 3 is half depth, 6 is depth

  let wallColor = "#cbd5e1";
  let floorColor = "#e2e8f0";
  let deskColor = "#b45309";

  if (agent.type.includes('CEO')) {
    floorColor = "#1e293b";
    deskColor = "#0f172a";
  } else if (agent.type.includes('CTO') || agent.type.includes('Developer')) {
    floorColor = "#0f172a";
    deskColor = "#1e293b";
  } else if (agent.type.includes('Sales') || agent.type.includes('Marketing') || agent.type.includes('CMO')) {
    floorColor = "#bfdbfe";
    deskColor = "#1e3a8a";
  } else if (agent.type.includes('Product') || agent.type.includes('Design')) {
    floorColor = "#e9d5ff";
    deskColor = "#581c87";
  } else if (agent.type.includes('Data')) {
    floorColor = "#a7f3d0";
    deskColor = "#065f46";
  } else {
    floorColor = "#fed7aa";
    deskColor = "#7c2d12";
  }

  return (
    <group position={[x, 0, z]}>
      {/* Floor */}
      <mesh receiveShadow position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[5.8, 5.8]} />
        <meshStandardMaterial color={floorColor} />
      </mesh>

      {/* CEO Red Carpet */}
      {agent.type.includes('CEO') && (
        <mesh receiveShadow position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[4, 4]} />
          <meshStandardMaterial color="#7f1d1d" />
        </mesh>
      )}

      {/* Walls */}
      {/* Top Wall (Outer) */}
      {row === 0 && (
        <mesh castShadow receiveShadow position={[0, 1, -2.9]}>
          <boxGeometry args={[6, 2, 0.2]} />
          <meshStandardMaterial color={wallColor} />
        </mesh>
      )}
      {/* Bottom Wall (Outer) */}
      {row === 1 && (
        <mesh castShadow receiveShadow position={[0, 1, 2.9]}>
          <boxGeometry args={[6, 2, 0.2]} />
          <meshStandardMaterial color={wallColor} />
        </mesh>
      )}
      {/* Right Wall (Outer) */}
      {col === 3 && (
        <mesh castShadow receiveShadow position={[2.9, 1, 0]}>
          <boxGeometry args={[0.2, 2, 6]} />
          <meshStandardMaterial color={wallColor} />
        </mesh>
      )}

      {/* Glass Wall (Left - Partial) */}
      {col > 0 && (
        <mesh castShadow receiveShadow position={[-2.9, 1, -1.5]}>
          <boxGeometry args={[0.1, 2, 3]} />
          <meshPhysicalMaterial color="#ffffff" transmission={0.9} opacity={1} transparent roughness={0.1} />
        </mesh>
      )}
      {/* Glass Wall (Bottom/Between rows - Partial) */}
      {row === 0 && (
        <mesh castShadow receiveShadow position={[-1.5, 1, 2.9]}>
          <boxGeometry args={[3, 2, 0.1]} />
          <meshPhysicalMaterial color="#ffffff" transmission={0.9} opacity={1} transparent roughness={0.1} />
        </mesh>
      )}

      {/* Desk */}
      <mesh castShadow receiveShadow position={[0, 0.4, row === 0 ? -1.5 : 1.5]}>
        <boxGeometry args={[3, 0.8, 1.2]} />
        <meshStandardMaterial color={deskColor} />
      </mesh>

      {/* Monitor */}
      <mesh castShadow receiveShadow position={[0, 1.0, row === 0 ? -1.8 : 1.8]}>
        <boxGeometry args={[1.2, 0.8, 0.1]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
      {/* Screen glow */}
      <mesh position={[0, 1.0, row === 0 ? -1.74 : 1.74]}>
        <planeGeometry args={[1.1, 0.7]} />
        <meshBasicMaterial color="#38bdf8" />
      </mesh>
    </group>
  );
}

function Lobby() {
  return (
    <group position={[-12, 0, 0]}>
      {/* Floor */}
      <mesh receiveShadow position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[5.8, 11.8]} />
        <meshStandardMaterial color="#cbd5e1" />
      </mesh>

      {/* Left Wall (Top part) */}
      <mesh castShadow receiveShadow position={[-2.9, 1, -4]}>
        <boxGeometry args={[0.2, 2, 4]} />
        <meshStandardMaterial color="#94a3b8" />
      </mesh>
      {/* Left Wall (Bottom part) */}
      <mesh castShadow receiveShadow position={[-2.9, 1, 4]}>
        <boxGeometry args={[0.2, 2, 4]} />
        <meshStandardMaterial color="#94a3b8" />
      </mesh>
      {/* Front Door (Glass) */}
      <mesh castShadow receiveShadow position={[-2.9, 1, 0]}>
        <boxGeometry args={[0.1, 2, 4]} />
        <meshPhysicalMaterial color="#ffffff" transmission={0.9} opacity={1} transparent roughness={0.1} />
      </mesh>
      {/* Door Handle */}
      <mesh castShadow receiveShadow position={[-2.8, 1, 0.5]}>
        <boxGeometry args={[0.1, 0.4, 0.1]} />
        <meshStandardMaterial color="#333333" />
      </mesh>
      
      {/* Glass Wall to Rooms (Partial) */}
      <mesh castShadow receiveShadow position={[2.9, 1, -3]}>
        <boxGeometry args={[0.1, 2, 6]} />
        <meshPhysicalMaterial color="#ffffff" transmission={0.9} opacity={1} transparent roughness={0.1} />
      </mesh>
      <mesh castShadow receiveShadow position={[2.9, 1, 4.5]}>
        <boxGeometry args={[0.1, 2, 3]} />
        <meshPhysicalMaterial color="#ffffff" transmission={0.9} opacity={1} transparent roughness={0.1} />
      </mesh>

      {/* Top Wall */}
      <mesh castShadow receiveShadow position={[0, 1, -5.9]}>
        <boxGeometry args={[6, 2, 0.2]} />
        <meshStandardMaterial color="#94a3b8" />
      </mesh>
      {/* Bottom Wall */}
      <mesh castShadow receiveShadow position={[0, 1, 5.9]}>
        <boxGeometry args={[6, 2, 0.2]} />
        <meshStandardMaterial color="#94a3b8" />
      </mesh>

      {/* Reception Desk */}
      <mesh castShadow receiveShadow position={[-1, 0.5, 0]}>
        <boxGeometry args={[1, 1, 4]} />
        <meshStandardMaterial color="#92400e" />
      </mesh>

      {/* Arcade Machine */}
      <group position={[-2, 0, -4]}>
        <mesh castShadow receiveShadow position={[0, 1, 0]}>
          <boxGeometry args={[1.5, 2, 1]} />
          <meshStandardMaterial color="#581c87" />
        </mesh>
        <mesh position={[0.76, 1.2, 0]} rotation={[0, Math.PI/2, 0]}>
          <planeGeometry args={[0.8, 0.6]} />
          <meshBasicMaterial color="#22d3ee" />
        </mesh>
      </group>

      {/* Sofa */}
      <mesh castShadow receiveShadow position={[-2, 0.4, 4]}>
        <boxGeometry args={[1, 0.8, 3]} />
        <meshStandardMaterial color="#4338ca" />
      </mesh>
    </group>
  );
}

function Trees({ trees }: { trees: { left: string; top: string }[] }) {
  return (
    <group>
      {trees.map((pos, i) => {
        // Convert % to world coordinates for a larger garden area
        // Garden is 60x60
        const x = (parseFloat(pos.left) / 100) * 60 - 30;
        const z = (parseFloat(pos.top) / 100) * 60 - 30;
        
        // Don't place trees inside the office (X: -15 to 15, Z: -6 to 6)
        if (x > -16 && x < 16 && z > -7 && z < 7) return null;

        return (
          <group key={i} position={[x, 0, z]}>
            {/* Trunk */}
            <mesh castShadow receiveShadow position={[0, 1, 0]}>
              <cylinderGeometry args={[0.4, 0.6, 2]} />
              <meshStandardMaterial color="#78350f" />
            </mesh>
            {/* Leaves */}
            <mesh castShadow receiveShadow position={[0, 3, 0]}>
              <sphereGeometry args={[2, 16, 16]} />
              <meshStandardMaterial color="#15803d" />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function CameraController({ viewMode, zoomLevel }: { viewMode: string, zoomLevel: number }) {
  useFrame((state) => {
    let targetPos = new THREE.Vector3(0, 20, 20);
    let targetLookAt = new THREE.Vector3(0, 0, 0);

    if (viewMode === 'birdsEye') {
      targetPos.set(0, 25 / zoomLevel, 0.1); // slight offset to avoid gimbal lock
    } else if (viewMode === 'eagleEye') {
      targetPos.set(0, 40 / zoomLevel, 0.1);
    } else if (viewMode === '3d') {
      targetPos.set(-20 / zoomLevel, 20 / zoomLevel, 20 / zoomLevel);
    }

    state.camera.position.lerp(targetPos, 0.05);
    state.camera.lookAt(targetLookAt);
  });
  return null;
}

export default function Office3D({ agents, trees, viewMode, zoomLevel }: Office3DProps) {
  return (
    <div className="w-full h-full bg-sky-200">
      <Canvas shadows camera={{ position: [0, 20, 20], fov: 45 }}>
        <CameraController viewMode={viewMode} zoomLevel={zoomLevel} />
        
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

        {/* Garden Ground */}
        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
          <planeGeometry args={[100, 100]} />
          <meshStandardMaterial color="#86efac" />
        </mesh>

        {/* Office Base */}
        <mesh receiveShadow position={[0, 0, 0]}>
          <boxGeometry args={[30.2, 0.2, 12.2]} />
          <meshStandardMaterial color="#475569" />
        </mesh>

        <Lobby />
        
        {agents.map((agent, i) => {
          const col = i % 4;
          const row = Math.floor(i / 4);
          return <Room key={`room-${i}`} col={col} row={row} agent={agent} />;
        })}

        {agents.map((agent, i) => (
          <Agent3D key={agent.id} agent={agent} index={i} agents={agents} />
        ))}

        <Trees trees={trees} />

        {viewMode === '3d' && <OrbitControls makeDefault maxPolarAngle={Math.PI / 2 - 0.1} />}
      </Canvas>
    </div>
  );
}
