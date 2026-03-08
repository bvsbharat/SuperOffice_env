# Quick Reference — Pixel-Art Office Map Enhancement

## Phase 1-4 Summary

**Status:** ✅ Complete (4 of 6 phases)
**TypeScript:** 0 errors
**New Files:** 4 modules (885 lines)
**Modified Files:** 3 files (120 lines)

---

## 📊 Phase Overview

| Phase | Name | Status | Key Deliverable |
|-------|------|--------|-----------------|
| 1 | Agent Behavior State Machine | ✅ | agentBehavior.ts |
| 2 | Collaboration Detection | ✅ | pathfinding.ts + rl_bridge updates |
| 3 | Enhanced Speech Bubbles | ✅ | speechBubbles.ts |
| 4 | Performance Optimization | ✅ | spriteCache.ts |
| 5 | UI/UX Polish | ⏳ | Guide: NEXT_STEPS_PHASE5.md |
| 6 | Backend Integration | ⏳ | WebSocket + streaming |

---

## 🎯 What Each Module Does

### agentBehavior.ts (290 lines)
```
AgentState enum: IDLE | WORKING | WALKING | COLLABORATING | PRESENTING
BehaviorManager: Manages state transitions + animations
Usage: new BehaviorManager() → updateBehavior() each frame
Output: Idle bob, direction facing, state-based scale
```

### pathfinding.ts (185 lines)
```
TilePathfinder: BFS pathfinding on 40×34 tile grid
Methods: findPath(), worldToTile(), tileToWorld(), isWalkable()
Usage: pathfinder.findPath(x1, y1, x2, y2)
Output: Array of tile coordinates to walk through
```

### speechBubbles.ts (275 lines)
```
SpeechBubbleManager: Manages all agent speech bubbles
Animation: Fade-in (300ms) + Fade-out (500ms)
Types: reasoning (blue) | chat (green) | action (orange) | event (purple)
Usage: manager.show(agentId, text, type) → manager.render()
```

### spriteCache.ts (135 lines)
```
SpriteCache: Zoom-level sprite pre-rendering
Cache Levels: [0.3x, 0.5x, 1.0x, 1.5x, 2.0x, 3.0x]
Trimming: Keeps only current ±0.2 zoom range
Usage: cache.getCachedSprite(key, zoom)
```

---

## 🔌 Integration Points

### OfficeScene.ts Changes
```typescript
// Import
import { BehaviorManager, AgentState } from './agentBehavior'

// Initialize
private behaviorManager = new BehaviorManager()
private activeAgent: AgentId | null = null

// In update()
this.behaviorManager.updateBehavior(aid, phase, isActive, isMoving, collab, delta)

// Visual effects
const bobOffset = this.behaviorManager.getIdleBobOffset(aid)
sprite.y += bobOffset
```

### useStore.ts Changes
```typescript
// Type
interface Collaboration {
  from: AgentId, to: AgentId, type: string,
  startTime: number, duration: number,
  meetPoint: {x, y}, active: boolean
}

// State
activeCollaborations: Collaboration[]

// Actions
addCollaboration(collab)
updateCollaborations(deltaTime)
```

### rl_bridge.py Changes
```python
# In step() after agent action
collaborations = []
if "message" in action_dict:
    # Check for agent mentions
if "target" in action_dict:
    # Check for agent names in target

# Return
"collaborations": collaborations
```

---

## 🚀 Phase 5 Quick Start

**Tasks (4-5 hours):**
1. Create `easing.ts` with ease functions
2. Add collision movement to OfficeScene
3. Process collaborations in useStore
4. Draw connecting lines
5. Add hover tooltips
6. Add visual feedback (particles, highlights)

**See:** `NEXT_STEPS_PHASE5.md` for full guide

---

## 🧪 Testing Quick Check

### Frontend Build
```bash
cd demo/frontend
npx tsc --noEmit        # Should be 0 errors
npm run build           # Should succeed
npm run dev             # Should start dev server
```

### Agent Behavior
```
✓ Idle bob: Agents should bounce up/down slightly
✓ Phase change: Agents move to corridor on standup
✓ Walk animation: Plays when moving
✓ Scale: Active agent larger than others
```

### Speech Bubbles
```
✓ Fade-in: Smooth pop-in effect (300ms)
✓ Fade-out: Smooth disappear (500ms)
✓ Colors: Blue/Green/Orange/Purple match types
✓ Cleanup: Old bubbles properly destroyed
```

### Collaboration
```
✓ Backend detects from messages
✓ Backend detects from target field
✓ Frontend receives via WebSocket
✓ Pathfinding ready for movement (Phase 5)
```

---

## 📚 Documentation Map

```
Quick Reference (this file)
└─ Technical overview of each module

PLAN_IMPLEMENTATION_SUMMARY.md
├─ Complete architecture overview
├─ Design decisions & rationale
├─ Quality metrics & validation
└─ Success criteria

IMPLEMENTATION_STATUS.md
├─ Phase-by-phase detailed status
├─ File structure & state flow
├─ Verification checklist
└─ Build instructions

NEXT_STEPS_PHASE5.md
├─ 5 sequential implementation tasks
├─ Code examples & templates
├─ Testing checklist
├─ Debugging tips
└─ Performance optimization guide

memory/MEMORY.md
├─ Project architecture overview
├─ Key design decisions
├─ Build instructions
└─ Known compatibility notes
```

---

## 💡 Key Design Decisions

| Decision | Why | Benefit |
|----------|-----|---------|
| FSM over flags | Clearer state | Easy to extend, fewer bugs |
| BFS pathfinding | Simple + clear | O(grid_size), predictable |
| Manager pattern | Single responsibility | Testable, maintainable |
| Expiration cleanup | Event-driven | Memory-safe, no tasks |
| Sprite caching | Performance | 60fps target achievable |

---

## 🐛 Common Issues & Solutions

### TypeScript Errors
```bash
# Check compilation
npx tsc --noEmit

# If errors, check:
- All imports use correct paths
- Types properly exported
- No circular dependencies
```

### Agents Not Moving
```typescript
// Check updateAgents called with correct activeAgent
// Check targetX/targetY set correctly
// Check MOVEMENT_SPEED not zero
```

### Bubbles Not Appearing
```typescript
// Check SpeechBubbleManager created in OfficeScene
// Check render() called in update loop
// Check depth ordering (20-21)
```

### Performance Issues
```typescript
// Check sprite caching enabled
// Check graphics cleanup on expiration
// Check no infinite loops in update()
// Profile with Chrome DevTools
```

---

## 📋 File Locations

```
CORE FILES:
demo/frontend/src/game/
├── agentBehavior.ts
├── pathfinding.ts
├── speechBubbles.ts
├── spriteCache.ts
├── OfficeScene.ts (modified)
└── officeLayout.ts (unchanged)

STATE MANAGEMENT:
demo/frontend/src/store/
├── useStore.ts (modified)
└── types/index.ts (unchanged)

BACKEND:
demo/api/
├── rl_bridge.py (modified)
├── routes.py (unchanged)
└── server.py (unchanged)

DOCUMENTATION:
root/
├── PLAN_IMPLEMENTATION_SUMMARY.md
├── IMPLEMENTATION_STATUS.md
├── NEXT_STEPS_PHASE5.md
├── QUICK_REFERENCE.md (this file)
└── memory/MEMORY.md
```

---

## ⏱️ Estimated Timeline

| Phase | Tasks | Time | Status |
|-------|-------|------|--------|
| 1 | FSM setup + integration | 2h | ✅ Done |
| 2 | Pathfinding + collaboration | 2h | ✅ Done |
| 3 | Speech bubbles | 1.5h | ✅ Done |
| 4 | Sprite caching | 1h | ✅ Done |
| 5 | UI/UX polish | 4-5h | ⏳ Next |
| 6 | Backend integration | 3-4h | ⏳ Later |
| **TOTAL** | **Full Enhancement** | **13-15h** | **⏳ 65% Done** |

---

## 🎓 Learning Resources

### Concepts Used
- **State Machines:** Common in game dev, clear state transitions
- **BFS Pathfinding:** Classic algorithm for grid-based movement
- **Manager Pattern:** Single responsibility principle
- **Sprite Caching:** Performance optimization technique

### Related Documentation
- Phaser.js docs: https://photonstorm.github.io/phaser3-docs/
- TypeScript Handbook: https://www.typescriptlang.org/docs/
- Git patterns: Check CLAUDE.md in project

---

## ✅ Sign-Off Checklist

Before moving to Phase 5:

- [ ] Read PLAN_IMPLEMENTATION_SUMMARY.md
- [ ] Review all 4 new TypeScript files
- [ ] Run `npx tsc --noEmit` (0 errors)
- [ ] Verify OfficeScene integration
- [ ] Check useStore collaboration state
- [ ] Confirm rl_bridge collaboration detection
- [ ] Update memory/MEMORY.md with any notes
- [ ] Ready to proceed to Phase 5

---

## 📞 Quick Help

**Q: Where do I start?**
A: Read PLAN_IMPLEMENTATION_SUMMARY.md, then follow NEXT_STEPS_PHASE5.md

**Q: How do I test?**
A: `npm run dev` in frontend, check console for errors

**Q: How do I debug?**
A: Check Debugging section in NEXT_STEPS_PHASE5.md

**Q: What's next after Phase 5?**
A: Phase 6 WebSocket integration and real-time collaboration streaming

---

**Document Last Updated:** 2026-03-08
**Implementation Status:** 65% Complete (4 of 6 phases)
**Next Phase Estimated:** 4-5 hours
**Overall Project Health:** ✅ On Track
