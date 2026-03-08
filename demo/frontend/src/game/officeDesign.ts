/**
 * Office Design System
 *
 * Top-down pixel-art office layout with rooms, furniture, and workspaces
 * Matches pixel-agents aesthetic with detailed tile-based office
 */

export enum RoomType {
  CEO = 'ceo',
  DEV = 'dev',
  MARKETING = 'marketing',
  SALES = 'sales',
  CONTENT = 'content',
  HR = 'hr',
  CUSTOMER = 'customer',
  HALLWAY = 'hallway',
  MEETING = 'meeting',
}

export interface RoomLayout {
  id: string
  type: RoomType
  name: string
  x: number        // Top-left corner in pixels
  y: number
  width: number    // In pixels
  height: number
  color: string    // Wall color
  floorColor: string
  furniture: FurnitureItem[]
  agentSpawn: { x: number; y: number }  // Where agent stands
}

export interface FurnitureItem {
  type: string  // 'desk', 'chair', 'bookshelf', 'plant', etc
  x: number
  y: number
  width: number
  height: number
  tint?: string
}

/**
 * Define all office rooms with their layouts
 */
export const OFFICE_ROOMS: Record<string, RoomLayout> = {
  // Top row
  ceo: {
    id: 'ceo',
    type: RoomType.CEO,
    name: 'CEO Office',
    x: 20,
    y: 20,
    width: 240,
    height: 160,
    color: '#8B7355',  // Brown wood walls
    floorColor: '#CD853F',  // Peru
    furniture: [
      { type: 'desk', x: 80, y: 60, width: 80, height: 40, tint: '#8B4513' },
      { type: 'bookshelf', x: 20, y: 30, width: 40, height: 100 },
      { type: 'plant', x: 180, y: 50, width: 30, height: 50 },
      { type: 'window', x: 210, y: 20, width: 40, height: 20 },
    ],
    agentSpawn: { x: 100, y: 100 },
  },

  hr: {
    id: 'hr',
    type: RoomType.HR,
    name: 'HR Office',
    x: 280,
    y: 20,
    width: 240,
    height: 160,
    color: '#8B7355',
    floorColor: '#DEB887',  // Burlywood
    furniture: [
      { type: 'desk', x: 100, y: 60, width: 80, height: 40 },
      { type: 'filing_cabinet', x: 40, y: 80, width: 40, height: 60 },
      { type: 'plant', x: 200, y: 50, width: 30, height: 50 },
      { type: 'window', x: 480, y: 20, width: 40, height: 20 },
    ],
    agentSpawn: { x: 160, y: 100 },
  },

  // Middle row
  marketing: {
    id: 'marketing',
    type: RoomType.MARKETING,
    name: 'Marketing Hub',
    x: 20,
    y: 200,
    width: 240,
    height: 160,
    color: '#696969',  // Dim gray
    floorColor: '#A9A9A9',  // Dark gray
    furniture: [
      { type: 'desk', x: 40, y: 60, width: 80, height: 40 },
      { type: 'desk', x: 140, y: 60, width: 80, height: 40 },
      { type: 'whiteboard', x: 20, y: 30, width: 80, height: 40 },
      { type: 'plant', x: 200, y: 100, width: 30, height: 50 },
    ],
    agentSpawn: { x: 130, y: 120 },
  },

  content: {
    id: 'content',
    type: RoomType.CONTENT,
    name: 'Content Lab',
    x: 280,
    y: 200,
    width: 240,
    height: 160,
    color: '#4169E1',  // Royal blue
    floorColor: '#87CEEB',  // Sky blue
    furniture: [
      { type: 'desk', x: 60, y: 70, width: 80, height: 40 },
      { type: 'bookshelf', x: 180, y: 50, width: 40, height: 100 },
      { type: 'camera_stand', x: 40, y: 30, width: 30, height: 30 },
      { type: 'plant', x: 200, y: 120, width: 30, height: 40 },
    ],
    agentSpawn: { x: 150, y: 100 },
  },

  // Bottom row
  dev: {
    id: 'dev',
    type: RoomType.DEV,
    name: 'Dev Room',
    x: 20,
    y: 380,
    width: 240,
    height: 160,
    color: '#2F4F4F',  // Dark slate gray
    floorColor: '#708090',  // Slate gray
    furniture: [
      { type: 'desk', x: 40, y: 60, width: 80, height: 40 },
      { type: 'desk', x: 140, y: 60, width: 80, height: 40 },
      { type: 'monitor_tower', x: 35, y: 30, width: 40, height: 40 },
      { type: 'monitor_tower', x: 135, y: 30, width: 40, height: 40 },
    ],
    agentSpawn: { x: 130, y: 120 },
  },

  sales: {
    id: 'sales',
    type: RoomType.SALES,
    name: 'Sales Floor',
    x: 280,
    y: 380,
    width: 240,
    height: 160,
    color: '#8B4513',  // Saddle brown
    floorColor: '#A0522D',  // Sienna
    furniture: [
      { type: 'desk', x: 40, y: 60, width: 80, height: 40 },
      { type: 'desk', x: 140, y: 60, width: 80, height: 40 },
      { type: 'phone_bank', x: 20, y: 30, width: 60, height: 30 },
      { type: 'plant', x: 200, y: 100, width: 30, height: 50 },
    ],
    agentSpawn: { x: 130, y: 120 },
  },

  customer: {
    id: 'customer',
    type: RoomType.CUSTOMER,
    name: 'Lobby',
    x: 20,
    y: 560,
    width: 240,
    height: 140,
    color: '#D3D3D3',  // Light gray
    floorColor: '#F5F5F5',  // White smoke
    furniture: [
      { type: 'reception_desk', x: 60, y: 60, width: 120, height: 50 },
      { type: 'plant', x: 40, y: 40, width: 30, height: 50 },
      { type: 'plant', x: 200, y: 40, width: 30, height: 50 },
      { type: 'window', x: 20, y: 20, width: 200, height: 20 },
    ],
    agentSpawn: { x: 130, y: 100 },
  },

  // Hallways connecting rooms
  hallway_v: {
    id: 'hallway_v',
    type: RoomType.HALLWAY,
    name: 'Vertical Hallway',
    x: 270,
    y: 20,
    width: 30,
    height: 480,
    color: '#C0C0C0',  // Silver
    floorColor: '#E8E8E8',
    furniture: [],
    agentSpawn: { x: 285, y: 250 },
  },

  hallway_h: {
    id: 'hallway_h',
    type: RoomType.HALLWAY,
    name: 'Horizontal Hallway',
    x: 20,
    y: 190,
    width: 500,
    height: 30,
    color: '#C0C0C0',
    floorColor: '#E8E8E8',
    furniture: [],
    agentSpawn: { x: 250, y: 205 },
  },
};

/**
 * Get all room positions for layout calculation
 */
export function getRoomPositions() {
  return Object.values(OFFICE_ROOMS).map(room => ({
    id: room.id,
    x: room.x,
    y: room.y,
    width: room.width,
    height: room.height,
    centerX: room.x + room.width / 2,
    centerY: room.y + room.height / 2,
  }));
}

/**
 * Get room by agent type
 */
export function getRoomForAgent(agentId: string): RoomLayout {
  return OFFICE_ROOMS[agentId] || OFFICE_ROOMS.customer;
}

/**
 * Draw furniture sprite (placeholder - would be sprite or SVG)
 */
export function drawFurniture(graphics: any, furniture: FurnitureItem) {
  const color = furniture.tint || '#8B7355';
  const colorInt = parseInt(color.replace('#', ''), 16);

  // Fill furniture
  graphics.fillStyle(colorInt, 1);
  graphics.fillRect(furniture.x, furniture.y, furniture.width, furniture.height);

  // Draw border
  graphics.lineStyle(1, 0x333333, 1);
  graphics.strokeRect(furniture.x, furniture.y, furniture.width, furniture.height);
}

/**
 * Calculate office bounds
 */
export function getOfficeBounds() {
  const rooms = Object.values(OFFICE_ROOMS);
  const xs = rooms.map(r => r.x);
  const ys = rooms.map(r => r.y);
  const x2s = rooms.map(r => r.x + r.width);
  const y2s = rooms.map(r => r.y + r.height);

  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...x2s),
    maxY: Math.max(...y2s),
    width: Math.max(...x2s) - Math.min(...xs),
    height: Math.max(...y2s) - Math.min(...ys),
  };
}
