import { useState } from 'react'
import { PhaserGame } from './PhaserGame'
import { MapOverlays } from './MapOverlays'
import type { PhaserBridge } from '../game/OfficeScene'

export function OfficeMap() {
  const [bridge, setBridge] = useState<PhaserBridge | null>(null)
  const [tilt, setTilt] = useState(0)

  return (
    <div className="w-full h-full relative flex justify-center" style={{ background: '#99ff69', perspective: '1200px', overflow: 'hidden' }}>
      {/* Jungle background overlay — matches canvas green */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0, opacity: 0.35 }}>
        {/* Left side tree canopies */}
        <circle cx="4%" cy="10%" r="20" fill="#6abf3a" />
        <circle cx="3%" cy="11%" r="15" fill="#7cd44e" />
        <circle cx="7%" cy="8%" r="12" fill="#5eaa30" />
        <circle cx="9%" cy="25%" r="24" fill="#6abf3a" />
        <circle cx="6%" cy="23%" r="18" fill="#7cd44e" />
        <circle cx="12%" cy="26%" r="14" fill="#5eaa30" />
        <circle cx="3%" cy="45%" r="22" fill="#6abf3a" />
        <circle cx="6%" cy="42%" r="16" fill="#7cd44e" />
        <circle cx="8%" cy="47%" r="13" fill="#5eaa30" />
        <circle cx="5%" cy="65%" r="26" fill="#6abf3a" />
        <circle cx="3%" cy="62%" r="20" fill="#7cd44e" />
        <circle cx="9%" cy="68%" r="15" fill="#5eaa30" />
        <circle cx="4%" cy="85%" r="22" fill="#6abf3a" />
        <circle cx="7%" cy="82%" r="17" fill="#7cd44e" />
        <circle cx="10%" cy="87%" r="13" fill="#5eaa30" />
        <circle cx="2%" cy="55%" r="18" fill="#5eaa30" />
        <circle cx="11%" cy="38%" r="11" fill="#7cd44e" />
        <circle cx="1%" cy="75%" r="16" fill="#6abf3a" />
        {/* Right side tree canopies */}
        <circle cx="96%" cy="8%" r="20" fill="#6abf3a" />
        <circle cx="94%" cy="10%" r="15" fill="#7cd44e" />
        <circle cx="98%" cy="6%" r="12" fill="#5eaa30" />
        <circle cx="91%" cy="28%" r="24" fill="#6abf3a" />
        <circle cx="95%" cy="25%" r="18" fill="#7cd44e" />
        <circle cx="89%" cy="30%" r="14" fill="#5eaa30" />
        <circle cx="97%" cy="48%" r="22" fill="#6abf3a" />
        <circle cx="94%" cy="45%" r="16" fill="#7cd44e" />
        <circle cx="91%" cy="50%" r="13" fill="#5eaa30" />
        <circle cx="95%" cy="68%" r="26" fill="#6abf3a" />
        <circle cx="98%" cy="65%" r="20" fill="#7cd44e" />
        <circle cx="92%" cy="71%" r="15" fill="#5eaa30" />
        <circle cx="96%" cy="88%" r="22" fill="#6abf3a" />
        <circle cx="93%" cy="85%" r="17" fill="#7cd44e" />
        <circle cx="99%" cy="91%" r="13" fill="#5eaa30" />
        <circle cx="88%" cy="55%" r="11" fill="#7cd44e" />
        <circle cx="98%" cy="37%" r="16" fill="#6abf3a" />
        <circle cx="90%" cy="78%" r="18" fill="#5eaa30" />
        {/* Scattered smaller bushes */}
        <circle cx="14%" cy="15%" r="8" fill="#7cd44e" />
        <circle cx="86%" cy="18%" r="9" fill="#7cd44e" />
        <circle cx="13%" cy="50%" r="7" fill="#6abf3a" />
        <circle cx="87%" cy="60%" r="8" fill="#6abf3a" />
        <circle cx="15%" cy="72%" r="9" fill="#7cd44e" />
        <circle cx="85%" cy="42%" r="7" fill="#7cd44e" />
        {/* Trunk hints */}
        <rect x="3.5%" y="12%" width="3" height="10" rx="1" fill="#8B6914" opacity="0.25" />
        <rect x="8.5%" y="26%" width="3" height="12" rx="1" fill="#8B6914" opacity="0.25" />
        <rect x="95%" y="9%" width="3" height="10" rx="1" fill="#8B6914" opacity="0.25" />
        <rect x="91%" y="29%" width="3" height="12" rx="1" fill="#8B6914" opacity="0.25" />
        <rect x="4%" y="66%" width="3" height="10" rx="1" fill="#8B6914" opacity="0.25" />
        <rect x="95%" y="69%" width="3" height="10" rx="1" fill="#8B6914" opacity="0.25" />
      </svg>
      <div
        className="h-full relative"
        style={{
          width: '100%',
          maxWidth: '1020px',
          transform: `rotateX(${tilt}deg) scale(${1 + (tilt / 45) * 0.35})`,
          transformOrigin: '50% 50%',
          zIndex: 1,
        }}
      >
        <PhaserGame onBridgeReady={setBridge} />
      </div>

      {/* Overlays — outside 3D transform so z-index works reliably */}
      <MapOverlays bridge={bridge} />

      {/* Camera Controls — bottom-right, above the footer */}
      {bridge && (
        <div className="absolute bottom-3 right-3 flex flex-col items-center gap-1.5 pointer-events-auto z-10">
          {/* Tilt slider on top */}
          <div className="flex flex-col items-center gap-0.5 mb-1">
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
        </div>
      )}
    </div>
  )
}
