import { useState } from 'react'
import { PhaserGame } from './PhaserGame'
import { MapOverlays } from './MapOverlays'
import type { PhaserBridge } from '../game/OfficeScene'

export function OfficeMap() {
  const [bridge, setBridge] = useState<PhaserBridge | null>(null)
  const [tilt, setTilt] = useState(0)

  return (
    <div className="w-full h-full relative" style={{ background: 'rgb(153 255 105)', perspective: '1200px', overflow: 'visible' }}>
      <div
        className="w-full h-full relative"
        style={{
          transform: `rotateX(${tilt}deg) scale(${1 + (tilt / 45) * 0.35})`,
          transformOrigin: '50% 50%',
          zIndex: 1,
        }}
      >
        <PhaserGame onBridgeReady={setBridge} />
      </div>

      {/* Overlays — outside 3D transform so z-index works reliably */}
      <MapOverlays bridge={bridge} />

      {/* Camera Controls */}
      {bridge && (
        <div className="absolute top-3 right-3 flex flex-col gap-1.5 pointer-events-auto z-10">
          <button
            onClick={() => bridge.zoomIn()}
            className="map-control-btn"
            title="Zoom In"
          >
            +
          </button>
          <button
            onClick={() => bridge.zoomOut()}
            className="map-control-btn"
            title="Zoom Out"
          >
            &minus;
          </button>
          <button
            onClick={() => bridge.resetCamera()}
            className="map-control-btn text-[10px]"
            title="Reset View"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 1 3 7" />
              <polyline points="3 22 3 16 9 16" />
            </svg>
          </button>

          {/* Tilt slider */}
          <div className="mt-2 flex flex-col items-center gap-0.5">
            <span className="text-[8px] text-gray-400 select-none">TILT</span>
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
        </div>
      )}
    </div>
  )
}
