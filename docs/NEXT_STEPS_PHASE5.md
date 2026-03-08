# Phase 5 Implementation Guide: UI/UX Polish & Collision Movement

**Objective:** Integrate collaboration movement, add smooth animations, and polish the agent experience.

---

## Quick Start

### 1. Test Current State (5 min)
```bash
cd demo/frontend && npm run dev
# Should show agents in rooms with idle bob animations
# Phase change should move them to standup corridor
# Speech bubbles should appear with fade animation
```

### 2. Key Files to Modify

```
Phase 5 Modules:
├── OfficeScene.ts           (Add collision movement integration)
├── useStore.ts              (Process collaboration events)
├── PhaserGame.tsx           (Pass collaborations to scene)
├── components/MapOverlays   (Add hover tooltips, visual feedback)
└── game/easing.ts           (NEW - easing functions)
```

---

## Implementation Tasks for Phase 5

### Task 1: Add Easing Functions (30 min)

**Create:** `demo/frontend/src/game/easing.ts`

```typescript
// Easing functions for smooth animations
export const ease = {
  linear: (t: number) => t,
  easeInOutQuad: (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeOutCubic: (t: number) => (t - 1) ** 3 + 1,
  easeInElastic: (t: number) => { /* ... */ },
}
```

**Use in:** OfficeScene.update() for smooth agent movement

### Task 2: Integrate Collaboration Movement (90 min)

**Update:** `demo/frontend/src/game/OfficeScene.ts`

```typescript
private handleCollaboration(collab: Collaboration, agentSprites: Map<AgentId, AgentSprite>): void {
  const agent1 = agentSprites.get(collab.from)
  const agent2 = agentSprites.get(collab.to)
  if (!agent1 || !agent2) return

  // 1. Calculate midpoint
  const midX = (agent1.sprite.x + agent2.sprite.x) / 2
  const midY = (agent1.sprite.y + agent2.sprite.y) / 2

  // 2. Use pathfinding to get paths (optional, linear for now)
  // const pathfinder = new TilePathfinder()
  // const path1 = pathfinder.findPath(agent1.sprite.x, agent1.sprite.y, midX, midY)

  // 3. Set movement targets
  agent1Data.targetX = midX - 20
  agent1Data.targetY = midY
  agent2Data.targetX = midX + 20
  agent2Data.targetY = midY

  // 4. Trigger COLLABORATING state
  this.behaviorManager.updateBehavior(collab.from, ..., collab.to, ...)
  this.behaviorManager.updateBehavior(collab.to, ..., collab.from, ...)

  // 5. Draw connecting line
  this.drawCollaborationLine(agent1.sprite, agent2.sprite, collab.type)
}

private drawCollaborationLine(sprite1: Phaser.GameObjects.Sprite, sprite2: Phaser.GameObjects.Sprite, type: string): void {
  // Draw dashed line between agents
  const line = this.add.graphics()
  line.lineStyle(2, this.getCollaborationColor(type), 0.7)
  line.lineBetween(sprite1.x, sprite1.y, sprite2.x, sprite2.y)
  // Store for cleanup/update
}
```

**Key Points:**
- Use `pathfinder.findPath()` for advanced movement (optional for Phase 5)
- Offset agents slightly so they don't overlap (±20px)
- Draw connecting line with color matching collaboration type
- Update line position each frame (store graphics in a Map)

### Task 3: Process Collaboration Events (60 min)

**Update:** `demo/frontend/src/store/useStore.ts`

```typescript
// In applyStepResult:
if (result.collaborations && Array.isArray(result.collaborations)) {
  for (const collab of result.collaborations) {
    const now = Date.now()
    const agent1Pos = agentWorldPositions[collab.from]
    const agent2Pos = agentWorldPositions[collab.to]

    if (agent1Pos && agent2Pos) {
      state.addCollaboration({
        from: collab.from,
        to: collab.to,
        type: collab.type as 'message' | 'coordinate' | 'handoff',
        startTime: now,
        duration: 3000,  // 3 seconds
        meetPoint: {
          x: (agent1Pos.x + agent2Pos.x) / 2,
          y: (agent1Pos.y + agent2Pos.y) / 2,
        },
        active: true,
      })
    }
  }
}
```

### Task 4: Add Hover Tooltips (60 min)

**Update:** `demo/frontend/src/game/OfficeScene.ts`

```typescript
private createAgentSprite(aid: AgentId) {
  // ... existing code ...

  sprite.on('pointerover', () => {
    this.showTooltip(aid)
  })

  sprite.on('pointerout', () => {
    this.hideTooltip(aid)
  })
}

private showTooltip(aid: AgentId): void {
  const behavior = this.behaviorManager.get(aid)
  if (!behavior) return

  const tooltipText = `${aid.toUpperCase()}\nState: ${behavior.state}`
  // Create tooltip text object
  // Position above agent
}
```

### Task 5: Add Visual Feedback (90 min)

**Enhancements:**
- Room highlight on agent action (colored border pulse)
- Progress bars above agents
- Celebration particles on high rewards
- Screen shake on big events

**Implementation:**
- Add graphics layer for room highlights
- Use `this.add.particles()` for celebration effects
- Store screen shake state in OfficeScene

---

## Integration Checklist

```
Phase 5 Integration:
☐ Create easing.ts with ease functions
☐ Add collision movement to OfficeScene
☐ Process collaborations in useStore
☐ Draw connecting lines between agents
☐ Add hover tooltips
☐ Add room highlight effects
☐ Add progress bar rendering
☐ Test 60fps with multiple collaborations
☐ Test memory stability over 500+ steps
☐ Document new APIs in code comments
```

---

## Code Examples

### Using Pathfinding
```typescript
import { pathfinder } from './pathfinding'

const startX = agent1.sprite.x
const startY = agent1.sprite.y
const endX = midX
const endY = midY

const path = pathfinder.findPath(startX, startY, endX, endY)
// path is array of {x, y} world coordinates
for (const waypoint of path) {
  // Could store waypoints and move through them
}
```

### Using SpeechBubbleManager
```typescript
import { SpeechBubbleManager } from './speechBubbles'

const bubbleManager = new SpeechBubbleManager(this)

// Show bubble
bubbleManager.show('dev', 'Coordinating with marketing', 'chat', 5000)

// In update loop
bubbleManager.update(delta)
bubbleManager.render(this.agentSprites)
```

### Using BehaviorManager
```typescript
const behavior = this.behaviorManager.get('dev')
console.log(behavior.state)  // 'collaborating'
console.log(behavior.direction)  // 'right'
const scale = this.behaviorManager.getStateScale(behavior.state, isActive)
```

---

## Testing Checklist (Phase 5)

### Visual Tests
- [ ] Two agents move toward each other when collaborating
- [ ] Connecting line draws and stays updated
- [ ] Dashed line has correct collaboration color
- [ ] Agents return to rooms after collaboration ends
- [ ] Hover tooltip shows on mouse over
- [ ] Room highlight pulses when agent acts
- [ ] Progress bar visible above agent
- [ ] Celebration particles on big rewards

### Performance Tests
- [ ] 60fps at 1x zoom with 2+ simultaneous collaborations
- [ ] Smooth camera panning with easing
- [ ] No memory leaks over 500+ steps
- [ ] CPU <5% when idle

### Edge Cases
- [ ] Collaboration expires correctly (3s default)
- [ ] Multiple collaborations don't conflict
- [ ] Agents return to correct rooms after collaboration
- [ ] Pathfinding handles obstacles (if using)
- [ ] Speech bubbles don't overlap with collaboration lines

---

## Performance Tips

1. **Limit Active Collaborations:** Only show up to 5 simultaneous (cap in store)
2. **Throttle Graphics Updates:** Don't redraw every frame if nothing changed
3. **Use Object Pooling:** Destroy/create graphics sparingly
4. **Cache Paths:** Store pathfinding results for same source/dest
5. **Profile Regularly:** Use Phaser DevTools or Chrome DevTools

---

## Debugging

### Enable Logs
```typescript
// In OfficeScene
private DEBUG = true

update() {
  if (this.DEBUG && collaboration) {
    console.log(`Collab: ${collab.from} <-> ${collab.to}`)
  }
}
```

### Visualize Pathfinding
```typescript
// Show all walkable tiles (debug)
const tiles = pathfinder.getWalkableTiles()
for (const tile of tiles) {
  const {x, y} = pathfinder.tileToWorld(tile.x, tile.y)
  this.add.circle(x, y, 2, 0x00ff00, 0.3)  // Green dots
}
```

### Check Store State
```typescript
import { useStore } from '@/store/useStore'

const state = useStore()
console.log('Active collaborations:', state.activeCollaborations)
console.log('Speech bubbles:', state.speechBubbles)
```

---

## Documentation for Phase 6

Phase 6 will focus on:
1. WebSocket integration for real-time collaboration streaming
2. Backend action_progress tracking
3. Visual events (celebrations, milestones)
4. More sophisticated agent behaviors

The foundation is now in place for these enhancements.

---

**Ready to start Phase 5? Begin with Task 1 (easing.ts) and work through each task sequentially.**

**Estimated Time:** 4-5 hours for all Phase 5 tasks
**Complexity:** Medium (mostly integration, some new algorithms)
**Risk:** Low (all changes isolated to new methods/files)
