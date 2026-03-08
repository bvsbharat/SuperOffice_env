import type { AgentId } from '../types'

export const TILE_SIZE = 32
export const MAP_COLS = 40
export const MAP_ROWS = 34

// Visible area — full map so grass + plants are shown
export const BUILDING_MIN_COL = 0
export const BUILDING_MAX_COL = MAP_COLS
export const BUILDING_W = MAP_COLS * TILE_SIZE
export const BUILDING_H = MAP_ROWS * TILE_SIZE
export const BUILDING_CENTER_X = (MAP_COLS / 2) * TILE_SIZE
export const BUILDING_CENTER_Y = (MAP_ROWS / 2) * TILE_SIZE

// Room grid: 2 columns x 4 rows (8th room is empty meeting room)
export const ROOM_TILE_CENTERS: Record<AgentId, { tx: number; ty: number }> = {
  ceo:       { tx: 10, ty: 4 },
  hr:        { tx: 29, ty: 4 },
  marketing: { tx: 10, ty: 12 },
  content:   { tx: 29, ty: 12 },
  dev:       { tx: 10, ty: 20 },
  sales:     { tx: 29, ty: 20 },
  customer:  { tx: 10, ty: 28 },
}

// Where agents move during standup (center corridor area)
export const STANDUP_POSITIONS: Record<AgentId, { tx: number; ty: number }> = {
  ceo:       { tx: 19, ty: 4 },
  hr:        { tx: 20, ty: 4 },
  marketing: { tx: 19, ty: 12 },
  content:   { tx: 20, ty: 12 },
  dev:       { tx: 19, ty: 20 },
  sales:     { tx: 20, ty: 20 },
  customer:  { tx: 19, ty: 28 },
}

// Top-center of each room for label placement
export const ROOM_LABEL_POSITIONS: Record<AgentId, { tx: number; ty: number }> = {
  ceo:       { tx: 10, ty: 2 },
  hr:        { tx: 29, ty: 2 },
  marketing: { tx: 10, ty: 10 },
  content:   { tx: 29, ty: 10 },
  dev:       { tx: 10, ty: 18 },
  sales:     { tx: 29, ty: 18 },
  customer:  { tx: 10, ty: 26 },
}

export function tileToPixel(tx: number, ty: number): { x: number; y: number } {
  return { x: tx * TILE_SIZE + TILE_SIZE / 2, y: ty * TILE_SIZE + TILE_SIZE / 2 }
}
