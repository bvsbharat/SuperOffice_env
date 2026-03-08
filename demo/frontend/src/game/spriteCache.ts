/**
 * Sprite Caching System
 *
 * Manages sprite caching and pre-rendering at different zoom levels
 * to maintain 60fps performance across zoom ranges 0.3x to 3.0x.
 */

import Phaser from 'phaser'

/**
 * SpriteCache - Caches and manages sprite rendering at different zoom levels
 */
export class SpriteCache {
  private cache: Map<string, Map<number, Phaser.GameObjects.Image>> = new Map()
  private commonZooms: number[] = [0.3, 0.5, 1.0, 1.5, 2.0, 3.0]
  private currentZoom: number = 1.0
  private scene: Phaser.Scene

  constructor(scene: Phaser.Scene) {
    this.scene = scene
  }

  /**
   * Get cached sprite at a specific zoom level
   *
   * Creates a new cached sprite if it doesn't exist.
   */
  getCachedSprite(key: string, zoom: number): Phaser.GameObjects.Image {
    const normalizedZoom = this.normalizeZoom(zoom)

    if (!this.cache.has(key)) {
      this.cache.set(key, new Map())
    }

    const zoomCache = this.cache.get(key)!

    if (!zoomCache.has(normalizedZoom)) {
      // Pre-render sprite at this zoom level
      const sprite = this.scene.make.image({
        key,
        scale: normalizedZoom * 1.5,  // Account for base 1.5x scale
        add: false,
      })
      zoomCache.set(normalizedZoom, sprite)
    }

    return zoomCache.get(normalizedZoom)!
  }

  /**
   * Preload sprites at common zoom levels
   */
  preloadCommonZooms(keys: string[]): void {
    for (const key of keys) {
      for (const zoom of this.commonZooms) {
        this.getCachedSprite(key, zoom)
      }
    }
  }

  /**
   * Handle zoom changes and clear cache if necessary
   */
  handleZoomChange(newZoom: number): void {
    const diff = Math.abs(newZoom - this.currentZoom)
    this.currentZoom = newZoom

    // If zoom changed significantly, consider clearing some cache
    if (diff > 0.3) {
      this.trimCache()
    }
  }

  /**
   * Normalize zoom to grid for better cache hits
   *
   * Rounds to nearest 0.1 for cache efficiency
   */
  private normalizeZoom(zoom: number): number {
    return Math.round(zoom * 10) / 10
  }

  /**
   * Trim cache to remove unused zoom levels
   *
   * Keeps only the current zoom and adjacent levels
   */
  private trimCache(): void {
    const normalized = this.normalizeZoom(this.currentZoom)

    for (const [key, zoomCache] of this.cache) {
      const keysToDelete: number[] = []

      for (const zoom of zoomCache.keys()) {
        // Keep current, +0.1, -0.1 levels
        const diff = Math.abs(zoom - normalized)
        if (diff > 0.2 && !this.commonZooms.includes(zoom)) {
          keysToDelete.push(zoom)
        }
      }

      // Destroy and remove sprites
      for (const zoom of keysToDelete) {
        const sprite = zoomCache.get(zoom)
        if (sprite) {
          sprite.destroy()
          zoomCache.delete(zoom)
        }
      }
    }
  }

  /**
   * Clear all cached sprites
   */
  clear(): void {
    for (const [_key, zoomCache] of this.cache) {
      for (const sprite of zoomCache.values()) {
        sprite.destroy()
      }
      zoomCache.clear()
    }
    this.cache.clear()
  }

  /**
   * Get cache statistics for debugging
   */
  getStats(): { totalSprites: number; keys: string[] } {
    let totalSprites = 0
    const keys: string[] = []

    for (const [key, zoomCache] of this.cache) {
      totalSprites += zoomCache.size
      keys.push(key)
    }

    return { totalSprites, keys }
  }
}
