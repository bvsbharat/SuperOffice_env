import { useState } from 'react'
import { PhaserGame } from './PhaserGame'
import { MapOverlays } from './MapOverlays'
import type { PhaserBridge } from '../game/OfficeScene'

interface OfficeMapProps {
  onBridgeReady?: (bridge: PhaserBridge) => void
}

export function OfficeMap({ onBridgeReady }: OfficeMapProps) {
  const [bridge, setBridge] = useState<PhaserBridge | null>(null)
  const [tilt, setTilt] = useState(0)

  function handleBridge(b: PhaserBridge) {
    setBridge(b)
    onBridgeReady?.(b)
  }

  return (
    <div className="w-full h-full relative flex justify-center" style={{ background: '#99ff69', perspective: '1200px', overflow: 'hidden' }}>
      <div
        className="h-full relative"
        style={{
          width: '100%',
          maxWidth: '1400px',
          transform: `rotateX(${tilt}deg) scale(${1 + (tilt / 45) * 0.35})`,
          transformOrigin: '50% 50%',
          zIndex: 1,
        }}
      >
        <PhaserGame onBridgeReady={handleBridge} />
      </div>

      {/* Overlays — outside 3D transform so z-index works reliably */}
      <MapOverlays bridge={bridge} />

      {/* Tilt slider — stays on map since it affects CSS transform, not Phaser camera */}
      {bridge && (
        <div className="absolute bottom-3 right-3 flex flex-col items-center gap-0.5 pointer-events-auto z-10">
          <span className="text-[8px] select-none" style={{ color: 'var(--color-text-faint)' }}>TILT</span>
          <input
            type="range"
            min="0"
            max="45"
            value={tilt}
            onChange={(e) => setTilt(Number(e.target.value))}
            className="tilt-slider"
            title={`Tilt: ${tilt}°`}
          />
        </div>
      )}
    </div>
  )
}
