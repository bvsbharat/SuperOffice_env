/**
 * Pathfinding Module
 *
 * Simple BFS-based pathfinding on a tile grid for agent collaboration movement.
 * Agents use this to navigate toward collaboration meeting points.
 */

import { TILE_SIZE, MAP_COLS, MAP_ROWS, ROOM_TILE_CENTERS } from './officeLayout'
import type { AgentId } from '../types'

interface Tile {
  x: number
  y: number
}

/**
 * TilePathfinder - Handles pathfinding on the office grid
 *
 * Converts between world coordinates and tile coordinates,
 * and finds paths using BFS (breadth-first search).
 */
export class TilePathfinder {
  private grid: boolean[][]  // true = walkable, false = obstacle
  private readonly tileSize: number = TILE_SIZE
  private readonly mapCols: number = MAP_COLS
  private readonly mapRows: number = MAP_ROWS

  constructor() {
    // Initialize walkable grid — for now, assume most tiles are walkable
    // In the future, this could be loaded from the tilemap collision layer
    this.grid = Array(this.mapRows)
      .fill(null)
      .map(() => Array(this.mapCols).fill(true))

    // Mark non-walkable areas based on room boundaries
    // Rooms are roughly positioned at these tile ranges, keep those clear
    // For simplicity, we'll just use open corridors and room centers
  }

  /**
   * Convert world coordinates to tile coordinates
   */
  worldToTile(worldX: number, worldY: number): Tile {
    const tx = Math.floor(worldX / this.tileSize)
    const ty = Math.floor(worldY / this.tileSize)
    return {
      x: Math.max(0, Math.min(this.mapCols - 1, tx)),
      y: Math.max(0, Math.min(this.mapRows - 1, ty)),
    }
  }

  /**
   * Convert tile coordinates to world coordinates (center of tile)
   */
  tileToWorld(tx: number, ty: number): { x: number; y: number } {
    return {
      x: tx * this.tileSize + this.tileSize / 2,
      y: ty * this.tileSize + this.tileSize / 2,
    }
  }

  /**
   * Check if a tile is walkable
   */
  isWalkable(tx: number, ty: number): boolean {
    if (tx < 0 || tx >= this.mapCols || ty < 0 || ty >= this.mapRows) {
      return false
    }
    return this.grid[ty][tx]
  }

  /**
   * Find path from start to end using BFS
   *
   * Returns array of tile coordinates, or empty array if no path found.
   * Uses Manhattan distance heuristic for efficiency.
   */
  findPath(startX: number, startY: number, endX: number, endY: number): Tile[] {
    // Convert to tile coordinates
    const startTile = this.worldToTile(startX, startY)
    const endTile = this.worldToTile(endX, endY)

    // Simple BFS
    const queue: Array<{ tile: Tile; path: Tile[] }> = [
      { tile: startTile, path: [startTile] },
    ]
    const visited = new Set<string>()
    visited.add(this.tileKey(startTile.x, startTile.y))

    const directions = [
      { dx: 0, dy: -1 },  // up
      { dx: 0, dy: 1 },   // down
      { dx: -1, dy: 0 },  // left
      { dx: 1, dy: 0 },   // right
    ]

    while (queue.length > 0) {
      const { tile, path } = queue.shift()!

      // Check if we reached the goal
      if (tile.x === endTile.x && tile.y === endTile.y) {
        return path
      }

      // Explore neighbors
      for (const { dx, dy } of directions) {
        const nextX = tile.x + dx
        const nextY = tile.y + dy
        const key = this.tileKey(nextX, nextY)

        if (!visited.has(key) && this.isWalkable(nextX, nextY)) {
          visited.add(key)
          queue.push({
            tile: { x: nextX, y: nextY },
            path: [...path, { x: nextX, y: nextY }],
          })
        }
      }
    }

    // No path found
    return []
  }

  /**
   * Get string key for tile coordinates
   */
  private tileKey(tx: number, ty: number): string {
    return `${tx},${ty}`
  }

  /**
   * Get walkable tiles in the grid (for debugging visualization)
   */
  getWalkableTiles(): Tile[] {
    const tiles: Tile[] = []
    for (let ty = 0; ty < this.mapRows; ty++) {
      for (let tx = 0; tx < this.mapCols; tx++) {
        if (this.isWalkable(tx, ty)) {
          tiles.push({ x: tx, y: ty })
        }
      }
    }
    return tiles
  }

  /**
   * Get agent's room center tile
   */
  getAgentRoomTile(agentId: AgentId): Tile {
    const pos = ROOM_TILE_CENTERS[agentId]
    return { x: pos.tx, y: pos.ty }
  }

  /**
   * Calculate simple distance between two tiles (Manhattan distance)
   */
  distance(t1: Tile, t2: Tile): number {
    return Math.abs(t1.x - t2.x) + Math.abs(t1.y - t2.y)
  }
}

// Singleton instance for convenience
export const pathfinder = new TilePathfinder()
