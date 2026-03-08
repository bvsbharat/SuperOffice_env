import type { AgentId } from '../types'

export const TILE_SIZE = 32
export const MAP_COLS = 40
export const MAP_ROWS = 34

// Building area (excluding grass borders)
// Left rooms start at col 5, right rooms end at col 34
export const BUILDING_MIN_COL = 4
export const BUILDING_MAX_COL = 35
export const BUILDING_W = (BUILDING_MAX_COL - BUILDING_MIN_COL) * TILE_SIZE  // 992px
export const BUILDING_H = MAP_ROWS * TILE_SIZE                                // 1088px
export const BUILDING_CENTER_X = ((BUILDING_MIN_COL + BUILDING_MAX_COL) / 2) * TILE_SIZE  // 624px
export const BUILDING_CENTER_Y = (MAP_ROWS / 2) * TILE_SIZE                               // 544px

// Room grid: 2 columns x 4 rows
// Left rooms: cols 5-16 (12 wide), Right rooms: cols 23-34 (12 wide)
// Corridor: cols 17-22 (6 wide), Grass border: cols 0-4, cols 35-39
// Room rows: y=1-7, y=9-15, y=17-23, y=25-31 (7 tiles tall each)
// Interior: top wall + transition + 4 interior rows + bottom wall

export const ROOM_TILE_CENTERS: Record<AgentId, { tx: number; ty: number }> = {
  ceo:       { tx: 10, ty: 4 },
  hr:        { tx: 29, ty: 4 },
  marketing: { tx: 10, ty: 12 },
  content:   { tx: 29, ty: 12 },
  dev:       { tx: 10, ty: 20 },
  sales:     { tx: 29, ty: 20 },
  scene:     { tx: 10, ty: 28 },
  customer:  { tx: 29, ty: 28 },
}

// Where agents move during standup (center corridor area)
export const STANDUP_POSITIONS: Record<AgentId, { tx: number; ty: number }> = {
  ceo:       { tx: 19, ty: 4 },
  hr:        { tx: 20, ty: 4 },
  marketing: { tx: 19, ty: 12 },
  content:   { tx: 20, ty: 12 },
  dev:       { tx: 19, ty: 20 },
  sales:     { tx: 20, ty: 20 },
  scene:     { tx: 19, ty: 28 },
  customer:  { tx: 20, ty: 28 },
}

// Top-center of each room for label placement
export const ROOM_LABEL_POSITIONS: Record<AgentId, { tx: number; ty: number }> = {
  ceo:       { tx: 10, ty: 2 },
  hr:        { tx: 29, ty: 2 },
  marketing: { tx: 10, ty: 10 },
  content:   { tx: 29, ty: 10 },
  dev:       { tx: 10, ty: 18 },
  sales:     { tx: 29, ty: 18 },
  scene:     { tx: 10, ty: 26 },
  customer:  { tx: 29, ty: 26 },
}

export function tileToPixel(tx: number, ty: number): { x: number; y: number } {
  return { x: tx * TILE_SIZE + TILE_SIZE / 2, y: ty * TILE_SIZE + TILE_SIZE / 2 }
}
